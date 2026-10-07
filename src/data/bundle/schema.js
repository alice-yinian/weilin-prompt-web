import { STORES, DEFAULT_COLOR } from '../db.js'
import { normalizeLabelItem } from '../repos/labels.js'

/**
 * bundle 数据包的格式约定（开发计划 §5.4）。
 * 导入与导出共用这里的字段表与规范化函数，保证"导出→导入→再导出"逐字节稳定。
 */

export const BUNDLE_FORMAT = 'weilin-prompt-bundle'
export const BUNDLE_FORMAT_VERSION = 1
export const BUNDLE_BATCH_SIZE = 1000
export const CHECKSUM_ALGORITHM = 'SHA-256'
export const DEFAULT_GENERATOR = 'weilin-prompt-web/0.1.0'

const text = (value, fallback = '') => {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return fallback
  return String(value)
}

const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback)

const int = (value, fallback = 0) => (Number.isFinite(value) ? Math.trunc(value) : fallback)

const nullableText = (value) => (value === undefined || value === null ? null : text(value))

/** 各仓库的字段定义：导入时按这份表裁剪未知字段，导出时按同样的顺序拼装 */
export const ENTITY_SPECS = [
  {
    store: STORES.GROUPS,
    key: 'p_uuid',
    fields: ['p_uuid', 'name', 'color', 'create_time', 'src_id']
  },
  {
    store: STORES.SUBGROUPS,
    key: 'g_uuid',
    parentField: 'p_uuid',
    parentStore: STORES.GROUPS,
    fields: ['g_uuid', 'p_uuid', 'name', 'color', 'create_time', 'src_id']
  },
  {
    store: STORES.TAGS,
    key: 't_uuid',
    parentField: 'g_uuid',
    parentStore: STORES.SUBGROUPS,
    fields: [
      't_uuid',
      'g_uuid',
      'text',
      'desc',
      'color',
      'create_time',
      'image_path',
      'image_status',
      'src_id'
    ]
  },
  {
    store: STORES.HISTORY,
    key: null,
    fields: ['tag', 'name', 'color', 'create_time', 'src_id']
  },
  {
    store: STORES.FAVORITES,
    key: null,
    fields: ['tag', 'name', 'color', 'create_time', 'src_id']
  },
  {
    store: STORES.DICT,
    key: 'tag',
    fields: ['tag', 'color_id', 'translate', 'hot', 'aliases']
  },
  {
    store: STORES.LABELS,
    key: 'id',
    fields: ['id', 'name', 'content', 'createdAt', 'updatedAt', 'pinned', 'highlighted', 'order']
  },
  {
    store: STORES.BLOBS,
    key: 'key',
    fields: ['key', 'blob']
  }
]

/** 查某仓库的格式约定 */
export function entitySpec(storeName) {
  return ENTITY_SPECS.find((spec) => spec.store === storeName) || null
}

export function normalizeGroup(raw = {}) {
  return {
    p_uuid: text(raw.p_uuid),
    name: text(raw.name),
    color: text(raw.color) || DEFAULT_COLOR,
    create_time: num(raw.create_time),
    src_id: raw.src_id === undefined ? null : raw.src_id
  }
}

export function normalizeSubgroup(raw = {}) {
  return {
    g_uuid: text(raw.g_uuid),
    p_uuid: text(raw.p_uuid),
    name: text(raw.name),
    color: text(raw.color) || DEFAULT_COLOR,
    create_time: num(raw.create_time),
    src_id: raw.src_id === undefined ? null : raw.src_id
  }
}

export function normalizeTag(raw = {}) {
  return {
    t_uuid: text(raw.t_uuid),
    g_uuid: text(raw.g_uuid),
    text: text(raw.text),
    desc: text(raw.desc),
    color: text(raw.color) || DEFAULT_COLOR,
    create_time: num(raw.create_time),
    image_path: nullableText(raw.image_path),
    image_status: nullableText(raw.image_status),
    src_id: raw.src_id === undefined ? null : raw.src_id
  }
}

export function normalizeHistory(raw = {}) {
  return {
    tag: text(raw.tag),
    name: text(raw.name),
    color: text(raw.color),
    create_time: num(raw.create_time),
    src_id: raw.src_id === undefined ? null : raw.src_id
  }
}

export function normalizeFavorite(raw = {}) {
  return normalizeHistory(raw)
}

export function normalizeDictEntry(raw = {}) {
  return {
    tag: text(raw.tag),
    color_id: int(raw.color_id, -1),
    translate: text(raw.translate),
    hot: int(raw.hot, 0),
    aliases: int(raw.aliases, 0)
  }
}

export function normalizeLabel(raw = {}, index = 0) {
  return normalizeLabelItem(raw, index)
}

export function normalizeBlob(raw = {}) {
  return { key: text(raw.key), blob: raw.blob ?? null }
}

const NORMALIZERS = {
  [STORES.GROUPS]: normalizeGroup,
  [STORES.SUBGROUPS]: normalizeSubgroup,
  [STORES.TAGS]: normalizeTag,
  [STORES.HISTORY]: normalizeHistory,
  [STORES.FAVORITES]: normalizeFavorite,
  [STORES.DICT]: normalizeDictEntry,
  [STORES.LABELS]: normalizeLabel,
  [STORES.BLOBS]: normalizeBlob
}

/** 按仓库名规范化一条记录 */
export function normalizeBundleRecord(storeName, raw, index = 0) {
  const normalizer = NORMALIZERS[storeName]
  if (!normalizer) throw new Error(`未知的对象仓库: ${storeName}`)
  return normalizer(raw, index)
}

/** 校验 bundle 头部；不合法直接抛错（UI 只需展示 message） */
export function validateBundleHeader(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('数据包内容不是对象')
  }
  if (bundle.format !== BUNDLE_FORMAT) {
    throw new Error(`数据包格式不匹配：期望 ${BUNDLE_FORMAT}，实际 ${String(bundle.format)}`)
  }
  if (bundle.formatVersion !== BUNDLE_FORMAT_VERSION) {
    throw new Error(
      `数据包版本不支持：期望 ${BUNDLE_FORMAT_VERSION}，实际 ${String(bundle.formatVersion)}`
    )
  }
  if (bundle.data !== undefined && (bundle.data === null || typeof bundle.data !== 'object')) {
    throw new Error('数据包 data 字段不是对象')
  }
  return true
}
