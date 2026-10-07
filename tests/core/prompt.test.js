import { describe, expect, it } from 'vitest'
import { convertFullwidth, DEFAULT_CONVERT_OPTIONS } from '../../src/core/prompt/convert'
import { serialize } from '../../src/core/prompt/serialize'
import { splitSegments, tokenize, NEWLINE, TAB } from '../../src/core/prompt/tokenize'
import { applyWeight, formatWeight, getWeight, stripWeight } from '../../src/core/prompt/weight'
import { addBracket, isWrappedBy, listLayers, removeBracket, toggleBracket } from '../../src/core/prompt/brackets'
import { countTokens } from '../../src/core/prompt/tokenCount'

const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

describe('convert', () => {
  it('转换中文标点为 ASCII', () => {
    expect(convertFullwidth('猫，狗。『括号』（圆）《尖》')).toBe('猫,狗.『括号』(圆)<尖>')
  })

  it('可以按开关关闭', () => {
    const options = { ...DEFAULT_CONVERT_OPTIONS, comma: false }
    expect(convertFullwidth('猫，狗', options)).toBe('猫，狗')
  })

  it('全角方括号转半角', () => {
    expect(convertFullwidth('【a】')).toBe('[a]')
  })
})

describe('splitSegments / tokenize', () => {
  it('按逗号与换行切分并 trim', () => {
    expect(splitSegments('a, b ,c')).toEqual(['a', 'b', 'c'])
    expect(splitSegments('a,\nb, c')).toEqual(['a', NEWLINE, 'b', 'c'])
  })

  it('括号不保护逗号（与上游行为一致）', () => {
    expect(splitSegments('(a, b), c')).toEqual(['(a', 'b)', 'c'])
  })

  it('制表符作为独立 raw token', () => {
    expect(splitSegments('a\tb')).toEqual(['a', TAB, 'b'])
  })

  it('空输入返回空数组', () => {
    expect(splitSegments('')).toEqual([])
    expect(splitSegments(' , , ')).toEqual([])
  })

  it('tokenize 复用同文本的可见 token（保留 id 与翻译）', () => {
    const createId = ids()
    const first = tokenize('cat, dog', [], { createId })
    first[0].translate = '猫'
    const second = tokenize('cat, dog, bird', first, { createId })
    expect(second).toHaveLength(3)
    expect(second[0].id).toBe(first[0].id)
    expect(second[0].translate).toBe('猫')
    expect(second[2].text).toBe('bird')
  })

  it('隐藏 token 不参与可见匹配，并被保留在隐藏区', () => {
    const createId = ids()
    const first = tokenize('cat, dog', [], { createId })
    first[0].isHidden = true
    const second = tokenize('cat, dog', first, { createId })
    expect(second.filter((token) => !token.isHidden).map((token) => token.text)).toEqual(['cat', 'dog'])
    expect(second.filter((token) => token.isHidden)).toHaveLength(1)
    expect(second.filter((token) => token.isHidden)[0].id).toBe(first[0].id)
  })
})

describe('serialize', () => {
  const make = (texts) =>
    texts.map((text, index) => ({
      id: `t${index}`,
      text,
      isRaw: text === NEWLINE || text === TAB,
      isNewline: text === NEWLINE,
      isHidden: false
    }))

  it('每行末尾补逗号，含最后一行', () => {
    expect(serialize(make(['a', 'b']))).toBe('a, b,')
  })

  it('换行后重新开始一行', () => {
    expect(serialize(make(['a', NEWLINE, 'b', 'c']))).toBe('a,\nb, c,')
  })

  it('跳过隐藏 token', () => {
    const tokens = make(['a', 'b', 'c'])
    tokens[1].isHidden = true
    expect(serialize(tokens)).toBe('a, c,')
  })

  it('空列表输出空串', () => {
    expect(serialize([])).toBe('')
  })

  it('round-trip：serialize → tokenize 得到相同的可见文本', () => {
    const tokens = make(['1girl', 'solo', NEWLINE, 'school'])
    const text = serialize(tokens)
    const reparsed = tokenize(text, [], { createId: ids() })
    expect(reparsed.filter((token) => !token.isHidden).map((token) => token.text)).toEqual([
      '1girl',
      'solo',
      NEWLINE,
      'school'
    ])
  })
})

describe('weight', () => {
  it('给纯文本加权重', () => {
    expect(applyWeight('cat', 1.2)).toBe('(cat:1.2)')
  })

  it('权重 1 去掉权重与外层括号', () => {
    expect(applyWeight('(cat:1.2)', 1)).toBe('cat')
  })

  it('替换已有权重', () => {
    expect(applyWeight('(cat:1.2)', 2)).toBe('(cat:2)')
  })

  it('支持负数权重', () => {
    expect(applyWeight('cat', -1.5)).toBe('(cat:-1.5)')
    expect(getWeight('(cat:-1.5)')).toBe(-1.5)
  })

  it('已有括号但无权重时在括号内补权重', () => {
    expect(applyWeight('(cat)', 1.2)).toBe('(cat:1.2)')
  })

  it('转义括号文本可正确识别权重', () => {
    const text = applyWeight('ask_\\(askzy\\)', 1.2)
    expect(text).toBe('(ask_\\(askzy\\):1.2)')
    expect(getWeight(text)).toBe(1.2)
    expect(stripWeight(text)).toBe('ask_\\(askzy\\)')
  })

  it('无权重时 getWeight 返回 null', () => {
    expect(getWeight('cat')).toBe(null)
    expect(getWeight('(cat)')).toBe(null)
  })

  it('formatWeight 不产生浮点尾巴', () => {
    expect(formatWeight(0.1 + 0.2)).toBe('0.3')
  })
})

describe('brackets', () => {
  it('加层与减层', () => {
    expect(addBracket('cat', '()')).toBe('(cat)')
    expect(addBracket('(cat)', '()')).toBe('(cat)')
    expect(addBracket('cat', '[]')).toBe('[cat]')
    expect(removeBracket('[cat]', '[]')).toBe('cat')
    expect(removeBracket('cat', '[]')).toBe('cat')
  })

  it('toggle 与层检测', () => {
    expect(toggleBracket('cat', '{}')).toBe('{cat}')
    expect(isWrappedBy('{cat}', '{}')).toBe(true)
    expect(listLayers('({cat})')).toEqual(['()', '{}'])
  })
})


describe('countTokens', () => {
  it('按空白计数', () => {
    expect(countTokens('')).toBe(0)
    expect(countTokens('   ')).toBe(0)
    expect(countTokens('a, b,')).toBe(2)
    expect(countTokens('a,\nb,')).toBe(2)
  })
})
