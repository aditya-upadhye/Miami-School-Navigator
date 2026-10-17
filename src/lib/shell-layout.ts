// Phone-shell layout helpers (ARCH-2085): pure, no imports, no React, so a unit test can load them. @/lib/shell-actions re-exports them.

// The notifications popover must never leave the viewport on a phone (390px): its width is min(22rem, viewport - 2 * pad) and its
// collision padding is the same pad. Inline styles, so the numbers live in one place (a Tailwind class cannot be built from a constant).
export const SHELL_POPOVER_PAD = 12

/** CSS width of a shell popover: at most `max`, never wider than the viewport minus a gutter on both sides. */
export function shellPopoverWidth(pad: number = SHELL_POPOVER_PAD, max: string = "22rem"): string {
  return `min(${max}, calc(100vw - ${2 * pad}px))`
}

// A sticky header must not cover the first heading or an anchor target: the shell publishes its height as --shell-header-h on <html>
// (for `scroll-mt-(--shell-header-h)`, or `pt-(--shell-header-h)` under a fixed header) and as scroll-padding-top.
export const SHELL_HEADER_VAR = "--shell-header-h"

/** Publish `height` (px, rounded up, never negative) on `root` (an element, <html> in the shell). Returns the value written. */
export function applyShellHeaderOffset(root: HTMLElement, height: number | string): number {
  const h = Math.max(0, Math.ceil(Number(height) || 0))
  root.style.setProperty(SHELL_HEADER_VAR, `${h}px`)
  root.style.scrollPaddingTop = `var(${SHELL_HEADER_VAR})`
  return h
}

/** Undo `applyShellHeaderOffset`. */
export function clearShellHeaderOffset(root: HTMLElement): void {
  root.style.removeProperty(SHELL_HEADER_VAR)
  root.style.removeProperty("scroll-padding-top")
}
