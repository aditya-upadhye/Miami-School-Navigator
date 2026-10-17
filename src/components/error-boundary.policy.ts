/**
 * Auto-recovery policy for a route whose lazy chunk failed to load.
 *
 * Under the Archie preview gate a dynamic `import()` gets a 401 once the 1 h
 * session lapses, while a document reload is a navigation the gate answers
 * with 302 → bridge → fresh cookie. The same reload also cures a stale chunk
 * after a production deploy.
 *
 * Loop guard: at most one automatic reload per AUTO_RELOAD_COOLDOWN_MS,
 * recorded in sessionStorage. Without a working sessionStorage there is no
 * automatic reload at all: an in-memory flag would not survive the reload it
 * triggers, so it could not stop a loop.
 */
export const IMPORT_FAILURE_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
export const AUTO_RELOAD_COOLDOWN_MS = 60_000;
export const AUTO_RELOAD_STORAGE_KEY = 'archie:import-reload-at';

export type ReloadMarkStorage = Pick<Storage, 'getItem' | 'setItem'>;

function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return null;
}

export function shouldAutoReloadForImportFailure(
  error: unknown,
  storage: ReloadMarkStorage | null,
  now: number,
): boolean {
  const message = errorMessage(error);
  if (message === null || !IMPORT_FAILURE_PATTERN.test(message)) return false;
  if (storage === null) return false;
  let raw: string | null;
  try {
    raw = storage.getItem(AUTO_RELOAD_STORAGE_KEY);
  } catch {
    return false;
  }
  if (raw === null) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  // A mark from the future (clock moved back) yields a negative gap: treated as recent.
  return now - last >= AUTO_RELOAD_COOLDOWN_MS;
}

export function markAutoReload(storage: ReloadMarkStorage, now: number): boolean {
  try {
    storage.setItem(AUTO_RELOAD_STORAGE_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide → mark → reload, in one place: reloads exactly when the error
 * qualifies AND the cooldown mark was actually written. A caller must never
 * reload on its own after only checking `shouldAutoReloadForImportFailure` —
 * that ordering, including the StrictMode-safe "second call within the
 * cooldown is a no-op", lives here so it cannot drift between call sites.
 */
export function autoReloadIfImportFailure(
  error: unknown,
  storage: ReloadMarkStorage | null,
  now: number,
  reload: () => void,
): boolean {
  if (!shouldAutoReloadForImportFailure(error, storage, now)) return false;
  if (storage === null || !markAutoReload(storage, now)) return false;
  reload();
  return true;
}

export function readSessionStorage(): ReloadMarkStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
