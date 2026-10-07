import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { DEFAULT_COLOR } from '../../src/data/db.js'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  moveGroup
} from '../../src/data/repos/groups.js'
import {
  listSubgroups,
  createSubgroup,
  updateSubgroup,
  deleteSubgroup,
  moveSubgroup
} from '../../src/data/repos/subgroups.js'
import {
  listTags,
  listAllTags,
  getTag,
  createTag,
  updateTag,
  deleteTags,
  moveTag,
  searchTagsByPrefix
} from '../../src/data/repos/tags.js'

beforeEach(resetDatabase)

describe('repos/groups', () => {
  it('新建分组：补 uuid、默认颜色，按 create_time 升序追加在末尾', async () => {
    const first = await createGroup({ name: '人物' })
    const second = await createGroup({ name: '场景', color: '#fff' })

    expect(first.p_uuid).toBeTruthy()
    expect(first.g_uuid).toBeUndefined()
    expect(first.color).toBe(DEFAULT_COLOR)
    expect(first.src_id).toBeNull()
    expect(first.create_time).toBeGreaterThan(0)
    expect(second.create_time).toBeGreaterThan(first.create_time)

    const list = await listGroups()
    expect(list.map((group) => group.name)).toEqual(['人物', '场景'])
  })

  it('缺少 name 抛错', async () => {
    await expect(createGroup({})).rejects.toThrow('name')
    await expect(createGroup({ name: '   ' })).rejects.toThrow('name')
  })

  it('更新分组：只改传入字段，目标不存在返回 null', async () => {
    const group = await createGroup({ name: '人物', color: '#000' })
    const updated = await updateGroup(group.p_uuid, { name: '角色' })

    expect(updated).toMatchObject({ p_uuid: group.p_uuid, name: '角色', color: '#000' })
    expect((await listGroups())[0].name).toBe('角色')
    expect(await updateGroup('not-exist', { name: 'x' })).toBeNull()
    await expect(updateGroup(group.p_uuid, { name: '' })).rejects.toThrow('name')
  })

  it('删除分组：级联删除二级分组与标签', async () => {
    const keep = await createGroup({ name: '保留' })
    const drop = await createGroup({ name: '删除' })

    const dropSub = await createSubgroup({ p_uuid: drop.p_uuid, name: '子A' })
    const dropSub2 = await createSubgroup({ p_uuid: drop.p_uuid, name: '子B' })
    const keepSub = await createSubgroup({ p_uuid: keep.p_uuid, name: '子C' })
    await createTag({ g_uuid: dropSub.g_uuid, text: '1girl' })
    await createTag({ g_uuid: dropSub.g_uuid, text: '2girl' })
    await createTag({ g_uuid: dropSub2.g_uuid, text: 'cat' })
    await createTag({ g_uuid: keepSub.g_uuid, text: 'dog' })

    const deleted = await deleteGroup(drop.p_uuid)
    expect(deleted).toEqual({ groups: 1, subgroups: 2, tags: 3 })

    expect((await listGroups()).map((group) => group.name)).toEqual(['保留'])
    expect((await listSubgroups()).map((sub) => sub.name)).toEqual(['子C'])
    expect((await listAllTags()).map((tag) => tag.text)).toEqual(['dog'])
    expect(await deleteGroup('not-exist')).toEqual({ groups: 0, subgroups: 0, tags: 0 })
  })

  it('移动分组：before/after 改写 create_time，参照项缺失返回 false', async () => {
    const a = await createGroup({ name: 'a' })
    const b = await createGroup({ name: 'b' })
    const c = await createGroup({ name: 'c' })
    expect((await listGroups()).map((group) => group.name)).toEqual(['a', 'b', 'c'])

    expect(await moveGroup(c.p_uuid, a.p_uuid, 'before')).toBe(true)
    expect((await listGroups()).map((group) => group.name)).toEqual(['c', 'a', 'b'])

    expect(await moveGroup(a.p_uuid, b.p_uuid, 'after')).toBe(true)
    expect((await listGroups()).map((group) => group.name)).toEqual(['c', 'b', 'a'])

    expect(await moveGroup(a.p_uuid, 'not-exist', 'before')).toBe(false)
    expect(await moveGroup('not-exist', a.p_uuid, 'before')).toBe(false)
    expect(await moveGroup(a.p_uuid, b.p_uuid, 'middle')).toBe(false)
    expect(await moveGroup(a.p_uuid, a.p_uuid, 'before')).toBe(false)
  })

  it('移动分组撞值时保序重整，顺序仍然确定', async () => {
    const a = await createGroup({ name: 'a' })
    const b = await createGroup({ name: 'b' })
    const c = await createGroup({ name: 'c' })

    await moveGroup(b.p_uuid, a.p_uuid, 'before') // b 抢到 a 前面
    await moveGroup(c.p_uuid, a.p_uuid, 'before') // c 与 b 撞 create_time → 整体重整

    const list = await listGroups()
    expect(list.map((group) => group.name)).toEqual(['b', 'c', 'a'])
    const times = list.map((group) => group.create_time)
    expect(times[0]).toBeLessThan(times[1])
    expect(times[1]).toBeLessThan(times[2])
  })
})

