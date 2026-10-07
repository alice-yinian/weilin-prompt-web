import { describe, expect, it } from 'vitest'
import {
  YOUDAO_ENDPOINT,
  YOUDAO_MAX_CHARS,
  buildRequest,
  buildYoudaoBatches,
  parseResponse
} from '../../src/core/translate/providers/youdao'
import { translateTexts } from '../../src/core/translate/index'

const CONFIG = { provider: 'youdao', direction: 'en2zh', proxyPrefix: '' }

function qs(init) {
  return new URLSearchParams(init.body)
}

// 假 fetch：把每条用「译:」前缀回译，按行返回
function echoFetch(calls) {
  return async (url, init) => {
    const q = qs(init).get('q')
    calls.push({ url, init, q })
    const lines = q.split('\n').map((line) => `译:${line}`)
    return { ok: true, status: 200, json: async () => ({ translation: [lines.join('\n')] }) }
  }
}

describe('有道：buildRequest', () => {
  it('URL/头/表单字段形状正确，多行用 \\n 拼接', () => {
    const { url, init } = buildRequest({ ...CONFIG }, ['1girl', 'cat_ears'])
    expect(url).toBe(YOUDAO_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const form = qs(init)
    expect(form.get('q')).toBe('1girl\ncat_ears')
    expect(form.get('from')).toBe('en')
    expect(form.get('to')).toBe('zh-CHS')
  })

  it('zh2en 方向 from/to 互换', () => {
    const { init } = buildRequest({ ...CONFIG, direction: 'zh2en' }, ['猫'])
    expect(qs(init).get('from')).toBe('zh-CHS')
    expect(qs(init).get('to')).toBe('en')
  })

  it('proxyPrefix 作用于有道端点，且折叠标签内部换行', () => {
    const { url, init } = buildRequest({ ...CONFIG, proxyPrefix: 'https://proxy.local/' }, ['a\nb'])
    expect(url).toBe(`https://proxy.local/${YOUDAO_ENDPOINT}`)
    expect(qs(init).get('q')).toBe('a b')
  })
})

describe('有道：buildYoudaoBatches', () => {
  it('按字符上限拆批，批次拼接后与原文一一对应', () => {
    const texts = ['a'.repeat(2500), 'b'.repeat(2500), 'c'.repeat(2500)]
    const batches = buildYoudaoBatches(texts)
    expect(batches.length).toBe(3)
    expect(batches.flat()).toEqual(texts)
    for (const batch of batches) {
      expect(batch.join('\n').length).toBeLessThanOrEqual(YOUDAO_MAX_CHARS)
    }
  })

  it('短文本单批', () => {
    expect(buildYoudaoBatches(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']])
  })

  it('支持自定义上限', () => {
    expect(buildYoudaoBatches(['aa', 'bb', 'cc'], 5)).toEqual([['aa', 'bb'], ['cc']])
  })
})

describe('有道：parseResponse', () => {
  it('按行对回原文并补齐', () => {
    expect(parseResponse({ translation: ['你好\n世界'] }, 2)).toEqual(['你好', '世界'])
    expect(parseResponse({ translation: ['只有一行'] }, 3)).toEqual(['只有一行', '', ''])
  })

  it('错误码或缺失 translation 时抛错', () => {
    expect(() => parseResponse({ errorCode: '401' }, 1)).toThrowError(/错误码/)
    expect(() => parseResponse({}, 1)).toThrowError(/translation/)
  })
})

describe('有道：translateTexts', () => {
  it('超长文本拆成多批，译文按顺序回填', async () => {
    const calls = []
    const t1 = 'a'.repeat(2500)
    const t2 = 'b'.repeat(2500)
    const result = await translateTexts([t1, t2], { ...CONFIG, batchSize: 20 }, { fetchImpl: echoFetch(calls) })

    expect(calls).toHaveLength(2)
    expect(calls[0].q).toBe(t1)
    expect(calls[1].q).toBe(t2)
    expect(result.errors).toEqual([])
    expect(result.translations).toEqual([`译:${t1}`, `译:${t2}`])
  })

  it('单批失败只记 errors，后续批次继续', async () => {
    const calls = []
    const echo = echoFetch(calls)
    const t1 = 'a'.repeat(2500)
    const t2 = 'b'.repeat(2500)
    const fetchImpl = async (url, init) => {
      if (calls.length === 0) {
        calls.push({ url, init, q: qs(init).get('q') })
        return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
      }
      return echo(url, init)
    }
    const result = await translateTexts([t1, t2], CONFIG, { fetchImpl })
    expect(result.translations).toEqual(['', `译:${t2}`])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('第 1/2 批')
  })

  it('onProgress 覆盖每批', async () => {
    const events = []
    const texts = ['a', 'b', 'c']
    await translateTexts(texts, CONFIG, { fetchImpl: echoFetch([]), onProgress: (e) => events.push(e) })
    expect(events).toEqual([{ done: 3, total: 3, batchIndex: 0, batchCount: 1, error: null }])
  })
})
