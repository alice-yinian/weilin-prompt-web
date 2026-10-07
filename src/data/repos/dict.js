import { STORES, withTx, countStore } from '../db.js'
import { toArray } from '../util.js'

/**
 * danbooru 词典（只读数据源）。keyPath = tag。
 * 字段：{tag, color_id, translate, hot, aliases}
 *
 * 14 万条数据太大，不随应用启动灌入内存：
 * `loadDictIndex()` 在"首次需要补全/翻译/搜索"时才把轻量三元组灌进数组缓存。
 */

export const DICT_DEFAULT_LIMIT = 25

let dictIndexCache = null
let dictIndexLoading = null

/** 词典条目数 */
export async function dictSize() {
  return countStore(STORES.DICT)
}

/** 按 tag 批量取完整条目（返回顺序与入参 tags 对齐，未命中的条目不出来） */
export async function getDictEntries(tags) {
  const keys = toArray(tags).filter((tag) => typeof tag === 'string' && tag.length > 0)
  if (keys.length === 0) return []
  return withTx(STORES.DICT, 'readonly', async (tx) => {
    // 逐键 get 而非 getAll(keys)：后者在部分实现（fake-indexeddb）下不生效，
    // 且这里的调用方一次只查少量 tag
    const records = await Promise.all(keys.map((key) => tx.store.get(key)))
    const result = []
    for (const record of records) {
      if (record) result.push(record)
    }
    return result
  })
}

/** 取单条；不存在返回 null */
export async function getDictEntry(tag) {
  if (!tag) return null
  return withTx(STORES.DICT, 'readonly', async (tx) => (await tx.store.get(tag)) ?? null)
}

/** 懒加载全量轻量索引 `[{tag, translate, color_id}]`，只灌一次；返回该数组（同一引用） */
export async function loadDictIndex({ force = false } = {}) {
  if (force) invalidateDictIndex()
  if (dictIndexCache) return dictIndexCache
  if (!dictIndexLoading) {
    dictIndexLoading = (async () => {
      const entries = await withTx(STORES.DICT, 'readonly', async (tx) => {
        const result = []
        // 游标遍历：一次事务里顺序读完，避免 getAll 一次性构造 14 万个对象的峰值
        let cursor = await tx.store.openCursor()
        while (cursor) {
          const record = cursor.value
          result.push({
            tag: record.tag,
            translate: record.translate ?? '',
            color_id: record.color_id ?? -1
          })
          cursor = await cursor.continue()
        }
        return result
      })
      dictIndexCache = entries
      return entries
    })().finally(() => {
      dictIndexLoading = null
    })
  }
  return dictIndexLoading
}

/** 丢弃词典索引缓存（导入/清空数据后调用） */
export function invalidateDictIndex() {
  dictIndexCache = null
  dictIndexLoading = null
}

/** 词典索引是否已加载（UI 用来决定是否提示"正在加载词典"） */
export function isDictIndexLoaded() {
  return dictIndexCache !== null
}

function scoreEntry(entry, query) {
  const tag = entry.tag
  const translate = entry.translate
  if (tag === query) return 100
  if (tag.startsWith(query)) return 90
  if (tag.includes(query)) return 80
  if (translate && translate === query) return 70
  if (translate && translate.startsWith(query)) return 60
  if (translate && translate.includes(query)) return 50
  return 0
}

/**
 * 词典搜索（与上游 autocomplete.py 的 danbooru 回退同口径：
 * tag 精确 100 / 前缀 90 / 包含 80；translate 精确 70 / 前缀 60 / 包含 50）。
 *
 * @param {string} prefixOrKeyword 关键词（大小写不敏感）
 * @param {number} limit 返回上限，默认 25
 * @returns {Promise<Array<{tag:string,color_id:number,translate:string,hot:number,aliases:number}>>}
 */
export async function searchDict(prefixOrKeyword, limit = DICT_DEFAULT_LIMIT) {
  const query = String(prefixOrKeyword ?? '').trim().toLowerCase()
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DICT_DEFAULT_LIMIT
  if (!query) return []

  const entries = await loadDictIndex()
  const matched = []
  for (const entry of entries) {
    const score = scoreEntry(entry, query)
    if (score > 0) matched.push({ entry, score })
  }
  matched.sort((a, b) => b.score - a.score || (a.entry.tag < b.entry.tag ? -1 : 1))

  const keys = matched.slice(0, size).map((item) => item.entry.tag)
  return getDictEntries(keys)
}
