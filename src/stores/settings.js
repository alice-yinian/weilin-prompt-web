import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_CONVERT_OPTIONS } from '../core/prompt/convert'
import { DEFAULT_AUTOCOMPLETE_LIMIT } from '../core/search/autocomplete'
import { DEFAULT_TAG_COLOR } from '../core/exchange/constants'
import { currentLocale, setLocale } from '../i18n'

const STORAGE_KEY = 'weilin_prompt_web_settings'

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (error) {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const stored = loadStored()

  const theme = ref(stored.theme || 'dark')
  const locale = ref(currentLocale())
  const convertOptions = ref({ ...DEFAULT_CONVERT_OPTIONS, ...(stored.convertOptions || {}) })
  const bracketEscape = ref(stored.bracketEscape ?? false)
  const underscoreToSpace = ref(stored.underscoreToSpace ?? false)
  const autocompleteLimit = ref(stored.autocompleteLimit ?? DEFAULT_AUTOCOMPLETE_LIMIT)
  const defaultColor = ref(stored.defaultColor || DEFAULT_TAG_COLOR)
  const randomGroups = ref(stored.randomGroups || [])

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: theme.value,
        convertOptions: convertOptions.value,
        bracketEscape: bracketEscape.value,
        underscoreToSpace: underscoreToSpace.value,
        autocompleteLimit: autocompleteLimit.value,
        defaultColor: defaultColor.value,
        randomGroups: randomGroups.value
      })
    )
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  function initFromStorage() {
    applyTheme()
    setLocale(locale.value)
  }

  function setTheme(value) {
    theme.value = value === 'light' ? 'light' : 'dark'
    applyTheme()
    persist()
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function setLocaleValue(value) {
    locale.value = value
    setLocale(value)
  }

  function updateConvert(key, value) {
    convertOptions.value = { ...convertOptions.value, [key]: value }
    persist()
  }

  function setAutocompleteLimit(value) {
    const num = Number(value)
    autocompleteLimit.value = Number.isFinite(num) && num > 0 ? Math.min(200, Math.floor(num)) : DEFAULT_AUTOCOMPLETE_LIMIT
    persist()
  }

  function setDefaultColor(value) {
    defaultColor.value = value || DEFAULT_TAG_COLOR
    persist()
  }

  function setFlag(key, value) {
    if (key === 'bracketEscape') bracketEscape.value = !!value
    if (key === 'underscoreToSpace') underscoreToSpace.value = !!value
    persist()
  }

  function setRandomGroups(groups) {
    randomGroups.value = groups
    persist()
  }

  function resetAll() {
    theme.value = 'dark'
    convertOptions.value = { ...DEFAULT_CONVERT_OPTIONS }
    bracketEscape.value = false
    underscoreToSpace.value = false
    autocompleteLimit.value = DEFAULT_AUTOCOMPLETE_LIMIT
    defaultColor.value = DEFAULT_TAG_COLOR
    randomGroups.value = []
    applyTheme()
    persist()
  }

  return {
    theme,
    locale,
    convertOptions,
    bracketEscape,
    underscoreToSpace,
    autocompleteLimit,
    defaultColor,
    randomGroups,
    initFromStorage,
    setTheme,
    toggleTheme,
    setLocaleValue,
    updateConvert,
    setAutocompleteLimit,
    setDefaultColor,
    setFlag,
    setRandomGroups,
    resetAll
  }
})
