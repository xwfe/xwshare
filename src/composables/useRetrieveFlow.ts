import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { ParcelService } from '@/services'
import { useAlertStore } from '@/stores/alertStore'
import { useFileDataStore } from '@/stores/fileData'
import type { ReceivedFileRecord } from '@/types'
import { copyToClipboard } from '@/utils/clipboard'
import { getErrorMessage } from '@/utils/common'
import { renderMarkdownPreview } from '@/utils/content-preview'
import { decryptText, extractEncryptionKey } from '@/utils/crypto'
import { downloadReceivedRecord } from '@/utils/download-action'

type InputStatus = {
  readonly: boolean
  loading: boolean
}

export function useRetrieveFlow() {
  const { t } = useI18n()
  const alertStore = useAlertStore()
  const fileStore = useFileDataStore()
  const { receiveData: records } = storeToRefs(fileStore)

  const code = ref('')
  const isRetrieving = ref(false)
  const inputStatus = ref<InputStatus>({
    readonly: false,
    loading: false
  })
  const error = ref('')
  const selectedRecord = ref<ReceivedFileRecord | null>(null)
  const previewMediaRecord = ref<ReceivedFileRecord | null>(null)
  const showDrawer = ref(false)
  const showPreview = ref(false)
  const showMediaPreview = ref(false)
  const renderedContent = ref('')
  const normalizedCode = computed(() => code.value.trim())
  const isWorking = computed(() => isRetrieving.value)
  const hasValidCode = computed(() => normalizedCode.value.length === 6)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 ' + t('fileSize.bytes')
    const k = 1024
    const sizes = [
      t('fileSize.bytes'),
      t('fileSize.kb'),
      t('fileSize.mb'),
      t('fileSize.gb'),
      t('fileSize.tb')
    ]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / k ** i).toFixed(2)) + ' ' + sizes[i]
  }

  const handleSubmit = async () => {
    if (!hasValidCode.value) {
      alertStore.showAlert(t('retrieve.messages.invalidCode'), 'error')
      return
    }

    isRetrieving.value = true
    inputStatus.value.readonly = true
    inputStatus.value.loading = true
    error.value = ''

    try {
      const encryptionKey = extractEncryptionKey(window.location.hash) || undefined
      const pRes = await ParcelService.pickup(normalizedCode.value)
      let content = pRes.content ?? null

      if (pRes.encrypted && content) {
        if (encryptionKey) {
          try {
            content = await decryptText(content, encryptionKey)
          } catch (decErr) {
            console.error('Text decryption failed:', decErr)
            alertStore.showAlert(t('retrieve.messages.decryptFailed'), 'error')
          }
        } else {
          alertStore.showAlert(t('retrieve.messages.encryptionKeyRequired'), 'warning')
        }
      }

      const parcelData: ReceivedFileRecord = {
        id: Date.now(),
        code: normalizedCode.value,
        filename: pRes.fileName || pRes.title || (pRes.type === 'file' ? 'File' : 'Text'),
        size: pRes.fileSize
          ? formatFileSize(pRes.fileSize)
          : content
            ? `${(content.length / 1024).toFixed(2)} KB`
            : '0 KB',
        downloadUrl: pRes.downloadUrl ?? null,
        content,
        date: new Date().toLocaleString(),
        type: pRes.type === 'file' ? 'file' : 'text',
        burnAfterRead: pRes.burnAfterRead,
        encrypted: pRes.encrypted,
        encryptionKey
      }

      if (pRes.burnAfterRead) {
        alertStore.showAlert(t('retrieve.messages.burnedAfterRead'), 'warning')
      }

      const existingIndex = fileStore.receiveData.findIndex((file) => file.code === parcelData.code)
      if (existingIndex !== -1) {
        fileStore.deleteReceiveData(existingIndex)
      }
      fileStore.addReceiveData(parcelData)
      selectedRecord.value = parcelData
      if (parcelData.content) {
        showPreview.value = true
      }
      alertStore.showAlert(t('retrieve.messages.retrieveSuccess'), 'success')
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, t('retrieve.messages.unknownError'))
      error.value = errorMessage
      alertStore.showAlert(t('retrieve.messages.networkError') + errorMessage, 'error')
    } finally {
      isRetrieving.value = false
      inputStatus.value.readonly = false
      inputStatus.value.loading = false
      code.value = ''
    }
  }

  const copyContent = async () => {
    if (selectedRecord.value?.content) {
      await copyToClipboard(selectedRecord.value.content, {
        successMsg: t('fileRecord.contentCopied'),
        errorMsg: t('fileRecord.copyFailed'),
        notify: (message, type) => alertStore.showAlert(message, type)
      })
    }
  }

  const viewDetails = (record: ReceivedFileRecord) => {
    selectedRecord.value = record
  }

  const closeDetails = () => {
    selectedRecord.value = null
  }

  const deleteRecord = (id: number) => {
    const index = records.value.findIndex((record) => record.id === id)
    if (index !== -1) {
      fileStore.deleteReceiveData(index)
    }
  }

  const toggleDrawer = () => {
    showDrawer.value = !showDrawer.value
  }

  const downloadRecord = async (record: ReceivedFileRecord) => {
    try {
      await downloadReceivedRecord(record)
    } catch (err: unknown) {
      alertStore.showAlert(getErrorMessage(err, t('common.downloadFailed')), 'error')
    }
  }

  const showContentPreview = () => {
    showPreview.value = true
  }

  const closeContentPreview = () => {
    showPreview.value = false
  }

  const showFilePreview = () => {
    if (!selectedRecord.value) return
    previewMediaRecord.value = selectedRecord.value
    showMediaPreview.value = true
  }

  const closeFilePreview = () => {
    showMediaPreview.value = false
    previewMediaRecord.value = null
  }

  onMounted(() => {
    const urlParams = new URLSearchParams(window.location.search)
    let autoCode = urlParams.get('code')
    if (!autoCode && window.location.hash.includes('code=')) {
      const hashQuery = window.location.hash.split('?')[1]
      if (hashQuery) {
        const hp = new URLSearchParams(hashQuery)
        autoCode = hp.get('code')
      }
    }
    if (autoCode && autoCode.trim().length === 6) {
      code.value = autoCode.trim()
    }
  })

  watch(
    () => selectedRecord.value?.content,
    async (content) => {
      if (content) {
        renderedContent.value = await renderMarkdownPreview(content)
      } else {
        renderedContent.value = ''
      }
    },
    { immediate: true }
  )

  watch(normalizedCode, (nextCode) => {
    if (nextCode.length < 6 && error.value) {
      error.value = ''
    }
  })

  return {
    code,
    isRetrieving,
    isWorking,
    hasValidCode,
    inputStatus,
    error,
    records,
    selectedRecord,
    previewMediaRecord,
    showDrawer,
    showPreview,
    showMediaPreview,
    renderedContent,
    closeFilePreview,
    closeContentPreview,
    closeDetails,
    copyContent,
    deleteRecord,
    downloadRecord,
    handleSubmit,
    showFilePreview,
    showContentPreview,
    toggleDrawer,
    viewDetails
  }
}
