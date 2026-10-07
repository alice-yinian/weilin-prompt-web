import { listAllTags } from './repos/tags.js'
import { invalidateDictIndex } from './repos/dict.js'

/**
 * 内存索引：IndexedDB 做不了"包含"匹配，补全/搜索/翻译改成在内存里跑。
 * - tags：全量（几千条，量级可控），启动后首次用到时构建；
 * - dict：不在这里灌，交给 repos/dict.js 懒加载（14 万条，首次用到才加载）。
 *
 * @typedef {{t_uuid: string, g_uuid: string, text: string, desc: string, color: string}} TagIndexEntry
 * @typedef {{entries: TagIndexEntry[], byText: Map<string, TagIndexEntry>}} TagIndex
 */

let tagIndexCache = null
let tagIndexLoading = null

/** 构建（并缓存）标签内存索引；byText 的 key 为小写 text */
export async function buildTagIndex() {
  const records = await listAllTags()
  const entries = records.map((record) => ({
    t_uuid: record.t_uuid,
    g_uuid: record.g_uuid,
    text: record.text ?? '',
    desc: record.desc ?? '',
    color: record.color ?? ''
  }))
  const byText = new Map()
  for (const entry of entries) {
    const key = entry.text.toLowerCase()
    // 文本可能重复（不同分组下同名 tag）；entries 按 create_time 降序，保留最新的一条
    if (!byText.has(key)) byText.set(key, entry)
  }
  tagIndexCache = { entries, byText }
  return tagIndexCache
}

/** 取标签索引（未构建时自动构建；并发调用共享同一次构建） */
export async function getTagIndex() {
  if (tagIndexCache) return tagIndexCache
  if (!tagIndexLoading) {
    tagIndexLoading = buildTagIndex().finally(() => {
      tagIndexLoading = null
    })
  }
  return tagIndexLoading
}

/** 索引是否已构建 */
export function isTagIndexBuilt() {
  return tagIndexCache !== null
}

/**
 * 失效标签索引（导入 bundle / 清空数据 / 批量改标签后调用）。
 * 词典索引一并失效：两者是同一条"数据变了"的链路。
 */
export function invalidateTagIndex() {
  tagIndexCache = null
  tagIndexLoading = null
  invalidateDictIndex()
}
