import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Archie preview host renews the gate session through a hidden iframe whose
// `return` is `/favicon.svg`, then probes that same file (spec 2026-09-25 §3.3, §7).
// If it disappears, every renewal reads as a failure.
test('public/favicon.svg exists and is an SVG', () => {
  const path = join(import.meta.dir, '..', 'public', 'favicon.svg');
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8')).toContain('<svg');
});
