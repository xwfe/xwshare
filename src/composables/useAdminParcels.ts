import { onMounted, ref } from 'vue'
import { AdminParcelService, type AdminParcel } from '@/services'
import { useAlertStore } from '@/stores/alertStore'
import { getErrorMessage } from '@/utils/common'

export function useAdminParcels() {
  const alertStore = useAlertStore()
  const items = ref<AdminParcel[]>([])
  const total = ref(0)
  const status = ref('')
  const isLoading = ref(false)

  const load = async () => {
    isLoading.value = true
    try {
      const data = await AdminParcelService.list(status.value)
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

  onMounted(() => {
    void load()
  })

  return {
    items,
    total,
    status,
    isLoading,
    load,
    remove
  }
}
