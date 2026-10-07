import { describe, expect, it } from 'vitest'
import {
  MAX_AUTOCOMPLETE_QUERY_LENGTH,
  normalizeQuery,
  scoreEntry,
  searchEntries
} from '../../src/core/search/autocomplete'
import { createTranslationLookup, extractText, translatePhrase } from '../../src/core/search/offlineTranslate'

describe('scoreEntry', () => {
  it('按上游打分表给分', () => {
    expect(scoreEntry('cat', 'cat', '猫')).toBe(100)
    expect(scoreEntry('ca', 'cat', '猫')).toBe(90)
    expect(scoreEntry('at', 'cat', '猫')).toBe(80)
    expect(scoreEntry('猫', 'cat', '猫')).toBe(70)
    expect(scoreEntry('猫', 'cat', '猫娘')).toBe(60)
    expect(scoreEntry('娘', 'cat', '猫娘')).toBe(50)
    expect(scoreEntry('zzz', 'cat', '猫')).toBe(0)
  })

  it('大小写不敏感', () => {
    expect(scoreEntry('CAT', 'cat', '')).toBe(100)
  })
})

describe('normalizeQuery', () => {
  it('剥离括号并截断到 20 字符', () => {
    expect(normalizeQuery('[cat]')).toBe('cat')
    expect(normalizeQuery('(cat)')).toBe('cat')
    expect(normalizeQuery('a'.repeat(30))).toHaveLength(MAX_AUTOCOMPLETE_QUERY_LENGTH)
  })
})

describe('searchEntries', () => {
  const tags = [
    { text: 'cat', desc: '猫', color: 'rgba(1,2,3,.4)' },
    { text: 'cat_ears', desc: '猫耳', color: 'rgba(1,2,3,.4)' },
    { text: 'dog', desc: '狗', color: 'rgba(1,2,3,.4)' }
  ]
  const dict = [
    { tag: 'cat_ears', translate: '', color_id: 0 },
    { tag: 'catgirl', translate: '猫娘', color_id: 0 }
  ]

  it('tags 优先，词典补足剩余名额', () => {
    const results = searchEntries('cat', { tags, dict }, 10)
    expect(results.map((item) => item.text)).toEqual(['cat', 'cat_ears', 'catgirl'])
    expect(results[2].source).toBe('dict')
  })

  it('遵守 limit', () => {
    expect(searchEntries('cat', { tags, dict }, 2)).toHaveLength(2)
  })

  it('空查询返回空', () => {
    expect(searchEntries('', { tags, dict })).toEqual([])
  })

  it('词典命中时带出 color_id', () => {
    const results = searchEntries('catgirl', { tags: [], dict }, 5)
    expect(results[0]).toMatchObject({ text: 'catgirl', colorId: 0, source: 'dict' })
  })
})

describe('extractText', () => {
  it('剥掉权重后缀', () => {
    expect(extractText('cat:1.2')).toBe('cat')
    expect(extractText('cat')).toBe('cat')
    expect(extractText('long_hair:0.8')).toBe('long_hair')
  })
})

describe('translatePhrase', () => {
  const tags = [
    { text: 'long hair', desc: '长发', color: 'rgba(1,2,3,.4)' },
    { text: 'hair', desc: '头发', color: 'rgba(9,9,9,.4)' },
    { text: 'cat', desc: '猫', color: 'rgba(1,2,3,.4)' }
  ]
  const dict = [{ tag: 'solo', translate: '单人', color_id: 0 }]

  it('贪心匹配最长子短语', () => {
    const result = translatePhrase('long hair cat', { tags, dict })
    expect(result.translated).toBe('长发 猫')
    expect(result.color).toBe('rgba(1,2,3,.4)')
  })

  it('未知单词原样保留', () => {
    expect(translatePhrase('cat unknown_word', { tags, dict }).translated).toBe('猫 unknown_word')
  })

  it('词典兜底并返回 color_id', () => {
    const result = translatePhrase('solo cat', { tags, dict })
    expect(result.translated).toBe('单人 猫')
    expect(result.colorId).toBe(0)
  })

  it('空短语返回空结果', () => {
    expect(translatePhrase('', { tags, dict })).toMatchObject({ original: '', translated: '' })
  })

  it('可复用预建的 lookup', () => {
    const maps = createTranslationLookup({ tags, dict })
    expect(translatePhrase('hair', { maps }).translated).toBe('头发')
  })
})
