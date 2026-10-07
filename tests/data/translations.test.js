import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { clearAllData } from '../../src/data/repos/maintenance.js'
import {
  getTranslation,
  getTranslations,
  putTranslation,
  putTranslations,
  listTranslations,
  translationCount,
  deleteTranslation,
  clearTranslations
} from '../../src/data/repos/translations.js'

beforeEach(resetDatabase)

describe('repos/translations CRUD', () => {
  it('put/get：textLower 归一化（去空格 + 小写），text 保留原大小写', async () => {
    const record = await putTranslation('  Cat  ', '猫', 'library')
    expect(record).toMatchObject({
      textLower: 'cat',
      text: 'Cat',
      translated: '猫',
      source: 'library'
    })
    expect(record.updatedAt).toBeGreaterThan(0)

    expect(await getTranslation('CAT')).toEqual(record)
    expect(await getTranslation(' cat ')).toEqual(record)
    expect(await getTranslation('dog')).toBeNull()
    expect(await getTranslation('')).toBeNull()
    expect(await getTranslation('   ')).toBeNull()
  })

  it('text 为空抛错；source 非法时退回 manual', async () => {
    await expect(putTranslation('', 'x')).rejects.toThrow('text')
    await expect(putTranslation('   ', 'x')).rejects.toThrow('text')

    expect((await putTranslation('a', '译', 'api')).source).toBe('api')
    expect((await putTranslation('b', '译')).source).toBe('manual')
    expect((await putTranslation('c', '译', 'bogus')).source).toBe('manual')
  })

  it('getTranslations：Map 以调用方原文本为键，未命中不出现', async () => {
    await putTranslation('Cat', '猫')
    await putTranslation('Dog', '狗')

    const map = await getTranslations([' cat ', 'DOG', 'bird', 'cat'])
    expect([...map.keys()].sort()).toEqual([' cat ', 'DOG'])
    expect(map.get(' cat ').translated).toBe('猫')
    expect(map.get('DOG').translated).toBe('狗')
    expect(map.has('bird')).toBe(false)
    expect((await getTranslations([])).size).toBe(0)
    expect((await getTranslations(null)).size).toBe(0)
  })

  it('deleteTranslation：命中返回 true，未命中 false', async () => {
    await putTranslation('cat', '猫')
    expect(await deleteTranslation(' CAT ')).toBe(true)
    expect(await deleteTranslation('cat')).toBe(false)
    expect(await deleteTranslation('')).toBe(false)
    expect(await translationCount()).toBe(0)
  })
})

describe('repos/translations 批量与列表', () => {
  it('putTranslations：跳过空 text/空译文/归一化重复，返回写入条数', async () => {
    const written = await putTranslations(
      [
        { text: 'a', translated: '甲' },
        { text: 'b', translated: '' },
        { text: '', translated: 'x' },
        { text: 'A ', translated: '甲2' },
        { text: 'c', translated: '丙' },
        null
      ],
      'api'
    )
    expect(written).toBe(2)
    expect(await translationCount()).toBe(2)
    expect((await getTranslation('a')).translated).toBe('甲')
    expect((await getTranslation('c')).source).toBe('api')
    expect(await putTranslations([])).toBe(0)
    expect(await putTranslations([{ text: 'd', translated: '' }])).toBe(0)
  })

  it('listTranslations 按 updatedAt 降序并遵守 limit', async () => {
    await putTranslation('a', '甲')
    await putTranslation('b', '乙')
    await putTranslation('c', '丙')

    expect((await listTranslations()).map((item) => item.textLower)).toEqual(['c', 'b', 'a'])
    expect((await listTranslations({ limit: 2 })).map((item) => item.textLower)).toEqual(['c', 'b'])
    expect((await listTranslations({ limit: 0 })).length).toBe(3) // 非法 limit 视为不限
  })

  it('clearTranslations 返回删除条数', async () => {
    await putTranslation('a', '甲')
    await putTranslation('b', '乙')
    expect(await clearTranslations()).toBe(2)
    expect(await translationCount()).toBe(0)
    expect(await clearTranslations()).toBe(0)
  })

  it('clearAllData 覆盖 translations 仓库', async () => {
    await putTranslation('a', '甲')
    const counts = await clearAllData()
    expect(counts.translations).toBe(1)
    expect(await translationCount()).toBe(0)
  })
})
