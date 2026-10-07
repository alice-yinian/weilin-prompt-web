import { STORES, withTx, countStore } from '../db.js'
import { toArray, requireText } from '../util.js'

/**
 * 译文缓存（开发计划本轮新增）。
 *
 * keyPath = textLower（原文去掉首尾空格后小写），大小写/空格差异共用同一条缓存；
 * 字段：{textLower, text, translated, source, direction, updatedAt}
 * 索引：updatedAt（列表按最近更新降序）。
 *
 * `text` 保留用户输入的原始大小写，`translated` 是译文；
 * `source` 只允许 'library'（词库 desc）| 'api'（在线接口）| 'manual'（手动编辑）；
 * `direction` 只允许 'en2zh'（英译中）| 'zh2en'（中译英）。
 *
 * 同一份文本在两个方向上的译文是两条独立记录：zh2en 的键带 `zh2en:` 前缀，
 * en2zh 沿用历史纯文本键，因此旧库/旧数据包里的记录仍然按 en2zh 命中。
 */

export const TRANSLATION_SOURCES = Object.freeze(['library', 'api', 'manual'])

export const TRANSLATION_DIRECTIONS = Object.freeze(['en2zh', 'zh2en'])

export const DEFAULT_TRANSLATION_DIRECTION = 'en2zh'

const ZH2EN_KEY_PREFIX = 'zh2en:'

/** 归一化方向：缺省/非法值一律视为 en2zh（兼容旧记录） */
export function normalizeDirection(direction) {
  return TRANSLATION_DIRECTIONS.includes(direction) ? direction : DEFAULT_TRANSLATION_DIRECTION
}

/**
 * 归一化缓存键：去首尾空格 + 小写；非字符串或空串返回空串。
 * en2zh 用历史纯文本键，zh2en 加前缀，避免两个方向的同形文本互相覆盖。
 */
export function translationKey(text, direction = DEFAULT_TRANSLATION_DIRECTION) {
  if (typeof text !== 'string') return ''
  const normalized = text.trim().toLowerCase()
  if (!normalized) return ''
  return normalizeDirection(direction) === 'zh2en' ? `${ZH2EN_KEY_PREFIX}${normalized}` : normalized
}

/** 旧记录可能没有 direction 字段（或值非法），读取时统一按 en2zh 兜底 */
function withDirection(record) {
  if (!record) return record
  const direction = normalizeDirection(record.direction)
  return record.direction === direction ? record : { ...record, direction }
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

function makeRecord(text, translated, source, direction) {
  const normalizedDirection = normalizeDirection(direction)
  return {
    textLower: translationKey(text, normalizedDirection),
    text: typeof text === 'string' ? text.trim() : String(text ?? '').trim(),
    translated: typeof translated === 'string' ? translated : String(translated ?? ''),
    source: normalizeSource(source),
    direction: normalizedDirection,
    updatedAt: nextUpdatedAt()
  }
}

/** 按键取单条译文；未命中或入参为空返回 null */
export async function getTranslation(text, direction = DEFAULT_TRANSLATION_DIRECTION) {
  const key = translationKey(text, direction)
  if (!key) return null
  const record = await withTx(STORES.TRANSLATIONS, 'readonly', async (tx) => (await tx.store.get(key)) ?? null)
  return withDirection(record)
}

/**
 * 批量取译文，返回 `Map<原文本, record>`；未命中的键不会出现在 Map 里。
 * Map 的键用调用方传入的原文本（而非归一化键），方便调用方直接按原词取值。
 */
export async function getTranslations(texts, direction = DEFAULT_TRANSLATION_DIRECTION) {
  const input = toArray(texts)
  const keyed = new Map() // 归一化键 → 首个原文本
  for (const text of input) {
    const key = translationKey(text, direction)
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
    const record = withDirection(records[index++])
    if (record) result.set(text, record)
  }
  return result
}

/** 写入单条译文（text 为空抛错；译文为空是合法的"已翻译为空"） */
export async function putTranslation(
  text,
  translated,
  source = 'manual',
  direction = DEFAULT_TRANSLATION_DIRECTION
) {
  requireText(text, 'text')
  const record = makeRecord(text, translated, source, direction)
  await withTx(STORES.TRANSLATIONS, 'readwrite', (tx) => tx.store.put(record))
  return record
}

/**
 * 批量写入译文。
 * @param {Array<{text: string, translated: string}>} entries
 * @param {'library'|'api'|'manual'} [source='api']
 * @param {'en2zh'|'zh2en'} [direction='en2zh']
 * @returns {Promise<number>} 实际写入条数（text/translated 为空的条目跳过）
 */
export async function putTranslations(entries, source = 'api', direction = DEFAULT_TRANSLATION_DIRECTION) {
  const records = []
  const seen = new Set()
  for (const entry of toArray(entries)) {
    if (!entry || typeof entry !== 'object') continue
    const key = translationKey(entry.text, direction)
    if (!key || seen.has(key)) continue
    const translated = typeof entry.translated === 'string' ? entry.translated : String(entry.translated ?? '')
    if (translated === '') continue
    seen.add(key)
    records.push(makeRecord(entry.text, translated, source, direction))
  }
  if (records.length === 0) return 0
  await withTx(STORES.TRANSLATIONS, 'readwrite', async (tx) => {
    for (const record of records) await tx.store.put(record)
  })
  return records.length
}

/**
 * 译文列表，updatedAt 降序。
 * @param {{limit?: number, direction?: 'en2zh'|'zh2en'}} [options] 传 direction 只返回该方向
 */
export async function listTranslations({ limit, direction } = {}) {
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
  const filter = direction === undefined ? null : normalizeDirection(direction)
  return withTx(STORES.TRANSLATIONS, 'readonly', async (tx) => {
    const result = []
    let cursor = await tx.store.index('updatedAt').openCursor(null, 'prev')
    while (cursor) {
      const record = withDirection(cursor.value)
      if (!filter || record.direction === filter) {
        result.push(record)
        if (size && result.length >= size) break
      }
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
export async function deleteTranslation(text, direction = DEFAULT_TRANSLATION_DIRECTION) {
  const key = translationKey(text, direction)
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
