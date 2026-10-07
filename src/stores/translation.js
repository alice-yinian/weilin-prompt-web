import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  translationKey,
  getTranslation,
  getTranslations,
  listTranslations,
  putTranslation,
  putTranslations,
  deleteTranslation,
  clearTranslations,
  translationCount
} from '../data/repos/translations'
import { timestampSuffix } from '../utils/format'

// 缓存键带方向：en2zh 沿用旧纯文本键，zh2en 带方向前缀（由 repos 的 translationKey 统一）
function keyOf(text, direction = 'en2zh') {
  return translationKey(text, direction)
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// 译文缓存：词库释义优先，其次本地缓存（API/手动），都由这里统一解析
export const useTranslationStore = defineStore('translation', () => {
  const cache = ref(new Map())
  const count = ref(0)
  const loading = ref(false)

  function applyRecords(records) {
    const next = new Map(cache.value)
    for (const record of records) next.set(record.textLower, record)
    cache.value = next
  }

  async function refresh() {
    loading.value = true
    try {
      const records = await listTranslations()
      const map = new Map()
      for (const record of records) map.set(record.textLower, record)
      cache.value = map
      count.value = records.length
      return count.value
    } finally {
      loading.value = false
    }
  }

  // 确保这些文本已从 IndexedDB 载入缓存（批量、幂等）
  async function ensureCached(texts, direction = 'en2zh') {
    const missing = []
    for (const text of texts || []) {
      const key = keyOf(text, direction)
      if (key && !cache.value.has(key)) missing.push(text)
    }
    if (!missing.length) return
    const found = await getTranslations(missing, direction)
    if (!found.size) return
    const next = new Map(cache.value)
    for (const record of found.values()) next.set(record.textLower, record)
    cache.value = next
    count.value = next.size
  }

  function cachedOf(text, direction = 'en2zh') {
    const key = keyOf(text, direction)
    return key ? cache.value.get(key) || null : null
  }

  async function save(text, translated, source = 'manual', direction = 'en2zh') {
    const value = String(translated ?? '').trim()
    if (!keyOf(text, direction) || !value) return null
    const record = await putTranslation(text, value, source, direction)
    applyRecords([record])
    count.value = cache.value.size
    return record
  }

  async function saveMany(entries, source = 'api', direction = 'en2zh') {
    const written = await putTranslations(entries, source, direction)
    const rows = (entries || [])
      .filter((entry) => entry && keyOf(entry.text, direction) && String(entry.translated ?? '').trim())
      .map((entry) => ({
        textLower: keyOf(entry.text, direction),
        text: String(entry.text).trim(),
        translated: String(entry.translated).trim(),
        source,
        direction: direction === 'zh2en' ? 'zh2en' : 'en2zh',
        updatedAt: Date.now()
      }))
    applyRecords(rows)
    count.value = cache.value.size
    return written
  }

  async function remove(text, direction = 'en2zh') {
    const ok = await deleteTranslation(text, direction)
    if (ok) {
      const next = new Map(cache.value)
      next.delete(keyOf(text, direction))
      cache.value = next
      count.value = next.size
    }
    return ok
  }

  async function clearAll() {
    const removed = await clearTranslations()
    cache.value = new Map()
    count.value = 0
    return removed
  }

  async function list({ limit } = {}) {
    return listTranslations({ limit })
  }

  async function getOne(text, direction = 'en2zh') {
    return getTranslation(text, direction)
  }

  // 供翻译面板导出：json / csv
  async function exportAll(format = 'json') {
    const records = await listTranslations()
    const stamp = timestampSuffix()
    if (format === 'csv') {
      const lines = ['text,translated,source,direction,updatedAt']
      for (const record of records) {
        lines.push(
          [
            csvCell(record.text),
            csvCell(record.translated),
            csvCell(record.source),
            csvCell(record.direction || 'en2zh'),
            record.updatedAt
          ].join(',')
        )
      }
      return {
        filename: `weilin-translations-${stamp}.csv`,
        content: '\ufeff' + lines.join('\n'),
        count: records.length
      }
    }
    return {
      filename: `weilin-translations-${stamp}.json`,
      content: JSON.stringify(
        { format: 'weilin-translations', formatVersion: 1, exportedAt: Date.now(), translations: records },
        null,
        2
      ),
      count: records.length
    }
  }

  return {
    cache,
    count,
    loading,
    refresh,
    ensureCached,
    cachedOf,
    save,
    saveMany,
    remove,
    clearAll,
    list,
    getOne,
    exportAll,
    refreshCount: async () => {
      count.value = await translationCount()
      return count.value
    }
  }
})
