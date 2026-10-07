import { STORES, withTx, META_KEYS, getMeta, setMeta } from '../db.js'
import { uid } from '../util.js'

/**
 * 主标签片段（提示词片段）。
 *
 * 存储位置（开发计划 §4 允许自行选择）：
 * - 条目 `{id, name, content, createdAt, updatedAt, pinned, highlighted, order}` 存在 `labels` 仓库，
 *   一条记录一个片段（keyPath = id），便于按 id 增量更新、按 order 建索引。
 * - 排序设置 `{sortMode, sortTimeDesc, sortNameAsc, selectedId}` 不属于条目集合，
 *   存在 `meta` 仓库的 `labels.settings` 键下，避免污染条目列表。
 */

/** 与上游 tag_labels.json / main_label_manager.vue 一致的默认设置 */
export const DEFAULT_LABEL_SETTINGS = Object.freeze({
  sortMode: 'manual',
  sortTimeDesc: true,
  sortNameAsc: true,
  selectedId: null
})

/** 规范化单个片段（兼容旧格式字段缺失） */
export function normalizeLabelItem(item = {}, index = 0) {
  const now = Date.now()
  const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : item.updatedAt ?? now
  const updatedAt = Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt
  return {
    id: item.id ? String(item.id) : uid(),
    name: typeof item.name === 'string' ? item.name : '',
    content: typeof item.content === 'string' ? item.content : '',
    createdAt,
    updatedAt,
    pinned: Boolean(item.pinned),
    highlighted: Boolean(item.highlighted),
    order: Number.isFinite(item.order) ? item.order : index
  }
}

/** 读取片段数据（`{items, settings}`；空库时返回空列表 + 默认设置） */
export async function getLabelsPayload() {
  const items = await withTx(STORES.LABELS, 'readonly', async (tx) => {
    const all = await tx.store.getAll()
    return all
      .map((item, index) => normalizeLabelItem(item, index))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  })
  const settings = await getMeta(META_KEYS.LABELS_SETTINGS, null)
  return {
    items,
    settings: settings ? { ...DEFAULT_LABEL_SETTINGS, ...settings } : { ...DEFAULT_LABEL_SETTINGS }
  }
}

/**
 * 整体保存片段数据（全量覆盖：不在 items 里的片段会被删除，与上游"本地全量持久化"语义一致）。
 * @returns {Promise<{items: number, settings: object}>}
 */
export async function saveLabelsPayload({ items = [], settings } = {}) {
  const normalized = items.map((item, index) => normalizeLabelItem(item, index))
  const ids = normalized.map((item) => item.id)

  await withTx(STORES.LABELS, 'readwrite', async (tx) => {
    const existing = await tx.store.getAllKeys()
    for (const key of existing) {
      if (!ids.includes(key)) await tx.store.delete(key)
    }
    for (const item of normalized) await tx.store.put(item)
  })

  let savedSettings = null
  if (settings && typeof settings === 'object') {
    savedSettings = { ...DEFAULT_LABEL_SETTINGS, ...settings }
    await setMeta(META_KEYS.LABELS_SETTINGS, savedSettings)
  } else {
    savedSettings = await getMeta(META_KEYS.LABELS_SETTINGS, { ...DEFAULT_LABEL_SETTINGS })
  }

  return { items: normalized.length, settings: savedSettings }
}

/** 只保存排序设置 */
export async function saveLabelSettings(settings) {
  const next = { ...DEFAULT_LABEL_SETTINGS, ...(settings || {}) }
  await setMeta(META_KEYS.LABELS_SETTINGS, next)
  return next
}
