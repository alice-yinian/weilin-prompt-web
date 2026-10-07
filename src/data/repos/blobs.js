import { STORES, withTx } from '../db.js'
import { toArray, requireText } from '../util.js'

/**
 * 标签预览图（复用 db 里已有的 blobs 仓库，keyPath = key）。
 *
 * key 约定 `tag:<t_uuid>`；记录 `{key, blob, mime, name, updatedAt}`。
 * mime / name 只是展示与导出的辅助字段，可为空。
 */

export const TAG_IMAGE_PREFIX = 'tag:'

/** 由标签 uuid 得到 blobs 仓库主键 */
export function tagImageKey(t_uuid) {
  return `${TAG_IMAGE_PREFIX}${t_uuid}`
}

function isBlobLike(value) {
  // 跨 realm（如 jsdom 的 window.Blob）时 instanceof 会失效，按结构判断更稳
  return Boolean(value) && typeof value === 'object' && typeof value.arrayBuffer === 'function'
}

/**
 * 写入/覆盖某个标签的预览图。
 * @param {string} t_uuid 标签 uuid
 * @param {Blob} blob 图片二进制
 * @param {{mime?: string, name?: string}} [options]
 * @returns {Promise<{key:string, blob:Blob, mime:string, name:string, updatedAt:number}>}
 */
export async function putTagImage(t_uuid, blob, { mime, name } = {}) {
  requireText(t_uuid, 't_uuid')
  if (!isBlobLike(blob)) throw new Error('缺少必填字段: blob（需为 Blob）')
  const record = {
    key: tagImageKey(t_uuid),
    blob,
    mime: typeof mime === 'string' && mime ? mime : typeof blob.type === 'string' ? blob.type : '',
    name: typeof name === 'string' ? name : '',
    updatedAt: Date.now()
  }
  await withTx(STORES.BLOBS, 'readwrite', (tx) => tx.store.put(record))
  return record
}

/** 取某个标签的预览图；未命中返回 null */
export async function getTagImage(t_uuid) {
  if (!t_uuid) return null
  return withTx(STORES.BLOBS, 'readonly', async (tx) => {
    const record = await tx.store.get(tagImageKey(t_uuid))
    return record?.blob ?? null
  })
}

/** 批量取预览图，返回 `Map<t_uuid, Blob>`；未命中的 uuid 不会出现在 Map 里 */
export async function getTagImages(t_uuids) {
  const uuids = toArray(t_uuids).filter((value) => typeof value === 'string' && value.length > 0)
  const result = new Map()
  if (uuids.length === 0) return result
  const records = await withTx(STORES.BLOBS, 'readonly', async (tx) => {
    return Promise.all(uuids.map((uuid) => tx.store.get(tagImageKey(uuid))))
  })
  records.forEach((record, index) => {
    if (record?.blob) result.set(uuids[index], record.blob)
  })
  return result
}

/** 删除某个标签的预览图，返回是否删除成功 */
export async function deleteTagImage(t_uuid) {
  if (!t_uuid) return false
  return withTx(STORES.BLOBS, 'readwrite', async (tx) => {
    const key = tagImageKey(t_uuid)
    if (!(await tx.store.getKey(key))) return false
    await tx.store.delete(key)
    return true
  })
}

/** 列出全部有预览图的标签 uuid（升序，稳定输出） */
export async function listTagImageUuids() {
  return withTx(STORES.BLOBS, 'readonly', async (tx) => {
    const keys = await tx.store.getAllKeys()
    return keys
      .filter((key) => typeof key === 'string' && key.startsWith(TAG_IMAGE_PREFIX))
      .map((key) => key.slice(TAG_IMAGE_PREFIX.length))
      .sort()
  })
}

/** 有预览图的标签数量 */
export async function tagImageCount() {
  const uuids = await listTagImageUuids()
  return uuids.length
}

/** 清空全部标签预览图，返回删除条数（其他前缀的 blob 不动） */
export async function clearTagImages() {
  return withTx(STORES.BLOBS, 'readwrite', async (tx) => {
    const keys = await tx.store.getAllKeys()
    let deleted = 0
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(TAG_IMAGE_PREFIX)) {
        await tx.store.delete(key)
        deleted += 1
      }
    }
    return deleted
  })
}
