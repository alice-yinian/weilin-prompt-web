import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { tokenize, createToken, NEWLINE, TAB } from '../core/prompt/tokenize'
import { serialize } from '../core/prompt/serialize'
import { applyWeight } from '../core/prompt/weight'
import { toggleBracket, addBracket, removeBracket } from '../core/prompt/brackets'
import { buildLoraTag, parseLoraTag, isLoraTag, updateLoraTag } from '../core/prompt/loraTag'
import { countTokens } from '../core/prompt/tokenCount'
import { useSettingsStore } from './settings'

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
  const loraTokens = computed(() => tokens.value.filter((token) => token.isLoraTag))

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

  function addLoraTag(payload) {
    const tag = payload && payload.tag ? payload.tag : buildLoraTag(payload || {})
    return insertTag(tag)
  }

  function updateLoraToken(id, patch) {
    const token = findById(id)
    if (!token) return
    const parsed = parseLoraTag(token.text)
    if (!parsed) return
    updateToken(id, { text: updateLoraTag(token.text, patch) })
  }

  // ---- 历史记录载荷：与上游 {prompt, lora, temp_prompt, temp_lora} 对齐 ----
  function buildHistoryPayload() {
    const visibleLoras = loraTokens.value.filter((token) => !token.isHidden).map(toLoraRecord)
    const allLoras = loraTokens.value.map(toLoraRecord)
    return {
      prompt: promptText.value,
      lora: visibleLoras.length ? visibleLoras : '',
      temp_prompt: tokens.value.map((token) => ({
        id: token.id,
        text: token.text,
        isRaw: !!token.isRaw,
        isNewline: !!token.isNewline,
        isHidden: !!token.isHidden,
        isLoraTag: !!token.isLoraTag,
        translate: token.translate,
        color: token.color,
        colorId: token.colorId
      })),
      temp_lora: allLoras.length ? allLoras : ''
    }
  }

  function toLoraRecord(token) {
    const parsed = parseLoraTag(token.text) || {}
    return {
      name: parsed.name,
      modelWeight: parsed.modelWeight,
      textWeight: parsed.textWeight,
      triggerWeight: parsed.triggerWeight,
      isHidden: !!token.isHidden
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
      isLoraTag: item.isLoraTag ?? (!isRaw && isLoraTag(text)),
      translate: item.translate,
      color: item.color,
      colorId: item.colorId
    }
  }

  function snapshot() {
    return JSON.stringify(buildHistoryPayload())
  }

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
    loraTokens,
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
    // LoRA
    addLoraTag,
    updateLoraToken,
    // 载荷
    buildHistoryPayload,
    loadPayload,
    snapshot,
    clearAll
  }
})
