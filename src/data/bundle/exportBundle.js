import { STORES, withTx } from '../db.js'
import { listGroups } from '../repos/groups.js'
import { listSubgroups } from '../repos/subgroups.js'
import { listAllTags } from '../repos/tags.js'
import { listHistory } from '../repos/history.js'
import { listFavorites } from '../repos/favorites.js'
import { getLabelsPayload } from '../repos/labels.js'
import { listTranslations } from '../repos/translations.js'
import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  CHECKSUM_ALGORITHM,
  DEFAULT_GENERATOR,
  normalizeBlob,
  normalizeDictEntry,
  normalizeFavorite,
  normalizeGroup,
  normalizeHistory,
  normalizeLabel,
  normalizeSubgroup,
  normalizeTag,
  normalizeTranslation
} from './schema.js'

/**
 * bundle 导出（开发计划 §5.4）：产出的结构可直接被 importBundle() 读回，
 * 也可以交给 `tools/import_weilin_db.py` 之外的任何工具消费。
 *
 * 校验和：对每个仓库的 JSON 字符串算 SHA-256。`crypto.subtle` 只在安全上下文
 * （https / localhost / file 之外的 http 不行）存在，取不到时 checksum = null 并在
 * warnings 里说明，导入端不做强制校验。
 */

/** 校验和覆盖的仓库（blobs 里是二进制 Blob，不可 JSON 化，不计入） */
const CHECKSUM_STORES = [
  STORES.GROUPS,
  STORES.SUBGROUPS,
  STORES.TAGS,
  STORES.HISTORY,
  STORES.FAVORITES,
  STORES.DICT,
  STORES.TRANSLATIONS,
  STORES.LABELS
]

function textEncoder() {
  return new TextEncoder()
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** 是否支持 Web Crypto（非安全上下文下为 false，导出会降级为无校验和） */
export function isChecksumAvailable() {
  return typeof globalThis.crypto?.subtle?.digest === 'function'
}

/**
 * 计算校验和。
 * @returns {Promise<string|null>} `sha256:<hex>`；环境不支持时返回 null
 */
export async function computeChecksum(value) {
  if (!isChecksumAvailable()) return null
  const bytes = textEncoder().encode(JSON.stringify(value ?? null))
  const digest = await globalThis.crypto.subtle.digest(CHECKSUM_ALGORITHM, bytes)
  return `sha256:${toHex(digest)}`
}

/** 从 bundle 里取出参与校验和的载荷（导出/校验共用同一份规则） */
export function checksumPayload(bundle) {
  const data = bundle?.data || {}
  const payload = {}
  for (const store of CHECKSUM_STORES) {
    if (store === STORES.LABELS) {
      payload[store] = Array.isArray(data.labels?.items) ? data.labels.items : []
    } else {
      payload[store] = Array.isArray(data[store]) ? data[store] : []
    }
  }
  return payload
}

/**
 * 校验 bundle 的 checksum（只检查包里确实带了校验和的仓库）。
 * @returns {Promise<{available: boolean, ok: boolean, mismatched: string[]}>}
 */
export async function verifyBundleChecksum(bundle) {
  const expected = bundle?.checksum
  if (!expected || !isChecksumAvailable()) {
    return { available: false, ok: false, mismatched: [] }
  }
  const payload = checksumPayload(bundle)
  const mismatched = []
  for (const [store, digest] of Object.entries(expected)) {
    const actual = await computeChecksum(payload[store])
    if (actual !== digest) mismatched.push(store)
  }
  return { available: true, ok: mismatched.length === 0, mismatched }
}

/**
 * 导出完整数据包。
 *
 * @param {object} [options]
 * @param {string} [options.generator] generator 标识
 * @param {boolean} [options.includeDict=true] 是否导出 14 万条词典（备份整库时保留；只在导出词库时可关掉）
 * @param {boolean} [options.includeBlobs=false] 是否把预览图 Blob 一起放进来（JSON.stringify 会丢 Blob，一般走 zip）
 * @param {(progress: {store: string, index: number, total: number, count: number}) => void|Promise<void>} [options.onProgress]
 * @returns {Promise<object>} 开发计划 §5.4 定义的结构
 */
export async function exportBundle({
  generator = DEFAULT_GENERATOR,
  includeDict = true,
  includeBlobs = false,
  onProgress
} = {}) {
  const warnings = []
  const stores = []
  if (includeDict) stores.push(STORES.DICT)
  stores.push(STORES.BLOBS)
  // 固定步骤：groups/subgroups/tags/history/favorites/labels/translations
  const totalSteps = stores.length + 7
  let step = 0
  const report = async (store, count) => {
    step += 1
    if (typeof onProgress === 'function') await onProgress({ store, index: step, total: totalSteps, count })
  }

  const groups = (await listGroups()).map(normalizeGroup)
  await report(STORES.GROUPS, groups.length)

  const subgroups = (await listSubgroups()).map(normalizeSubgroup)
  await report(STORES.SUBGROUPS, subgroups.length)

  const tags = (await listAllTags()).map(normalizeTag)
  await report(STORES.TAGS, tags.length)

  const history = (await listHistory()).map(normalizeHistory)
  await report(STORES.HISTORY, history.length)

  const favorites = (await listFavorites()).map(normalizeFavorite)
  await report(STORES.FAVORITES, favorites.length)

  const labelsPayload = await getLabelsPayload()
  const labels = {
    items: labelsPayload.items.map((item, index) => normalizeLabel(item, index)),
    settings: { ...labelsPayload.settings }
  }
  await report(STORES.LABELS, labels.items.length)

  let dict = []
  if (includeDict) {
    const records = await withTx(STORES.DICT, 'readonly', (tx) => tx.store.getAll())
    dict = records.map(normalizeDictEntry)
    await report(STORES.DICT, dict.length)
  }

  const translations = (await listTranslations()).map(normalizeTranslation)
  await report(STORES.TRANSLATIONS, translations.length)

  const data = { groups, subgroups, tags, history, favorites, dict, labels, translations }

  let images = 0
  if (includeBlobs) {
    const blobs = await withTx(STORES.BLOBS, 'readonly', (tx) => tx.store.getAll())
    data.blobs = blobs.map(normalizeBlob)
    images = data.blobs.length
    warnings.push('预览图以 Blob 形式内联，JSON.stringify 无法序列化，需要走 zip 打包')
    await report(STORES.BLOBS, images)
  }

  const counts = {
    groups: groups.length,
    subgroups: subgroups.length,
    tags: tags.length,
    history: history.length,
    favorites: favorites.length,
    dict: dict.length,
    labels: labels.items.length,
    translations: translations.length,
    images
  }

  const bundle = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    generatedAt: Date.now(),
    generator,
    source: {
      lang: null,
      dbFiles: [],
      hasImages: images > 0
    },
    counts,
    data,
    warnings,
    checksum: null
  }

  if (isChecksumAvailable()) {
    const payload = checksumPayload(bundle)
    const checksum = {}
    for (const store of CHECKSUM_STORES) {
      checksum[store] = await computeChecksum(payload[store])
    }
    bundle.checksum = checksum
  } else {
    warnings.push('当前环境不支持 Web Crypto（非安全上下文），已跳过 checksum 计算')
  }

  return bundle
}
