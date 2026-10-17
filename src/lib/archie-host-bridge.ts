/**
 * postMessage bridge to the archie-app host (live re-theme only).
 *
 * Handles the inbound `apply-theme-css` / `apply-design-config` (legacy, latched off after the first theme-css apply) /
 * `apply-palette-mode` / `get-design-config` messages the host sends to this app's iframe
 * `contentWindow`, and acks with `design-config-applied` — mirroring the
 * subset of archie-kit's `router-script.ts` message handler this template
 * needs (navigate / get-routes / route-changed / comment-mode are explicitly
 * OUT of scope here).
 */

import {
  applyDesignConfig,
  applyPaletteMode,
  clearLegacyWrites,
  getDesignConfig,
  isThemeCssLatched,
  type ArchieDesignConfig,
} from "./archie-design-runtime";
import { HOST_ORIGINS, isAllowedHostOrigin } from "./archie-host-origins";

interface ArchieHostMessage {
  source?: string;
  type?: string;
  config?: ArchieDesignConfig;
  mode?: "light" | "dark";
  css?: unknown;
  fonts?: unknown;
}

// Advertised in `ready` and on every ack so the host knows this build understands `apply-theme-css`.
const THEME_CSS_VERSION = 1;
const MAX_THEME_CSS_BYTES = 256 * 1024;
const MAX_FONT_LINKS = 8;
const LIVE_FONT_ATTR = "data-archie-live-font";

function notifyHost(type: string, data?: Record<string, unknown>): void {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ source: "archie-prototype", type, ...data }, "*");
  } catch {
    // Parent origin/window unavailable — nothing to notify.
  }
}

function ackApplied(applied: string | null, extra?: Record<string, unknown>): void {
  notifyHost("design-config-applied", {
    themeCss: THEME_CSS_VERSION,
    applied,
    ...extra,
    config: getDesignConfig(),
  });
}

// The single constructable sheet this bridge owns; replaced on every apply, removed on clear.
let ownedSheet: CSSStyleSheet | null = null;

function byteLength(text: string): number {
  return typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
}

function supportsConstructableSheets(): boolean {
  return (
    typeof CSSStyleSheet === "function" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function" &&
    "adoptedStyleSheets" in document
  );
}

// Only Google Fonts CSS2 stylesheets: a font link is a network fetch the host decides, so the URL shape is pinned.
function isAllowedFontUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "fonts.googleapis.com" && u.pathname === "/css2" && !u.username && !u.password;
  } catch {
    return false;
  }
}

function removeOwnedSheet(): void {
  if (ownedSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== ownedSheet);
  ownedSheet = null;
}

function removeLiveFonts(): void {
  document.head.querySelectorAll(`link[${LIVE_FONT_ATTR}]`).forEach((el) => el.remove());
}

// A backslash anywhere rejects the whole payload: custom-property values keep escapes verbatim in the serialised rules,
// so `--x:u\72l(https://e.test/a.png)` passes the serialised check below and still fetches once read through var().
// Generated theme CSS never needs an escape. `@import` is rejected on the raw text too: replaceSync silently DROPS it,
// which would otherwise apply the rest of the payload minus the import instead of rejecting it.
// Then parse with the browser's own CSS parser and inspect the SERIALISED rules (escapes decoded by the parser in
// non-custom-property positions); a parse failure or any @import / url( / image-set( rejects the payload.
function parseThemeSheet(css: string): { sheet: CSSStyleSheet } | { reason: string } {
  if (css.includes("\\") || /@import/i.test(css)) return { reason: "forbidden-css" };
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(css);
  } catch {
    return { reason: "invalid-css" };
  }
  for (const rule of Array.from(sheet.cssRules)) {
    if (typeof CSSImportRule === "function" && rule instanceof CSSImportRule) return { reason: "forbidden-css" };
    if (/@import|url\(|image-set\(|src\(|image\(/i.test(rule.cssText)) return { reason: "forbidden-css" };
  }
  return { sheet };
}

function applyThemeCss(msg: ArchieHostMessage): void {
  const { css, fonts } = msg;
  if ((css !== null && css !== undefined && typeof css !== "string") || (fonts !== undefined && !Array.isArray(fonts))) {
    ackApplied(null, { reason: "invalid-payload" });
    return;
  }

  if (css === null || css === undefined || css === "") {
    removeOwnedSheet();
    removeLiveFonts();
    ackApplied("theme-css");
    return;
  }

  if (byteLength(css) > MAX_THEME_CSS_BYTES) {
    ackApplied(null, { reason: "too-large" });
    return;
  }
  const fontUrls = (fonts ?? []) as unknown[];
  if (fontUrls.length > MAX_FONT_LINKS || !fontUrls.every(isAllowedFontUrl)) {
    ackApplied(null, { reason: "forbidden-font" });
    return;
  }
  // Never a <style> fallback: an unparsed string in a <style> would skip the serialised-rule check above.
  if (!supportsConstructableSheets()) {
    ackApplied(null, { reason: "unsupported" });
    return;
  }

  const parsed = parseThemeSheet(css);
  if ("reason" in parsed) {
    ackApplied(null, { reason: parsed.reason });
    return;
  }

  // First successful apply: the legacy inline writes would otherwise stack on (and, being inline, beat) the sheet.
  if (!isThemeCssLatched()) {
    clearLegacyWrites();
    window.__archieThemeCssLatched = true;
  }

  // Adopted last = wins the cascade over every other sheet at equal specificity/layer, on each apply.
  const others = document.adoptedStyleSheets.filter((s) => s !== ownedSheet);
  ownedSheet = parsed.sheet;
  document.adoptedStyleSheets = [...others, parsed.sheet];

  removeLiveFonts();
  for (const href of fontUrls as string[]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(LIVE_FONT_ATTR, "");
    document.head.appendChild(link);
  }
  ackApplied("theme-css");
}

function handleMessage(e: MessageEvent<ArchieHostMessage>): void {
  // Every message type, not just apply-theme-css: exact origin AND the parent window (a frame posting to itself, or a
  // sibling, is not the host).
  if (!isAllowedHostOrigin(e.origin, HOST_ORIGINS)) return;
  if (e.source !== window.parent || window.parent === window) return;
  if (!e.data || e.data.source !== "archie-app") return;

  const { type } = e.data;

  if (type === "get-design-config") {
    notifyHost("design-config", { themeCss: THEME_CSS_VERSION, config: getDesignConfig() });
    return;
  }

  if (type === "apply-theme-css") {
    applyThemeCss(e.data);
    return;
  }

  if (type === "apply-design-config" && e.data.config) {
    // Once the theme.css path owns the tokens, the legacy inline writes would beat it: ack only.
    if (isThemeCssLatched()) {
      ackApplied(null, { reason: "theme-css-latched" });
      return;
    }
    applyDesignConfig(e.data.config);
    ackApplied("design-config");
    return;
  }

  if (type === "apply-palette-mode" && e.data.mode) {
    applyPaletteMode(e.data.mode);
    ackApplied("palette-mode");
    return;
  }
}

declare global {
  interface Window {
    __archieHostBridgeInstalled?: boolean;
  }
}

export function installArchieHostBridge(): void {
  // Idempotent under HMR: a module re-eval on save must not stack a second
  // listener (each would double-apply and double-ack every push) nor repeat `ready`.
  if (window.__archieHostBridgeInstalled) return;
  window.__archieHostBridgeInstalled = true;
  window.addEventListener("message", handleMessage);
  notifyHost("ready", { themeCss: THEME_CSS_VERSION });
}

if (window.parent !== window) {
  installArchieHostBridge();
}
