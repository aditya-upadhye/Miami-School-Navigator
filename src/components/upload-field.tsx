import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { CircleAlert, CircleCheck, RotateCw, Upload, User, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  formatBytes,
  isRetryable,
  normalizeErrorCode,
  validateFile,
  variantDefaults,
  type UploadController,
  type UploadedFile,
  type UploadErrorCode,
  type UploadFieldVariant,
} from './upload-field.policy'

export type { UploadController, UploadedFile, UploadFieldVariant } from './upload-field.policy'

export interface UploadFieldProps {
  /** `file`: any file. `avatar`: round image preview, `image/*`, 5 MB pre-check by default. */
  variant?: UploadFieldVariant
  /** Visible label and accessible name of the control. Translate it at the call site. */
  label: string
  /** Optional help text under the control (linked with aria-describedby). */
  description?: string
  /**
   * Upload state + actions. Build it with `useFileUploader()` from
   * `@/infrastructure/archie/use-file-uploader` (the only module that touches the SDK).
   */
  uploader: UploadController
  /** Called once with the stored file. Persist `fileId` in a relation column to `files`, never `url`. */
  onUploaded: (file: UploadedFile) => void
  /** Called with a stable code when the pre-check or the upload fails (e.g. to also raise a toast). */
  onError?: (code: UploadErrorCode | 'UNKNOWN') => void
  /** `avatar` only: URL of the image already saved, shown until a new file is picked. */
  value?: string | null
  /** Native `accept` string. Defaults: none for `file`, `image/*` for `avatar`. */
  accept?: string
  /** Client-side pre-check, in bytes (the backend still enforces its own limit). Defaults: none for `file`, 5 MB for `avatar`. */
  maxSizeBytes?: number
  disabled?: boolean
  id?: string
  className?: string
}

interface Picked {
  file: File
  previewUrl: string | null
}

/**
 * File / avatar upload control with real progress, retry and abort. Presentational over an injected
 * `UploadController` because the `components/` plane may not import the SDK (lint law L37).
 *
 * A11y: native file input (visually hidden, driven by a labelled button), a polite live region for
 * status, `role="alert"` for errors, and the progress bar is named after the file.
 *
 * @example
 * const uploader = useFileUploader()
 * <UploadField variant="avatar" label={t('profile.avatar')} uploader={uploader}
 *   onUploaded={({ fileId }) => saveAvatar(fileId)} />
 */
