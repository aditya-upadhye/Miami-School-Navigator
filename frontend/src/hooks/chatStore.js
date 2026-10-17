import { api } from '../api/client';

// The Jarvis conversation lives here, outside any component, so it survives moving between pages (a component's own state is lost when
// it unmounts) and a reload of the tab. It is saved in sessionStorage: kept for this tab only, gone when the tab is closed, never sent
// anywhere except as the chat history of the next question.
const KEY = 'sn.chat.v1';
const MAX_MESSAGES = 40;

let state = { messages: load(), loading: false, error: null };
let busy = false;
const listeners = new Set();
const mapListeners = new Set();
const profileListeners = new Set();

/** The profile provider registers here to keep what the family told Jarvis (their children). Returns the unsubscribe function. */
export const onProfileUpdate = (fn) => {
  profileListeners.add(fn);
  return () => profileListeners.delete(fn);
};

/** The Explore page registers here to put filters Jarvis was asked to apply onto its map. Returns the unsubscribe function. */
export const onMapUpdate = (fn) => {
  mapListeners.add(fn);
  return () => mapListeners.delete(fn);
};

// Filters Jarvis was asked to apply while no map was on screen (the onboarding chat): the map page takes them when it opens.
let pendingMap = null;
let pendingShow = null;
const PENDING_MS = 15000; // a request waits only for the map page that is opening right now, never for a visit later
const showListeners = new Set();

/** The Explore page registers here to put a chat answer's schools on its map. Returns the unsubscribe function. */
export const onShowSchools = (fn) => {
  showListeners.add(fn);
  return () => showListeners.delete(fn);
};
export const takePendingShow = () => {
  const p = pendingShow;
  pendingShow = null;
  return p && Date.now() - p.at < PENDING_MS ? p.req : null;
};

/** Put the schools of a chat answer on the map (and open one of them). Returns true if a live map took them; otherwise they wait for the map page, and false is returned so the caller can go there. */
export function showSchools(schools, selectedId = null, filters = null, origin = null, compare = false) {
  const req = { schools, selectedId, filters, origin, compare };
  if (showListeners.size) {
    showListeners.forEach((fn) => fn(req));
    return true;
  }
  pendingShow = { req, at: Date.now() };
  return false;
}
export const setPendingMap = (u) => {
  pendingMap = { u, at: Date.now() };
};
export const takePendingMap = () => {
  const p = pendingMap;
  pendingMap = null;
  return p && Date.now() - p.at < PENDING_MS ? p.u : null;
};

// Same rule as the profile: kept for this tab only, unless the family ticked "Remember me on this device".
const REMEMBER_KEY = 'sn-remember';
const remembered = () => {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
};

/** What is sent back as history: the text, plus the schools shown (name and id) so "the second one" or "that school" can be understood. */
const forModel = ({ role, content, results }) => ({
  role,
  content: results?.length ? `${content}\n[Schools shown: ${results.slice(0, 20).map((r, i) => `${i + 1}. ${r.name} (id ${r.id})`).join('; ')}]` : content,
});

