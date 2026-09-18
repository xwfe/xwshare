import { ParcelService } from '@/services'
import type { AlertType, ApiResponse, ExpiresIn, UploadProgress } from '@/types'
import { encryptFile, encryptText, generateEncryptionKey } from '@/utils/crypto'
import { calculateFileHash, packFilesAsZip } from '@/utils/file-processing'

type Translate = (
  key: string,
  params?: Record<string, string | number | undefined>
) => string

type UseSendSubmitOptions = {
  notify: (message: string, type: AlertType) => void
  translate: Translate
  onProgress: (progress: UploadProgress) => void
  onHashCalculated: (hash: string) => void
}

export type SubmitFileOptions = {
  selectedFile: File | null
  selectedFiles: File[]
  expireValue: number
  expireStyle: string
  validateFileSize: (file: File) => boolean
  burnAfterRead?: boolean
  maxDownloads?: number
  enableEncryption?: boolean
  turnstileToken?: string
}

export type SubmitTextOptions = {
  text: string
  expireValue: number
  expireStyle: string
  burnAfterRead?: boolean
  maxDownloads?: number
  enableEncryption?: boolean
  turnstileToken?: string
}

function normalizeExpiresIn(method: string, value: number): ExpiresIn {
  if (method === 'hour' && value <= 1) return '1h'
  if (method === 'minute' && value <= 60) return '1h'
  if (method === 'day' && value >= 7) return '7d'
  if (method === 'hour' && value > 24) return '7d'
  return '1d'
}

export function useSendSubmit(options: UseSendSubmitOptions) {
  const submitFile = async ({
    selectedFile,
    selectedFiles,
    expireValue,
    expireStyle,
    validateFileSize,
    burnAfterRead = false,
    maxDownloads = 0,
    enableEncryption = false,
    turnstileToken = ''
  }: SubmitFileOptions): Promise<ApiResponse<{
    code?: string
    name?: string
    encryptionKey?: string
  }> | null> => {
    let fileToUpload = selectedFile

    if (selectedFiles.length > 0) {
      options.notify(options.translate('send.messages.packingFiles'), 'info')
      fileToUpload = await packFilesAsZip(selectedFiles)
      if (!validateFileSize(fileToUpload)) {
        return null
      }
      options.onHashCalculated(await calculateFileHash(fileToUpload))
    }

    if (!fileToUpload) {
      throw new Error(options.translate('send.messages.selectFile'))
    }

    let key: string | undefined
    let uploadPayload: File | Blob = fileToUpload
    let contentType = fileToUpload.type || 'application/octet-stream'

    if (enableEncryption) {
      options.notify(options.translate('send.messages.encryptingFile'), 'info')
      key = await generateEncryptionKey()
      uploadPayload = await encryptFile(fileToUpload, key)
      contentType = 'application/octet-stream'
    }

    const expiresIn = normalizeExpiresIn(expireStyle, expireValue)
    const parcelRes = await ParcelService.createFileParcel({
      fileName: fileToUpload.name,
      fileSize: uploadPayload.size,
      contentType,
      expiresIn,
      burnAfterRead,
      maxDownloads: maxDownloads > 0 ? maxDownloads : undefined,
      turnstileToken,
      encrypted: enableEncryption
    })

    if (!parcelRes.uploadUrl || !parcelRes.uploadToken) {
      throw new Error(options.translate('send.messages.missingUploadUrl'))
    }

    options.notify(options.translate('send.messages.uploadingFile'), 'info')
    await ParcelService.uploadFile(
      parcelRes.uploadUrl,
      uploadPayload,
      contentType,
      (loaded, total) => {
        options.onProgress({
          loaded,
          total,
          percentage: Math.min(100, Math.round((loaded / total) * 100))
        })
      },
      parcelRes.uploadToken
    )

    await ParcelService.confirmUpload(parcelRes.code)

    return {
      code: 200,
      detail: {
        code: parcelRes.code,
        name: fileToUpload.name,
        encryptionKey: key
      }
    }
  }

  const submitText = async ({
    text,
    expireValue,
    expireStyle,
    burnAfterRead = false,
    maxDownloads = 0,
    enableEncryption = false,
    turnstileToken = ''
  }: SubmitTextOptions): Promise<ApiResponse<{
    code?: string
    name?: string
    encryptionKey?: string
  }>> => {
    let key: string | undefined
    let contentToUpload = text

    if (enableEncryption) {
      options.notify(options.translate('send.messages.encryptingText'), 'info')
      key = await generateEncryptionKey()
      contentToUpload = await encryptText(text, key)
    }

    const expiresIn = normalizeExpiresIn(expireStyle, expireValue)
    const parcelRes = await ParcelService.createTextParcel({
      type: 'text',
      content: contentToUpload,
      expiresIn,
      burnAfterRead,
      maxDownloads: maxDownloads > 0 ? maxDownloads : undefined,
      turnstileToken,
      encrypted: enableEncryption
    })

    return {
      code: 200,
      detail: {
        code: parcelRes.code,
        name: 'Text',
        encryptionKey: key
      }
    }
  }

  return {
    submitFile,
    submitText
  }
}
