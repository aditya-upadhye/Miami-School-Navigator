import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { useProfile } from '../profile/ProfileProvider';
import { GUEST_MAX, addId, clearGuestIds, readGuestIds, removeId, writeGuestIds } from './savedLogic';

const SavedContext = createContext(null);

/**
 * Saved schools.
 *  - Signed in: the server is the truth. Changes show at once and are rolled back (with the server's localized message, for
 *    example when the list is full) if the request fails.
 *  - Guest: only school ids, in localStorage ('sn-saved-ids'). On sign-in they are merged into the account and the local list is cleared.
 * `items` for a signed-in family carry the school summary; for a guest they are bare ids (the Saved page fetches the summaries).
 */
export function SavedProvider({ children }) {
  const { user, ready, showNotice, refresh: refreshSession } = useAuth();
  const { profile } = useProfile();
  const { t, lang } = useI18n();
  const [serverItems, setServerItems] = useState(null);
  const [guestIds, setGuestIds] = useState(readGuestIds);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const itemsRef = useRef(serverItems);
  itemsRef.current = serverItems;
  const guestRef = useRef(guestIds);
  guestRef.current = guestIds;
  const inflight = useRef(0);
  const loadSeq = useRef(0);
  const userId = user?.id ?? null;
  const { lat, lon } = profile;

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const r = await api.me.saved(lat, lon);
      if (seq === loadSeq.current) {
        setServerItems(r.items);
        setLoadError(null);
      }
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err);
      if (err.code === 'not_signed_in') refreshSession();
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [lat, lon, refreshSession]);

  // Session known or changed (and the language or location, which change the summaries): merge a guest's list once, then load.
  useEffect(() => {
    if (!ready) return undefined;
    if (userId === null) {
      loadSeq.current++;
      setServerItems(null);
      setLoadError(null);
      setLoading(false);
      setGuestIds(readGuestIds());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const guest = readGuestIds();
      if (guest.length) {
        try {
          await api.me.mergeSaved(guest);
          clearGuestIds();
          setGuestIds([]);
        } catch (err) {
          showNotice(err); // the guest list stays on this device; nothing is lost
        }
      }
      if (!cancelled) load();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, userId, lang, load, showNotice]);

  const signedIn = userId !== null;
  const ids = useMemo(
    () => new Set(signedIn ? (serverItems ?? []).map((i) => i.place_id) : guestIds),
    [signedIn, serverItems, guestIds],
  );

  const items = useMemo(
    () =>
      signedIn
        ? (serverItems ?? [])
        : guestIds.map((id) => ({ place_id: id, note: '', saved_at: null, school: undefined })),
    [signedIn, serverItems, guestIds],
  );

  const fail = useCallback(
    (err) => {
      showNotice(err);
      if (err.code === 'not_signed_in') refreshSession();
    },
    [showNotice, refreshSession],
  );

  /** Run one server write: `apply` is the optimistic change, `undo` reverses it on failure. Re-sync once no write is pending. */
  const serverWrite = useCallback(
    async (call, apply, undo, { resync = true } = {}) => {
      apply();
      inflight.current++;
      let ok = true;
      try {
        await call();
      } catch (err) {
        ok = false;
        undo();
        fail(err);
      } finally {
        inflight.current--;
        if (resync && inflight.current === 0) load();
      }
      return ok;
    },
    [fail, load],
  );

  const guestWrite = useCallback((next) => {
    guestRef.current = next;
    setGuestIds(next);
    writeGuestIds(next); // when storage refuses, the list still works until the tab closes
  }, []);

  const save = useCallback(
    (id) => {
      if (!signedIn) {
        if (guestRef.current.length >= GUEST_MAX && !guestRef.current.includes(id)) {
          showNotice({ message: t('saved.err.guestLimit', { n: GUEST_MAX }) });
          return Promise.resolve();
        }
        guestWrite(addId(guestRef.current, id));
        return Promise.resolve();
      }
      if (itemsRef.current?.some((i) => i.place_id === id)) return Promise.resolve();
      const placeholder = { place_id: id, note: '', saved_at: new Date().toISOString(), school: undefined };
      return serverWrite(
        () => api.me.save(id),
        () => setServerItems((list) => [placeholder, ...(list ?? [])]),
        () => setServerItems((list) => (list ?? []).filter((i) => i.place_id !== id)),
      );
    },
    [signedIn, guestWrite, serverWrite, showNotice, t],
  );

  const remove = useCallback(
    (id) => {
      if (!signedIn) {
        guestWrite(removeId(guestRef.current, id));
        return Promise.resolve();
      }
      const list = itemsRef.current ?? [];
      const index = list.findIndex((i) => i.place_id === id);
      if (index < 0) return Promise.resolve();
      const removed = list[index];
      return serverWrite(
        () => api.me.unsave(id),
        () => setServerItems((l) => (l ?? []).filter((i) => i.place_id !== id)),
        () =>
          setServerItems((l) => {
            const cur = l ?? [];
            if (cur.some((i) => i.place_id === id)) return cur;
            const next = [...cur];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          }),
      );
    },
    [signedIn, guestWrite, serverWrite],
  );

  const isSaved = useCallback((id) => ids.has(id), [ids]);
  const toggle = useCallback((id) => (ids.has(id) ? remove(id) : save(id)), [ids, save, remove]);

  /** Signed in only (guests are asked to sign in): save a note on a saved school. */
  const setNote = useCallback(
    (id, note) => {
      if (!signedIn) return Promise.resolve();
      const before = itemsRef.current?.find((i) => i.place_id === id)?.note ?? '';
      if (before === note) return Promise.resolve();
      const setTo = (value) => () =>
        setServerItems((l) => (l ?? []).map((i) => (i.place_id === id ? { ...i, note: value } : i)));
      return serverWrite(() => api.me.save(id, note), setTo(note), setTo(before), { resync: false });
    },
    [signedIn, serverWrite],
  );

  const value = useMemo(
    () => ({
      ids,
      isSaved,
      toggle,
      save,
      remove,
      setNote,
      items,
      count: ids.size,
      loading,
      loadError,
      reload: load,
      signedIn,
    }),
    [ids, isSaved, toggle, save, remove, setNote, items, loading, loadError, load, signedIn],
  );
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error('useSaved must be used inside <SavedProvider>');
  return ctx;
}
