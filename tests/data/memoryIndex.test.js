import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { STORES, withTx } from '../../src/data/db.js'
import { createGroup } from '../../src/data/repos/groups.js'
import { createSubgroup } from '../../src/data/repos/subgroups.js'
import { createTag } from '../../src/data/repos/tags.js'
import { loadDictIndex, isDictIndexLoaded } from '../../src/data/repos/dict.js'
import {
  buildTagIndex,
  getTagIndex,
  invalidateTagIndex,
  isTagIndexBuilt
} from '../../src/data/memoryIndex.js'

beforeEach(resetDatabase)

async function seedTags() {
  const group = await createGroup({ name: '人物' })
  const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
  const cat = await createTag({ g_uuid: sub.g_uuid, text: 'Cat', desc: '猫', color: '#f00' })
  const girl = await createTag({ g_uuid: sub.g_uuid, text: '1girl', desc: '1女孩' })
  return { group, sub, cat, girl }
}

describe('data/memoryIndex', () => {
  it('buildTagIndex 覆盖全量 tags，byText 使用小写 key', async () => {
    const { sub, cat, girl } = await seedTags()
    const index = await buildTagIndex()

    expect(index.entries.length).toBe(2)
    expect(index.entries.map((entry) => entry.text).sort()).toEqual(['1girl', 'Cat'])
    expect(Object.keys(index.entries[0]).sort()).toEqual([
      'color',
      'desc',
      'g_uuid',
      't_uuid',
      'text'
    ])
    expect(index.byText.get('cat')).toMatchObject({
      t_uuid: cat.t_uuid,
      g_uuid: sub.g_uuid,
      text: 'Cat',
      desc: '猫',
      color: '#f00'
    })
    expect(index.byText.get('1girl')).toMatchObject({ t_uuid: girl.t_uuid })
    expect(index.byText.has('Cat')).toBe(false)
    expect(isTagIndexBuilt()).toBe(true)
  })

  it('getTagIndex 命中缓存，invalidate 后能拿到新数据', async () => {
    const { sub } = await seedTags()
    const first = await getTagIndex()
    expect(await getTagIndex()).toBe(first)

    await createTag({ g_uuid: sub.g_uuid, text: 'dog' })
    expect((await getTagIndex()).entries.length).toBe(2) // 仍是缓存

    invalidateTagIndex()
    expect(isTagIndexBuilt()).toBe(false)
    const rebuilt = await getTagIndex()
    expect(rebuilt).not.toBe(first)
    expect(rebuilt.entries.length).toBe(3)
  })

  it('多次并发 getTagIndex 共享同一次构建', async () => {
    await seedTags()
    const [a, b, c] = await Promise.all([getTagIndex(), getTagIndex(), getTagIndex()])
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('同名 tag 只保留最新的一条（entries 按 create_time 降序）', async () => {
    const group = await createGroup({ name: '人物' })
    const first = await createSubgroup({ p_uuid: group.p_uuid, name: 'A' })
    const second = await createSubgroup({ p_uuid: group.p_uuid, name: 'B' })
    await createTag({ g_uuid: first.g_uuid, text: 'dup' })
    const newest = await createTag({ g_uuid: second.g_uuid, text: 'dup' })

    const index = await buildTagIndex()
    expect(index.entries.length).toBe(2)
    expect(index.byText.get('dup').t_uuid).toBe(newest.t_uuid)
  })

  it('invalidateTagIndex 同时失效词典索引', async () => {
    await withTx(STORES.DICT, 'readwrite', async (tx) => {
      await tx.store.put({ tag: 'cat', color_id: 3, translate: '猫', hot: 1, aliases: 0 })
    })
    await loadDictIndex()
    expect(isDictIndexLoaded()).toBe(true)

    invalidateTagIndex()
    expect(isDictIndexLoaded()).toBe(false)
  })
})
