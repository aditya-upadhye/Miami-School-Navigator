import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import en from "@/i18n/locales/en.json"
import es from "@/i18n/locales/es.json"
import { UploadField } from "./upload-field"
import {
  AVATAR_DEFAULT_MAX_BYTES,
  UPLOAD_ERROR_CODES,
  formatBytes,
  isRetryable,
  matchesAccept,
  normalizeErrorCode,
  validateFile,
  variantDefaults,
  type UploadController,
} from "./upload-field.policy"

const idle: UploadController = {
  upload: async () => null,
  progress: 0,
  isUploading: false,
  error: null,
  retry: async () => null,
  abort: () => {},
  reset: () => {},
}

async function render(node: React.ReactNode, lng: "en" | "es" = "en", catalogs: Record<string, object> = { en, es }) {
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: "en",
    resources: Object.fromEntries(Object.entries(catalogs).map(([k, v]) => [k, { translation: v }])),
    interpolation: { escapeValue: false },
  })
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)
}

const field = (uploader: Partial<UploadController> = {}, props: Partial<React.ComponentProps<typeof UploadField>> = {}) => (
  <UploadField label="Photo" uploader={{ ...idle, ...uploader }} onUploaded={() => {}} {...props} />
)

describe("upload-field policy", () => {
  test("avatar defaults: image/* and 5 MB; file has none", () => {
    expect(variantDefaults("avatar")).toEqual({ accept: "image/*", maxSizeBytes: 5 * 1024 * 1024 })
    expect(AVATAR_DEFAULT_MAX_BYTES).toBe(5242880)
    expect(variantDefaults("file")).toEqual({ accept: undefined, maxSizeBytes: undefined })
  })

  test("matchesAccept follows the native accept grammar", () => {
    const png = { name: "a.PNG", type: "image/png" }
    expect(matchesAccept(png, undefined)).toBe(true)
    expect(matchesAccept(png, "image/*")).toBe(true)
    expect(matchesAccept(png, "image/png")).toBe(true)
    expect(matchesAccept(png, ".png,.jpg")).toBe(true)
    expect(matchesAccept(png, "application/pdf")).toBe(false)
    expect(matchesAccept({ name: "a.pdf", type: "application/pdf" }, "image/*")).toBe(false)
  })

  test("validateFile: type first, then size; the limit itself is allowed", () => {
    const rules = { accept: "image/*", maxSizeBytes: 5 * 1024 * 1024 }
    expect(validateFile({ name: "a.pdf", type: "application/pdf", size: 10 }, rules)).toBe("UNSUPPORTED_FILE_TYPE")
    expect(validateFile({ name: "a.png", type: "image/png", size: 5 * 1024 * 1024 + 1 }, rules)).toBe("FILE_TOO_LARGE")
    expect(validateFile({ name: "a.png", type: "image/png", size: 5 * 1024 * 1024 }, rules)).toBeNull()
    expect(validateFile({ name: "a.bin", type: "", size: 1e9 }, {})).toBeNull()
  })

  test("normalizeErrorCode / isRetryable", () => {
    expect(normalizeErrorCode("FILE_TOO_LARGE")).toBe("FILE_TOO_LARGE")
    expect(normalizeErrorCode("SOMETHING_ELSE")).toBe("UNKNOWN")
    expect(normalizeErrorCode(undefined)).toBe("UNKNOWN")
    expect(isRetryable("NETWORK_ERROR")).toBe(true)
    expect(isRetryable("TIMEOUT")).toBe(true)
    expect(isRetryable("FILE_TOO_LARGE")).toBe(false)
    expect(isRetryable("STORAGE_NOT_ENABLED")).toBe(false)
  })

  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(2048)).toBe("2 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB")
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB")
  })
})

describe("upload-field catalogs", () => {
  test("en and es carry a message for every error code, the generic one and every UI string", () => {
    for (const cat of [en, es]) {
      const u = (cat as unknown as { uploadField: { errors: Record<string, string> } & Record<string, unknown> }).uploadField
      for (const code of [...UPLOAD_ERROR_CODES, "UNKNOWN"]) expect(typeof u.errors[code]).toBe("string")
      for (const k of ["chooseFile", "chooseImage", "replace", "cancel", "retry", "uploading", "uploaded", "progressLabel", "previewAlt"]) {
        expect(typeof u[k]).toBe("string")
      }
    }
    // The es copy is translated, not a copy of en.
    expect(es.uploadField.errors.FILE_TOO_LARGE).not.toBe(en.uploadField.errors.FILE_TOO_LARGE)
  })
})

describe("UploadField render", () => {
  test("idle file variant: label bound to the button, hidden input, live region mounted, no progress", async () => {
    const html = await render(field(), "en", { en, es }).then((h) => h)
    expect(html).toMatch(/<label[^>]*for="[^"]+-button"[^>]*>Photo<\/label>/)
    expect(html).toContain("Choose file")
    expect(html).toContain('type="file"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="progressbar"')
    expect(html).not.toContain('accept=')
  })

  test("avatar variant: image/* accept, avatar copy, preview from value", async () => {
    const html = await render(field({}, { variant: "avatar", value: "https://cdn.test/me.png" }))
    expect(html).toContain('accept="image/*"')
    expect(html).toContain("Choose image")
    expect(html).toContain('data-variant="avatar"')
  })

  test("uploading: Progress bound to the controller value, cancel offered, button disabled", async () => {
    const html = await render(field({ isUploading: true, progress: 42.4 }))
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="42"')
    expect(html).toContain("Cancel")
    expect(html).toContain("disabled")
  })

  test("every SDK error code renders its own message in en and es", async () => {
    for (const lng of ["en", "es"] as const) {
      const seen = new Set<string>()
      for (const code of UPLOAD_ERROR_CODES) {
        const html = await render(field({ error: { code } }, { maxSizeBytes: 1024 * 1024 }), lng)
        expect(html).toContain('role="alert"')
        expect(html).not.toContain("uploadField.")
        expect(html).not.toContain("{{")
        const m = html.match(/<span>([^<]*)<\/span><\/p>/)
        expect(m?.[1]).toBeTruthy()
        seen.add(m![1])
      }
      expect(seen.size).toBe(UPLOAD_ERROR_CODES.length)
    }
  })

  test("FILE_TOO_LARGE interpolates the limit; unknown codes use the generic message", async () => {
    const big = await render(field({ error: { code: "FILE_TOO_LARGE" } }, { variant: "avatar" }))
    expect(big).toContain("5 MB")
    const unknown = await render(field({ error: { code: "WEIRD" } }))
    expect(unknown).toContain("The upload failed. Try again.")
  })

  test("English defaults are built in when the catalog lacks the keys", async () => {
    const html = await render(field({ error: { code: "STORAGE_NOT_ENABLED" } }), "en", { en: {} })
    expect(html).toContain("File storage is not set up for this app yet.")
    expect(html).toContain("Choose file")
  })

  test("retry is only offered for retryable errors and after a file was picked (never on first paint)", async () => {
    // No file picked in a static render, so no retry even for a retryable code; the rule itself is policy-tested.
    const html = await render(field({ error: { code: "NETWORK_ERROR" } }))
    expect(html).not.toContain("Try again</button>")
  })
})
