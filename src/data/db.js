import { openDB as idbOpenDB, deleteDB } from 'idb'
import { DEFAULT_COLOR } from './util.js'

export const DB_NAME = 'weilin-prompt-web'
export const DB_VERSION = 2

/** 对象仓库名（与开发计划 §4 表格一一对应） */
export const STORES = Object.freeze({
  META: 'meta',
  GROUPS: 'groups',
  SUBGROUPS: 'subgroups',
  TAGS: 'tags',
  HISTORY: 'history',
  FAVORITES: 'favorites',
  LABELS: 'labels',
  DICT: 'dict',
  TRANSLATIONS: 'translations',
  BLOBS: 'blobs'
})

export const ALL_STORES = Object.freeze(Object.values(STORES))

/** meta 仓库里使用到的固定键 */
export const META_KEYS = Object.freeze({
  SCHEMA_VERSION: 'schemaVersion',
  LAST_IMPORT: 'lastImport',
  SETTINGS: 'settings',
  LABELS_SETTINGS: 'labels.settings'
})

export { DEFAULT_COLOR }

let dbPromise = null

function upgrade(db) {
  if (!db.objectStoreNames.contains(STORES.META)) {
    db.createObjectStore(STORES.META, { keyPath: 'key' })
  }

  if (!db.objectStoreNames.contains(STORES.GROUPS)) {
    const groups = db.createObjectStore(STORES.GROUPS, { keyPath: 'p_uuid' })
    groups.createIndex('create_time', 'create_time')
  }

  if (!db.objectStoreNames.contains(STORES.SUBGROUPS)) {
    const subgroups = db.createObjectStore(STORES.SUBGROUPS, { keyPath: 'g_uuid' })
    subgroups.createIndex('p_uuid', 'p_uuid')
    subgroups.createIndex('create_time', 'create_time')
  }

  if (!db.objectStoreNames.contains(STORES.TAGS)) {
    const tags = db.createObjectStore(STORES.TAGS, { keyPath: 't_uuid' })
    tags.createIndex('g_uuid', 'g_uuid')
    tags.createIndex('text', 'text')
    tags.createIndex('create_time', 'create_time')
  }

  if (!db.objectStoreNames.contains(STORES.HISTORY)) {
    const history = db.createObjectStore(STORES.HISTORY, { keyPath: 'id', autoIncrement: true })
    history.createIndex('create_time', 'create_time')
  }

  if (!db.objectStoreNames.contains(STORES.FAVORITES)) {
    const favorites = db.createObjectStore(STORES.FAVORITES, {
      keyPath: 'id',
      autoIncrement: true
    })
    favorites.createIndex('create_time', 'create_time')
  }

  if (!db.objectStoreNames.contains(STORES.LABELS)) {
    const labels = db.createObjectStore(STORES.LABELS, { keyPath: 'id' })
    labels.createIndex('order', 'order')
  }

  if (!db.objectStoreNames.contains(STORES.DICT)) {
    const dict = db.createObjectStore(STORES.DICT, { keyPath: 'tag' })
    dict.createIndex('translate', 'translate')
  }

  if (!db.objectStoreNames.contains(STORES.TRANSLATIONS)) {
    const translations = db.createObjectStore(STORES.TRANSLATIONS, { keyPath: 'textLower' })
    translations.createIndex('updatedAt', 'updatedAt')
  }

  if (!db.objectStoreNames.contains(STORES.BLOBS)) {
    db.createObjectStore(STORES.BLOBS, { keyPath: 'key' })
  }
}

/** 打开（并缓存）数据库连接；首次调用即建库 */
export function openDB() {
  if (!dbPromise) {
    dbPromise = idbOpenDB(DB_NAME, DB_VERSION, {
      upgrade,
      terminated() {
        // 浏览器回收了连接（例如另一个标签页升级了库），下次调用重新打开
        dbPromise = null
      }
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/**
 * 事务封装：`fn(tx)` 里只做 IDB 操作（不要在里面 await 非 IDB 的 Promise，
 * 否则事务会自动提交），返回值在事务提交后回传；`fn` 抛错时事务中断。
 *
 * @param {string|string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx) => Promise<any>|any} fn
 */
export async function withTx(storeNames, mode, fn) {
  const db = await openDB()
  const names = Array.isArray(storeNames) ? storeNames : [storeNames]
  const tx = db.transaction(names, mode)
  try {
    const result = await fn(tx)
    await tx.done
    return result
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // 事务已结束，忽略
    }
    try {
      await tx.done
    } catch {
      // 只抛原始错误
    }
    throw error
  }
}

/** 关闭并丢弃缓存的连接（测试与"重置数据"用） */
export async function closeDB() {
  if (!dbPromise) return
  const pending = dbPromise
  dbPromise = null
  try {
    const db = await pending
    db.close()
  } catch {
    // 打开失败时无需关闭
  }
}

/** 删除整库（设置页"清空数据"与单测重置用） */
export async function deleteDatabase() {
  await closeDB()
  await deleteDB(DB_NAME)
}

/** 读取 meta 记录（返回 value，不存在时返回 fallback） */
export async function getMeta(key, fallback = null) {
  if (!key) return fallback
  return withTx(STORES.META, 'readonly', async (tx) => {
    const record = await tx.store.get(key)
    return record ? record.value : fallback
  })
}

/** 写入 meta 记录 */
export async function setMeta(key, value) {
  // meta 的值会随 bundle 导出/整库备份一起走，统一走结构化克隆可安全存的类型
  return withTx(STORES.META, 'readwrite', async (tx) => {
    await tx.store.put({ key, value })
    return true
  })
}

/** 统计某个仓库的记录数 */
export async function countStore(storeName) {
  return withTx(storeName, 'readonly', (tx) => tx.store.count())
}
