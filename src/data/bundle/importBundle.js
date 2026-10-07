import { STORES, withTx, setMeta, getMeta, META_KEYS } from '../db.js'
import { uid, toArray } from '../util.js'
import { invalidateTagIndex } from '../memoryIndex.js'
import { DEFAULT_LABEL_SETTINGS, normalizeLabelItem } from '../repos/labels.js'
import {
  BUNDLE_BATCH_SIZE,
  ENTITY_SPECS,
  normalizeBundleRecord,
  validateBundleHeader
} from './schema.js'

/**
 * bundle 导入（开发计划 §5.4）。
 *
 * mode 语义：
 * - `overwrite`：同 uuid 用包内数据覆盖，缺失的插入（等于整包还原）。
 * - `merge`：同 uuid 保留库内已有记录、只插入缺失的；缺失 uuid 的记录会补一个新 uuid 再插入。
 * - `skip`：同 uuid 完全跳过；缺失 uuid 的记录也跳过（只认包内自带标识的条目）。
 *
 * 没有 uuid 的自增表（history / favorites）三种模式一致：按内容（tag 字符串）去重，
 * 已存在则跳过——避免"导入一个历史为 0 的包"把用户历史清空。
 *
 * 一致性：父仓库先写，子仓库写入前校验父 uuid 是否存在，缺父的条目计入 skipped + warnings。
 */

export const IMPORT_MODES = Object.freeze(['overwrite', 'merge', 'skip'])

/** 缺少 uuid 时允许自动补号的一级对象（dict/blobs 的键是业务键，缺失即无意义） */
const AUTO_KEY_STORES = new Set([STORES.GROUPS, STORES.SUBGROUPS, STORES.TAGS])

function emptyCounts() {
  const counts = {}
  for (const spec of ENTITY_SPECS) counts[spec.store] = 0
  return counts
}

function withTotals(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return { ...counts, total }
}

async function collectKeys(storeName) {
  const keys = await withTx(storeName, 'readonly', (tx) => tx.store.getAllKeys())
  return new Set(keys)
}

async function putBatches(storeName, records, onChunk) {
  for (let offset = 0; offset < records.length; offset += BUNDLE_BATCH_SIZE) {
    const chunk = records.slice(offset, offset + BUNDLE_BATCH_SIZE)
    await withTx(storeName, 'readwrite', async (tx) => {
      for (const record of chunk) await tx.store.put(record)
    })
    await onChunk(Math.min(offset + chunk.length, records.length))
  }
}

async function addBatches(storeName, records, onChunk) {
  for (let offset = 0; offset < records.length; offset += BUNDLE_BATCH_SIZE) {
    const chunk = records.slice(offset, offset + BUNDLE_BATCH_SIZE)
    await withTx(storeName, 'readwrite', async (tx) => {
      for (const record of chunk) await tx.store.add(record)
    })
    await onChunk(Math.min(offset + chunk.length, records.length))
  }
}

/** 带 uuid 的仓库：分组 / 二级分组 / 标签 / 词典 / 图片 */
async function importKeyedStore(spec, rawRecords, ctx) {
  const { mode, warnings, imported, skipped, report } = ctx
  const total = rawRecords.length
  const target = []
  const seen = new Set()

  rawRecords.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`${spec.store}: 第 ${index + 1} 条不是对象，已跳过`)
      skipped[spec.store] += 1
      return
    }
    const record = normalizeBundleRecord(spec.store, raw, index)
    if (!record[spec.key]) {
      if (mode === 'skip' || !AUTO_KEY_STORES.has(spec.store)) {
        warnings.push(`${spec.store}: 第 ${index + 1} 条缺少 ${spec.key}，已跳过`)
        skipped[spec.store] += 1
        return
      }
      record[spec.key] = uid()
      warnings.push(`${spec.store}: 第 ${index + 1} 条缺少 ${spec.key}，已生成新 uuid`)
    }
    const key = record[spec.key]
    if (seen.has(key)) {
      // 包内重复 uuid：后者覆盖前者（与 overwrite 语义一致）
      const previous = target.findIndex((item) => item[spec.key] === key)
      if (previous >= 0) target[previous] = record
      warnings.push(`${spec.store}: uuid ${key} 在包内重复，已保留最后一条`)
      return
    }
    seen.add(key)
    target.push(record)
  })

  if (spec.parentStore) {
    const parentKeys = await collectKeys(spec.parentStore)
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const record = target[index]
      if (!parentKeys.has(record[spec.parentField])) {
        warnings.push(
          `${spec.store}: ${spec.key}=${record[spec.key]} 的父级 ${spec.parentField}=${String(
            record[spec.parentField]
          )} 不存在，已跳过`
        )
        skipped[spec.store] += 1
        target.splice(index, 1)
      }
    }
  }

  let toWrite = target
  if (mode !== 'overwrite') {
    const existingKeys = await collectKeys(spec.store)
    toWrite = target.filter((record) => {
      if (existingKeys.has(record[spec.key])) {
        skipped[spec.store] += 1
        return false
      }
      return true
    })
  }

  await report({ store: spec.store, phase: 'start', done: 0, total })
  await putBatches(spec.store, toWrite, async (done) => {
    imported[spec.store] = done
    await report({ store: spec.store, phase: 'write', done, total: toWrite.length })
  })
  imported[spec.store] = toWrite.length
  await report({ store: spec.store, phase: 'done', done: toWrite.length, total: toWrite.length })
}

