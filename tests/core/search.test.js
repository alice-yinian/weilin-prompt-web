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

describe('createTranslationLookup reverseByDesc', () => {
  it('按 desc/translate 去首尾空格并小写建键，tags 优先于 dict', () => {
    const maps = createTranslationLookup({
      tags: [
        { text: 'long hair', desc: ' 长发 ', color: 'rgba(1,2,3,.4)' },
        { text: 'solo_focus', desc: '单人', color: 'rgba(7,7,7,.4)' }
      ],
      dict: [
        { tag: 'solo', translate: '单人', color_id: 0 },
        { tag: 'rating_r18', translate: 'R18', color_id: 3 }
      ]
    })

    expect(maps.reverseByDesc).toBeInstanceOf(Map)
    expect(maps.reverseByDesc.get('长发')).toMatchObject({ text: 'long hair', color: 'rgba(1,2,3,.4)' })
    const solo = maps.reverseByDesc.get('单人')
    expect(solo.text).toBe('solo_focus')
    expect(solo.color).toBe('rgba(7,7,7,.4)')
    expect(solo.colorId).toBeNull()
    expect(maps.reverseByDesc.get('r18').text).toBe('rating_r18')
  })
})

describe('translatePhrase zh2en', () => {
  const tags = [
    { text: 'long hair', desc: '长发', color: 'rgba(1,2,3,.4)' },
    { text: 'hair', desc: '头发', color: 'rgba(9,9,9,.4)' },
    { text: 'cat', desc: '猫', color: 'rgba(5,5,5,.4)' }
  ]
  const dict = [
    { tag: 'solo', translate: '单人', color_id: 0 },
    { tag: 'smile', translate: '微笑', color_id: 2 }
  ]
  const maps = createTranslationLookup({ tags, dict })

  it('整句中文转英文', () => {
    const result = translatePhrase('长发 猫', { maps, direction: 'zh2en' })
    expect(result.translated).toBe('long hair cat')
    expect(result.original).toBe('长发 猫')
  })

  it('贪婪匹配最长子短语', () => {
    const greedyMaps = createTranslationLookup({
      tags: [
        { text: 'red', desc: '红' },
        { text: 'hair', desc: '发' },
        { text: 'red hair', desc: '红 发' }
      ],
      dict: []
    })
    expect(translatePhrase('红 发', { maps: greedyMaps, direction: 'zh2en' }).translated).toBe('red hair')
    expect(translatePhrase('红 蓝', { maps: greedyMaps, direction: 'zh2en' }).translated).toBe('red 蓝')
  })

  it('中英混排：未命中的英文原样保留', () => {
    expect(translatePhrase('长发 cat 微笑', { maps, direction: 'zh2en' }).translated).toBe('long hair cat smile')
  })

  it('未命中的中文原样保留', () => {
    expect(translatePhrase('长发 未知词', { maps, direction: 'zh2en' }).translated).toBe('long hair 未知词')
  })

  it('颜色取最后一个命中', () => {
    const result = translatePhrase('长发 猫', { maps, direction: 'zh2en' })
    expect(result.color).toBe('rgba(5,5,5,.4)')
    expect(result.colorId).toBeNull()
  })

  it('词典命中带出 color_id', () => {
    const result = translatePhrase('单人 微笑', { maps, direction: 'zh2en' })
    expect(result.translated).toBe('solo smile')
    expect(result.colorId).toBe(2)
  })

  it('大小写不敏感（反查键已小写）', () => {
    const mixedMaps = createTranslationLookup({ tags: [], dict: [{ tag: 'rating_r18', translate: 'R18', color_id: 3 }] })
    expect(translatePhrase('r18', { maps: mixedMaps, direction: 'zh2en' }).translated).toBe('rating_r18')
  })

  it('不传 direction 时等同 en2zh', () => {
    expect(translatePhrase('cat', { maps }).translated).toBe('猫')
    expect(translatePhrase('猫', { maps }).translated).toBe('猫')
  })

  it('空短语返回空结果', () => {
    expect(translatePhrase('', { maps, direction: 'zh2en' })).toMatchObject({ original: '', translated: '' })
  })

  it('手写 maps 缺反查表时回落到 tags/dict', () => {
    expect(translatePhrase('猫', { tags, dict, direction: 'zh2en' }).translated).toBe('cat')
  })
})
