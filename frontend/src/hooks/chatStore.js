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

/** The Explore page registers here to put filters Jarvis was asked to apply onto its map. Returns the unsubscribe function. */
export const onMapUpdate = (fn) => {
  mapListeners.add(fn);
  return () => mapListeners.delete(fn);
};

function load() {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(messages) {
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
  const history = [...state.messages, { role: 'user', content }].slice(-MAX_MESSAGES);
  set({ messages: history, loading: true, error: null });
  try {
    const res = await api.chat(makeBody(history.map(({ role, content: c }) => ({ role, content: c }))));
    set({
      messages: [
        ...state.messages,
        { role: 'assistant', content: res.answer, citations: res.citations, results: res.results, warnings: res.warnings, degraded: res.degraded, mapApplied: !!res.map_update && mapListeners.size > 0 },
      ].slice(-MAX_MESSAGES),
    });
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
