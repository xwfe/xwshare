<script setup lang="ts">
/**
 * 快递高级选项：阅后即焚 + 下载次数限制 + E2E 加密
 */
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { FlameIcon, DownloadIcon, LockIcon } from 'lucide-vue-next'

const { t } = useI18n()

defineProps<{
  burnAfterRead: boolean
  maxDownloads: number
  enableEncryption: boolean
}>()

const emit = defineEmits<{
  'update:burnAfterRead': [value: boolean]
  'update:maxDownloads': [value: number]
  'update:enableEncryption': [value: boolean]
}>()

const isDarkMode = inject('isDarkMode')
</script>

<template>
  <div class="space-y-3">
    <!-- 阅后即焚 -->
    <label
      class="flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-all duration-300"
      :class="[
        burnAfterRead
          ? isDarkMode
            ? 'border-orange-500/30 bg-orange-500/10'
            : 'border-orange-200 bg-orange-50'
          : isDarkMode
            ? 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
            : 'border-slate-200/80 bg-white hover:border-slate-300'
      ]"
    >
      <div class="flex items-center gap-2.5">
        <FlameIcon
          class="h-4 w-4"
          :class="[
            burnAfterRead
              ? 'text-orange-500'
              : isDarkMode
                ? 'text-zinc-500'
                : 'text-slate-400'
          ]"
        />
        <span
          class="text-sm font-medium"
          :class="[isDarkMode ? 'text-zinc-300' : 'text-slate-700']"
        >
          {{ t('send.options.burnAfterRead', '阅后即焚') }}
        </span>
      </div>
      <input
        type="checkbox"
        :checked="burnAfterRead"
        @change="emit('update:burnAfterRead', ($event.target as HTMLInputElement).checked)"
        class="h-4 w-4 rounded accent-orange-500"
      />
    </label>

    <!-- 下载次数限制 -->
    <div
      class="flex items-center justify-between rounded-xl border px-4 py-3 transition-all duration-300"
      :class="[
        isDarkMode
          ? 'border-zinc-800 bg-zinc-950/50'
          : 'border-slate-200/80 bg-white'
      ]"
    >
      <div class="flex items-center gap-2.5">
        <DownloadIcon
          class="h-4 w-4"
          :class="[isDarkMode ? 'text-zinc-500' : 'text-slate-400']"
        />
        <span
          class="text-sm font-medium"
          :class="[isDarkMode ? 'text-zinc-300' : 'text-slate-700']"
        >
          {{ t('send.options.maxDownloads', '下载次数限制') }}
        </span>
      </div>
      <input
        type="number"
        :value="maxDownloads || ''"
        @input="emit('update:maxDownloads', parseInt(($event.target as HTMLInputElement).value) || 0)"
        :placeholder="t('send.options.unlimited', '不限')"
        min="0"
        max="9999"
        class="w-20 rounded-lg border px-2 py-1 text-center text-sm transition-all duration-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        :class="[
          isDarkMode
            ? 'border-zinc-700 bg-zinc-900 text-zinc-200 focus:border-zinc-500'
            : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-400'
        ]"
      />
    </div>

    <!-- E2E 加密 -->
    <label
      class="flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-all duration-300"
      :class="[
        enableEncryption
          ? isDarkMode
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-emerald-200 bg-emerald-50'
          : isDarkMode
            ? 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
            : 'border-slate-200/80 bg-white hover:border-slate-300'
      ]"
    >
      <div class="flex items-center gap-2.5">
        <LockIcon
          class="h-4 w-4"
          :class="[
            enableEncryption
              ? 'text-emerald-500'
              : isDarkMode
                ? 'text-zinc-500'
                : 'text-slate-400'
          ]"
        />
        <div>
          <span
            class="text-sm font-medium"
            :class="[isDarkMode ? 'text-zinc-300' : 'text-slate-700']"
          >
            {{ t('send.options.encryption', '端到端加密') }}
          </span>
          <p
            class="text-xs"
            :class="[isDarkMode ? 'text-zinc-500' : 'text-slate-400']"
          >
            {{ t('send.options.encryptionHint', '密钥仅在链接中，服务器无法解密') }}
          </p>
        </div>
      </div>
      <input
        type="checkbox"
        :checked="enableEncryption"
        @change="emit('update:enableEncryption', ($event.target as HTMLInputElement).checked)"
        class="h-4 w-4 rounded accent-emerald-500"
      />
    </label>
  </div>
</template>
