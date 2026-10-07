import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { tokenize, createToken, NEWLINE, TAB } from '../core/prompt/tokenize'
import { serialize } from '../core/prompt/serialize'
import { applyWeight } from '../core/prompt/weight'
import { toggleBracket, addBracket, removeBracket } from '../core/prompt/brackets'
import { countTokens } from '../core/prompt/tokenCount'
import { isConfigured, translateTexts as apiTranslateTexts } from '../core/translate/index.js'
import { useSettingsStore } from './settings'
import { useTranslationStore } from './translation'
import { useLibraryStore } from './library'

// 编辑器状态：tokens 是唯一数据源，文本输入框与卡片流都从它派生
export const useEditorStore = defineStore('editor', () => {
  const settings = useSettingsStore()

  const tokens = ref([])
  const inputText = ref('')
  const selection = ref([])
  const lastSavedSnapshot = ref('')

  const promptText = computed(() => serialize(tokens.value))
  const tokenCount = computed(() => countTokens(promptText.value))
  const visibleTokens = computed(() => tokens.value.filter((token) => !token.isHidden))
  const hiddenTokens = computed(() => tokens.value.filter((token) => token.isHidden))
  const textTokens = computed(() => tokens.value.filter((token) => !token.isRaw))

  function findById(id) {
    return tokens.value.find((token) => token.id === id) || null
  }

  function selectionTokens() {
    return selection.value.map(findById).filter(Boolean)
  }

  // 从文本输入框同步（用户直接打字/粘贴）
  function setInput(text) {
    inputText.value = text
    tokens.value = tokenize(text, tokens.value, { convert: settings.convertOptions })
    selection.value = selection.value.filter((id) => tokens.value.some((token) => token.id === id))
  }

  // 从 tokens 反向同步文本
  function syncText() {
    inputText.value = serialize(tokens.value)
  }

  function replaceTokens(nextTokens) {
    tokens.value = nextTokens
    syncText()
  }

  function insertTag(text, options = {}) {
    const value = String(text ?? '').trim()
    if (!value) return null
    const token = createToken(value, options)
    tokens.value = tokens.value.concat(token)
    syncText()
    return token
  }

  function insertManyTags(texts) {
    const list = (texts || []).map((text) => String(text ?? '').trim()).filter(Boolean)
    if (!list.length) return
    tokens.value = tokens.value.concat(list.map((text) => createToken(text)))
    syncText()
  }

  function insertRaw(kind) {
    const text = kind === 'tab' ? TAB : NEWLINE
    tokens.value = tokens.value.concat(createToken(text))
    syncText()
  }

  function removeToken(id) {
    tokens.value = tokens.value.filter((token) => token.id !== id)
    selection.value = selection.value.filter((value) => value !== id)
    syncText()
  }

  function removeTokens(ids) {
    const set = new Set(ids)
    tokens.value = tokens.value.filter((token) => !set.has(token.id))
    selection.value = selection.value.filter((value) => !set.has(value))
    syncText()
  }

  function updateToken(id, patch) {
    tokens.value = tokens.value.map((token) => (token.id === id ? { ...token, ...patch } : token))
    syncText()
  }

  function setWeight(id, weight) {
    const token = findById(id)
    if (!token || token.isRaw) return
    updateToken(id, { text: applyWeight(token.text, weight) })
  }

  function setWeightOfSelection(weight) {
    const ids = new Set(selection.value)
    tokens.value = tokens.value.map((token) =>
      ids.has(token.id) && !token.isRaw ? { ...token, text: applyWeight(token.text, weight) } : token
    )
    syncText()
  }

  function toggleTokenBracket(id, type) {
    const token = findById(id)
    if (!token || token.isRaw) return
    updateToken(id, { text: toggleBracket(token.text, type) })
  }

  function addTokenBracket(id, type) {
    const token = findById(id)
    if (!token || token.isRaw) return
    updateToken(id, { text: addBracket(token.text, type) })
  }

  function removeTokenBracket(id, type) {
    const token = findById(id)
    if (!token || token.isRaw) return
    updateToken(id, { text: removeBracket(token.text, type) })
  }

  function toggleHidden(id) {
    const token = findById(id)
    if (!token || token.isNewline) return
    updateToken(id, { isHidden: !token.isHidden })
  }

  function setHiddenForSelection(hidden) {
    const ids = new Set(selection.value)
    tokens.value = tokens.value.map((token) =>
      ids.has(token.id) && !token.isNewline ? { ...token, isHidden: hidden } : token
    )
    syncText()
  }

  function clearHidden() {
    tokens.value = tokens.value.filter((token) => !token.isHidden)
    syncText()
  }

  function moveToken(id, offset) {
    const index = tokens.value.findIndex((token) => token.id === id)
    if (index < 0) return
    const target = index + offset
    if (target < 0 || target >= tokens.value.length) return
    const next = tokens.value.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    tokens.value = next
    syncText()
  }

  function moveTokenTo(id, targetId, position = 'before') {
    if (id === targetId) return
    const next = tokens.value.slice()
    const from = next.findIndex((token) => token.id === id)
    if (from < 0) return
    const [item] = next.splice(from, 1)
    let to = next.findIndex((token) => token.id === targetId)
    if (to < 0) {
      next.push(item)
    } else {
      if (position === 'after') to += 1
      next.splice(to, 0, item)
    }
    tokens.value = next
    syncText()
  }

  function setSelection(ids) {
    selection.value = Array.from(new Set(ids || []))
  }

  function toggleSelection(id) {
    if (selection.value.includes(id)) {
      selection.value = selection.value.filter((value) => value !== id)
    } else {
      selection.value = selection.value.concat(id)
    }
  }

  function clearSelection() {
    selection.value = []
  }

  function selectAll() {
    selection.value = textTokens.value.map((token) => token.id)
  }

  function clearAll() {
    tokens.value = []
    inputText.value = ''
    selection.value = []
  }

  // ---- 历史记录载荷：{prompt, temp_prompt}（旧版载荷里的 lora 字段已随 LoRA 功能移除）----
  function buildHistoryPayload() {
    return {
      prompt: promptText.value,
      temp_prompt: tokens.value.map((token) => ({
        id: token.id,
        text: token.text,
        isRaw: !!token.isRaw,
        isNewline: !!token.isNewline,
        isHidden: !!token.isHidden,
        translate: token.translate,
        color: token.color,
        colorId: token.colorId
      }))
    }
  }

  // 载入历史/收藏：兼容 JSON 载荷、旧 {tokens, lora} 结构、纯文本
  function loadPayload(payload) {
    if (payload == null || payload === '') {
      clearAll()
      return { ok: false, error: 'empty' }
    }

    let data = payload
    if (typeof payload === 'string') {
      const trimmed = payload.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          data = JSON.parse(trimmed)
        } catch (error) {
          data = { prompt: payload }
        }
      } else {
        data = { prompt: payload }
      }
    }

    if (Array.isArray(data)) {
      clearAll()
      setInput(serialize(data.map((item) => createToken(String(item ?? '')))))
      return { ok: true }
    }

    const savedTokens = data.temp_prompt || data.tokens
    const text = data.prompt ?? data.text ?? ''

    if (Array.isArray(savedTokens) && savedTokens.length) {
      tokens.value = savedTokens.map((item) => normalizeSavedToken(item))
      syncText()
      selection.value = []
      return { ok: true }
    }

    clearAll()
    setInput(String(text || ''))
    return { ok: true }
  }

  function normalizeSavedToken(item) {
    if (typeof item === 'string') return createToken(item)
    const text = String(item.text ?? '')
    const isRaw = item.isRaw ?? (text === NEWLINE || text === TAB)
    return {
      id: item.id || createToken(text).id,
      text,
      isRaw,
      isNewline: item.isNewline ?? text === NEWLINE,
      isHidden: !!item.isHidden,
      translate: item.translate,
      color: item.color,
      colorId: item.colorId
    }
  }

  function snapshot() {
    return JSON.stringify(buildHistoryPayload())
  }

  // ---- 译文：词库释义优先，其次本地缓存（API/手动）----
  let translationStoreRef = null
  let libraryRef = null
  function translationStore() {
    if (!translationStoreRef) translationStoreRef = useTranslationStore()
    return translationStoreRef
  }
  function library() {
    if (!libraryRef) libraryRef = useLibraryStore()
    return libraryRef
  }

  function translationDirection() {
    return useSettingsStore().apiTranslation?.direction === 'zh2en' ? 'zh2en' : 'en2zh'
  }

  function resolveTranslation(text) {
    // 中→英：先用「中文释义 → 英文标签」反查表
    if (translationDirection() === 'zh2en') {
      const reverse = library().reverseDescOf(text)
      if (reverse?.text) {
        return { translated: reverse.text, source: 'library', color: reverse.color }
      }
    }
    const fromLibrary = library().descOf(text)
    if (fromLibrary?.desc) {
      return { translated: fromLibrary.desc, source: 'library', color: fromLibrary.color }
    }
    const cached = translationStore().cachedOf(text)
    if (cached?.translated) {
      return { translated: cached.translated, source: cached.source || 'cache' }
    }
    return null
  }

  // 幂等：没有变化时返回原数组，避免 watch 里反复触发
  function attachTranslations(list) {
    let changed = false
    const next = list.map((token) => {
      if (token.isRaw) return token
      const hit = resolveTranslation(token.text)
      if (!hit) {
        if (token.translate === undefined && token.translateSource === undefined) return token
        changed = true
        return { ...token, translate: undefined, translateSource: undefined }
      }
      if (token.translate === hit.translated && token.translateSource === hit.source) return token
      changed = true
      return {
        ...token,
        translate: hit.translated,
        translateSource: hit.source,
        color: hit.color || token.color
      }
    })
    return changed ? next : list
  }

  // 词库索引/译文缓存变化后由 UI 调用
  function refreshTranslations() {
    const next = attachTranslations(tokens.value)
    if (next !== tokens.value) tokens.value = next
    return next
  }

  function isTranslationConfigured() {
    return isConfigured(useSettingsStore().apiTranslation)
  }

  function translationOf(token) {
    if (!token?.translate) return null
    return { translated: token.translate, source: token.translateSource || 'cache' }
  }

  async function lookupTranslation(text) {
    const hit = resolveTranslation(text)
    if (hit) return { translated: hit.translated, source: hit.source }
    await translationStore().ensureCached([text])
    const cached = translationStore().cachedOf(text)
    return cached ? { translated: cached.translated, source: cached.source || 'cache' } : null
  }

  function textTokensNeedingTranslation() {
    return tokens.value.filter((token) => !token.isRaw && !token.translate)
  }

  // 编辑器内未译且词库/缓存都没有的标签
  async function missingTranslations() {
    const candidates = textTokensNeedingTranslation()
    if (!candidates.length) return []
    await translationStore().ensureCached(candidates.map((token) => token.text))
    return candidates
      .filter((token) => !resolveTranslation(token.text))
      .map((token) => ({ text: token.text, tokenId: token.id }))
  }

  /**
   * 翻译文本：词库/缓存命中的直接返回；其余交给 API 并写入缓存。
   * @param {string[]} texts
   * @param {{force?: boolean, onProgress?: Function}} options force=true 时忽略词库/缓存重新请求
   */
  async function translateTexts(texts, { force = false, onProgress } = {}) {
    const settings = useSettingsStore()
    const list = Array.from(new Set((texts || []).map((text) => String(text ?? '').trim()).filter(Boolean)))
    const results = []
    const pending = []

    for (const text of list) {
      if (!force) {
        const hit = resolveTranslation(text)
        if (hit) {
          results.push({ text, translated: hit.translated, source: hit.source, error: null })
          continue
        }
      }
      pending.push(text)
    }

    if (!pending.length) return results

    const config = settings.apiTranslation
    if (!isConfigured(config)) {
      for (const text of pending) {
        results.push({ text, translated: '', source: 'api', error: 'not-configured' })
      }
      return results
    }

    await translationStore().ensureCached(pending)
    const { translations, errors } = await apiTranslateTexts(pending, config, { onProgress })
    const entries = []
    pending.forEach((text, index) => {
      const translated = String(translations?.[index] ?? '').trim()
      if (translated) entries.push({ text, translated })
      results.push({
        text,
        translated,
        source: 'api',
        error: translated ? null : errors?.[0] || 'empty'
      })
    })
    if (entries.length) await translationStore().saveMany(entries, 'api')
    refreshTranslations()
    return results
  }

  async function translateSelectedTokens(ids, options = {}) {
    const targetIds = ids && ids.length ? ids : selection.value
    const set = new Set(targetIds)
    const targets = tokens.value.filter(
      (token) => set.has(token.id) && !token.isRaw
    )
    if (!targets.length) return { ok: 0, fail: 0, total: 0 }
    const rows = await translateTexts(targets.map((token) => token.text), options)
    const ok = rows.filter((row) => row.translated).length
    return { ok, fail: rows.length - ok, total: rows.length }
  }

  async function saveManualTranslation(tokenId, translated) {
    const token = findById(tokenId)
    if (!token || token.isRaw) return null
    const value = String(translated ?? '').trim()
    if (!value) return clearTranslation(tokenId)
    await translationStore().save(token.text, value, 'manual')
    updateToken(tokenId, { translate: value, translateSource: 'manual' })
    return value
  }

  function clearTranslation(tokenId) {
    const token = findById(tokenId)
    if (!token) return
    translationStore().remove(token.text)
    updateToken(tokenId, { translate: undefined, translateSource: undefined })
  }

  // token 变化后自动补译文（幂等，无变化时不写回，避免循环）
  watch(
    tokens,
    () => {
      const next = attachTranslations(tokens.value)
      if (next !== tokens.value) tokens.value = next
    },
    { flush: 'post' }
  )

  return {
    // state
    tokens,
    inputText,
    selection,
    lastSavedSnapshot,
    // getters
    promptText,
    tokenCount,
    visibleTokens,
    hiddenTokens,
    // text sync
    setInput,
    syncText,
    replaceTokens,
    // 编辑操作
    insertTag,
    insertManyTags,
    insertRaw,
    removeToken,
    removeTokens,
    updateToken,
    setWeight,
    setWeightOfSelection,
    toggleTokenBracket,
    addTokenBracket,
    removeTokenBracket,
    toggleHidden,
    setHiddenForSelection,
    clearHidden,
    moveToken,
    moveTokenTo,
    // 选择
    setSelection,
    toggleSelection,
    clearSelection,
    selectAll,
    selectionTokens,
    // 载荷
    buildHistoryPayload,
    loadPayload,
    snapshot,
    // 译文
    translationOf,
    lookupTranslation,
    missingTranslations,
    translateTexts,
    isTranslationConfigured,
    translateSelectedTokens,
    saveManualTranslation,
    clearTranslation,
    refreshTranslations,
    resolveTranslation,
    clearAll
  }
})
