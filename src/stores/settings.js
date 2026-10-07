import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_CONVERT_OPTIONS } from '../core/prompt/convert'
import { DEFAULT_AUTOCOMPLETE_LIMIT } from '../core/search/autocomplete'
import { DEFAULT_TAG_COLOR } from '../core/exchange/constants'
import { DEFAULT_API_TRANSLATION_CONFIG, normalizeConfig } from '../core/translate/index.js'
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
  // 编辑器右侧面板宽度（拖拽分隔条调整）
  const panelWidth = ref(stored.panelWidth ?? 400)
  // 词库页一级 / 二级分组两栏宽度
  const tagGroupWidth = ref(stored.tagGroupWidth ?? 260)
  const tagSubgroupWidth = ref(stored.tagSubgroupWidth ?? 260)
  // API 翻译配置（密钥只存在本机浏览器）
  const apiTranslation = ref(normalizeConfig(stored.apiTranslation || DEFAULT_API_TRANSLATION_CONFIG))
  // 标签预览图上传选项
  const imageCompress = ref(stored.imageCompress ?? true)
  const imageMaxSize = ref(stored.imageMaxSize ?? 512)
  const imageQuality = ref(stored.imageQuality ?? 0.85)

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
        randomGroups: randomGroups.value,
        panelWidth: panelWidth.value,
        tagGroupWidth: tagGroupWidth.value,
        tagSubgroupWidth: tagSubgroupWidth.value,
        apiTranslation: apiTranslation.value,
        imageCompress: imageCompress.value,
        imageMaxSize: imageMaxSize.value,
        imageQuality: imageQuality.value
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
    if (key === 'imageCompress') imageCompress.value = !!value
    persist()
  }

  function setRandomGroups(groups) {
    randomGroups.value = groups
    persist()
  }

  function setPanelWidth(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return
    panelWidth.value = Math.min(760, Math.max(260, Math.round(num)))
    persist()
  }

  /** 词库页列宽（key: 'group' | 'subgroup'） */
  function setTagColumnWidth(key, value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return
    const width = Math.min(720, Math.max(160, Math.round(num)))
    if (key === 'group') tagGroupWidth.value = width
    else if (key === 'subgroup') tagSubgroupWidth.value = width
    persist()
  }

  function setImageMaxSize(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return
    imageMaxSize.value = Math.min(2048, Math.max(64, Math.round(num)))
    persist()
  }

  function setImageQuality(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return
    imageQuality.value = Math.min(1, Math.max(0.1, Number(num.toFixed(2))))
    persist()
  }

  function updateApiTranslation(patch = {}) {
    apiTranslation.value = normalizeConfig({ ...apiTranslation.value, ...patch })
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
    panelWidth.value = 400
    tagGroupWidth.value = 260
    tagSubgroupWidth.value = 260
    apiTranslation.value = normalizeConfig(DEFAULT_API_TRANSLATION_CONFIG)
    imageCompress.value = true
    imageMaxSize.value = 512
    imageQuality.value = 0.85
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
    panelWidth,
    tagGroupWidth,
    tagSubgroupWidth,
    apiTranslation,
    imageCompress,
    imageMaxSize,
    imageQuality,
    initFromStorage,
    setTheme,
    toggleTheme,
    setLocaleValue,
    updateConvert,
    setAutocompleteLimit,
    setDefaultColor,
    setFlag,
    setPanelWidth,
    setTagColumnWidth,
    setImageMaxSize,
    setImageQuality,
    updateApiTranslation,
    setRandomGroups,
    resetAll
  }
})
