import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
globalThis.window = { sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
vi.mock('../api/client', () => ({ api: { chat: vi.fn(async ({ messages }) => ({ answer: `echo: ${messages.at(-1).content}`, citations: [], results: [{ id: 'x' }] })) } }));

const fresh = async () => {
  vi.resetModules(); // a new module instance is what a page reload or a new page view gets
  return import('../hooks/chatStore');
};
const body = (messages) => ({ messages, profile: {}, lang: 'en' });

describe('chat store', () => {
  beforeEach(() => store.clear());

  it('keeps the conversation after the component that asked has gone, and after a reload', async () => {
    const a = await fresh();
    await a.sendMessage('hello', body);
    expect(a.getState().messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const b = await fresh();
    expect(b.getState().messages.map((m) => m.content)).toEqual(['hello', 'echo: hello']);
    await b.sendMessage('and more', body);
    expect(b.getState().messages).toHaveLength(4);
  });

  it('sends the earlier turns as history', async () => {
    const { api } = await import('../api/client');
    const a = await fresh();
    await a.sendMessage('one', body);
    await a.sendMessage('two', body);
    const last = api.chat.mock.calls.at(-1)[0].messages;
    expect(last.map((m) => m.content)).toEqual(['one', 'echo: one', 'two']);
  });

  it('can be cleared, and caps the history', async () => {
    const a = await fresh();
    for (let i = 0; i < 25; i++) await a.sendMessage(`m${i}`, body);
    expect(a.getState().messages.length).toBeLessThanOrEqual(40);
    a.resetChat();
    expect(a.getState().messages).toEqual([]);
    expect(store.has('sn.chat.v1')).toBe(false);
  });

  it('hands a map update to the live map only, and marks the answer as applied only then', async () => {
    const { api } = await import('../api/client');
    api.chat.mockImplementationOnce(async () => ({ answer: 'Done.', citations: [], map_update: { kinds: ['charter'], radius_mi: 5 } }));
    const a = await fresh();
    await a.sendMessage('show only charter schools', body); // no map open: nothing receives it
    expect(a.getState().messages.at(-1).mapApplied).toBe(false);
    const seen = [];
    const off = a.onMapUpdate((u) => seen.push(u));
    api.chat.mockImplementationOnce(async () => ({ answer: 'Done.', citations: [], map_update: { kinds: ['charter'], radius_mi: 5 } }));
    await a.sendMessage('set radius 5', body);
    expect(seen).toEqual([{ kinds: ['charter'], radius_mi: 5 }]);
    expect(a.getState().messages.at(-1).mapApplied).toBe(true);
    off();
    await a.sendMessage('a question?', body); // an answer without map_update changes nothing
    expect(seen).toHaveLength(1);
  });
});
