import { STORES, withTx, countStore } from '../db.js'
import { toArray, requireText } from '../util.js'

/**
 * 译文缓存（开发计划本轮新增）。
 *
 * keyPath = textLower（原文去掉首尾空格后小写），大小写/空格差异共用同一条缓存；
 * 字段：{textLower, text, translated, source, updatedAt}
 * 索引：updatedAt（列表按最近更新降序）。
 *
 * `text` 保留用户输入的原始大小写，`translated` 是译文；
 * `source` 只允许 'library'（词库 desc）| 'api'（在线接口）| 'manual'（手动编辑）。
 */

export const TRANSLATION_SOURCES = Object.freeze(['library', 'api', 'manual'])

/** 归一化缓存键：去首尾空格 + 小写；非字符串按空串处理 */
export function translationKey(text) {
  if (typeof text !== 'string') return ''
  return text.trim().toLowerCase()
}

function normalizeSource(source) {
  return TRANSLATION_SOURCES.includes(source) ? source : 'manual'
}

// 同一毫秒内的连续写入也要有严格递增的 updatedAt，否则列表顺序不确定
let lastUpdatedAt = 0

function nextUpdatedAt() {
  lastUpdatedAt = Math.max(lastUpdatedAt + 1, Date.now())
  return lastUpdatedAt
}

function makeRecord(text, translated, source) {
  const textLower = translationKey(text)
  return {
    textLower,
    text: typeof text === 'string' ? text.trim() : String(text ?? '').trim(),
    translated: typeof translated === 'string' ? translated : String(translated ?? ''),
    source: normalizeSource(source),
    updatedAt: nextUpdatedAt()
  }
}

/** 按键取单条译文；未命中或入参为空返回 null */
export async function getTranslation(text) {
  const key = translationKey(text)
  if (!key) return null
  return withTx(STORES.TRANSLATIONS, 'readonly', async (tx) => (await tx.store.get(key)) ?? null)
}

/**
 * 批量取译文，返回 `Map<原文本, record>`；未命中的键不会出现在 Map 里。
 * Map 的键用调用方传入的原文本（而非归一化键），方便调用方直接按原词取值。
 */
export async function getTranslations(texts) {
  const input = toArray(texts)
  const keyed = new Map() // 归一化键 → 首个原文本
  for (const text of input) {
    const key = translationKey(text)
    if (key && !keyed.has(key)) keyed.set(key, text)
  }
  const result = new Map()
  if (keyed.size === 0) return result

  const records = await withTx(STORES.TRANSLATIONS, 'readonly', async (tx) => {
    // 逐键 get 而非 getAll(keys)：与 dict 仓库保持一致，兼容 fake-indexeddb
    return Promise.all([...keyed.keys()].map((key) => tx.store.get(key)))
  })
  let index = 0
  for (const [key, text] of keyed) {
    const record = records[index++]
    if (record) result.set(text, record)
  }
  return result
}

/** 写入单条译文（text 为空抛错；译文为空是合法的"已翻译为空"） */
export async function putTranslation(text, translated, source = 'manual') {
  requireText(text, 'text')
  const record = makeRecord(text, translated, source)
  await withTx(STORES.TRANSLATIONS, 'readwrite', (tx) => tx.store.put(record))
  return record
}

/**
 * 批量写入译文。
 * @param {Array<{text: string, translated: string}>} entries
 * @param {'library'|'api'|'manual'} [source='api']
 * @returns {Promise<number>} 实际写入条数（text/translated 为空的条目跳过）
 */
export async function putTranslations(entries, source = 'api') {
  const records = []
  const seen = new Set()
  for (const entry of toArray(entries)) {
    if (!entry || typeof entry !== 'object') continue
    const key = translationKey(entry.text)
    if (!key || seen.has(key)) continue
    const translated = typeof entry.translated === 'string' ? entry.translated : String(entry.translated ?? '')
    if (translated === '') continue
    seen.add(key)
    records.push(makeRecord(entry.text, translated, source))
  }
  if (records.length === 0) return 0
  await withTx(STORES.TRANSLATIONS, 'readwrite', async (tx) => {
    for (const record of records) await tx.store.put(record)
  })
  return records.length
}

/**
 * 译文列表，updatedAt 降序。
 * @param {{limit?: number}} [options]
 */
export async function listTranslations({ limit } = {}) {
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
  return withTx(STORES.TRANSLATIONS, 'readonly', async (tx) => {
    const result = []
    let cursor = await tx.store.index('updatedAt').openCursor(null, 'prev')
    while (cursor) {
      result.push(cursor.value)
      if (size && result.length >= size) break
      cursor = await cursor.continue()
    }
    return result
  })
}

/** 译文条数 */
export async function translationCount() {
  return countStore(STORES.TRANSLATIONS)
}

/** 删除单条译文，返回是否删除成功 */
export async function deleteTranslation(text) {
  const key = translationKey(text)
  if (!key) return false
  return withTx(STORES.TRANSLATIONS, 'readwrite', async (tx) => {
    if (!(await tx.store.getKey(key))) return false
    await tx.store.delete(key)
    return true
  })
}

/** 清空全部译文，返回删除条数 */
export async function clearTranslations() {
  return withTx(STORES.TRANSLATIONS, 'readwrite', async (tx) => {
    const count = await tx.store.count()
    await tx.store.clear()
    return count
  })
}
