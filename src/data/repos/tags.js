import { STORES, withTx, DEFAULT_COLOR } from '../db.js'
import { uid, nextCreateTime, requireText, computeMove, sortByCreateTime, toArray } from '../util.js'

/**
 * 标签。排序方向：create_time 降序（上游 `WHERE g_uuid = ? ORDER BY create_time DESC`）。
 * 字段：{t_uuid, g_uuid, text, desc, color, create_time, image_path, image_status, src_id}
 */

/** 某个二级分组下的标签（create_time 降序） */
export async function listTags(g_uuid) {
  requireText(g_uuid, 'g_uuid')
  return withTx(STORES.TAGS, 'readonly', async (tx) => {
    const all = await tx.store.index('g_uuid').getAll(g_uuid)
    return sortByCreateTime(all, 'desc')
  })
}

/** 全量标签（内存索引用；create_time 降序） */
export async function listAllTags() {
  return withTx(STORES.TAGS, 'readonly', async (tx) => {
    const all = await tx.store.getAll()
    return sortByCreateTime(all, 'desc')
  })
}

/** 按 t_uuid 取单条；不存在返回 null */
export async function getTag(t_uuid) {
  if (!t_uuid) return null
  return withTx(STORES.TAGS, 'readonly', async (tx) => (await tx.store.get(t_uuid)) ?? null)
}

/**
 * 前缀搜索（走 text 索引，大小写敏感）。
 * 需要"包含匹配 / 忽略大小写"时请用 memoryIndex 的 byText，IDB 无法高效支持。
 */
export async function searchTagsByPrefix(prefix, { limit = 50, g_uuid } = {}) {
  if (!prefix) return []
  return withTx(STORES.TAGS, 'readonly', async (tx) => {
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`)
    const found = await tx.store.index('text').getAll(range, limit)
    return g_uuid ? found.filter((record) => record.g_uuid === g_uuid) : found
  })
}

/** 新建标签；父二级分组不存在时抛错（保证 uuid 链完整） */
export async function createTag({ g_uuid, text, desc, color } = {}) {
  requireText(g_uuid, 'g_uuid')
  requireText(text, 'text')
  return withTx([STORES.SUBGROUPS, STORES.TAGS], 'readwrite', async (tx) => {
    const parent = await tx.objectStore(STORES.SUBGROUPS).get(g_uuid)
    if (!parent) throw new Error(`父二级分组不存在: ${g_uuid}`)

    const store = tx.objectStore(STORES.TAGS)
    const siblings = await store.index('g_uuid').getAll(g_uuid)
    const record = {
      t_uuid: uid(),
      g_uuid,
      text,
      desc: desc ?? '',
      color: color || DEFAULT_COLOR,
      create_time: nextCreateTime(siblings.map((item) => item.create_time)),
      image_path: null,
      image_status: null,
      src_id: null
    }
    await store.put(record)
    return record
  })
}

/** 更新标签（text / desc / color / image_path / image_status / src_id） */
export async function updateTag(t_uuid, patch = {}) {
  requireText(t_uuid, 't_uuid')
  return withTx(STORES.TAGS, 'readwrite', async (tx) => {
    const record = await tx.store.get(t_uuid)
    if (!record) return null
    const next = { ...record }
    if (patch.text !== undefined) next.text = requireText(patch.text, 'text')
    if (patch.desc !== undefined) next.desc = patch.desc
    if (patch.color !== undefined) next.color = patch.color
    if (patch.image_path !== undefined) next.image_path = patch.image_path
    if (patch.image_status !== undefined) next.image_status = patch.image_status
    if (patch.src_id !== undefined) next.src_id = patch.src_id
    await tx.store.put(next)
    return next
  })
}

/** 批量删除标签，返回删除条数 */
export async function deleteTags(t_uuids) {
  const keys = toArray(t_uuids).filter(Boolean)
  if (keys.length === 0) return { tags: 0 }
  return withTx(STORES.TAGS, 'readwrite', async (tx) => {
    let deleted = 0
    for (const key of keys) {
      if (await tx.store.getKey(key)) {
        await tx.store.delete(key)
        deleted += 1
      }
    }
    return { tags: deleted }
  })
}

/**
 * 在同一二级分组内，把标签移动到参照标签之前/之后。
 * @returns {Promise<boolean>} false = 目标或参照不存在 / 参照不在同一二级分组下
 */
export async function moveTag(t_uuid, refTUuid, position = 'before') {
  requireText(t_uuid, 't_uuid')
  requireText(refTUuid, 'refTUuid')
  return withTx(STORES.TAGS, 'readwrite', async (tx) => {
    const target = await tx.store.get(t_uuid)
    if (!target) return false
    const siblings = await tx.store.index('g_uuid').getAll(target.g_uuid)
    const updates = computeMove(siblings, 't_uuid', t_uuid, refTUuid, position, 'desc')
    if (!updates) return false
    for (const record of updates) await tx.store.put(record)
    return true
  })
}
