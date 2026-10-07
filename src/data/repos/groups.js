import { STORES, withTx, DEFAULT_COLOR } from '../db.js'
import { uid, nextCreateTime, requireText, computeMove, sortByCreateTime } from '../util.js'

/**
 * 一级分组。排序方向：create_time 升序（与上游 `ORDER BY create_time ASC` 一致）。
 * 字段：{p_uuid, name, color, create_time, src_id}
 */

/** 全部分组，create_time 升序 */
export async function listGroups() {
  return withTx(STORES.GROUPS, 'readonly', async (tx) => {
    const all = await tx.store.getAll()
    return sortByCreateTime(all, 'asc')
  })
}

/** 新建分组，返回新记录（新条目 create_time 最大 → 排在列表末尾） */
export async function createGroup({ name, color } = {}) {
  requireText(name, 'name')
  return withTx(STORES.GROUPS, 'readwrite', async (tx) => {
    const all = await tx.store.getAll()
    const record = {
      p_uuid: uid(),
      name,
      color: color || DEFAULT_COLOR,
      create_time: nextCreateTime(all.map((item) => item.create_time)),
      src_id: null
    }
    await tx.store.put(record)
    return record
  })
}

/** 更新分组（仅 name / color / src_id 可改；排序请用 moveGroup） */
export async function updateGroup(p_uuid, patch = {}) {
  requireText(p_uuid, 'p_uuid')
  return withTx(STORES.GROUPS, 'readwrite', async (tx) => {
    const record = await tx.store.get(p_uuid)
    if (!record) return null
    const next = { ...record }
    if (patch.name !== undefined) next.name = requireText(patch.name, 'name')
    if (patch.color !== undefined) next.color = patch.color
    if (patch.src_id !== undefined) next.src_id = patch.src_id
    await tx.store.put(next)
    return next
  })
}

/** 删除分组并级联删除其下二级分组与标签，返回删除条数 */
export async function deleteGroup(p_uuid) {
  requireText(p_uuid, 'p_uuid')
  return withTx([STORES.GROUPS, STORES.SUBGROUPS, STORES.TAGS], 'readwrite', async (tx) => {
    const groups = tx.objectStore(STORES.GROUPS)
    const subgroups = tx.objectStore(STORES.SUBGROUPS)
    const tags = tx.objectStore(STORES.TAGS)

    const group = await groups.get(p_uuid)
    if (!group) return { groups: 0, subgroups: 0, tags: 0 }

    const deleted = { groups: 1, subgroups: 0, tags: 0 }
    const children = await subgroups.index('p_uuid').getAllKeys(p_uuid)
    for (const g_uuid of children) {
      let cursor = await tags.index('g_uuid').openCursor(g_uuid)
      while (cursor) {
        await cursor.delete()
        deleted.tags += 1
        cursor = await cursor.continue()
      }
      await subgroups.delete(g_uuid)
      deleted.subgroups += 1
    }
    await groups.delete(p_uuid)
    return deleted
  })
}

/**
 * 移动分组到参照分组之前/之后。
 * @returns {Promise<boolean>} false = 目标或参照不存在（未做任何修改）
 */
export async function moveGroup(p_uuid, refPuuId, position = 'before') {
  requireText(p_uuid, 'p_uuid')
  requireText(refPuuId, 'refPuuId')
  return withTx(STORES.GROUPS, 'readwrite', async (tx) => {
    const all = await tx.store.getAll()
    const updates = computeMove(all, 'p_uuid', p_uuid, refPuuId, position, 'asc')
    if (!updates) return false
    for (const record of updates) await tx.store.put(record)
    return true
  })
}
