import { describe, it, expect } from 'vitest'
import {
  buildTagIndex,
  isImageFile,
  matchTagFile,
  normalizeTagText,
  stripExtension
} from '../../src/ui/tags/filenameMatch.js'

const UUID = '0192f0aa-1111-7000-8000-abcdefabcdef'

describe('ui/tags/filenameMatch 文件名匹配', () => {
  it('stripExtension：只去掉最后一个扩展名，无扩展名原样返回', () => {
    expect(stripExtension('1girl.png')).toBe('1girl')
    expect(stripExtension('a.b.jpg')).toBe('a.b')
    expect(stripExtension('noext')).toBe('noext')
    expect(stripExtension('  spaced.webp  ')).toBe('spaced')
    expect(stripExtension('')).toBe('')
    expect(stripExtension(undefined)).toBe('')
  })

  it('normalizeTagText：忽略大小写，空格与下划线等价', () => {
    expect(normalizeTagText('Long_Hair')).toBe('long hair')
    expect(normalizeTagText('long  hair')).toBe('long hair')
    expect(normalizeTagText(' long_hair ')).toBe('long hair')
    expect(normalizeTagText('__a__b__')).toBe('a b')
  })

  it('先按 t_uuid 精确匹配：uuid 命中优先于同名文本', () => {
    const index = buildTagIndex([
      { t_uuid: UUID, text: '别的文本' },
      { t_uuid: 'other-uuid', text: UUID }
    ])
    expect(matchTagFile(`${UUID}.png`, index)).toEqual({ t_uuid: UUID, by: 'uuid' })
  })

  it('文本匹配：大小写不敏感，空格/下划线可互换', () => {
    const index = buildTagIndex([
      { t_uuid: 't-long', text: 'long_hair' },
      { t_uuid: 't-smile', text: 'Smile' }
    ])
    expect(matchTagFile('long hair.png', index)).toEqual({ t_uuid: 't-long', by: 'text' })
    expect(matchTagFile('long_hair.jpg', index)).toEqual({ t_uuid: 't-long', by: 'text' })
    expect(matchTagFile('LONG HAIR.webp', index)).toEqual({ t_uuid: 't-long', by: 'text' })
    expect(matchTagFile('smile.png', index)).toEqual({ t_uuid: 't-smile', by: 'text' })
  })

  it('未命中与空文件名返回 null（不计 uuid 前缀误配）', () => {
    const index = buildTagIndex([{ t_uuid: UUID, text: '1girl' }])
    expect(matchTagFile('unknown.png', index)).toBeNull()
    expect(matchTagFile('.png', index)).toBeNull()
    expect(matchTagFile('', index)).toBeNull()
    // 文本只做整体相等，不做包含匹配
    expect(matchTagFile('1girl solo.png', index)).toBeNull()
    // 带扩展名残留的 base 不匹配 uuid
    expect(matchTagFile(`${UUID}.extra.png`, index)).toBeNull()
  })

  it('同文本标签取列表中先出现的一条（listAllTags 为 create_time 降序）', () => {
    const index = buildTagIndex([
      { t_uuid: 'newest', text: 'hair' },
      { t_uuid: 'older', text: 'Hair' }
    ])
    expect(matchTagFile('hair.png', index).t_uuid).toBe('newest')
  })

  it('空索引/缺字段不抛错', () => {
    expect(matchTagFile('a.png', buildTagIndex([]))).toBeNull()
    expect(matchTagFile('a.png', buildTagIndex(null))).toBeNull()
    expect(matchTagFile('a.png', undefined)).toBeNull()
    expect(buildTagIndex([null, { text: 'x' }, { t_uuid: 'y' }])).toMatchObject({
      byUuid: new Set(['y'])
    })
  })

  it('isImageFile：type 优先，无 type 时按扩展名兜底', () => {
    expect(isImageFile({ name: 'a.png', type: 'image/png' })).toBe(true)
    expect(isImageFile({ name: 'a.txt', type: 'text/plain' })).toBe(false)
    expect(isImageFile({ name: 'a.PNG', type: '' })).toBe(true)
    expect(isImageFile({ name: 'a.txt', type: '' })).toBe(false)
    expect(isImageFile({ name: 'a' })).toBe(false)
  })
})
