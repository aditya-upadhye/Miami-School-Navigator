/**
 * Colour conversion for the live design runtime. Pure functions, no DOM.
 *
 * The template's colour tokens are FULL colour values (`oklch(L C H)`, shadcn v4 / apg's format), never bare
 * HSL triplets. Everything the runtime writes onto a colour custom property goes through `toColorValue`:
 *   - `#rgb` / `#rrggbb` / `#rrggbbaa` hex  -> `oklch(L C H)` (exact sRGB -> linear -> OKLab -> OKLCH; 4 decimals
 *     on L and C, 2 on H, the same precision apg's compileTheme() emits). An alpha byte becomes `/ a`.
 *   - a legacy bare HSL triplet `H S% L%` or `H S% L% / a` (a = 0.5 or 50%; what design-config.json used to carry)
 *     -> `hsl(H S% L%)` / `hsl(H S% L% / a)`
 *   - anything else (`oklch(...)`, `hsl(...)`, `rgb(...)`, `var(...)`, `color-mix(...)`) -> passed through untouched.
 */

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Parse the numbers of an `oklch(L C H [/ a])` string (L as 0..1 or %), as OKLab. For tests and delta-E. */
export function oklchToOklab(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

export function hslToSrgb(h: number, s: number, l: number): [number, number, number] {
  // h in degrees, s and l in 0..1
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}

export function formatOklch(r: number, g: number, b: number, alpha?: number): string {
  const [L, a, bb] = srgbToOklab(clamp01(r), clamp01(g), clamp01(b));
  const C = Math.hypot(a, bb);
  const H = C < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  const body = `${L.toFixed(4)} ${C.toFixed(4)} ${+H.toFixed(2)}`;
  return alpha !== undefined && alpha < 1 ? `oklch(${body} / ${+alpha.toFixed(3)})` : `oklch(${body})`;
}

export function hexToOklch(hex: string): string | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : undefined;
  return formatOklch(r, g, b, a);
}

const TRIPLET = /^(-?\d*\.?\d+)(?:deg)?[\s,]+(\d*\.?\d+)%[\s,]+(\d*\.?\d+)%(?:\s*\/\s*(\d*\.?\d+%?))?$/;

export function isBareHslTriplet(value: string): boolean {
  return TRIPLET.test(value.trim());
}

export function toColorValue(value: string): string {
  const v = value.trim();
  if (v.charAt(0) === "#") return hexToOklch(v) ?? v;
  if (TRIPLET.test(v)) {
    const m = TRIPLET.exec(v)!;
    return `hsl(${m[1]} ${m[2]}% ${m[3]}%${m[4] ? ` / ${m[4]}` : ""})`;
  }
  return v;
}