describe('repos/subgroups', () => {
  it('新建二级分组：父分组必须存在，按父分组过滤查询', async () => {
    const group = await createGroup({ name: '人物' })
    const other = await createGroup({ name: '场景' })
    const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
    await createSubgroup({ p_uuid: other.p_uuid, name: '背景' })

    expect(sub.g_uuid).toBeTruthy()
    expect(sub.p_uuid).toBe(group.p_uuid)
    expect(sub.color).toBe(DEFAULT_COLOR)
    expect((await listSubgroups(group.p_uuid)).map((item) => item.name)).toEqual(['对象'])
    expect((await listSubgroups()).length).toBe(2)
    await expect(createSubgroup({ p_uuid: 'not-exist', name: 'x' })).rejects.toThrow('父一级分组')
    await expect(createSubgroup({ p_uuid: group.p_uuid })).rejects.toThrow('name')
  })

  it('更新 / 删除二级分组：删除时级联标签', async () => {
    const group = await createGroup({ name: '人物' })
    const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
    const updated = await updateSubgroup(sub.g_uuid, { color: '#123' })
    expect(updated).toMatchObject({ name: '对象', color: '#123' })
    expect(await updateSubgroup('not-exist', { name: 'x' })).toBeNull()

    await createTag({ g_uuid: sub.g_uuid, text: '1girl' })
    await createTag({ g_uuid: sub.g_uuid, text: 'cat' })
    expect(await deleteSubgroup(sub.g_uuid)).toEqual({ subgroups: 1, tags: 2 })
    expect(await listSubgroups(group.p_uuid)).toEqual([])
    expect(await listAllTags()).toEqual([])
    expect(await deleteSubgroup('not-exist')).toEqual({ subgroups: 0, tags: 0 })
    // 父分组不受影响
    expect((await listGroups()).length).toBe(1)
  })

  it('移动二级分组：只在同一父分组内生效', async () => {
    const group = await createGroup({ name: '人物' })
    const other = await createGroup({ name: '场景' })
    const a = await createSubgroup({ p_uuid: group.p_uuid, name: 'a' })
    const b = await createSubgroup({ p_uuid: group.p_uuid, name: 'b' })
    const outsider = await createSubgroup({ p_uuid: other.p_uuid, name: 'x' })

    expect(await moveSubgroup(b.g_uuid, a.g_uuid, 'before')).toBe(true)
    expect((await listSubgroups(group.p_uuid)).map((item) => item.name)).toEqual(['b', 'a'])

    expect(await moveSubgroup(b.g_uuid, outsider.g_uuid, 'before')).toBe(false)
    expect((await listSubgroups(group.p_uuid)).map((item) => item.name)).toEqual(['b', 'a'])
  })
})