/** 自增键仓库（历史 / 收藏）：按内容去重 */
async function importContentStore(storeName, rawRecords, ctx) {
  const { warnings, imported, skipped, report } = ctx
  const existing = await withTx(storeName, 'readonly', (tx) => tx.store.getAll())
  const seenTags = new Set(existing.map((record) => record.tag))
  const toWrite = []

  rawRecords.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`${storeName}: 第 ${index + 1} 条不是对象，已跳过`)
      skipped[storeName] += 1
      return
    }
    const record = normalizeBundleRecord(storeName, raw, index)
    if (!record.tag) {
      warnings.push(`${storeName}: 第 ${index + 1} 条内容为空，已跳过`)
      skipped[storeName] += 1
      return
    }
    if (seenTags.has(record.tag)) {
      skipped[storeName] += 1
      return
    }
    seenTags.add(record.tag)
    toWrite.push(record)
  })

  await report({ store: storeName, phase: 'start', done: 0, total: rawRecords.length })
  await addBatches(storeName, toWrite, async (done) => {
    await report({ store: storeName, phase: 'write', done, total: toWrite.length })
  })
  imported[storeName] = toWrite.length
  await report({
    store: storeName,
    phase: 'done',
    done: toWrite.length,
    total: toWrite.length
  })
}

/** 主标签片段：格式是 {items, settings}（也兼容旧格式纯数组） */
async function importLabelsStore(payload, ctx) {
  const { mode, warnings, imported, skipped, report } = ctx
  const isObjectPayload = payload && !Array.isArray(payload) && typeof payload === 'object'
  const rawItems = toArray(isObjectPayload ? payload.items : payload)
  const settings = isObjectPayload ? payload.settings : undefined

  const normalized = []
  rawItems.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      skipped[STORES.LABELS] += 1
      return
    }
    if (mode === 'skip' && (raw.id === undefined || raw.id === null || raw.id === '')) {
      warnings.push(`labels: 第 ${index + 1} 条缺少 id，skip 模式下跳过`)
      skipped[STORES.LABELS] += 1
      return
    }
    normalized.push(normalizeLabelItem(raw, index))
  })

  await report({ store: STORES.LABELS, phase: 'start', done: 0, total: normalized.length })

  if (mode === 'overwrite') {
    const ids = new Set(normalized.map((item) => item.id))
    await withTx(STORES.LABELS, 'readwrite', async (tx) => {
      const keys = await tx.store.getAllKeys()
      for (const key of keys) {
        if (!ids.has(key)) await tx.store.delete(key)
      }
      for (const item of normalized) await tx.store.put(item)
    })
    imported[STORES.LABELS] = normalized.length
    if (settings && typeof settings === 'object') {
      await setMeta(META_KEYS.LABELS_SETTINGS, { ...DEFAULT_LABEL_SETTINGS, ...settings })
    }
  } else {
    const existingIds = await collectKeys(STORES.LABELS)
    const toWrite = normalized.filter((item) => {
      if (existingIds.has(item.id)) {
        skipped[STORES.LABELS] += 1
        return false
      }
      return true
    })
    await putBatches(STORES.LABELS, toWrite, async (done) => {
      await report({ store: STORES.LABELS, phase: 'write', done, total: toWrite.length })
    })
    imported[STORES.LABELS] = toWrite.length
    const current = await getMeta(META_KEYS.LABELS_SETTINGS, null)
    if (!current && settings && typeof settings === 'object') {
      await setMeta(META_KEYS.LABELS_SETTINGS, { ...DEFAULT_LABEL_SETTINGS, ...settings })
    }
  }

  await report({
    store: STORES.LABELS,
    phase: 'done',
    done: imported[STORES.LABELS],
    total: normalized.length
  })
}

