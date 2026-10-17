import { describe, expect, mock, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { MemoryRouter } from "react-router"
import en from "@/i18n/locales/en.json"
import es from "@/i18n/locales/es.json"
// Reduced-motion is a media query that bun has no window for: drive the hook through a flag.
const motionState = { reduced: false }
const realMotion = await import("motion/react")
mock.module("motion/react", () => ({ ...realMotion, useReducedMotion: () => motionState.reduced }))
const { NotFound } = await import("./NotFound")
const { resolveBackTarget } = await import("./not-found.policy")

// A fresh instance: the app's config pulls in the browser language detector and the HTTP backend.
async function render(
  lng: "en" | "es",
  props: { inShell?: boolean } = {},
  catalogs: Record<string, object> = { en, es },
) {
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: "en",
    resources: Object.fromEntries(Object.entries(catalogs).map(([k, v]) => [k, { translation: v }])),
    interpolation: { escapeValue: false },
  })
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <NotFound {...props} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe("NotFound", () => {
  test("es: translated copy from the catalog, no Oops", async () => {
    const html = await render("es")
    expect(html).toContain("Página no encontrada")
    expect(html).toContain("Esta página no existe o fue eliminada.")
    expect(html).toContain("Ir al inicio")
    expect(html).toContain("Volver")
    expect(html).not.toMatch(/oops|Page Not Found|notFound\./i)
  })

  test("en: translated copy", async () => {
    const html = await render("en")
    expect(html).toContain("Page not found")
    expect(html).toContain("Go to home")
    expect(html).not.toMatch(/oops/i)
  })

  test("inShell fills its slot instead of the viewport", async () => {
    expect(await render("en")).toContain("min-h-screen")
    const shell = await render("en", { inShell: true })
    expect(shell).not.toContain("min-h-screen")
  })

  test("catalogs ship the same notFound keys", () => {
    expect(Object.keys(es.notFound).sort()).toEqual(Object.keys(en.notFound).sort())
  })
})

describe("converted app (catalog without notFound.*)", () => {
  test("shows the English defaults, never raw keys", async () => {
    for (const lng of ["en", "es"] as const) {
      const html = await render(lng, {}, { en: { app: { title: "x" } }, es: { app: { title: "x" } } })
      expect(html).toContain("Page not found")
      expect(html).toContain("This page doesn&#x27;t exist or was removed.")
      expect(html).toContain("Go to home")
      expect(html).toContain("Go back")
      expect(html).not.toMatch(/notFound\./)
    }
  })
})

describe("accessibility", () => {
  test("standalone is the <main> landmark", async () => {
    const html = await render("en")
    expect(html).toMatch(/^<main\b/)
    expect(html).toContain('aria-labelledby="not-found-title"')
    expect(html).toContain('id="not-found-title"')
  })

  test("inShell is a labelled section, never a second <main>", async () => {
    const html = await render("en", { inShell: true })
    expect(html).toMatch(/^<section\b/)
    expect(html).not.toContain("<main")
  })

  test("infinite decorative loops are off under reduced motion", async () => {
    motionState.reduced = false
    const normal = await render("en")
    expect(normal).toContain("rounded-full") // the floating circles
    motionState.reduced = true
    try {
      const reduced = await render("en")
      expect(reduced).not.toContain("rounded-full")
      expect(reduced).toContain("Page not found") // content untouched
    } finally {
      motionState.reduced = false
    }
  })

  test("Go back falls back to homeHref when there is no history", () => {
    expect(resolveBackTarget(1, "/sales")).toBe("/sales")
    expect(resolveBackTarget(0, "/")).toBe("/")
    expect(resolveBackTarget(2, "/sales")).toBe(-1)
  })
})

describe("Toaster mount", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return sources(p)
      return /\.(tsx?|jsx?)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name) ? [p] : []
    })
  }

  test("exactly one <Toaster in the template source, in main.tsx inside ThemeProvider", () => {
    const srcDir = join(import.meta.dir, "..")
    const hits = sources(srcDir).filter((f) => /<Toaster\b/.test(readFileSync(f, "utf8")))
    expect(hits.map((f) => f.slice(srcDir.length + 1))).toEqual(["main.tsx"])
    const main = readFileSync(join(srcDir, "main.tsx"), "utf8")
    expect(main.match(/<Toaster\b/g)?.length).toBe(1)
    expect(main.indexOf("<ThemeProvider")).toBeLessThan(main.indexOf("<Toaster"))
    expect(main.indexOf("<Toaster")).toBeLessThan(main.indexOf("</ThemeProvider>"))
  })
})
