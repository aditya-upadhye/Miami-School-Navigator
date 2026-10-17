import { useEffect, useState } from "react"

// Pages are static HTML files, one per screen: `<slug>.html`.
export function href(slug: string, params?: Record<string, string> | URLSearchParams | string[][]): string {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return `${slug}.html${qs}`
}

// SSR has no URL, so the first render (server and hydration) returns `fallback`;
// the real query value arrives right after mount. Screens render a sensible
// default record first and switch when the id is known.
// (Read once on mount, exactly as apg does.)
export function useQueryParam(name: string): string | null
export function useQueryParam<F>(name: string, fallback: F): string | F
export function useQueryParam(name: string, fallback: unknown = null): unknown {
  const [value, setValue] = useState<unknown>(fallback)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(name)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apg's one-shot read after mount (the first render must equal the server's)
    if (v !== null) setValue(v)
  }, [name])
  return value
}
