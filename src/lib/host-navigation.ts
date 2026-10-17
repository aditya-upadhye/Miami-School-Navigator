// Host navigation (ARCH-2212). Template code that moves to another screen (the shell palette, the queue's open-row) used to call
// window.location.assign, which reloads the whole document. A HOST (a converted app's client-links) registers its router's
// navigate here, so those moves stay inside the single-page app. A static prototype page registers nothing and keeps the full load.
// Only same-origin hrefs go to the host, and they arrive as a path (pathname + search + hash): a router treats an absolute URL as a
// relative segment. A cross-origin or unparseable href is always a full load, with the href exactly as given.

export type HostNavigate = (href: string) => void

let current: HostNavigate | null = null

/** Registers the host's navigate; the last registration wins. The returned function unregisters ONLY if `fn` is still current. */
export function registerHostNavigate(fn: HostNavigate): () => void {
  current = fn
  return () => {
    if (current === fn) current = null
  }
}

/** Navigates through the registered host navigator when the href is same-origin, otherwise with a full document load. */
export function navigateTo(href: string): void {
  if (typeof window === "undefined") return
  const navigate = current
  if (navigate) {
    try {
      const url = new URL(href, window.location.href)
      if (url.origin === window.location.origin) {
        navigate(url.pathname + url.search + url.hash)
        return
      }
    } catch {
      // unparseable: fall through to a full load
    }
  }
  window.location.assign(href)
}
