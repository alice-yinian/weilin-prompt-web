import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { STORES, withTx } from '../../src/data/db.js'
import {
  dictSize,
  getDictEntries,
  getDictEntry,
  loadDictIndex,
  invalidateDictIndex,
  isDictIndexLoaded,
  searchDict
} from '../../src/data/repos/dict.js'

beforeEach(resetDatabase)

async function seedDict(entries) {
  await withTx(STORES.DICT, 'readwrite', async (tx) => {
    for (const entry of entries) await tx.store.put(entry)
  })
}

const SAMPLE = [
  { tag: '1girl', color_id: 0, translate: '1女孩', hot: 100, aliases: 0 },
  { tag: '1girls', color_id: 0, translate: '多女孩', hot: 10, aliases: 0 },
  { tag: 'black_cat', color_id: 3, translate: '黑猫', hot: 5, aliases: 1 },
  { tag: 'cat', color_id: 3, translate: '猫', hot: 50, aliases: 0 },
  { tag: 'dog', color_id: 4, translate: '狗', hot: 0, aliases: 0 }
]

describe('repos/dict', () => {
  it('dictSize 反映条目数', async () => {
    expect(await dictSize()).toBe(0)
    await seedDict(SAMPLE)
    expect(await dictSize()).toBe(SAMPLE.length)
  })

  it('getDictEntries 按入参顺序返回、未命中跳过；getDictEntry 取单条', async () => {
    await seedDict(SAMPLE)
    const entries = await getDictEntries(['cat', 'not-exist', '1girl'])
    expect(entries.map((entry) => entry.tag)).toEqual(['cat', '1girl'])
    expect(entries[0]).toMatchObject({ color_id: 3, translate: '猫', hot: 50, aliases: 0 })
    expect(await getDictEntries([])).toEqual([])
    expect(await getDictEntry('dog')).toMatchObject({ translate: '狗' })
    expect(await getDictEntry('')).toBeNull()
  })

  it('loadDictIndex 懒加载：只灌轻量三元组，可失效重载', async () => {
    await seedDict(SAMPLE)
    expect(isDictIndexLoaded()).toBe(false)

    const entries = await loadDictIndex()
    expect(isDictIndexLoaded()).toBe(true)
    expect(entries.length).toBe(SAMPLE.length)
    expect(Object.keys(entries[0]).sort()).toEqual(['color_id', 'tag', 'translate'])

    await loadDictIndex() // 命中缓存
    expect(await loadDictIndex()).toBe(entries)

    await seedDict([{ tag: 'zzz', color_id: 1, translate: '新词', hot: 0, aliases: 0 }])
    expect((await loadDictIndex()).length).toBe(SAMPLE.length) // 仍是缓存

    invalidateDictIndex()
    expect(isDictIndexLoaded()).toBe(false)
    expect((await loadDictIndex()).length).toBe(SAMPLE.length + 1)
  })

  it('searchDict 打分口径与上游一致（tag 100/90/80，translate 70/60/50）', async () => {
    await seedDict(SAMPLE)

    expect((await searchDict('1girl')).map((entry) => entry.tag)).toEqual(['1girl', '1girls'])
    expect((await searchDict('cat')).map((entry) => entry.tag)).toEqual(['cat', 'black_cat'])
    expect((await searchDict('猫')).map((entry) => entry.tag)).toEqual(['black_cat', 'cat'])
    expect((await searchDict('CAT')).map((entry) => entry.tag)).toEqual(['cat', 'black_cat'])
    expect(await searchDict('')).toEqual([])
    expect(await searchDict('   ')).toEqual([])
    expect(await searchDict('nothing-matches')).toEqual([])
  })

  it('searchDict 遵守 limit 且首次搜索会触发懒加载', async () => {
    await seedDict(SAMPLE)
    expect(isDictIndexLoaded()).toBe(false)

    const limited = await searchDict('1girl', 1)
    expect(limited.map((entry) => entry.tag)).toEqual(['1girl'])
    expect(limited[0]).toMatchObject({ color_id: 0, translate: '1女孩', hot: 100 })
    expect(isDictIndexLoaded()).toBe(true)

    expect((await searchDict('1girl', 0)).length).toBe(2) // 非法 limit 回退默认值
  })
})
