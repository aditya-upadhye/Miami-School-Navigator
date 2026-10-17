/**
 * Live design-config runtime — applies the archie-app host's palette / theme
 * pushes to this template's CSS custom properties.
 *
 * Port of `applyDesignConfig` / `applyPaletteMode` / `getDesignConfig` from
 * archie-kit's `kit-bridge/design-config-runtime.ts` (the prototype's runtime),
 * adapted to THIS template's token names (shadcn/Tailwind v4, not kit-D).
 *
 * `globals.css` declares color tokens as FULL colour values (`oklch(L C H)`,
 * shadcn v4 / apg format) and every consumer reads them as `var(--token)`, so
 * this runtime writes FULL colours too (`toColorValue`, ./color-convert.ts):
 * hex -> `oklch(...)`, a legacy bare triplet `H S% L%` -> `hsl(H S% L%)`,
 * any other full colour (oklch/hsl/rgb/...) passes through. Palette (mode-dependent) writes both `:root`/`.dark`
 * blocks into one `<style id="archie-design-palette">` so a mode toggle
 * resolves by native CSS cascade — synchronous, no reapply needed. Everything
 * else (radius, fonts, gradients, animations, glassmorphism, spacing) is
 * mode-independent and stays inline on `<html>`, as before.
 *
 * The config shape is treated as an OPEN SUPERSET (`DesignTokens` in
 * archie-code-genesis-v2's `prototype-contract.vo.ts`): unknown fields are
 * ignored, never dropped from the stored config, and never thrown on.
 */

import { toColorValue } from "./color-convert";

export interface ArchieDesignConfig {
  lightPalette?: Record<string, string>;
  darkPalette?: Record<string, string>;
  fontFamily?: string;
  fontUrl?: string;
  headingFontFamily?: string;
  headingFontUrl?: string;
  monoFontFamily?: string;
  monoFontUrl?: string;
  borderRadius?: string;
  borderRadiusScale?: Record<string, string>;
  // Type scale (ARCH-2276): `typeScale` keys are the Tailwind steps (xs, sm, base, lg, xl, 2xl, 3xl) and write
  // `--text-<k>`; `typeRoleSizes` keys are apg's roles (caption, eyebrow, meta, row-title, mono-id, card-title, body)
  // and write `--type-<k>-size`. Absent ⇒ nothing is written (the globals.css defaults stand).
  typeScale?: Record<string, string>;
  typeRoleSizes?: Record<string, string>;
  gradients?: { primary?: string; accent?: string; hero?: string };
  glassmorphism?: boolean;
  glassmorphismIntensity?: "light" | "medium" | "heavy";
  preferredThemeMode?: "light" | "dark" | "system";
  animations?: {
    duration?: { fast?: string; normal?: string; slow?: string; slower?: string };
    easing?: { easeIn?: string; easeOut?: string; easeInOut?: string };
  };
  spacing?: { semantic?: Record<string, string> };
  // Polish controls (uxui-fidelity) — ports of kit-bridge's
  // `design-config-runtime.ts` live seams for density/shadows/icons. `density`
  // itself (the named preset) carries no live seam here — only its derived
  // `densityFactor` multiplier does, matching kit-bridge.
  density?: string;
  densityFactor?: number;
  shadows?: Record<string, string>;
  shadowIntensity?: "none" | "subtle" | "prominent" | string;
  iconStrokeWidth?: number;
  iconSize?: number;
  [key: string]: unknown;
}

type PaletteMode = "light" | "dark";

declare global {
  interface Window {
    archieDesignConfig: ArchieDesignConfig;
    getDesignConfig: () => ArchieDesignConfig;
    applyDesignConfig: (config: ArchieDesignConfig) => void;
    applyPaletteMode: (mode: PaletteMode) => void;
    getPaletteMode: () => PaletteMode;
    __designConfigReady: Promise<ArchieDesignConfig>;
    __archieSyncThemeState?: (mode: PaletteMode) => void;
    // Set on the first successful apply-theme-css: from then on the theme.css path owns the tokens and the legacy
    // inline writes above are off (bridge acks apply-design-config without applying; boot hydration skips it).
    __archieThemeCssLatched?: boolean;
  }
}

// Keys whose kebab-case CSS var name is NOT what the generic camelCase→kebab
// mapping below would produce — mirrors kit-bridge's `KEY_MAP`/`ALIAS_MAP`,
// trimmed to the names that exist as tokens in THIS template.
const KEY_MAP: Record<string, string> = {
  mutedForeground: "muted-foreground",
  onPrimary: "primary-foreground",
  onSecondary: "secondary-foreground",
  onAccent: "accent-foreground",
  // `error` is the palette role name; this template has no `--danger` token,
  // only `--destructive` (shadcn's name for it).
  error: "destructive",
  errorForeground: "destructive-foreground",
};

