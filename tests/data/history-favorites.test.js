import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, tagJson } from './helpers.js'
import { getMeta, META_KEYS } from '../../src/data/db.js'
import {
  listHistory,
  addHistory,
  deleteHistory,
  clearHistory,
  clearAll
} from '../../src/data/repos/history.js'
import {
  listFavorites,
  addFavorite,
  updateFavorite,
  deleteFavorites
} from '../../src/data/repos/favorites.js'
import { createGroup, listGroups } from '../../src/data/repos/groups.js'
import { createSubgroup, listSubgroups } from '../../src/data/repos/subgroups.js'
import { createTag, listAllTags } from '../../src/data/repos/tags.js'
import { setMeta } from '../../src/data/db.js'

beforeEach(resetDatabase)

describe('repos/history', () => {
  it('新增历史：同内容不重复插入', async () => {
    const first = tagJson('1girl, cat')
    const second = tagJson('1girl, dog')

    expect(await addHistory(first)).toBe(true)
    expect(await addHistory(first)).toBe(false) // 内容相同 → 跳过
    expect(await addHistory(second)).toBe(true)
    expect(await addHistory('')).toBe(false)

    const list = await listHistory()
    expect(list.length).toBe(2)
    expect(list.map((item) => JSON.parse(item.tag).prompt).sort()).toEqual([
      '1girl, cat',
      '1girl, dog'
    ])
    expect(list[0].create_time).toBeGreaterThanOrEqual(list[1].create_time)
    expect(list[0].id).toBeTypeOf('number')
    expect(list[0].src_id).toBeNull()
  })

  it('列表按 create_time 降序（新的在前）', async () => {
    await addHistory(tagJson('first'))
    await addHistory(tagJson('second'))
    const list = await listHistory()
    expect(JSON.parse(list[0].tag).prompt).toBe('second')
  })

  it('批量删除 / 清空', async () => {
    await addHistory(tagJson('a'))
    await addHistory(tagJson('b'))
    await addHistory(tagJson('c'))
    const list = await listHistory()

    expect(await deleteHistory([list[0].id, 999999])).toEqual({ history: 1 })
    expect(await deleteHistory([])).toEqual({ history: 0 })
    expect((await listHistory()).length).toBe(2)
    expect(await clearHistory()).toEqual({ history: 2 })
    expect(await listHistory()).toEqual([])
  })
})

describe('repos/favorites', () => {
  it('新增收藏返回自增 id，同内容可重复收藏', async () => {
    const tag = tagJson('1girl, cat')
    const first = await addFavorite({ tag, name: '常用A', color: '#f00' })
    const second = await addFavorite({ tag, name: '常用B' })

    expect(first.id).toBeTypeOf('number')
    expect(second.id).toBeGreaterThan(first.id)
    expect(first).toMatchObject({ tag, name: '常用A', color: '#f00', src_id: null })

    const list = await listFavorites()
    expect(list.length).toBe(2)
    expect(list[0].id).toBe(second.id) // 降序：最新的在前
    await expect(addFavorite({})).rejects.toThrow('tag')
  })

  it('更新与批量删除收藏', async () => {
    const a = await addFavorite({ tag: tagJson('a'), name: 'A' })
    const b = await addFavorite({ tag: tagJson('b'), name: 'B' })

    const updated = await updateFavorite(a.id, { name: 'A2', color: '#0f0' })
    expect(updated).toMatchObject({ id: a.id, name: 'A2', color: '#0f0' })
    expect(await updateFavorite(999999, { name: 'x' })).toBeNull()
    await expect(updateFavorite(a.id, { tag: '' })).rejects.toThrow('tag')

    expect(await deleteFavorites([b.id, 999999])).toEqual({ favorites: 1 })
    expect((await listFavorites()).map((item) => item.name)).toEqual(['A2'])
  })
})

describe('repos/history clearAll', () => {
  it('清空全部仓库并返回各仓库条数', async () => {
    const group = await createGroup({ name: '人物' })
    const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
    await createTag({ g_uuid: sub.g_uuid, text: '1girl' })
    await addHistory(tagJson('1girl'))
    await addFavorite({ tag: tagJson('1girl'), name: 'A' })
    await setMeta(META_KEYS.SETTINGS, { theme: 'dark' })

    const counts = await clearAll()
    expect(counts.groups).toBe(1)
    expect(counts.subgroups).toBe(1)
    expect(counts.tags).toBe(1)
    expect(counts.history).toBe(1)
    expect(counts.favorites).toBe(1)
    expect(counts.meta).toBe(1)

    expect(await listGroups()).toEqual([])
    expect(await listSubgroups()).toEqual([])
    expect(await listAllTags()).toEqual([])
    expect(await listHistory()).toEqual([])
    expect(await listFavorites()).toEqual([])
    expect(await getMeta(META_KEYS.SETTINGS, null)).toBeNull()
  })
})
