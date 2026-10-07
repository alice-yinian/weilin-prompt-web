import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, tagJson } from './helpers.js'
import { getMeta, META_KEYS, STORES, withTx } from '../../src/data/db.js'
import { listGroups, createGroup } from '../../src/data/repos/groups.js'
import { listSubgroups, createSubgroup } from '../../src/data/repos/subgroups.js'
import { listAllTags, createTag } from '../../src/data/repos/tags.js'
import { listHistory, addHistory } from '../../src/data/repos/history.js'
import { listFavorites, addFavorite } from '../../src/data/repos/favorites.js'
import { getLabelsPayload, saveLabelsPayload } from '../../src/data/repos/labels.js'
import { isDictIndexLoaded } from '../../src/data/repos/dict.js'
import { loadDictIndex } from '../../src/data/repos/dict.js'
import { importBundle } from '../../src/data/bundle/importBundle.js'
import { exportBundle, verifyBundleChecksum, isChecksumAvailable } from '../../src/data/bundle/exportBundle.js'

beforeEach(resetDatabase)

function makeBundle(data = {}, extra = {}) {
  return {
    format: 'weilin-prompt-bundle',
    formatVersion: 1,
    generatedAt: 1759800000000,
    generator: 'test/1.0.0',
    source: { lang: 'zh_CN', dbFiles: [], hasImages: false },
    counts: {},
    data: {
      groups: [],
      subgroups: [],
      tags: [],
      history: [],
      favorites: [],
      dict: [],
      labels: { items: [], settings: {} },
      ...data
    },
    warnings: [],
    checksum: null,
    ...extra
  }
}

describe('bundle/importBundle 校验', () => {
  it('拒绝非法入参', async () => {
    await expect(importBundle(null)).rejects.toThrow('数据包内容不是对象')
    await expect(importBundle({ format: 'other', formatVersion: 1 })).rejects.toThrow('格式不匹配')
    await expect(
      importBundle({ format: 'weilin-prompt-bundle', formatVersion: 2 })
    ).rejects.toThrow('版本不支持')
    await expect(
      importBundle({ format: 'weilin-prompt-bundle', formatVersion: 1, data: 'x' })
    ).rejects.toThrow('data 字段')
    await expect(importBundle(makeBundle(), { mode: 'nope' })).rejects.toThrow('不支持的导入模式')
  })

  it('空包不报错，各仓库计数为 0', async () => {
    const result = await importBundle(makeBundle())
    expect(result.imported.total).toBe(0)
    expect(result.skipped.total).toBe(0)
    expect(result.mode).toBe('overwrite')
    expect(result.warnings).toEqual([])
  })
})

