import { describe, expect, it } from 'vitest';
import { initials, isEmail, validateCredentials } from '../auth/authLogic';
import {
  adoptServerProfile,
  decideProfileSync,
  isEmptyProfile,
  needsSave,
  profileForServer,
  serverKey,
} from '../profile/profileSync';
import {
  GUEST_KEY,
  GUEST_MAX,
  addId,
  cleanIds,
  clearGuestIds,
  mapLimit,
  mergeIds,
  readGuestIds,
  removeId,
  safeNext,
  writeGuestIds,
} from '../saved/savedLogic';
import { messages } from '../i18n/messages';

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    raw: m,
  };
};

describe('guest saved ids', () => {
  it('round-trips ids through storage under sn-saved-ids', () => {
    const s = memory();
    expect(readGuestIds(s)).toEqual([]);
    expect(writeGuestIds(['a', 'b'], s)).toBe(true);
    expect(s.raw.get(GUEST_KEY)).toBe('["a","b"]');
    expect(readGuestIds(s)).toEqual(['a', 'b']);
    clearGuestIds(s);
    expect(readGuestIds(s)).toEqual([]);
  });
  it('removes the key when the list is empty', () => {
    const s = memory();
    writeGuestIds(['a'], s);
    writeGuestIds([], s);
    expect(s.raw.has(GUEST_KEY)).toBe(false);
  });
  it('ignores corrupt or unexpected storage content', () => {
    for (const raw of ['not json', '{"a":1}', '"x"', '[1,null,{}]', '']) {
      const s = memory();
      s.setItem(GUEST_KEY, raw);
      expect(readGuestIds(s)).toEqual([]);
    }
  });
  it('survives storage that throws or is missing', () => {
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readGuestIds(boom)).toEqual([]);
    expect(writeGuestIds(['a'], boom)).toBe(false);
    expect(() => clearGuestIds(boom)).not.toThrow();
    expect(readGuestIds(null)).toEqual([]);
    expect(writeGuestIds(['a'], null)).toBe(false);
  });
  it('cleans, de-duplicates and caps the list', () => {
    expect(cleanIds(['a', 'a', '', 5, 'b', null])).toEqual(['a', 'b']);
    expect(cleanIds(Array.from({ length: GUEST_MAX + 20 }, (_, i) => `id${i}`))).toHaveLength(GUEST_MAX);
    expect(cleanIds('nope')).toEqual([]);
  });
  it('adds newest first, removes, and merges without duplicates', () => {
    expect(addId(['a'], 'b')).toEqual(['b', 'a']);
    const same = ['a'];
    expect(addId(same, 'a')).toBe(same);
    expect(removeId(['a', 'b'], 'a')).toEqual(['b']);
    expect(removeId(same, 'zzz')).toBe(same);
    expect(mergeIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(mergeIds(undefined, ['x'])).toEqual(['x']);
  });
});

describe('safeNext', () => {
  it('allows same-site paths', () => {
    expect(safeNext('/account')).toBe('/account');
    expect(safeNext('/school/abc?x=1#top')).toBe('/school/abc?x=1#top');
    expect(safeNext('/explore#compare')).toBe('/explore#compare');
  });
  it('rejects anything that could leave the site', () => {
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'evil.com',
      '',
      '   /x',
      '/a\\b',
      '/\t/evil.com',
      '/a\nb',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(safeNext(bad), String(bad)).toBe('/explore');
    }
  });
  it('uses the given fallback and never loops back to the sign-in pages', () => {
    expect(safeNext('//x', '/')).toBe('/');
    expect(safeNext('/login', null)).toBeNull();
    expect(safeNext('/signup?next=/x')).toBe('/explore');
    expect(safeNext('/loginx')).toBe('/loginx');
    expect(safeNext('/' + 'a'.repeat(600))).toBe('/explore');
  });
});

