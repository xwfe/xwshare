import { computed, onMounted, ref } from 'vue'
import { AdminParcelService, type AdminParcel } from '@/services'
import { useAlertStore } from '@/stores/alertStore'
import { getErrorMessage } from '@/utils/common'

const PAGE_SIZE = 50

export function useAdminParcels() {
  const alertStore = useAlertStore()
  const items = ref<AdminParcel[]>([])
  const total = ref(0)
  const status = ref('')
  const isLoading = ref(false)
  const page = ref(1)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const hasNext = computed(() => page.value < totalPages.value)
  const hasPrev = computed(() => page.value > 1)

  const load = async () => {
    isLoading.value = true
    try {
      const offset = (page.value - 1) * PAGE_SIZE
      const data = await AdminParcelService.list(status.value, PAGE_SIZE, offset)
      items.value = data.items
      total.value = data.total
    } catch (error: unknown) {
      alertStore.showAlert(getErrorMessage(error, '加载失败'), 'error')
    } finally {
      isLoading.value = false
    }
  }

  const remove = async (id: string) => {
    try {
      await AdminParcelService.remove(id)
      await load()
    } catch (error: unknown) {
      alertStore.showAlert(getErrorMessage(error, '删除失败'), 'error')
    }
  }

  /** 切换状态筛选时重置到第 1 页 */
  const changeStatus = () => {
    page.value = 1
    void load()
  }

  const nextPage = () => {
    if (hasNext.value) {
      page.value++
      void load()
    }
  }

  const prevPage = () => {
    if (hasPrev.value) {
      page.value--
      void load()
    }
  }

  onMounted(() => {
    void load()
  })

  return {
    items,
    total,
    status,
    isLoading,
    page,
    totalPages,
    hasNext,
    hasPrev,
    load,
    remove,
    changeStatus,
    nextPage,
    prevPage
  }
}