function mapKey(key: string): string {
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (key.includes("-")) return key; // already kebab-case
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}

const PALETTE_STYLE_ID = "archie-design-palette";

// Shadow keys written by the LAST applyDesignConfig call — `shadows` is an
// open record (keys are theme-defined, e.g. sm/md/lg), so resetting a slot
// back to a config without a given key requires knowing what used to be
// there. Mirrors the reset-on-absence handling kit-bridge's `iconSize`
// branch does for its own optional group.
let previousShadowKeys: string[] = [];
let previousTextVars: string[] = [];
let previousRoleVars: string[] = [];

// Every custom property applyDesignConfig has written inline on <html>. clearLegacyWrites() removes exactly these when the
// host switches to the theme.css path (apply-theme-css), so the two paths never stack.
const writtenProps = new Set<string>();

function put(root: HTMLElement, name: string, value: string): void {
  root.style.setProperty(name, value);
  writtenProps.add(name);
}

// Writes `scale` as custom properties named by `name(key)`, removes those written last time that are gone now, and
// returns the names written (string values only; anything else is ignored like the rest of this config).
// Only these keys are written: anything else would become an arbitrary custom property.
const TYPE_SCALE_KEYS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"];
const TYPE_ROLE_KEYS = ["eyebrow", "caption", "meta", "row-title", "mono-id", "card-title", "body"];

function writeScale(
  root: HTMLElement,
  scale: Record<string, string> | undefined,
  name: (key: string) => string,
  previous: string[],
  allowed: string[],
): string[] {
  const written: string[] = [];
  for (const [k, v] of Object.entries(scale ?? {})) {
    if (typeof v === "string" && allowed.includes(k)) {
      put(root, name(k), v);
      written.push(name(k));
    }
  }
  for (const prev of previous) if (!written.includes(prev)) root.style.removeProperty(prev);
  return written;
}

function paletteDecls(palette: Record<string, string> | undefined): string {
  const entries = Object.entries(palette ?? {}).filter(
    ([, v]) => typeof v === "string" && v !== "",
  );
  return entries.map(([k, v]) => `--${mapKey(k)}:${toColorValue(v)};`).join("");
}

