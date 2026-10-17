import { afterEach, describe, expect, it, vi } from 'vitest';
import { initials } from '../utils/initials';

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Ana Rivera')).toBe('AR');
    expect(initials('  maria de la cruz ')).toBe('MC');
  });
  it('handles one word and empty input', () => {
    expect(initials('madonna')).toBe('M');
    expect(initials('')).toBe('');
    expect(initials()).toBe('');
  });
});

describe('api client sends the session token', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds a Bearer header only when signed in', async () => {
    const store = {};
    vi.stubGlobal('window', { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] } });
    const { api } = await import('../api/client');
    const { setToken } = await import('../auth/token');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) });
    await api.me();
    expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined();
    setToken('abc');
    await api.me();
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer abc');
  });
});
