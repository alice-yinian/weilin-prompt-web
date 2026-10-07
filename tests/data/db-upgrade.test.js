import { describe, it, expect, beforeEach } from 'vitest'
import { openDB as idbOpenDB } from 'idb'
import { resetDatabase } from './helpers.js'
import {
  DB_NAME,
  DB_VERSION,
  STORES,
  ALL_STORES,
  openDB,
  withTx,
  getMeta
} from '../../src/data/db.js'
import { putTranslation, getTranslation } from '../../src/data/repos/translations.js'

beforeEach(resetDatabase)

/** 复刻 db.js v1 的建表逻辑，用于造一个"旧库" */
function createV1Schema(db) {
  db.createObjectStore(STORES.META, { keyPath: 'key' })

  const groups = db.createObjectStore(STORES.GROUPS, { keyPath: 'p_uuid' })
  groups.createIndex('create_time', 'create_time')

  const subgroups = db.createObjectStore(STORES.SUBGROUPS, { keyPath: 'g_uuid' })
  subgroups.createIndex('p_uuid', 'p_uuid')
  subgroups.createIndex('create_time', 'create_time')

  const tags = db.createObjectStore(STORES.TAGS, { keyPath: 't_uuid' })
  tags.createIndex('g_uuid', 'g_uuid')
  tags.createIndex('text', 'text')
  tags.createIndex('create_time', 'create_time')

  const history = db.createObjectStore(STORES.HISTORY, { keyPath: 'id', autoIncrement: true })
  history.createIndex('create_time', 'create_time')

  const favorites = db.createObjectStore(STORES.FAVORITES, { keyPath: 'id', autoIncrement: true })
  favorites.createIndex('create_time', 'create_time')

  const labels = db.createObjectStore(STORES.LABELS, { keyPath: 'id' })
  labels.createIndex('order', 'order')

  const dict = db.createObjectStore(STORES.DICT, { keyPath: 'tag' })
  dict.createIndex('translate', 'translate')

  db.createObjectStore(STORES.BLOBS, { keyPath: 'key' })
}

describe('db 升级', () => {
  it('DB_VERSION 为 2 且 ALL_STORES 含 translations', () => {
    expect(DB_VERSION).toBe(2)
    expect(STORES.TRANSLATIONS).toBe('translations')
    expect(ALL_STORES).toContain('translations')
  })

  it('v1 旧库打开后自动升级到 v2：旧数据保留且 translations 可用', async () => {
    const v1 = await idbOpenDB(DB_NAME, 1, { upgrade: createV1Schema })
    expect(v1.version).toBe(1)
    expect(v1.objectStoreNames.contains(STORES.TRANSLATIONS)).toBe(false)

    await v1.put(STORES.GROUPS, {
      p_uuid: 'p1',
      name: '旧分组',
      color: '#000',
      create_time: 1,
      src_id: null
    })
    await v1.put(STORES.META, { key: 'schemaVersion', value: 1 })
    v1.close()

    const upgraded = await openDB()
    expect(upgraded.version).toBe(2)
    expect(upgraded.objectStoreNames.contains(STORES.TRANSLATIONS)).toBe(true)

    const group = await withTx(STORES.GROUPS, 'readonly', (tx) => tx.store.get('p1'))
    expect(group).toMatchObject({ p_uuid: 'p1', name: '旧分组' })
    expect(await getMeta('schemaVersion')).toBe(1)

    // 新仓库立即可读写
    await putTranslation('Old', '旧', 'manual')
    expect((await getTranslation('old')).translated).toBe('旧')
  })
})
