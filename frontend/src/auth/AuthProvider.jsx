import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { DEMO_PROFILE, useProfile } from '../profile/ProfileProvider';
import {
  adoptServerProfile,
  decideProfileSync,
  needsSave,
  profileForServer,
  serverKey,
} from '../profile/profileSync';

const AuthContext = createContext(null);
const SAVE_DELAY_MS = 800;
// Defaults for fields a server-side profile might lack, without borrowing the demo family's children or priorities.
const ADOPT_BASE = { ...DEMO_PROFILE, children: [], priorities: [] };

/**
 * Who is signed in, and the signed-in family's profile kept on the server.
 *  - Guests: nothing is sent anywhere.
 *  - On a session start (page load, login) the server profile becomes the active one; if the server has none and this device has a
 *    real (non-demo) one, it is pushed up. On sign-up the current non-demo profile is sent with the account.
 *  - While signed in, profile changes are saved after a short pause. `lastKey` remembers what the server already has, so loading a
 *    profile from the server never triggers a save of the same thing (no echo loop). The demo profile is never sent.
 *  - On sign-out the profile resets to the demo family.
 */
export function AuthProvider({ children }) {
  const { profile, replaceProfile, clearProfile } = useProfile();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [profileStatus, setProfileStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [notice, setNotice] = useState(null); // an API error worth telling the family about: {message, suggestedAction}

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const lastKey = useRef(null); // serverKey() of what the server holds
  const pending = useRef(null); // {profile, key} waiting for the debounce
  const timer = useRef(null);

  const showNotice = useCallback((err) => {
    setNotice(err ? { message: err.message, suggestedAction: err.suggestedAction ?? null } : null);
  }, []);

  const expire = useCallback(() => {
    // The session ended elsewhere: behave as signed out (the profile on screen is kept until the family signs out themselves).
    pending.current = null;
    lastKey.current = null;
    setUser(null);
    setProfileStatus(null);
  }, []);

  const push = useCallback(
    async (payload, key) => {
      const before = lastKey.current;
      lastKey.current = key; // set first: nothing may re-send the same profile while this request is in flight
      setProfileStatus('saving');
      try {
        await api.me.putProfile({ profile: payload });
        setProfileStatus('saved');
        return true;
      } catch (err) {
        if (lastKey.current === key) lastKey.current = before === key ? null : before;
        setProfileStatus('error');
        if (err.code === 'not_signed_in') expire();
        else showNotice(err);
        return false;
      }
    },
    [expire, showNotice],
  );

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const job = pending.current;
    pending.current = null;
    if (job) await push(job.profile, job.key);
  }, [push]);

  /** A session exists: reconcile the server profile with this device's. `sent` means the profile went up with the sign-up. */
  const startSession = useCallback(
    (u, sent = false) => {
      const local = profileRef.current;
      const action = sent ? 'sent' : decideProfileSync(u.profile, local);
      if (action === 'adopt') {
        const next = adoptServerProfile(u.profile, ADOPT_BASE, local.lang ?? 'en');
        lastKey.current = serverKey(next);
        replaceProfile(next);
        setProfileStatus(null);
      } else if (action === 'sent') {
        lastKey.current = serverKey(local);
      } else if (action === 'push') {
        lastKey.current = null;
        push(profileForServer(local), serverKey(local));
      } else {
        lastKey.current = null;
      }
      setUser(u);
    },
    [push, replaceProfile],
  );

  // Who am I? Once, on load. Signed out is a normal answer.
  useEffect(() => {
    let cancelled = false;
    api.auth
      .me()
      .then((r) => {
        if (cancelled) return;
        if (r?.user) startSession(r.user);
        setReady(true);
      })
      .catch(() => !cancelled && setReady(true)); // backend unreachable: carry on as a guest
    return () => {
      cancelled = true;
    };
  }, [startSession]);

  // Debounced save of profile changes while signed in.
  useEffect(() => {
    if (!user) return undefined;
    if (!needsSave(profile, lastKey.current)) {
      pending.current = null;
      return undefined;
    }
    pending.current = { profile: profileForServer(profile), key: serverKey(profile) };
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [profile, user, flush]);

  // Do not lose a change made just before the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const signup = useCallback(
    async ({ email, password, name }) => {
      const body = { email: email.trim(), password, name: (name ?? '').trim() };
      const local = profileForServer(profileRef.current);
      if (local) body.profile = local;
      const r = await api.auth.signup(body);
      startSession(r.user, !!local);
      return r.user;
    },
    [startSession],
  );

  const login = useCallback(
    async ({ email, password }) => {
      const r = await api.auth.login({ email: email.trim(), password });
      startSession(r.user);
      return r.user;
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    await flush();
    await api.auth.logout(); // throws when it failed: the session is then still alive, so do not pretend otherwise
    pending.current = null;
    lastKey.current = null;
    setUser(null);
    setProfileStatus(null);
    clearProfile();
  }, [flush, clearProfile]);

  const changePassword = useCallback(
    (currentPassword, newPassword) =>
      api.auth.changePassword({ current_password: currentPassword, new_password: newPassword }),
    [],
  );

  const deleteAccount = useCallback(
    async (password) => {
      await api.auth.deleteAccount({ password });
      pending.current = null;
      lastKey.current = null;
      setUser(null);
      setProfileStatus(null);
      clearProfile();
    },
    [clearProfile],
  );

  const updateName = useCallback(
    async (name) => {
      const sent = profileForServer(profileRef.current);
      const r = await api.me.putProfile({ profile: sent ?? user?.profile ?? {}, name: name.trim() });
      if (sent) lastKey.current = serverKey(profileRef.current);
      setUser(r.user);
      return r.user;
    },
    [user],
  );

  /** Re-check the session (for example after a request answered "not signed in"). */
  const refresh = useCallback(async () => {
    try {
      const r = await api.auth.me();
      if (!r?.user) expire();
    } catch {
      /* offline: leave things as they are */
    }
  }, [expire]);

  const value = useMemo(
    () => ({
      user,
      ready,
      signedIn: !!user,
      profileStatus,
      notice,
      showNotice,
      signup,
      login,
      logout,
      changePassword,
      deleteAccount,
      updateName,
      refresh,
    }),
    [
      user,
      ready,
      profileStatus,
      notice,
      showNotice,
      signup,
      login,
      logout,
      changePassword,
      deleteAccount,
      updateName,
      refresh,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
