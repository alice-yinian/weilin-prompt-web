import { describe, expect, it, vi } from 'vitest'
import { BING_ENDPOINT, BING_MAX_BATCH, bingProvider, buildRequest, parseResponse } from '../../src/core/translate/providers/bing'
import { translateTexts } from '../../src/core/translate/index'

const CONFIG = { provider: 'bing', direction: 'en2zh', bingKey: 'azure-key', bingRegion: 'eastasia', proxyPrefix: '' }

describe('必应：buildRequest', () => {
  it('Azure 端点 + api-version/from/to + 密钥头 + [{Text}] body', () => {
    const { url, init } = buildRequest(CONFIG, ['1girl', 'cat_ears'])
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(BING_ENDPOINT)
    expect(parsed.searchParams.get('api-version')).toBe('3.0')
    expect(parsed.searchParams.get('from')).toBe('en')
    expect(parsed.searchParams.get('to')).toBe('zh-Hans')
    expect(init.method).toBe('POST')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('azure-key')
    expect(init.headers['Ocp-Apim-Subscription-Region']).toBe('eastasia')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual([{ Text: '1girl' }, { Text: 'cat_ears' }])
  })

  it('zh2en 方向语种为 zh-Hans → en', () => {
    const { url } = buildRequest({ ...CONFIG, direction: 'zh2en' }, ['猫'])
    const parsed = new URL(url)
    expect(parsed.searchParams.get('from')).toBe('zh-Hans')
    expect(parsed.searchParams.get('to')).toBe('en')
  })

  it('region 缺省回落 global', () => {
    const { init } = buildRequest({ ...CONFIG, bingRegion: '' }, ['a'])
    expect(init.headers['Ocp-Apim-Subscription-Region']).toBe('global')
  })
})

describe('必应：parseResponse', () => {
  it('按顺序取 translations[0].text 并补齐', () => {
    expect(parseResponse([{ translations: [{ text: '1女孩' }] }, { translations: [{ text: '猫耳' }] }], 2)).toEqual(['1女孩', '猫耳'])
    expect(parseResponse([{ translations: [{ text: '只有一条' }] }], 3)).toEqual(['只有一条', '', ''])
  })

  it('非数组报格式错误', () => {
    expect(() => parseResponse({}, 1)).toThrowError(/格式不符/)
  })
})

describe('必应：translateTexts', () => {
  it('无密钥时报明确错误且不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts(['a'], { provider: 'bing', bingKey: '' }, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.translations).toEqual([''])
    expect(result.errors[0]).toContain('Azure 密钥')
    expect(result.errors[0]).toContain('token 接口已失效')
  })

  it('单批不超过 50 条', async () => {
    const batches = []
    const fetchImpl = async (url, init) => {
      const list = JSON.parse(init.body)
      batches.push(list.length)
      return { ok: true, status: 200, json: async () => list.map((item) => ({ translations: [{ text: `译:${item.Text}` }] })) }
    }
    const texts = Array.from({ length: 60 }, (_, i) => `t${i}`)
    const result = await translateTexts(texts, { ...CONFIG, batchSize: 200 }, { fetchImpl })

    expect(BING_MAX_BATCH).toBe(50)
    expect(batches).toEqual([50, 10])
    expect(result.errors).toEqual([])
    expect(result.translations[0]).toBe('译:t0')
    expect(result.translations[59]).toBe('译:t59')
  })

  it('HTTP 401 归类为密钥错误', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) })
    const result = await translateTexts(['a'], CONFIG, { fetchImpl })
    expect(result.errors[0]).toContain('密钥')
  })

  it('provider 元数据：需要密钥、支持批量', () => {
    expect(bingProvider).toMatchObject({ id: 'bing', needsKey: true, concurrency: 1 })
  })
})
