import { FileService, ParcelService, uploadChunkedFile } from '@/services'
import type { AlertType, ApiResponse, ExpireStyle, ExpiresIn, UploadProgress } from '@/types'
import { encryptFile, encryptText, generateEncryptionKey } from '@/utils/crypto'
import { calculateFileHash, packFilesAsZip } from '@/utils/file-processing'
import { usePresignedUpload } from './usePresignedUpload'

type Translate = (
  key: string,
  params?: Record<string, string | number | undefined>
) => string

type UseSendSubmitOptions = {
  getMaxFileSize: () => number
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
  enableChunk: boolean
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
  const { uploadFile: presignUploadFile, reset: resetPresignUpload } = usePresignedUpload({
    getMaxFileSize: options.getMaxFileSize,
    notify: options.notify
  })

  const handleChunkUpload = async (
    file: File,
    expireValue: number,
    expireStyle: string
  ): Promise<ApiResponse> => {
    return uploadChunkedFile(file, {
      expireValue,
      expireStyle,
      onHashCalculated: options.onHashCalculated,
      onProgress: (progress: UploadProgress) => {
        options.onProgress(progress)
      },
      messages: {
        initFailed: options.translate('send.messages.initChunkUploadFailed'),
        chunkFailed: (index) => options.translate('send.messages.chunkUploadFailed', { index }),
        completeFailed: options.translate('send.messages.completeUploadFailed')
      }
    })
  }

  const handlePresignedUpload = async (
    file: File,
    expireValue: number,
    expireStyle: string
  ): Promise<ApiResponse<{ code?: string; name?: string }>> => {
    const code = await presignUploadFile(file, {
      expireValue,
      expireStyle: expireStyle as ExpireStyle,
      onProgress: (progress) => {
        options.onProgress(progress)
      }
    })

    if (!code) {
      throw new Error(options.translate('send.messages.uploadFailed'))
    }

    return {
      code: 200,
      detail: {
        code,
        name: file.name
      }
    }
  }

  const submitFile = async ({
    selectedFile,
    selectedFiles,
    expireValue,
    expireStyle,
    enableChunk,
    validateFileSize,
    burnAfterRead = false,
    maxDownloads = 0,
    enableEncryption = false,
    turnstileToken = ''
  }: SubmitFileOptions): Promise<ApiResponse<{ code?: string; name?: string; encryptionKey?: string }> | null> => {
    let fileToUpload = selectedFile

    if (selectedFiles.length > 0) {
      options.notify('正在打包文件...', 'info')
      fileToUpload = await packFilesAsZip(selectedFiles)
      if (!validateFileSize(fileToUpload)) {
        return null
      }
      options.onHashCalculated(await calculateFileHash(fileToUpload))
    }

    if (!fileToUpload) {
      throw new Error(options.translate('send.messages.selectFile'))
    }

    // 优先使用 Cloudflare Worker Parcel API 直传 R2
    try {
      let key: string | undefined
      let uploadPayload: File | Blob = fileToUpload
      let contentType = fileToUpload.type || 'application/octet-stream'

      if (enableEncryption) {
        options.notify('正在端到端加密文件...', 'info')
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

      if (!parcelRes.uploadUrl) {
        throw new Error('未获取到有效上传地址')
      }

      options.notify('正在上传文件...', 'info')
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
        }
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
    } catch (workerErr) {
      // 如果开启了加密，不允许回退到不支持加密的旧 API（避免明文泄露）
      if (enableEncryption) {
        throw workerErr
      }
      console.warn('Worker Parcel upload failed, falling back:', workerErr)
      const fallbackRes = enableChunk
        ? await handleChunkUpload(fileToUpload, expireValue, expireStyle)
        : await handlePresignedUpload(fileToUpload, expireValue, expireStyle)
      return fallbackRes as ApiResponse<{ code?: string; name?: string; encryptionKey?: string }>
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
  }: SubmitTextOptions): Promise<ApiResponse<{ code?: string; name?: string; encryptionKey?: string }>> => {
    let key: string | undefined
    let contentToUpload = text

    if (enableEncryption) {
      options.notify('正在端到端加密文本...', 'info')
      key = await generateEncryptionKey()
      contentToUpload = await encryptText(text, key)
    }

    try {
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
    } catch (workerErr) {
      // 如果开启了加密，不允许回退到旧 API（避免明文泄露）
      if (enableEncryption) {
        throw workerErr
      }
      console.warn('Worker Parcel create text failed, falling back:', workerErr)
      const fallbackRes = await FileService.uploadText(text, expireValue, expireStyle)
      return fallbackRes as ApiResponse<{ code?: string; name?: string; encryptionKey?: string }>
    }
  }

  return {
    resetPresignUpload,
    submitFile,
    submitText
  }
}
