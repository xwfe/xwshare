import './assets/style/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import i18n from './i18n'

console.info(
  '%c xwshare %c 文件快递柜 %c https://github.com/xwfe/xshare',
  'background:#09090b;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px',
  'background:#3f3f46;color:#fff;padding:2px 6px',
  'background:transparent;color:#71717a;padding:2px 6px;border-radius:0 3px 3px 0'
)

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
