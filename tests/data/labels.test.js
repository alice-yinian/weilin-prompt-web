import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import {
  getLabelsPayload,
  saveLabelsPayload,
  saveLabelSettings,
  normalizeLabelItem,
  DEFAULT_LABEL_SETTINGS
} from '../../src/data/repos/labels.js'

beforeEach(resetDatabase)

describe('repos/labels', () => {
  it('空库返回空列表与默认设置', async () => {
    const payload = await getLabelsPayload()
    expect(payload.items).toEqual([])
    expect(payload.settings).toEqual({ ...DEFAULT_LABEL_SETTINGS })
  })

  it('保存后可读回，按 order 排序', async () => {
    await saveLabelsPayload({
      items: [
        { id: 'b', name: '负面', content: 'lowres', order: 2, pinned: true },
        { id: 'a', name: '正面', content: '1girl', order: 1, highlighted: true }
      ],
      settings: { sortMode: 'time', sortTimeDesc: false }
    })

    const payload = await getLabelsPayload()
    expect(payload.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(payload.items[0]).toMatchObject({ content: '1girl', highlighted: true, pinned: false })
    expect(payload.items[1].pinned).toBe(true)
    expect(payload.settings).toEqual({
      ...DEFAULT_LABEL_SETTINGS,
      sortMode: 'time',
      sortTimeDesc: false
    })
  })

  it('全量保存：不在 items 里的条目会被删除', async () => {
    await saveLabelsPayload({ items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    const result = await saveLabelsPayload({ items: [{ id: 'b', name: 'B2' }] })

    expect(result.items).toBe(1)
    const payload = await getLabelsPayload()
    expect(payload.items.map((item) => item.id)).toEqual(['b'])
    expect(payload.items[0].name).toBe('B2')
  })

  it('缺 id / 缺时间戳的条目会被补全', async () => {
    await saveLabelsPayload({ items: [{ name: '新片段', content: 'x' }] })
    const payload = await getLabelsPayload()
    expect(payload.items[0].id).toBeTruthy()
    expect(payload.items[0].createdAt).toBeTypeOf('number')
    expect(payload.items[0].updatedAt).toBeTypeOf('number')
    expect(payload.items[0].order).toBe(0)
  })

  it('只保存设置时不动条目', async () => {
    await saveLabelsPayload({ items: [{ id: 'a', name: 'A' }] })
    const settings = await saveLabelSettings({ sortMode: 'name' })

    expect(settings).toEqual({ ...DEFAULT_LABEL_SETTINGS, sortMode: 'name' })
    const payload = await getLabelsPayload()
    expect(payload.items.length).toBe(1)
    expect(payload.settings.sortMode).toBe('name')
  })

  it('normalizeLabelItem 兼容旧字段（createdAt 回退 updatedAt，id 转字符串）', () => {
    const item = normalizeLabelItem({ name: 'x', content: 'y' }, 3)
    expect(item).toMatchObject({
      name: 'x',
      content: 'y',
      pinned: false,
      highlighted: false,
      order: 3
    })
    expect(item.createdAt).toBe(item.updatedAt)

    const fromUpstream = normalizeLabelItem({ id: 12345, updatedAt: 1000, order: 7 })
    expect(fromUpstream.id).toBe('12345')
    expect(fromUpstream.createdAt).toBe(1000)
  })
})
