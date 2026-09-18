<script setup lang="ts">
/**
 * Cloudflare Turnstile 验证组件
 *
 * 加载 Turnstile script 并渲染验证小部件。
 * 验证通过后通过 v-model 暴露 token。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  siteKey: string
  /** 主题跟随系统 */
  theme?: 'light' | 'dark' | 'auto'
}>()

const emit = defineEmits<{
  'update:modelValue': [token: string]
}>()

const containerRef = ref<HTMLDivElement>()
const widgetId = ref<string>()

const SCRIPT_ID = 'cf-turnstile-script'

function loadScript(): Promise<void> {
  if (document.getElementById(SCRIPT_ID)) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile script'))
    document.head.appendChild(script)
  })
}

function renderWidget() {
  if (!containerRef.value || !(window as any).turnstile) return

  // 清理已有 widget
  if (widgetId.value) {
    ;(window as any).turnstile.remove(widgetId.value)
  }

  widgetId.value = (window as any).turnstile.render(containerRef.value, {
    sitekey: props.siteKey,
    theme: props.theme || 'auto',
    callback: (token: string) => {
      emit('update:modelValue', token)
    },
    'expired-callback': () => {
      emit('update:modelValue', '')
    },
    'error-callback': () => {
      emit('update:modelValue', '')
    }
  })
}

onMounted(async () => {
  await loadScript()
  renderWidget()
})

onUnmounted(() => {
  if (widgetId.value && (window as any).turnstile) {
    ;(window as any).turnstile.remove(widgetId.value)
  }
})

watch(() => props.siteKey, () => {
  renderWidget()
})
</script>

<template>
  <div ref="containerRef" class="turnstile-container" />
</template>

<style scoped>
.turnstile-container {
  display: flex;
  justify-content: center;
}
</style>
