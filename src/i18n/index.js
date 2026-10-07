import { createI18n } from 'vue-i18n'
import zh_CN from './locales/zh_CN'
import en_US from './locales/en_US'

export const SUPPORTED_LOCALES = ['zh_CN', 'en_US']
export const LOCALE_STORAGE_KEY = 'weilin_prompt_web_lang'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: localStorage.getItem(LOCALE_STORAGE_KEY) || 'zh_CN',
  fallbackLocale: 'zh_CN',
  messages: { zh_CN, en_US }
})

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.setAttribute('lang', locale === 'zh_CN' ? 'zh-CN' : 'en')
}

export function currentLocale() {
  return i18n.global.locale.value
}
