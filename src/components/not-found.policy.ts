/**
 * Where "Go back" should go. With no history entry to return to (deep link, new tab)
 * `navigate(-1)` is a dead click, so fall back to the home target.
 * Kept pure so it is testable without a DOM.
 */
export function resolveBackTarget(historyLength: number, homeHref: string): number | string {
  return historyLength <= 1 ? homeHref : -1
}
