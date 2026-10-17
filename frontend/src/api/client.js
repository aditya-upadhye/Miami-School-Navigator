import { getToken } from '../auth/token';
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
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}/api${path}${toQuery(params)}`, {
      method,
      signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the School Navigator service.', {
      suggestedAction: 'Check that the backend is running and try again.',
    });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
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
  signup: (body, o) => request('/auth/signup', { method: 'POST', body, ...o }),
  login: (body, o) => request('/auth/login', { method: 'POST', body, ...o }),
  me: (o) => request('/auth/me', o),
  logout: (o) => request('/auth/logout', { method: 'POST', ...o }),
};