/** 预览图（blobs）：bundle 里带 blob 才写 */
async function importBlobsStore(rawRecords, ctx) {
  const { warnings, imported, skipped, report } = ctx
  const records = []
  toArray(rawRecords).forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || !raw.key || !raw.blob) {
      warnings.push(`blobs: 第 ${index + 1} 条缺少 key/blob，已跳过`)
      skipped[STORES.BLOBS] += 1
      return
    }
    records.push({
      key: String(raw.key),
      blob: raw.blob,
      mime: typeof raw.mime === 'string' ? raw.mime : '',
      name: typeof raw.name === 'string' ? raw.name : ''
    })
  })
  await report({ store: STORES.BLOBS, phase: 'start', done: 0, total: records.length })
  await putBatches(STORES.BLOBS, records, async (done) => {
    await report({ store: STORES.BLOBS, phase: 'write', done, total: records.length })
  })
  imported[STORES.BLOBS] = records.length
  await report({ store: STORES.BLOBS, phase: 'done', done: records.length, total: records.length })
}

/**
 * @param {object} bundle 开发计划 §5.4 定义的数据包
 * @param {object} [options]
 * @param {'overwrite'|'merge'|'skip'} [options.mode='overwrite']
 * @param {(progress: {store: string, phase: 'start'|'write'|'done', done: number, total: number}) => void|Promise<void>} [options.onProgress]
 * @returns {Promise<{mode: string, imported: object, skipped: object, warnings: string[]}>}
 *          imported / skipped 均含各仓库条数与 total。
 */
export async function importBundle(bundle, { mode = 'overwrite', onProgress } = {}) {
  validateBundleHeader(bundle)
  if (!IMPORT_MODES.includes(mode)) {
    throw new Error(`不支持的导入模式: ${mode}（可选 ${IMPORT_MODES.join(' / ')}）`)
  }

  const warnings = Array.isArray(bundle.warnings) ? [...bundle.warnings] : []
  const imported = emptyCounts()
  const skipped = emptyCounts()
  const report = async (progress) => {
    if (typeof onProgress === 'function') await onProgress(progress)
  }
  const ctx = { mode, warnings, imported, skipped, report }
  const data = bundle.data || {}

  for (const spec of ENTITY_SPECS) {
    if (!(spec.store in data)) continue
    if (spec.store === STORES.LABELS) {
      await importLabelsStore(data[spec.store], ctx)
    } else if (spec.store === STORES.BLOBS) {
      await importBlobsStore(data[spec.store], ctx)
    } else if (!spec.key) {
      await importContentStore(spec.store, toArray(data[spec.store]), ctx)
    } else {
      await importKeyedStore(spec, toArray(data[spec.store]), ctx)
    }
  }

  const counts = bundle.counts || {}
  if (counts.images > 0 && !data[STORES.BLOBS]) {
    warnings.push(`数据包声明有 ${counts.images} 张预览图，但 JSON 里没有图片数据（需用带 images/ 的 zip 导入）`)
  }

  const result = {
    mode,
    imported: withTotals(imported),
    skipped: withTotals(skipped),
    warnings
  }

  await setMeta(META_KEYS.LAST_IMPORT, {
    at: Date.now(),
    mode,
    generatedAt: bundle.generatedAt ?? null,
    generator: bundle.generator ?? null,
    imported: result.imported,
    skipped: result.skipped,
    warnings: warnings.length
  })
  invalidateTagIndex()

  return result
}
