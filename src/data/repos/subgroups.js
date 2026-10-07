import { STORES, withTx, DEFAULT_COLOR } from '../db.js'
import { uid, nextCreateTime, requireText, computeMove, sortByCreateTime } from '../util.js'

/**
 * 二级分组。排序方向：create_time 升序（上游 `WHERE p_uuid = ? ORDER BY create_time ASC`）。
 * 字段：{g_uuid, p_uuid, name, color, create_time, src_id}
 */

/** 二级分组；给 p_uuid 时只取该一级分组下的（升序） */
export async function listSubgroups(p_uuid) {
  return withTx(STORES.SUBGROUPS, 'readonly', async (tx) => {
    const all = p_uuid ? await tx.store.index('p_uuid').getAll(p_uuid) : await tx.store.getAll()
    return sortByCreateTime(all, 'asc')
  })
}

/** 新建二级分组；父分组不存在时抛错（保证 uuid 链完整） */
export async function createSubgroup({ p_uuid, name, color } = {}) {
  requireText(p_uuid, 'p_uuid')
  requireText(name, 'name')
  return withTx([STORES.GROUPS, STORES.SUBGROUPS], 'readwrite', async (tx) => {
    const parent = await tx.objectStore(STORES.GROUPS).get(p_uuid)
    if (!parent) throw new Error(`父一级分组不存在: ${p_uuid}`)

    const store = tx.objectStore(STORES.SUBGROUPS)
    const siblings = await store.index('p_uuid').getAll(p_uuid)
    const record = {
      g_uuid: uid(),
      p_uuid,
      name,
      color: color || DEFAULT_COLOR,
      create_time: nextCreateTime(siblings.map((item) => item.create_time)),
      src_id: null
    }
    await store.put(record)
    return record
  })
}

/** 更新二级分组（仅 name / color / src_id 可改；换父级请重建） */
export async function updateSubgroup(g_uuid, patch = {}) {
  requireText(g_uuid, 'g_uuid')
  return withTx(STORES.SUBGROUPS, 'readwrite', async (tx) => {
    const record = await tx.store.get(g_uuid)
    if (!record) return null
    const next = { ...record }
    if (patch.name !== undefined) next.name = requireText(patch.name, 'name')
    if (patch.color !== undefined) next.color = patch.color
    if (patch.src_id !== undefined) next.src_id = patch.src_id
    await tx.store.put(next)
    return next
  })
}

/** 删除二级分组并级联删除其下标签，返回删除条数 */
export async function deleteSubgroup(g_uuid) {
  requireText(g_uuid, 'g_uuid')
  return withTx([STORES.SUBGROUPS, STORES.TAGS], 'readwrite', async (tx) => {
    const subgroups = tx.objectStore(STORES.SUBGROUPS)
    const tags = tx.objectStore(STORES.TAGS)

    const record = await subgroups.get(g_uuid)
    if (!record) return { subgroups: 0, tags: 0 }

    let deletedTags = 0
    let cursor = await tags.index('g_uuid').openCursor(g_uuid)
    while (cursor) {
      await cursor.delete()
      deletedTags += 1
      cursor = await cursor.continue()
    }
    await subgroups.delete(g_uuid)
    return { subgroups: 1, tags: deletedTags }
  })
}

/**
 * 在同一父分组内，把二级分组移动到参照项之前/之后。
 * @returns {Promise<boolean>} false = 目标或参照不存在 / 参照不在同一父分组下
 */
export async function moveSubgroup(g_uuid, refGUuid, position = 'before') {
  requireText(g_uuid, 'g_uuid')
  requireText(refGUuid, 'refGUuid')
  return withTx(STORES.SUBGROUPS, 'readwrite', async (tx) => {
    const target = await tx.store.get(g_uuid)
    if (!target) return false
    const siblings = await tx.store.index('p_uuid').getAll(target.p_uuid)
    const updates = computeMove(siblings, 'g_uuid', g_uuid, refGUuid, position, 'asc')
    if (!updates) return false
    for (const record of updates) await tx.store.put(record)
    return true
  })
}
