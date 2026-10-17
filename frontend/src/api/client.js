import { getLang } from '../i18n/current';

// Thin client for the School Navigator backend (contract: backend/openapi.json). Every request carries X-Lang so the backend answers
// (notes, explanations, errors) in the family's language.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', suggestedAction = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.suggestedAction = suggestedAction;
  }
}

function toQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0))
      continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request(path, { method = 'GET', params, body, signal } = {}) {
  const headers = { 'X-Lang': getLang() };
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}/api${path}${toQuery(params)}`, {
      method,
      signal,
      headers,
      // The session cookie: sent same-origin through the Vite proxy and cross-origin when VITE_API_BASE_URL points elsewhere.
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the School Navigator service.', {
      suggestedAction: 'Check that the backend is running and try again.',
    });
  }
  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.message ?? `Request failed (${res.status}).`, {
      status: res.status,
      code: e.code ?? 'http_error',
      suggestedAction: e.suggested_action ?? null,
    });
  }
  return data;
}

export const api = {
  health: (o) => request('/health', o),
  geocode: (q, o) => request('/geocode', { params: { q }, ...o }),
  zones: (lat, lon, o) => request('/zones', { params: { lat, lon }, ...o }),
  zoneShapes: (lat, lon, o) => request('/zones/geojson', { params: { lat, lon }, ...o }),
  schools: (params, o) => request('/schools', { params, ...o }),
  school: (id, lat, lon, o) => request(`/schools/${encodeURIComponent(id)}`, { params: { lat, lon }, ...o }),
  compare: (body, o) => request('/compare', { method: 'POST', body, ...o }),
  pathway: (body, o) => request('/pathway', { method: 'POST', body, ...o }),
  plan: (body, o) => request('/plan', { method: 'POST', body, ...o }),
  dates: (o) => request('/dates', o),
  chat: (body, o) => request('/chat', { method: 'POST', body, ...o }),
  quality: (o) => request('/meta/quality', o),

  // Accounts. Errors carry the server's message and suggested action in the family's language.
  auth: {
    signup: (body, o) => request('/auth/signup', { method: 'POST', body, ...o }),
    login: (body, o) => request('/auth/login', { method: 'POST', body, ...o }),
    logout: (o) => request('/auth/logout', { method: 'POST', ...o }),
    me: (o) => request('/auth/me', o),
    changePassword: (body, o) => request('/auth/password', { method: 'POST', body, ...o }),
    deleteAccount: (body, o) => request('/auth/delete-account', { method: 'POST', body, ...o }),
  },
  me: {
    putProfile: (body, o) => request('/me/profile', { method: 'PUT', body, ...o }),
    saved: (lat, lon, o) => request('/me/saved', { params: { lat, lon }, ...o }),
    save: (id, note, o) =>
      request(`/me/saved/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: note === undefined ? undefined : { note },
        ...o,
      }),
    unsave: (id, o) => request(`/me/saved/${encodeURIComponent(id)}`, { method: 'DELETE', ...o }),
    mergeSaved: (ids, o) => request('/me/saved/merge', { method: 'POST', body: { ids }, ...o }),
  },
};
