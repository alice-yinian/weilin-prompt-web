import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useSettingsStore } from './stores/settings'
import './styles/theme.css'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// 主题与语言需要在挂载前落到 <html> 上，避免首屏闪烁
const settings = useSettingsStore()
settings.initFromStorage()

app.mount('#app')
