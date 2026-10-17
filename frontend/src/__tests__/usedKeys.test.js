import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '../i18n/messages';

// A key typed in code but missing from the catalogs shows up on screen as the raw key (or an empty label). This finds them:
// every literal key passed to t(), tp(), translate() or tr() must exist in all three languages.
const SRC = path.resolve(__dirname, '..');
// utils/stages.js wraps translate() with a fixed key prefix, so its literal keys are not full keys.
const PREFIXED = new Set(['utils/stages.js']);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'catalog' ? [] : sourceFiles(p);
    return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
  });
}

describe('translation keys used in code', () => {
  const used = [];
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:t|tp|translate|tr)\(\s*(?:getLang\(\)\s*,\s*)?'([a-zA-Z0-9_.]+)'/g)) {
      const rel = path.relative(SRC, file);
      if (!PREFIXED.has(rel)) used.push({ file: rel, key: m[1] });
    }
  }

  it('finds a sensible number of call sites', () => {
    expect(used.length).toBeGreaterThan(300);
  });

  it.each(['en', 'es', 'ht'])('every literal key exists in %s', (lang) => {
    const cat = messages[lang];
    const missing = used.filter(({ key }) => !(key in cat) && !(`${key}.one` in cat)).map((u) => `${u.file}: ${u.key}`);
    expect(missing).toEqual([]);
  });
});
