// Pure helpers for saved schools and for sign-in redirects. No React here so they are easy to test.
// A guest's saved schools are only school ids (public data, not personal data) in localStorage. Nothing else is ever stored there.

export const GUEST_KEY = 'sn-saved-ids';
export const GUEST_MAX = 200; // same ceiling as the account list

function defaultStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keep only distinct, non-empty string ids, in order, up to the limit. */
export function cleanIds(list, max = GUEST_MAX) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (typeof x !== 'string' || !x || x.length > 100 || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/** The guest's saved ids; [] when storage is unavailable or holds something unexpected. */
export function readGuestIds(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(GUEST_KEY);
    return raw ? cleanIds(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Save the guest's ids; returns false when storage refused (private mode, quota). */
export function writeGuestIds(ids, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    const clean = cleanIds(ids);
    if (clean.length === 0) storage.removeItem(GUEST_KEY);
    else storage.setItem(GUEST_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestIds(storage = defaultStorage()) {
  try {
    storage?.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

/** Union of two id lists, first list first, no duplicates. */
export const mergeIds = (a, b, max = GUEST_MAX) => cleanIds([...(a ?? []), ...(b ?? [])], max);

/** Newest first: a newly saved id goes to the front. Returns the same list when nothing changes. */
export function addId(ids, id, max = GUEST_MAX) {
  if (ids.includes(id)) return ids;
  return [id, ...ids].slice(0, max);
}

export const removeId = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids);

/**
 * Only same-site paths are allowed as a redirect target after sign-in: a single leading "/", never "//host", "/\host", a scheme,
 * control characters or backslashes. Anything else (and the sign-in pages themselves) falls back.
 */
export function safeNext(raw, fallback = '/explore') {
  if (typeof raw !== 'string') return fallback;
  if (raw.length === 0 || raw.length > 500) return fallback;
  if (!/^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/.test(raw)) return fallback;
  if (/^\/(login|signup)(?:[/?#]|$)/.test(raw)) return fallback;
  return raw;
}

/** Run `fn` over `items` with at most `limit` in flight. Never rejects: each result is {ok, value} or {ok:false, error}. Order kept. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        out[i] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
