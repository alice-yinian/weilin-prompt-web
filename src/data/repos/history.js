import { STORES, withTx } from '../db.js'
import { toArray, sortByCreateTime, nextCreateTime } from '../util.js'

/**
 * 历史记录。keyPath = id（自增），排序：create_time 降序（新→旧）。
 * `tag` 字段是上游格式的 JSON 字符串：{prompt, lora, temp_prompt, temp_lora}
 * 字段：{id, tag, name, color, create_time, src_id}
 */

/** 全部历史，create_time 降序 */
export async function listHistory() {
  return withTx(STORES.HISTORY, 'readonly', async (tx) => {
    const all = await tx.store.getAll()
    return sortByCreateTime(all, 'desc')
  })
}

/**
 * 追加历史。同内容（tag 字符串完全相同）已存在时不重复插入。
 * @param {string} tagJson 上游格式的提示词 JSON 字符串
 * @returns {Promise<boolean>} true = 新增了一条；false = 内容为空或已存在（未写入）
 */
export async function addHistory(tagJson) {
  if (typeof tagJson !== 'string' || tagJson.length === 0) return false
  return withTx(STORES.HISTORY, 'readwrite', async (tx) => {
    const all = await tx.store.getAll()
    if (all.some((record) => record.tag === tagJson)) return false
    await tx.store.add({
      tag: tagJson,
      name: '',
      color: '',
      create_time: nextCreateTime(all.map((record) => record.create_time)),
      src_id: null
    })
    return true
  })
}

/** 批量删除历史（软删除的上游语义在新版改为真删除），返回删除条数 */
export async function deleteHistory(ids) {
  const keys = toArray(ids).filter((id) => id !== undefined && id !== null)
  if (keys.length === 0) return { history: 0 }
  return withTx(STORES.HISTORY, 'readwrite', async (tx) => {
    let deleted = 0
    for (const key of keys) {
      if (await tx.store.getKey(key)) {
        await tx.store.delete(key)
        deleted += 1
      }
    }
    return { history: deleted }
  })
}

/** 清空历史，返回删除条数 */
export async function clearHistory() {
  return withTx(STORES.HISTORY, 'readwrite', async (tx) => {
    const count = await tx.store.count()
    await tx.store.clear()
    return { history: count }
  })
}