function load() {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? (remembered() ? window.localStorage.getItem(KEY) : null) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLocal(messages) {
  try {
    if (messages.length && remembered()) window.localStorage.setItem(KEY, JSON.stringify(messages.map(({ results, ...rest }) => rest)));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* no storage: the conversation is still kept for this tab */
  }
}

function save(messages) {
  saveLocal(messages);
  try {
    if (messages.length) window.sessionStorage.setItem(KEY, JSON.stringify(messages));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    try {
      // storage full: keep the conversation, drop the bulky school cards
      window.sessionStorage.setItem(KEY, JSON.stringify(messages.map(({ results, ...rest }) => rest)));
    } catch {
      /* private mode or no storage: the chat still works for this page view */
    }
  }
}

// ---- answer cache: a question asked before is answered at once, with no wait for the model. It survives a reload (same storage rule as the
// chat: this tab, or this device when "Remember me" is ticked) and expires after a week. A question that stands alone is keyed by itself; a
// follow-up ("yes", "the second one") by the whole conversation. The key also holds the profile, the memory notes and the map filters.
const CACHE_KEY = 'sn.chat.cache.v1';
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const CACHE_MAX = 60;
const POINTS_BACK = /\b(yes|yeah|yep|no|nope|ok|okay|sure|please|that|those|them|it|this|these|first|second|third|last|same|more|also|why|how about|what about|sí|si|claro|eso|esos|primero|segundo|iyè|wi|non)\b/i;
const norm = (t) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
const standalone = (t) => t.trim().split(/\s+/).length > 4 && !POINTS_BACK.test(t);

function hash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export function cacheKey(body) {
  const msgs = (body.messages ?? []).map((m) => [m.role, norm(m.content)]);
  const last = body.messages?.at(-1)?.content ?? '';
  const convo = standalone(last) ? msgs.slice(-1) : msgs;
  return hash(JSON.stringify([convo, body.profile, body.lang, body.map_available, body.map_next, body.map_filters, new Date().toDateString()]));
}

function readCache() {
  for (const store of ['sessionStorage', 'localStorage']) {
    try {
      const raw = window[store].getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* try the next store */
    }
  }
  return {};
}

function writeCache(map) {
  const text = JSON.stringify(map);
  try {
    window.sessionStorage.setItem(CACHE_KEY, text);
  } catch {
    /* full or unavailable: the cache just stays smaller */
  }
  try {
    if (remembered()) window.localStorage.setItem(CACHE_KEY, text);
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const cacheGet = (k) => {
  const hit = readCache()[k];
  return hit && Date.now() - hit.t < CACHE_TTL ? hit.res : null;
};

function cachePut(k, res) {
  if (res.degraded) return; // the model was down: the next try may succeed
  const map = readCache();
  map[k] = { t: Date.now(), res };
  const keep = Object.entries(map).sort((a, b) => b[1].t - a[1].t).slice(0, CACHE_MAX);
  writeCache(Object.fromEntries(keep));
}

/** The Explore page registers its live search here so Jarvis's school lists start from the same filters as the map. */
let mapContext = null;
export const setMapContext = (ctx) => {
  mapContext = ctx;
};

function set(patch) {
  state = { ...state, ...patch };
  if (patch.messages) save(state.messages);
  listeners.forEach((l) => l());
}

export const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getState = () => state;

/** Ask Jarvis. The answer is added to the shared conversation even if the person has moved to another page meanwhile. */
export async function sendMessage(raw, makeBody) {
  const content = raw.trim();
  if (!content || busy) return;
  busy = true;
  const history = [...state.messages, { role: 'user', content, at: Date.now() }].slice(-MAX_MESSAGES);
  set({ messages: history, loading: true, error: null });
  try {
    const body = makeBody(history.map(forModel));
    if (mapContext) body.map_filters = mapContext;
    const key = cacheKey(body);
    const res = cacheGet(key) ?? (await api.chat(body));
    cachePut(key, res);
    set({
      messages: [
        ...state.messages,
        { role: 'assistant', at: Date.now(), content: res.answer, citations: res.citations, results: res.results, warnings: res.warnings, degraded: res.degraded, mapApplied: !!res.map_update && mapListeners.size > 0, filters: res.filters_applied?.radius_mi != null && !res.filters_applied.q ? res.filters_applied : null, compare: !!res.tool_calls?.some((c) => c.tool === 'compare') && (res.results?.length ?? 0) > 1, origin: res.origin ?? null, profileSaved: res.profile_update?.children?.length ?? 0, remembered: res.profile_update?.memory?.length ?? 0 },
      ].slice(-MAX_MESSAGES),
    });
    if (res.profile_update) profileListeners.forEach((fn) => fn(res.profile_update)); // first, so the map filters below see the children
    // An open map follows the conversation: the schools Jarvis just searched for become the map's filters and matches. A search that found
    // nothing (or a name lookup) leaves the map as it is, so the map is never emptied by a chat question.
    if (res.results?.length && res.filters_applied?.radius_mi != null && !res.filters_applied.q) {
      showListeners.forEach((fn) => fn({ schools: res.results, selectedId: null, filters: res.filters_applied, origin: res.origin }));
    }
    // "Show these to compare": the compared schools go on the map and into the compare panel.
    if (res.tool_calls?.some((c) => c.tool === 'compare') && res.results?.length > 1) {
      showListeners.forEach((fn) => fn({ schools: res.results, selectedId: null, filters: null, origin: null, compare: true }));
    }
    // A zoning lookup with no search: the zoned schools go on the map.
    if (res.tool_calls?.some((c) => c.tool === 'get_zones') && !res.tool_calls.some((c) => c.tool === 'search_schools' || c.tool === 'compare') && res.results?.length) {
      showListeners.forEach((fn) => fn({ schools: res.results, selectedId: null, filters: null, origin: null }));
    }
    if (res.map_update) mapListeners.forEach((fn) => fn(res.map_update)); // only a live map takes it; a stale one is never replayed
  } catch (e) {
    set({ error: e });
  } finally {
    busy = false;
    set({ loading: false });
  }
}

export function resetChat() {
  set({ messages: [], error: null });
}