// Writes BOTH palettes into one <style>, appended last so it wins globals.css
// by source order at equal (:root/.dark) specificity — the mode toggle then
// resolves by native cascade, synchronously, with no JS reapply on flip.
function writePaletteStyle(config: ArchieDesignConfig): void {
  const light = paletteDecls(config.lightPalette);
  const dark = paletteDecls(config.darkPalette);
  const css = `${light ? `:root{${light}}` : ""}${dark ? `.dark{${dark}}` : ""}`;
  let el = document.getElementById(PALETTE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PALETTE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

window.archieDesignConfig = window.archieDesignConfig ?? {};

export function getDesignConfig(): ArchieDesignConfig {
  return JSON.parse(JSON.stringify(window.archieDesignConfig));
}

// The mode the document is ACTUALLY showing — `.dark` on <html> is this
// template's source of truth for which token block is active (globals.css
// only defines `:root` / `.dark`; `[data-theme]` is written for parity with
// genesis-v2's Kit-facing theme-init but nothing here reads it back).
export function getPaletteMode(): PaletteMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function preferredMode(): PaletteMode {
  const pref = window.archieDesignConfig?.preferredThemeMode;
  return pref === "dark" ? "dark" : "light";
}

function swapFontLink(selector: string, url?: string): void {
  if (!url) return;
  const el = document.querySelector<HTMLLinkElement>(selector);
  if (el) el.href = url;
}

export function applyDesignConfig(newConfig: ArchieDesignConfig): void {
  window.archieDesignConfig = newConfig;
  const root = document.documentElement;

  writePaletteStyle(newConfig);

  const gradients = newConfig.gradients ?? {};
  if (gradients.primary) put(root, "--gradient-primary", gradients.primary);
  if (gradients.accent) put(root, "--gradient-accent", gradients.accent);
  if (gradients.hero) put(root, "--gradient-hero", gradients.hero);

  if (newConfig.borderRadius) put(root, "--radius", newConfig.borderRadius);
  const radiusScale = newConfig.borderRadiusScale ?? {};
  for (const [k, v] of Object.entries(radiusScale)) {
    if (typeof v === "string") {
      // Both names: `--radius-<k>` (historical) and `--theme-radius-<k>`, which the semantic sinks read.
      put(root, `--radius-${k}`, v);
      put(root, `--theme-radius-${k}`, v);
    }
  }

  // fontFamily/headingFontFamily/monoFontFamily are already complete, valid
  // CSS font stacks from the token mapper — used as-is (no re-wrapping).
  // Both names are written: `--font-sans/heading/mono` (the historical ones) and apg's roles
  // `--font-body/display/code`, which globals.css's `--font-sans/…` and every `type-*` read (ARCH-2276).
  if (newConfig.fontFamily) {
    put(root, "--font-sans", newConfig.fontFamily);
    put(root, "--font-body", newConfig.fontFamily);
  }
  if (newConfig.headingFontFamily) {
    put(root, "--font-heading", newConfig.headingFontFamily);
    put(root, "--font-display", newConfig.headingFontFamily);
  }
  if (newConfig.monoFontFamily) {
    put(root, "--font-mono", newConfig.monoFontFamily);
    put(root, "--font-code", newConfig.monoFontFamily);
  }

  // Type scale (ARCH-2276). Keys written by the previous call and absent now are removed, so a switch back to a theme
  // without a scale reverts to the globals.css defaults instead of leaving a stale size.
  previousTextVars = writeScale(root, newConfig.typeScale, (k) => `--text-${k}`, previousTextVars, TYPE_SCALE_KEYS);
  previousRoleVars = writeScale(root, newConfig.typeRoleSizes, (k) => `--type-${k}-size`, previousRoleVars, TYPE_ROLE_KEYS);

  swapFontLink("link[data-design-font]", newConfig.fontUrl);
  swapFontLink("link[data-design-heading-font]", newConfig.headingFontUrl);
  swapFontLink("link[data-design-mono-font]", newConfig.monoFontUrl);

  const anim = newConfig.animations ?? {};
  const dur = anim.duration ?? {};
  if (dur.fast) put(root, "--duration-fast", dur.fast);
  if (dur.normal) put(root, "--duration-normal", dur.normal);
  if (dur.slow) put(root, "--duration-slow", dur.slow);
  if (dur.slower) put(root, "--duration-slower", dur.slower);

  const ease = anim.easing ?? {};
  if (ease.easeIn) put(root, "--ease-in", ease.easeIn);
  if (ease.easeOut) put(root, "--ease-out", ease.easeOut);
  if (ease.easeInOut) {
    put(root, "--ease-in-out", ease.easeInOut);
    put(root, "--ease-default", ease.easeInOut);
  }

  if (typeof newConfig.glassmorphism === "boolean") {
    if (newConfig.glassmorphism) {
      const gi = newConfig.glassmorphismIntensity;
      const blur = gi === "light" ? "8px" : gi === "heavy" ? "24px" : "16px";
      const sat = gi === "light" ? "160%" : gi === "heavy" ? "180%" : "170%";
      put(root, "--glassmorphism-blur", blur);
      put(root, "--glassmorphism-saturate", sat);
    } else {
      put(root, "--glassmorphism-blur", "0px");
      put(root, "--glassmorphism-saturate", "100%");
    }
  }

  const semanticSpacing = newConfig.spacing?.semantic ?? {};
  for (const [k, v] of Object.entries(semanticSpacing)) {
    if (typeof v === "string") put(root, `--spacing-${mapKey(k)}`, v);
  }

  // Density (uxui-fidelity Polish control) — the sanctioned global spacing
  // multiplier, ported byte-for-byte from kit-bridge's clamp (0.75..1.25).
  // Absent/invalid removes the override so a slot switch back to a theme
  // without it reverts to the unscaled default, same reset law as the
  // glass/shadow groups below.
  const densityFactor = newConfig.densityFactor;
  if (typeof densityFactor === "number" && isFinite(densityFactor)) {
    put(
      root,
      "--density-factor",
      String(Math.min(1.25, Math.max(0.75, densityFactor))),
    );
  } else {
    root.style.removeProperty("--density-factor");
  }

  // Shadows (uxui-fidelity) — each `shadows[k]` overrides `--shadow-<k>`
  // wholesale (a full box-shadow value), same as kit-bridge. Keys present in
  // the PREVIOUS call but absent now are reset so a slot switch back to a
  // theme without overrides doesn't leave a stale shadow behind.
  const shadows = newConfig.shadows ?? {};
  for (const prevKey of previousShadowKeys) {
    if (!(prevKey in shadows)) {
      root.style.removeProperty(`--shadow-${prevKey}`);
      root.style.removeProperty(`--theme-shadow-${prevKey}`);
    }
  }
  const shadowKeys: string[] = [];
  for (const [k, v] of Object.entries(shadows)) {
    if (typeof v === "string") {
      put(root, `--shadow-${k}`, v);
      put(root, `--theme-shadow-${k}`, v);
      shadowKeys.push(k);
    }
  }
  previousShadowKeys = shadowKeys;

  // Shadow strength (uxui-fidelity) — the Polish "Shadows" control. Scales
  // the alpha of the DEFAULT shadow scale in globals.css
  // (`calc(<alpha> * var(--shadow-strength,1))`); none=0 / subtle=.6 /
  // prominent=1.5, byte-identical mapping to kit-bridge. Any other/absent
  // value removes the override, falling back to 1 (byte-identical render).
  const shadowIntensity = newConfig.shadowIntensity;
  if (shadowIntensity === "none") put(root, "--shadow-strength", "0");
  else if (shadowIntensity === "subtle") put(root, "--shadow-strength", "0.6");
  else if (shadowIntensity === "prominent") put(root, "--shadow-strength", "1.5");
  else root.style.removeProperty("--shadow-strength");

  // Icon stroke (uxui-fidelity) — the Polish "Icon stroke" control.
  // globals.css binds `.lucide { stroke-width: var(--icon-stroke-width,2) }`
  // (this template's lucide-react icons carry the same `.lucide` class as
  // the kit's static SVGs). Clamp 1..3, same range as kit-bridge. Absent
  // removes the override, falling back to Lucide's own default (2).
  if (typeof newConfig.iconStrokeWidth === "number" && isFinite(newConfig.iconStrokeWidth)) {
    put(
      root,
      "--icon-stroke-width",
      String(Math.min(3, Math.max(1, newConfig.iconStrokeWidth))),
    );
  } else {
    root.style.removeProperty("--icon-stroke-width");
  }

  // Icon size (uxui-fidelity) — the Polish "Icon size" control. Not bound to
  // any selector in this template yet (no central lucide size hook that
  // wouldn't also fight explicit `size-*` classes), but written for parity
  // with kit-bridge and so a future consumer can opt in. Clamp 12..28px,
  // same range as kit-bridge; absent resets to the same defaults kit-bridge
  // falls back to (1em / scale 1) rather than leaving a stale override.
  if (typeof newConfig.iconSize === "number" && isFinite(newConfig.iconSize)) {
    const iconPx = Math.min(28, Math.max(12, Math.round(newConfig.iconSize)));
    put(root, "--icon-size", `${iconPx}px`);
    put(root, "--icon-scale", String(iconPx / 16));
  } else {
    put(root, "--icon-size", "1em");
    put(root, "--icon-scale", "1");
  }
}

// Removes every inline property applyDesignConfig ever wrote, the palette <style>, and the bookkeeping that remembers
// them. Called once when the theme.css path takes over; nothing it removes is rewritten afterwards (the latch).
export function clearLegacyWrites(): void {
  const root = document.documentElement;
  for (const name of writtenProps) root.style.removeProperty(name);
  writtenProps.clear();
  document.getElementById(PALETTE_STYLE_ID)?.remove();
  previousShadowKeys = [];
  previousTextVars = [];
  previousRoleVars = [];
}

export function isThemeCssLatched(): boolean {
  return window.__archieThemeCssLatched === true;
}

export function applyPaletteMode(mode: PaletteMode): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(mode);

  const preferred = preferredMode();
  if (mode === preferred) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);

  window.__archieSyncThemeState?.(mode);
  // No applyDesignConfig() here: the palette is cascade-native (writePaletteStyle
  // already wrote both :root/.dark), and nothing else in applyDesignConfig is
  // mode-dependent — reapplying it would just rewrite the same values.
}

