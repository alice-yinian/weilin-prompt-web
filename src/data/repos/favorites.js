import { STORES, withTx } from '../db.js'
import { toArray, sortByCreateTime, nextCreateTime } from '../util.js'

/**
 * 收藏（上游 collect_history 表）。keyPath = id（自增），排序：create_time 降序。
 * `tag` 字段同样是上游格式的 JSON 字符串；额外带 name / color。
 * 字段：{id, tag, name, color, create_time, src_id}
 */

/** 全部收藏，create_time 降序 */
export async function listFavorites() {
  return withTx(STORES.FAVORITES, 'readonly', async (tx) => {
    const all = await tx.store.getAll()
    return sortByCreateTime(all, 'desc')
  })
}

/**
 * 新增收藏（同一提示词可重复收藏，仅靠 name 区分，故不做去重）。
 * @returns {Promise<object>} 带自增 id 的完整记录
 */
export async function addFavorite({ tag, name = '', color = '' } = {}) {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error('缺少必填字段: tag')
  }
  return withTx(STORES.FAVORITES, 'readwrite', async (tx) => {
    const all = await tx.store.getAll()
    const record = {
      tag,
      name,
      color,
      create_time: nextCreateTime(all.map((item) => item.create_time)),
      src_id: null
    }
    const id = await tx.store.add(record)
    return { ...record, id }
  })
}

/** 更新收藏（name / color / tag） */
export async function updateFavorite(id, patch = {}) {
  if (id === undefined || id === null) throw new Error('缺少必填字段: id')
  return withTx(STORES.FAVORITES, 'readwrite', async (tx) => {
    const record = await tx.store.get(id)
    if (!record) return null
    const next = { ...record }
    if (patch.name !== undefined) next.name = patch.name
    if (patch.color !== undefined) next.color = patch.color
    if (patch.tag !== undefined) {
      if (typeof patch.tag !== 'string' || patch.tag.length === 0) {
        throw new Error('缺少必填字段: tag')
      }
      next.tag = patch.tag
    }
    await tx.store.put(next)
    return next
  })
}

/** 批量删除收藏，返回删除条数 */
export async function deleteFavorites(ids) {
  const keys = toArray(ids).filter((id) => id !== undefined && id !== null)
  if (keys.length === 0) return { favorites: 0 }
  return withTx(STORES.FAVORITES, 'readwrite', async (tx) => {
    let deleted = 0
    for (const key of keys) {
      if (await tx.store.getKey(key)) {
        await tx.store.delete(key)
        deleted += 1
      }
    }
    return { favorites: deleted }
  })
}
