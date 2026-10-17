/**
 * Origins allowed to drive this app's host bridge (ARCH-2274 PQ-2). Every inbound message type is checked against
 * this list, not only `apply-theme-css`: the sender window alone proves nothing about who controls the parent page.
 *
 * Baked defaults mirror apg's list of archie-app UI origins (07b-live-theme.ts DEFAULT_HOST_ORIGINS); keep them in sync.
 * Extra exact origins come from VITE_ARCHIE_HOST_ORIGINS (comma separated); `http://localhost:3000` (archie-app's
 * local dev server) is allowed only in a dev build that also sets VITE_ARCHIE_ALLOW_LOCALHOST_HOST=1, never in a
 * production bundle.
 */
export const DEFAULT_HOST_ORIGINS: readonly string[] = [
  "https://app.dev.archie-platform.com",
  "https://app.staging.archie-platform.com",
  "https://app.archie.com",
];

export const LOCALHOST_HOST_ORIGIN = "http://localhost:3000";

const ORIGIN = /^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;

/** Exact origins only (lowercased, as a browser's `event.origin` is): wildcards, paths, credentials and empty entries are dropped. */
export function buildHostOrigins(extra: string | undefined, dev: boolean): string[] {
  const list = [...DEFAULT_HOST_ORIGINS, ...(extra ?? "").split(","), ...(dev ? [LOCALHOST_HOST_ORIGIN] : [])];
  const out: string[] = [];
  for (const raw of list) {
    const o = raw.trim().toLowerCase();
    if (ORIGIN.test(o) && !out.includes(o)) out.push(o);
  }
  return out;
}

export function isAllowedHostOrigin(origin: string, allowed: readonly string[]): boolean {
  return allowed.includes(origin);
}

const env = (import.meta as { env?: Record<string, unknown> }).env;

export const HOST_ORIGINS: readonly string[] = buildHostOrigins(
  typeof env?.VITE_ARCHIE_HOST_ORIGINS === "string" ? env.VITE_ARCHIE_HOST_ORIGINS : undefined,
  env?.DEV === true && env?.VITE_ARCHIE_ALLOW_LOCALHOST_HOST === "1",
);