export function UploadField({
  variant = 'file',
  label,
  description,
  uploader,
  onUploaded,
  onError,
  value,
  accept,
  maxSizeBytes,
  disabled,
  id,
  className,
}: UploadFieldProps) {
  const { t } = useTranslation()
  const autoId = useId()
  const base = id ?? autoId
  const buttonId = `${base}-button`
  const inputId = `${base}-input`
  const statusId = `${base}-status`
  const descId = `${base}-desc`

  const defaults = variantDefaults(variant)
  const effectiveAccept = accept ?? defaults.accept
  const effectiveMax = maxSizeBytes ?? defaults.maxSizeBytes

  const inputRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [done, setDone] = useState<UploadedFile | null>(null)
  // Pre-check failures never reach the controller, so they live here.
  const [localError, setLocalError] = useState<UploadErrorCode | null>(null)

  const { isUploading, abort } = uploader
  // Latest values for the unmount cleanup and the error notifier; refs so identity changes of the
  // SDK callbacks never re-run (and thereby fire) the cleanup.
  const latest = useRef({ picked, isUploading, abort, onError })
  useEffect(() => {
    latest.current = { picked, isUploading, abort, onError }
  })
  // Object URLs are not garbage-collected with the component; revoke on unmount and stop an upload in flight.
  useEffect(
    () => () => {
      const { picked: p, isUploading: busy, abort: stop } = latest.current
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl)
      if (busy) stop()
    },
    [],
  )
  // Surface controller failures (upload errors) to the caller once per error instance.
  const controllerError = uploader.error
  useEffect(() => {
    if (controllerError) latest.current.onError?.(normalizeErrorCode(controllerError.code))
  }, [controllerError])

  const finish = useCallback(
    (result: UploadedFile | null) => {
      if (result) {
        setDone(result)
        onUploaded(result)
      }
    },
    [onUploaded],
  )

  const fail = useCallback(
    (code: UploadErrorCode) => {
      setLocalError(code)
      onError?.(code)
    },
    [onError],
  )

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input so picking the same file again re-fires change.
    event.target.value = ''
    if (!file) return

    setLocalError(null)
    setDone(null)
    uploader.reset()

    const rejected = validateFile(file, { accept: effectiveAccept, maxSizeBytes: effectiveMax })
    if (rejected) {
      fail(rejected)
      return
    }

    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl)
    const previewUrl = variant === 'avatar' && file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    setPicked({ file, previewUrl })

    const result = await uploader.upload(file, { filename: file.name, contentType: file.type || 'application/octet-stream' })
    finish(result)
  }

  async function handleRetry() {
    setLocalError(null)
    finish(await uploader.retry())
  }

  function handleAbort() {
    abort()
  }

  const errorCode: UploadErrorCode | 'UNKNOWN' | null = localError ?? (uploader.error ? normalizeErrorCode(uploader.error.code) : null)
  const canRetry = !localError && uploader.error !== null && isRetryable(uploader.error.code) && picked !== null
  const name = picked?.file.name ?? ''
  const progress = Math.max(0, Math.min(100, Math.round(uploader.progress)))

  const errorText = errorCode
    ? t(`uploadField.errors.${errorCode}`, {
        defaultValue: ERROR_FALLBACK[errorCode],
        max: formatBytes(effectiveMax ?? 0),
      })
    : null

  let status = ''
  if (uploader.isUploading) status = t('uploadField.uploading', { defaultValue: 'Uploading {{name}}', name })
  else if (done) status = t('uploadField.uploaded', { defaultValue: '{{name}} uploaded', name: done.filename })

  const buttonLabel = done || picked
    ? t('uploadField.replace', { defaultValue: 'Choose another' })
    : variant === 'avatar'
      ? t('uploadField.chooseImage', { defaultValue: 'Choose image' })
      : t('uploadField.chooseFile', { defaultValue: 'Choose file' })

  const previewSrc = picked?.previewUrl ?? value ?? undefined
  const describedBy = [description ? descId : null, statusId].filter(Boolean).join(' ')

  return (
    <div data-slot="upload-field" data-variant={variant} className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={buttonId}>{label}</Label>

      <div className={cn('flex gap-4', variant === 'avatar' ? 'items-center' : 'flex-col items-start')}>
        {variant === 'avatar' ? (
          <Avatar className="size-20">
            {previewSrc ? <AvatarImage src={previewSrc} alt={t('uploadField.previewAlt', { defaultValue: 'Selected image preview' })} /> : null}
            <AvatarFallback aria-hidden="true">
              <User className="size-8 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2 self-stretch">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              accept={effectiveAccept}
              disabled={disabled || uploader.isUploading}
              onChange={handleChange}
            />
            <Button
              id={buttonId}
              type="button"
              variant="outline"
              disabled={disabled || uploader.isUploading}
              aria-describedby={describedBy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              {buttonLabel}
            </Button>

            {uploader.isUploading ? (
              <Button type="button" variant="ghost" onClick={handleAbort}>
                <X aria-hidden="true" />
                {t('uploadField.cancel', { defaultValue: 'Cancel' })}
              </Button>
            ) : null}

            {canRetry ? (
              <Button type="button" variant="ghost" onClick={handleRetry}>
                <RotateCw aria-hidden="true" />
                {t('uploadField.retry', { defaultValue: 'Try again' })}
              </Button>
            ) : null}
          </div>

          {uploader.isUploading ? (
            <Progress
              value={progress}
              // Explicit as well: the value must reach assistive tech even if the ui/progress primitive is regenerated.
              aria-valuenow={progress}
              aria-label={t('uploadField.progressLabel', { defaultValue: 'Upload progress for {{name}}', name })}
            />
          ) : null}

          {picked && !uploader.isUploading && !errorText ? (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              {done ? <CircleCheck className="size-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
              <span className="truncate">{name}</span>
            </p>
          ) : null}

          {/* Always mounted so assistive tech registers the region before its text changes. */}
          <p id={statusId} role="status" aria-live="polite" className="sr-only">
            {status}
          </p>

          {errorText ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{errorText}</span>
            </p>
          ) : null}

          {description ? (
            <p id={descId} className="text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// English defaults built in (like NotFound): a generated catalog that lacks the keys never shows raw keys.
const ERROR_FALLBACK: Record<UploadErrorCode | 'UNKNOWN', string> = {
  FILE_TOO_LARGE: 'This file is too large. The maximum size is {{max}}.',
  UNSUPPORTED_FILE_TYPE: 'This file type is not allowed.',
  STORAGE_NOT_ENABLED: 'File storage is not set up for this app yet.',
  UPLOAD_AUTH_REQUIRED: 'Sign in again to upload files.',
  UPLOADS_DISABLED: 'Uploads are turned off for this app.',
  STORAGE_QUOTA_EXCEEDED: 'The storage limit has been reached.',
  REQUEST_ABORTED: 'The upload was cancelled.',
  TIMEOUT: 'The upload took too long. Try again.',
  NETWORK_ERROR: 'Network problem. Check your connection and try again.',
  UNKNOWN: 'The upload failed. Try again.',
}
