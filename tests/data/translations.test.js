import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { clearAllData } from '../../src/data/repos/maintenance.js'
import { STORES, withTx } from '../../src/data/db.js'
import {
  getTranslation,
  getTranslations,
  putTranslation,
  putTranslations,
  listTranslations,
  translationCount,
  deleteTranslation,
  clearTranslations,
  translationKey
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

describe('repos/translations 方向区分', () => {
  it('translationKey：en2zh 用历史纯键，zh2en 带前缀；空文本仍为空', () => {
    expect(translationKey('  Long Hair  ')).toBe('long hair')
    expect(translationKey('  Long Hair  ', 'en2zh')).toBe('long hair')
    expect(translationKey('长发', 'zh2en')).toBe('zh2en:长发')
    expect(translationKey('  长发  ', 'zh2en')).toBe('zh2en:长发')
    expect(translationKey('MiXeD', 'zh2en')).toBe('zh2en:mixed')
    expect(translationKey('', 'zh2en')).toBe('')
    expect(translationKey('   ', 'zh2en')).toBe('')
    expect(translationKey(null, 'zh2en')).toBe('')
  })

  it('同一文本两个方向共存互不干扰', async () => {
    const en = await putTranslation('long hair', '长发')
    const zh = await putTranslation('long hair', 'long-hair-en', 'api', 'zh2en')

    expect(en).toMatchObject({ textLower: 'long hair', direction: 'en2zh' })
    expect(zh).toMatchObject({ textLower: 'zh2en:long hair', direction: 'zh2en' })

    expect((await getTranslation('long hair')).translated).toBe('长发')
    expect((await getTranslation('long hair', 'en2zh')).translated).toBe('长发')
    expect((await getTranslation('long hair', 'zh2en')).translated).toBe('long-hair-en')
    expect((await getTranslation('LONG HAIR', 'zh2en')).translated).toBe('long-hair-en')
    // 另一个方向的键（这里是中文原文）互不相通
    expect(await getTranslation('长发')).toBeNull()
    expect(await translationCount()).toBe(2)
  })

  it('同形文本（如混合词）两个方向各存一条', async () => {
    await putTranslation('app', '应用', 'manual')
    await putTranslation('app', 'APP', 'manual', 'zh2en')
    await putTranslation('长发', 'long hair', 'manual', 'zh2en')

    expect((await getTranslation('app')).translated).toBe('应用')
    expect(await getTranslation('长发')).toBeNull() // en2zh 下没有「长发」键
    expect((await getTranslation('长发', 'zh2en')).translated).toBe('long hair')
    expect((await listTranslations()).map((item) => item.textLower).sort()).toEqual([
      'app',
      'zh2en:app',
      'zh2en:长发'
    ])
  })

  it('旧记录缺 direction 时按 en2zh 命中并补出 direction', async () => {
    await withTx(STORES.TRANSLATIONS, 'readwrite', (tx) =>
      tx.store.put({ textLower: 'cat', text: 'Cat', translated: '猫', source: 'manual', updatedAt: 1 })
    )

    const record = await getTranslation('CAT')
    expect(record).toMatchObject({ translated: '猫', direction: 'en2zh' })
    expect((await getTranslations(['cat'])).get('cat').direction).toBe('en2zh')
    expect((await listTranslations())[0].direction).toBe('en2zh')
    expect(await getTranslation('cat', 'zh2en')).toBeNull()
    // 旧键仍在，新写入 en2zh 会覆盖同一条
    await putTranslation('cat', '猫咪', 'manual')
    expect(await translationCount()).toBe(1)
    expect((await getTranslation('cat')).translated).toBe('猫咪')
  })

  it('非法 direction 一律退回 en2zh', async () => {
    const record = await putTranslation('x', 'y', 'manual', 'bogus')
    expect(record).toMatchObject({ direction: 'en2zh', textLower: 'x' })
    expect((await getTranslation('x', null)).translated).toBe('y')
    expect((await getTranslation('x', 'nope')).textLower).toBe('x')
  })

  it('putTranslations / getTranslations 按方向读写', async () => {
    const written = await putTranslations(
      [
        { text: '长发', translated: 'long hair' },
        { text: '短发', translated: 'short hair' },
        { text: '长发', translated: '重复被跳过' }
      ],
      'api',
      'zh2en'
    )
    expect(written).toBe(2)

    const map = await getTranslations(['长发', '短发', 'missing'], 'zh2en')
    expect(map.get('长发').translated).toBe('long hair')
    expect(map.get('短发')).toMatchObject({ translated: 'short hair', direction: 'zh2en' })
    expect(map.has('missing')).toBe(false)
    // 默认方向取不到 zh2en 的记录
    expect((await getTranslations(['长发'])).size).toBe(0)

    // 同文本再写 en2zh 不覆盖 zh2en 记录
    await putTranslations([{ text: '长发', translated: 'long hair (en)' }], 'api')
    expect((await getTranslation('长发', 'zh2en')).translated).toBe('long hair')
    expect((await getTranslation('长发')).translated).toBe('long hair (en)')
  })

  it('listTranslations 支持 direction 过滤且 limit 作用于过滤后', async () => {
    await putTranslation('a', '甲')
    await putTranslation('b', '乙', 'api', 'zh2en')
    await putTranslation('c', '丙')
    await putTranslation('d', '丁', 'api', 'zh2en')

    expect((await listTranslations({ direction: 'zh2en' })).map((item) => item.textLower)).toEqual([
      'zh2en:d',
      'zh2en:b'
    ])
    expect((await listTranslations({ direction: 'en2zh' })).map((item) => item.textLower)).toEqual(['c', 'a'])
    expect((await listTranslations({ direction: 'zh2en', limit: 1 })).map((item) => item.textLower)).toEqual([
      'zh2en:d'
    ])
    expect((await listTranslations()).length).toBe(4)
  })

  it('deleteTranslation 按方向删除，不影响另一方向', async () => {
    await putTranslation('k', 'v')
    await putTranslation('k', 'v2', 'manual', 'zh2en')

    expect(await deleteTranslation('k', 'zh2en')).toBe(true)
    expect(await deleteTranslation('k', 'zh2en')).toBe(false)
    expect(await getTranslation('k', 'zh2en')).toBeNull()
    expect((await getTranslation('k')).translated).toBe('v')
    expect(await deleteTranslation(' K ')).toBe(true)
    expect(await translationCount()).toBe(0)
  })
})
