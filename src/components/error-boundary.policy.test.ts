import { describe, expect, test } from 'bun:test';
import {
  AUTO_RELOAD_COOLDOWN_MS,
  AUTO_RELOAD_STORAGE_KEY,
  autoReloadIfImportFailure,
  markAutoReload,
  readSessionStorage,
  shouldAutoReloadForImportFailure,
  type ReloadMarkStorage,
} from './error-boundary.policy';

const NOW = 1_800_000_000_000;

function memoryStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  const storage: ReloadMarkStorage = {
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
  return { data, storage };
}

const throwingStorage: ReloadMarkStorage = {
  getItem: () => {
    throw new Error('SecurityError: storage disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const chunkError = new Error(
  'Failed to fetch dynamically imported module: https://p.previews.archie.com/src/presentation/containers/mon-profil.container.tsx',
);

describe('shouldAutoReloadForImportFailure — which errors qualify', () => {
  test.each([
    ['Chrome', 'Failed to fetch dynamically imported module: https://p.previews.archie.com/src/a.tsx'],
    ['Firefox', 'error loading dynamically imported module: https://p.previews.archie.com/src/a.tsx'],
    ['Safari', 'Importing a module script failed.'],
  ])('reloads for the %s wording', (_browser, message) => {
    expect(shouldAutoReloadForImportFailure(new Error(message), memoryStorage().storage, NOW)).toBe(true);
  });

  test('matches case-insensitively and accepts a bare string error', () => {
    expect(
      shouldAutoReloadForImportFailure('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE: x', memoryStorage().storage, NOW),
    ).toBe(true);
  });

  test.each([
    ['an app TypeError', new Error("Cannot read properties of undefined (reading 'value')")],
    ['a network error from app code', new Error('Network request failed')],
    ['a router error response', { status: 404, statusText: 'Not Found' }],
    ['null', null],
    ['undefined', undefined],
  ])('does not reload for %s', (_label, error) => {
    expect(shouldAutoReloadForImportFailure(error, memoryStorage().storage, NOW)).toBe(false);
  });
});

describe('shouldAutoReloadForImportFailure — cooldown', () => {
  test('pins the spec constants', () => {
    expect(AUTO_RELOAD_COOLDOWN_MS).toBe(60_000);
    expect(AUTO_RELOAD_STORAGE_KEY).toBe('archie:import-reload-at');
  });

  test('no reload within 60 s of the previous automatic reload', () => {
    const { storage } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: String(NOW - AUTO_RELOAD_COOLDOWN_MS + 1) });
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW)).toBe(false);
  });

  test('reloads again once 60 s have passed', () => {
    const { storage } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: String(NOW - AUTO_RELOAD_COOLDOWN_MS) });
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW)).toBe(true);
  });

  test('a mark from the future (clock moved back) counts as recent', () => {
    const { storage } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: String(NOW + 5_000) });
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW)).toBe(false);
  });

  test('an unparsable mark is ignored', () => {
    const { storage } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: 'garbage' });
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW)).toBe(true);
  });
});

describe('storage unavailable (private mode, disabled storage)', () => {
  test('no storage at all ⇒ never auto-reloads (an in-memory flag would not survive the reload)', () => {
    expect(shouldAutoReloadForImportFailure(chunkError, null, NOW)).toBe(false);
  });

  test('storage whose reads throw ⇒ never auto-reloads', () => {
    expect(shouldAutoReloadForImportFailure(chunkError, throwingStorage, NOW)).toBe(false);
  });

  test('readSessionStorage returns null where there is no window', () => {
    expect(readSessionStorage()).toBeNull();
  });
});

describe('markAutoReload', () => {
  test('writes the timestamp under the key and reports success', () => {
    const { data, storage } = memoryStorage();
    expect(markAutoReload(storage, NOW)).toBe(true);
    expect(data[AUTO_RELOAD_STORAGE_KEY]).toBe(String(NOW));
  });

  test('reports failure when the write throws, so the caller does not reload', () => {
    expect(markAutoReload(throwingStorage, NOW)).toBe(false);
  });

  test('mark then decide: a second failure right after is suppressed (no loop)', () => {
    const { storage } = memoryStorage();
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW)).toBe(true);
    markAutoReload(storage, NOW);
    expect(shouldAutoReloadForImportFailure(chunkError, storage, NOW + 1_000)).toBe(false);
  });
});

function spyReload() {
  let calls = 0;
  const reload = () => {
    calls += 1;
  };
  return { reload, get calls() { return calls; } };
}

describe('autoReloadIfImportFailure — decide, mark, reload in one place', () => {
  test('reloads once on a matching error with writable storage', () => {
    const { storage } = memoryStorage();
    const spy = spyReload();
    expect(autoReloadIfImportFailure(chunkError, storage, NOW, spy.reload)).toBe(true);
    expect(spy.calls).toBe(1);
  });

  test('a second call within the cooldown (StrictMode double invocation) does not reload again', () => {
    const { storage } = memoryStorage();
    const spy = spyReload();
    expect(autoReloadIfImportFailure(chunkError, storage, NOW, spy.reload)).toBe(true);
    expect(autoReloadIfImportFailure(chunkError, storage, NOW + 1, spy.reload)).toBe(false);
    expect(spy.calls).toBe(1);
  });

  test('no reload when storage is null', () => {
    const spy = spyReload();
    expect(autoReloadIfImportFailure(chunkError, null, NOW, spy.reload)).toBe(false);
    expect(spy.calls).toBe(0);
  });

  test('no reload when storage throws on write', () => {
    const spy = spyReload();
    expect(autoReloadIfImportFailure(chunkError, throwingStorage, NOW, spy.reload)).toBe(false);
    expect(spy.calls).toBe(0);
  });

  test('no reload for a non-matching error', () => {
    const { storage } = memoryStorage();
    const spy = spyReload();
    expect(autoReloadIfImportFailure(new Error('Network request failed'), storage, NOW, spy.reload)).toBe(false);
    expect(spy.calls).toBe(0);
  });
});
