<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAdminParcels, useInjectedDarkMode } from '@/composables'

const { t } = useI18n()
const isDarkMode = useInjectedDarkMode()
const {
  items, total, status, isLoading,
  page, totalPages, hasNext, hasPrev,
  load, remove, changeStatus, nextPage, prevPage
} = useAdminParcels()
</script>

<template>
  <div class="p-6 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">{{ t('admin.fileManage.title') }}</h2>
      <div class="flex items-center gap-2">
        <select
          v-model="status"
          class="rounded-lg border px-3 py-2 text-sm"
          :class="isDarkMode ? 'border-zinc-700 bg-zinc-900' : 'border-slate-200 bg-white'"
          @change="changeStatus"
        >
          <option value="">{{ t('fileManage.all') }}</option>
          <option value="PENDING">PENDING</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="CLAIMED">CLAIMED</option>
        </select>
        <button class="rounded-lg border px-3 py-2 text-sm" type="button" @click="load">
          {{ t('fileManage.refresh') }}
        </button>
      </div>
    </div>
    <p class="text-sm opacity-70">{{ t('fileManage.totalFiles') }}: {{ total }}</p>
    <p v-if="isLoading" class="text-sm">{{ t('common.loading') }}</p>
    <div v-else class="overflow-x-auto rounded-xl border" :class="isDarkMode ? 'border-zinc-800' : 'border-slate-200'">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr :class="isDarkMode ? 'bg-zinc-900' : 'bg-slate-50'">
            <th class="px-3 py-2">{{ t('fileManage.typeLabel') }}</th>
            <th class="px-3 py-2">{{ t('fileRecord.filename') }}</th>
            <th class="px-3 py-2">{{ t('fileManage.statusLabel') }}</th>
            <th class="px-3 py-2">{{ t('retrieve.workspace.expiresAt') }}</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-t" :class="isDarkMode ? 'border-zinc-800' : 'border-slate-100'">
            <td class="px-3 py-2">{{ item.type }}</td>
            <td class="px-3 py-2">{{ item.title || item.id }}</td>
            <td class="px-3 py-2">{{ item.status }}</td>
            <td class="px-3 py-2">{{ item.expires_at }}</td>
            <td class="px-3 py-2 text-right">
              <button type="button" class="text-red-500" @click="remove(item.id)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- 分页控件 -->
    <div v-if="totalPages > 1" class="flex items-center justify-between text-sm">
      <button
        type="button"
        class="rounded-lg border px-3 py-1.5 disabled:opacity-40"
        :disabled="!hasPrev"
        @click="prevPage"
      >
        {{ t('common.previous') }}
      </button>
      <span class="opacity-70">{{ page }} / {{ totalPages }}</span>
      <button
        type="button"
        class="rounded-lg border px-3 py-1.5 disabled:opacity-40"
        :disabled="!hasNext"
        @click="nextPage"
      >
        {{ t('common.next') }}
      </button>
    </div>
  </div>
</template>
