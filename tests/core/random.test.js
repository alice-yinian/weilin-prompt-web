import { describe, it, expect } from 'vitest'
import { pickRandomTags, formatRandomTags } from '../../src/core/random/pickRandom.js'

const pool = ['a', 'b', 'c', 'd', 'e']

describe('random/pickRandom', () => {
  it('无放回抽取指定数量', () => {
    const picked = pickRandomTags(pool, 3)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    for (const item of picked) expect(pool).toContain(item)
  })

  it('多次抽取都不重复且不超出数量', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomTags(pool, 4)
      expect(picked).toHaveLength(4)
      expect(new Set(picked).size).toBe(4)
    }
  })

  it('count 超限时返回全部', () => {
    expect(pickRandomTags(pool, 99)).toEqual(pool)
    expect(pickRandomTags(pool, pool.length)).toEqual(pool)
  })

  it('count <= 0 或非数组返回空', () => {
    expect(pickRandomTags(pool, 0)).toEqual([])
    expect(pickRandomTags(pool, -3)).toEqual([])
    expect(pickRandomTags(null, 3)).toEqual([])
  })

  it('可注入随机源，便于确定性测试', () => {
    // rng 恒返回 0 → 每次都选中当前下标本身
    expect(pickRandomTags(pool, 2, () => 0)).toEqual(['a', 'b'])
  })

  it('不修改原始数组', () => {
    const source = ['x', 'y', 'z']
    pickRandomTags(source, 2)
    expect(source).toEqual(['x', 'y', 'z'])
  })
})

describe('random/formatRandomTags', () => {
  it('逗号连接并补结尾逗号', () => {
    expect(formatRandomTags(['a', 'b', 'c'])).toBe('a,b,c,')
    expect(formatRandomTags(['1girl'])).toBe('1girl,')
  })

  it('空输入返回空串', () => {
    expect(formatRandomTags([])).toBe('')
    expect(formatRandomTags(null)).toBe('')
  })
})
