import { describe, expect, it } from 'vitest'
import { MYMEMORY_ENDPOINT, buildRequest, mymemoryProvider, parseResponse } from '../../src/core/translate/providers/mymemory'
import { translateTexts } from '../../src/core/translate/index'

describe('MyMemory：buildRequest', () => {
  it('GET + q/langpair，q 做 URL 编码，中文侧用 zh-CN', () => {
    const { url, init } = buildRequest({ provider: 'mymemory' }, '猫 ear & 耳')
    expect(init.method).toBe('GET')
    expect(url.startsWith(`${MYMEMORY_ENDPOINT}?`)).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('q')).toBe('猫 ear & 耳')
    expect(params.get('langpair')).toBe('en|zh-CN')
    // encodeURIComponent 语义：空格不能是裸空格
    expect(url).toContain('q=%E7%8C%AB%20ear%20%26%20%E8%80%B3')
  })

  it('zh2en 方向 langpair 反向', () => {
    const { url } = buildRequest({ provider: 'mymemory', direction: 'zh2en' }, '猫')
    expect(new URL(url).searchParams.get('langpair')).toBe('zh-CN|en')
  })

  it('proxyPrefix 生效', () => {
    const { url } = buildRequest({ provider: 'mymemory', proxyPrefix: 'https://proxy.local/' }, 'a')
    expect(url.startsWith(`https://proxy.local/${MYMEMORY_ENDPOINT}`)).toBe(true)
  })
})

describe('MyMemory：parseResponse', () => {
  it('取 responseData.translatedText', () => {
    expect(parseResponse({ responseData: { translatedText: '猫' }, responseStatus: 200 })).toBe('猫')
  })

  it('配额/限流识别为配额错误', () => {
    expect(() => parseResponse({ responseStatus: 403, responseDetails: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' })).toThrowError(/限流|配额|MYMEMORY/)
    expect(() => parseResponse({ responseData: { translatedText: 'MYMEMORY WARNING: quota' }, responseStatus: 200 })).toThrowError(/MYMEMORY/)
  })

  it('空译文报空内容', () => {
    expect(() => parseResponse({ responseData: { translatedText: '' }, responseStatus: 200 })).toThrowError(/空译文/)
  })
})

describe('MyMemory：translateTexts', () => {
  it('逐条请求；单条失败不影响其他条', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      const q = new URL(url).searchParams.get('q')
      calls.push(q)
      if (q === 'bad') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ responseStatus: 403, responseDetails: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' })
        }
      }
      return { ok: true, status: 200, json: async () => ({ responseData: { translatedText: `中:${q}` }, responseStatus: 200 }) }
    }
    const texts = ['a', 'bad', 'c', 'd', 'e']
    const result = await translateTexts(texts, { provider: 'mymemory' }, { fetchImpl })

    expect(calls).toHaveLength(5)
    expect(result.translations).toEqual(['中:a', '', '中:c', '中:d', '中:e'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('配额')
  })

  it('并发不超过 3', () => {
    expect(mymemoryProvider.concurrency).toBeLessThanOrEqual(3)
  })

  it('单条失败整条计入 errors 且顺序稳定', async () => {
    // 用 5xx（不触发退避重试）验证错误下标稳定
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
    const result = await translateTexts(['a', 'b'], { provider: 'mymemory' }, { fetchImpl })
    expect(result.translations).toEqual(['', ''])
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('第 1/2 批')
    expect(result.errors[1]).toContain('第 2/2 批')
  })
})