window.getDesignConfig = getDesignConfig;
window.applyDesignConfig = applyDesignConfig;
window.applyPaletteMode = applyPaletteMode;
window.getPaletteMode = getPaletteMode;

// No MutationObserver: it existed to reapply the palette on a `.dark`/
// `data-theme` mutation that bypasses `applyPaletteMode` (e.g. genesis-v2's
// patched `theme-provider.tsx`, which toggles the class directly). Now that
// the palette lives in :root/.dark CSS, ANY class mutation resolves it by
// cascade, synchronously, with zero JS involved — there is nothing left to
// reapply, so the race it used to paper over (async reapply losing to a sync
// read right after the toggle) no longer exists.

function loadInitialDesignConfig(): Promise<ArchieDesignConfig> {
  // Absolute path: this is an SPA with nested routes, so a relative
  // `design-config.json` would resolve against the current route (e.g.
  // `/users/design-config.json`) instead of the site root.
  return fetch(`/design-config.json?t=${Date.now()}`)
    .then((r) => (r.ok ? (r.json() as Promise<ArchieDesignConfig>) : {}))
    .then((cfg) => {
      window.archieDesignConfig = cfg;
      return cfg;
    })
    .catch(() => ({}) as ArchieDesignConfig);
}

window.__designConfigReady = loadInitialDesignConfig().then((cfg) => {
  // Skipped once the host has latched the theme.css path (a push can land before this fetch resolves).
  if (cfg && (cfg.lightPalette || cfg.darkPalette) && !isThemeCssLatched()) applyDesignConfig(cfg);
  return cfg;
});
