import { useFileUpload } from '@archie/react-sdk'
import { useMemo } from 'react'

/**
 * Adapter between the SDK's `useFileUpload()` and the `UploadController` shape `UploadField` consumes
 * (declared in `@/components/upload-field.policy`; matched structurally because infrastructure may not
 * import the components plane). This is the only place the upload SDK is touched.
 *
 * Wire it in the composition root / a container and pass the result as `<UploadField uploader=… />`.
 * Persist `result.fileId` into a relation column to `files`; never `url`. The SDK has no `files.delete`.
 */
export function useFileUploader() {
  const sdk = useFileUpload()
  const { upload, retry, abort, reset, progress, isUploading, error } = sdk

  return useMemo(
    () => ({
      // `filename`/`contentType` are explicit so a renamed/blob-backed file never trips the SDK's *_REQUIRED guards.
      upload: (file: File, options: { filename: string; contentType: string }) => upload(file, options),
      progress,
      isUploading,
      error: error ? { code: error.code } : null,
      retry,
      abort,
      reset,
    }),
    [upload, retry, abort, reset, progress, isUploading, error],
  )
}