describe('bundle/importBundle 三种 mode', () => {
  const baseData = {
    groups: [
      { p_uuid: 'p1', name: '包内名', color: 'rgba(1, 2, 3, .4)', create_time: 100, src_id: 1 },
      { p_uuid: 'p2', name: '新增组', create_time: 200 }
    ],
    subgroups: [
      { g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 100 },
      { g_uuid: 'g2', p_uuid: 'p2', name: '子2', create_time: 200 }
    ]
  }

  it('overwrite：同 uuid 覆盖', async () => {
    await createGroup({ name: '库内名' })
    // 先手工把库内分组的 uuid 固定成 p1，模拟"已有同 uuid 记录"
    await withTx(STORES.GROUPS, 'readwrite', async (tx) => {
      const all = await tx.store.getAll()
      await tx.store.delete(all[0].p_uuid)
      await tx.store.put({ p_uuid: 'p1', name: '库内名', color: '#000', create_time: 50, src_id: 9 })
    })

    const result = await importBundle(makeBundle(baseData), { mode: 'overwrite' })
    expect(result.imported.groups).toBe(2)
    expect(result.skipped.groups).toBe(0)

    const groups = await listGroups()
    expect(groups.map((group) => group.name)).toEqual(['包内名', '新增组'])
    expect(groups[0]).toMatchObject({ p_uuid: 'p1', color: 'rgba(1, 2, 3, .4)', src_id: 1 })
  })

  it('merge：同 uuid 保留库内记录，只插入缺失的', async () => {
    await withTx(STORES.GROUPS, 'readwrite', async (tx) => {
      await tx.store.put({ p_uuid: 'p1', name: '库内名', color: '#000', create_time: 50 })
    })

    const result = await importBundle(makeBundle(baseData), { mode: 'merge' })
    expect(result.imported.groups).toBe(1)
    expect(result.skipped.groups).toBe(1)
    expect((await listGroups()).map((group) => group.name)).toEqual(['库内名', '新增组'])
  })

  it('skip：同 uuid 跳过，缺 uuid 的记录也跳过；merge 会补新 uuid', async () => {
    const data = {
      groups: [{ name: '无 uuid 组', create_time: 10 }],
      subgroups: [],
      tags: [{ g_uuid: 'g1', text: 'orphan' }]
    }

    const skippedResult = await importBundle(makeBundle(data), { mode: 'skip' })
    expect(skippedResult.imported.groups).toBe(0)
    expect(skippedResult.skipped.groups).toBe(1)
    expect(skippedResult.warnings.join('\n')).toMatch('缺少 p_uuid')
    expect(await listGroups()).toEqual([])

    const mergeResult = await importBundle(makeBundle(data), { mode: 'merge' })
    expect(mergeResult.imported.groups).toBe(1)
    expect(mergeResult.warnings.join('\n')).toMatch('已生成新 uuid')
    const groups = await listGroups()
    expect(groups.length).toBe(1)
    expect(groups[0].p_uuid).toBeTruthy()
  })

  it('父级 uuid 缺失的条目计入 skipped 并写告警', async () => {
    const data = {
      groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }],
      subgroups: [{ g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 1 }],
      tags: [
        { t_uuid: 't1', g_uuid: 'g1', text: 'ok' },
        { t_uuid: 't2', g_uuid: 'missing', text: 'orphan' }
      ]
    }
    const result = await importBundle(makeBundle(data))

    expect(result.imported.tags).toBe(1)
    expect(result.skipped.tags).toBe(1)
    expect(result.warnings.some((line) => line.includes('父级 g_uuid=missing 不存在'))).toBe(true)
    expect((await listAllTags()).map((tag) => tag.text)).toEqual(['ok'])
  })

  it('历史/收藏按内容去重（三种模式一致）', async () => {
    await addHistory(tagJson('already'))
    const data = {
      history: [
        { tag: tagJson('already'), name: '', color: '', create_time: 111 },
        { tag: tagJson('fresh'), name: '', color: '', create_time: 222 }
      ],
      favorites: [{ tag: tagJson('fav'), name: 'F', color: '#0f0', create_time: 333 }]
    }
    const result = await importBundle(makeBundle(data), { mode: 'overwrite' })

    expect(result.imported.history).toBe(1)
    expect(result.skipped.history).toBe(1)
    expect(result.imported.favorites).toBe(1)
    expect((await listHistory()).length).toBe(2)
    expect((await listFavorites()).map((item) => item.name)).toEqual(['F'])
  })

  it('labels：overwrite 全量覆盖，merge 只补缺失 id', async () => {
    const labels = {
      items: [
        { id: 'l1', name: '包内旧', content: 'x', createdAt: 1, updatedAt: 2, order: 0 },
        { id: 'l2', name: '包内新', content: 'y', createdAt: 3, updatedAt: 4, order: 1 }
      ],
      settings: { sortMode: 'name', selectedId: 'l2' }
    }

    await saveLabelsPayload({ items: [{ id: 'l1', name: '库内', content: 'z', order: 0 }] })
    const overwrite = await importBundle(makeBundle({ labels }), { mode: 'overwrite' })
    expect(overwrite.imported.labels).toBe(2)

    let payload = await getLabelsPayload()
    expect(payload.items.map((item) => item.name)).toEqual(['包内旧', '包内新'])
    expect(payload.settings).toMatchObject({ sortMode: 'name', selectedId: 'l2' })

    await resetDatabase()
    await saveLabelsPayload({ items: [{ id: 'l1', name: '库内', content: 'z', order: 0 }] })
    const merged = await importBundle(makeBundle({ labels }), { mode: 'merge' })
    expect(merged.imported.labels).toBe(1)
    expect(merged.skipped.labels).toBe(1)

    payload = await getLabelsPayload()
    expect(payload.items.map((item) => item.name)).toEqual(['库内', '包内新'])
  })

  it('分批写入（每批 1000）并回调进度', async () => {
    const tags = Array.from({ length: 1001 }, (_, index) => ({
      t_uuid: `t${String(index).padStart(4, '0')}`,
      g_uuid: 'g1',
      text: `tag_${index}`,
      create_time: 1000 + index
    }))
    const bundle = makeBundle({
      groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }],
      subgroups: [{ g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 1 }],
      tags
    })

    const events = []
    const result = await importBundle(bundle, {
      onProgress: (progress) => {
        events.push(progress)
      }
    })

    expect(result.imported.tags).toBe(1001)
    const tagWrites = events.filter((event) => event.store === 'tags' && event.phase === 'write')
    expect(tagWrites.map((event) => event.done)).toEqual([1000, 1001])
    expect(tagWrites[1].total).toBe(1001)
    expect(events.some((event) => event.phase === 'done' && event.store === 'tags')).toBe(true)
    expect((await listAllTags()).length).toBe(1001)
  })

  it('导入后写入 lastImport 并失效内存索引', async () => {
    await withTx(STORES.DICT, 'readwrite', async (tx) => {
      await tx.store.put({ tag: 'cat', color_id: 3, translate: '猫', hot: 0, aliases: 0 })
    })
    await loadDictIndex()
    expect(isDictIndexLoaded()).toBe(true)

    await importBundle(makeBundle({ groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }] }))
    expect(isDictIndexLoaded()).toBe(false)

    const lastImport = await getMeta(META_KEYS.LAST_IMPORT, null)
    expect(lastImport).toMatchObject({ mode: 'overwrite', generator: 'test/1.0.0' })
    expect(lastImport.imported.groups).toBe(1)
  })
})

