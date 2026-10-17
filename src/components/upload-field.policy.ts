// Pure rules of UploadField, apart from React so they are unit-testable without a DOM.

export type UploadFieldVariant = 'file' | 'avatar'

/** What a finished upload hands back. `fileId` is the only thing to persist (FK to `files`), never `url`. */
export interface UploadedFile {
  fileId: string
  url: string | null
  filename: string
  mimetype: string
  size: number
}

export interface UploadControllerError {
  /** Stable SDK code (see UPLOAD_ERROR_CODES); anything else renders the generic message. */
  code: string
}

/**
 * The state + actions UploadField needs. The template's `components/` plane may not import the SDK
 * (only `src/infrastructure/archie/**` does), so the field receives this shape; the adapter is
 * `useFileUploader()` in `@/infrastructure/archie/use-file-uploader`.
 */
export interface UploadController {
  upload: (file: File, options: { filename: string; contentType: string }) => Promise<UploadedFile | null>
  /** 0..100, continuous; 100 on success. */
  progress: number
  isUploading: boolean
  error: UploadControllerError | null
  retry: () => Promise<UploadedFile | null>
  abort: () => void
  reset: () => void
}

/** Codes the SDK (>= 0.6.0) can surface from `files.upload`, plus the transport ones. */
export const UPLOAD_ERROR_CODES = [
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'STORAGE_NOT_ENABLED',
  'UPLOAD_AUTH_REQUIRED',
  'UPLOADS_DISABLED',
  'STORAGE_QUOTA_EXCEEDED',
  'REQUEST_ABORTED',
  'TIMEOUT',
  'NETWORK_ERROR',
] as const

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number]

/** Unknown codes fall back to the generic message instead of leaking a raw code. */
export function normalizeErrorCode(code: string | undefined): UploadErrorCode | 'UNKNOWN' {
  return (UPLOAD_ERROR_CODES as readonly string[]).includes(code ?? '') ? (code as UploadErrorCode) : 'UNKNOWN'
}

/** Failures where picking the same file again can succeed (retry shown); the rest need a different file or an admin. */
const RETRYABLE: ReadonlySet<string> = new Set(['REQUEST_ABORTED', 'TIMEOUT', 'NETWORK_ERROR', 'UNKNOWN', 'UPLOAD_AUTH_REQUIRED'])

export function isRetryable(code: string | undefined): boolean {
  return RETRYABLE.has(normalizeErrorCode(code))
}

export const AVATAR_ACCEPT = 'image/*'
export const AVATAR_DEFAULT_MAX_BYTES = 5 * 1024 * 1024

/** Defaults per variant; both are overridable through props. */
export function variantDefaults(variant: UploadFieldVariant): { accept: string | undefined; maxSizeBytes: number | undefined } {
  return variant === 'avatar'
    ? { accept: AVATAR_ACCEPT, maxSizeBytes: AVATAR_DEFAULT_MAX_BYTES }
    : { accept: undefined, maxSizeBytes: undefined }
}

/** Same matching as the native `accept` attribute: `.ext`, `type/*` or `type/sub`, comma separated. */
export function matchesAccept(file: { name: string; type: string }, accept: string | undefined): boolean {
  const tokens = (accept ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return tokens.some((tok) => {
    if (tok.startsWith('.')) return name.endsWith(tok)
    if (tok.endsWith('/*')) return type.startsWith(tok.slice(0, -1))
    return type === tok
  })
}

/** Client-side pre-check; the backend stays the authority (it re-checks MIME and size). Null = ok. */
export function validateFile(
  file: { name: string; type: string; size: number },
  rules: { accept?: string; maxSizeBytes?: number },
): 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' | null {
  if (!matchesAccept(file, rules.accept)) return 'UNSUPPORTED_FILE_TYPE'
  if (rules.maxSizeBytes !== undefined && file.size > rules.maxSizeBytes) return 'FILE_TOO_LARGE'
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}