describe('repos/tags', () => {
  async function setup() {
    const group = await createGroup({ name: '人物' })
    const sub = await createSubgroup({ p_uuid: group.p_uuid, name: '对象' })
    return { group, sub }
  }

  it('新建标签：父二级分组必须存在，列表按 create_time 降序（新的在前）', async () => {
    const { sub } = await setup()
    const first = await createTag({ g_uuid: sub.g_uuid, text: '1girl', desc: '1女孩' })
    const second = await createTag({ g_uuid: sub.g_uuid, text: 'cat' })

    expect(first.t_uuid).toBeTruthy()
    expect(first.color).toBe(DEFAULT_COLOR)
    expect(first.image_path).toBeNull()
    expect(first.image_status).toBeNull()
    expect(second.create_time).toBeGreaterThan(first.create_time)
    expect((await listTags(sub.g_uuid)).map((tag) => tag.text)).toEqual(['cat', '1girl'])
    expect((await listAllTags()).length).toBe(2)
    await expect(createTag({ g_uuid: 'not-exist', text: 'x' })).rejects.toThrow('父二级分组')
  })

  it('读取 / 更新标签', async () => {
    const { sub } = await setup()
    const tag = await createTag({ g_uuid: sub.g_uuid, text: 'cat', desc: '猫' })

    expect(await getTag(tag.t_uuid)).toMatchObject({ text: 'cat', desc: '猫' })
    expect(await getTag('not-exist')).toBeNull()

    const updated = await updateTag(tag.t_uuid, {
      desc: '猫猫',
      image_path: 'tag_images/x.png',
      image_status: 'ready'
    })
    expect(updated).toMatchObject({ text: 'cat', desc: '猫猫', image_status: 'ready' })
    expect(await updateTag('not-exist', { desc: 'x' })).toBeNull()
  })

  it('批量删除只统计真实存在的条目', async () => {
    const { sub } = await setup()
    const a = await createTag({ g_uuid: sub.g_uuid, text: 'a' })
    const b = await createTag({ g_uuid: sub.g_uuid, text: 'b' })
    await createTag({ g_uuid: sub.g_uuid, text: 'c' })

    expect(await deleteTags([a.t_uuid, b.t_uuid, 'not-exist'])).toEqual({ tags: 2 })
    expect(await deleteTags([])).toEqual({ tags: 0 })
    expect((await listTags(sub.g_uuid)).map((tag) => tag.text)).toEqual(['c'])
  })

  it('移动标签：降序语义（before = create_time + 1）', async () => {
    const { sub } = await setup()
    const a = await createTag({ g_uuid: sub.g_uuid, text: 'a' })
    const b = await createTag({ g_uuid: sub.g_uuid, text: 'b' })
    const c = await createTag({ g_uuid: sub.g_uuid, text: 'c' })
    expect((await listTags(sub.g_uuid)).map((tag) => tag.text)).toEqual(['c', 'b', 'a'])

    expect(await moveTag(a.t_uuid, c.t_uuid, 'before')).toBe(true)
    expect((await listTags(sub.g_uuid)).map((tag) => tag.text)).toEqual(['a', 'c', 'b'])

    expect(await moveTag(b.t_uuid, c.t_uuid, 'after')).toBe(true)
    expect((await listTags(sub.g_uuid)).map((tag) => tag.text)).toEqual(['a', 'c', 'b'])

    // 跨二级分组移动无效
    const otherSub = await createSubgroup({ p_uuid: (await listGroups())[0].p_uuid, name: '别的' })
    const outsider = await createTag({ g_uuid: otherSub.g_uuid, text: 'z' })
    expect(await moveTag(a.t_uuid, outsider.t_uuid, 'before')).toBe(false)
    expect(await moveTag('not-exist', a.t_uuid, 'before')).toBe(false)
  })

  it('文本索引前缀搜索（大小写敏感）', async () => {
    const { sub } = await setup()
    await createTag({ g_uuid: sub.g_uuid, text: 'cat' })
    await createTag({ g_uuid: sub.g_uuid, text: 'category' })
    await createTag({ g_uuid: sub.g_uuid, text: 'dog' })

    const found = await searchTagsByPrefix('cat')
    expect(found.map((tag) => tag.text).sort()).toEqual(['cat', 'category'])
    expect((await searchTagsByPrefix('cat', { limit: 1 })).length).toBe(1)
    expect(await searchTagsByPrefix('CAT')).toEqual([])
    expect(await searchTagsByPrefix('')).toEqual([])
  })
})