describe('bundle/exportBundle', () => {
  async function seed() {
    const group = await createGroup({ name: '人物' })
    const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
    await createTag({ g_uuid: sub.g_uuid, text: '1girl', desc: '1女孩' })
    await createTag({ g_uuid: sub.g_uuid, text: 'cat', desc: '猫' })
    await addHistory(tagJson('1girl, cat'))
    await addFavorite({ tag: tagJson('1girl'), name: '常用', color: '#f00' })
    await saveLabelsPayload({
      items: [{ id: 'l1', name: '正面', content: '1girl', createdAt: 1, updatedAt: 2, order: 0 }],
      settings: { sortMode: 'time' }
    })
    await withTx(STORES.DICT, 'readwrite', async (tx) => {
      await tx.store.put({ tag: 'cat', color_id: 3, translate: '猫', hot: 5, aliases: 0 })
      await tx.store.put({ tag: '1girl', color_id: 0, translate: '1女孩', hot: 100, aliases: 0 })
    })
  }

  it('产出与 §5.4 一致的结构与 counts', async () => {
    await seed()
    const bundle = await exportBundle()

    expect(bundle.format).toBe('weilin-prompt-bundle')
    expect(bundle.formatVersion).toBe(1)
    expect(bundle.generatedAt).toBeTypeOf('number')
    expect(bundle.counts).toEqual({
      groups: 1,
      subgroups: 1,
      tags: 2,
      history: 1,
      favorites: 1,
      dict: 2,
      labels: 1,
      images: 0
    })
    expect(bundle.source.hasImages).toBe(false)
    expect(bundle.data.groups[0]).not.toHaveProperty('id')
    expect(bundle.data.tags[0]).toHaveProperty('image_status')
    expect(bundle.data.history[0]).not.toHaveProperty('id')
    expect(Object.keys(bundle.data.labels)).toEqual(['items', 'settings'])

    if (isChecksumAvailable()) {
      expect(bundle.checksum.groups).toMatch(/^sha256:[0-9a-f]{64}$/)
      const verified = await verifyBundleChecksum(bundle)
      expect(verified).toEqual({ available: true, ok: true, mismatched: [] })
    } else {
      expect(bundle.checksum).toBeNull()
      expect(bundle.warnings.join('\n')).toMatch('Web Crypto')
      const verified = await verifyBundleChecksum(bundle)
      expect(verified.available).toBe(false)
    }
  })

  it('导出→导入→再导出：数据、counts 与 checksum 完全一致', async () => {
    await seed()
    const first = await exportBundle()

    await resetDatabase()
    const result = await importBundle(first, { mode: 'overwrite' })
    expect(result.imported.total).toBe(9)
    expect(result.skipped.total).toBe(0)

    const second = await exportBundle()
    expect(second.counts).toEqual(first.counts)
    expect(second.data).toEqual(first.data)
    expect(second.checksum).toEqual(first.checksum)
    if (isChecksumAvailable()) {
      expect((await verifyBundleChecksum(second)).ok).toBe(true)
    }
  })

  it('导出时不带词典（可选）', async () => {
    await seed()
    const bundle = await exportBundle({ includeDict: false })
    expect(bundle.counts.dict).toBe(0)
    expect(bundle.data.dict).toEqual([])
    if (isChecksumAvailable()) {
      expect(bundle.checksum.dict).toBeTypeOf('string')
    } else {
      expect(bundle.checksum).toBeNull()
    }
  })
})