describe('mapLimit', () => {
  it('keeps order, tolerates failures and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 3) throw new Error('boom');
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(out.map((r) => r.ok)).toEqual([true, true, false, true, true, true]);
    expect(out[0].value).toBe(10);
    expect(out[2].error.message).toBe('boom');
  });
  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

const REAL = {
  isDemo: false,
  address: '1 Main St',
  lat: 25.7,
  lon: -80.2,
  children: [{ age: 5 }],
  lang: 'es',
};
const DEMO = { isDemo: true, address: 'demo', lang: 'en' };

describe('profile sync decisions', () => {
  it('never sends the demo profile', () => {
    expect(profileForServer(DEMO)).toBeNull();
    expect(serverKey(DEMO)).toBeNull();
    expect(needsSave(DEMO, null)).toBe(false);
  });
  it('keeps the language and the demo flag on this device', () => {
    const sent = profileForServer(REAL);
    expect(sent).toEqual({ address: '1 Main St', lat: 25.7, lon: -80.2, children: [{ age: 5 }] });
    expect(sent).not.toHaveProperty('lang');
    expect(sent).not.toHaveProperty('isDemo');
  });
  it('adopts a non-empty server profile, pushes a local one to an empty account, otherwise nothing', () => {
    expect(decideProfileSync({ address: 'x' }, REAL)).toBe('adopt');
    expect(decideProfileSync({ address: 'x' }, DEMO)).toBe('adopt');
    expect(decideProfileSync({}, REAL)).toBe('push');
    expect(decideProfileSync(null, REAL)).toBe('push');
    expect(decideProfileSync({}, DEMO)).toBe('none');
    expect(isEmptyProfile({})).toBe(true);
    expect(isEmptyProfile({ a: 1 })).toBe(false);
  });
  it('adopts with the current language and marks it as not demo', () => {
    const base = { isDemo: true, radius: 3, children: [], lang: 'en' };
    const p = adoptServerProfile({ address: 'x', isDemo: true, lang: 'en' }, base, 'ht');
    expect(p).toMatchObject({ address: 'x', radius: 3, isDemo: false, lang: 'ht' });
  });
  it('does not echo: a profile just loaded from the server is not saved again', () => {
    const server = { address: 'x', lat: 1, lon: 2, children: [] };
    const adopted = adoptServerProfile(server, { isDemo: true, lang: 'en' }, 'es');
    const key = serverKey(adopted);
    expect(needsSave(adopted, key)).toBe(false);
    // a language change is not a profile change either
    expect(needsSave({ ...adopted, lang: 'ht' }, key)).toBe(false);
    // a real edit is
    expect(needsSave({ ...adopted, radius: 5 }, key)).toBe(true);
    // and after it is saved, it is quiet again
    const next = { ...adopted, radius: 5 };
    expect(needsSave(next, serverKey(next))).toBe(false);
  });
});

describe('form helpers', () => {
  it('checks the email shape', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail(' a@b.co ')).toBe(true);
    for (const bad of ['', 'a', 'a@b', 'a b@c.com', '@b.com', 'a@.com'])
      expect(isEmail(bad), bad).toBe(false);
  });
  it('validates credentials and returns translatable keys that exist', () => {
    const e = validateCredentials({ email: 'x', password: 'short' }, { checkPasswordLength: true });
    expect(e).toEqual({ email: 'auth.err.emailShape', password: 'auth.err.passwordShort' });
    expect(
      validateCredentials({ email: 'a@b.co', password: 'short' }, { checkPasswordLength: false }),
    ).toEqual({});
    expect(validateCredentials({ email: '', password: '' }, { checkPasswordLength: false })).toEqual({
      email: 'auth.err.emailRequired',
      password: 'auth.err.passwordRequired',
    });
    for (const k of Object.values(e)) expect(messages.en[k]).toBeTruthy();
  });
  it('makes initials', () => {
    expect(initials({ name: 'Ana Rivera', email: 'z@z.co' })).toBe('AR');
    expect(initials({ name: 'Ana María Rivera' })).toBe('AR');
    expect(initials({ name: 'ana' })).toBe('AN');
    expect(initials({ name: '', email: 'bob@x.com' })).toBe('B');
    expect(initials(null)).toBe('?');
  });
});
