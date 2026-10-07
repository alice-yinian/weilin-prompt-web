import { describe, expect, it, vi } from 'vitest'
import {
  API_ERROR_CODES,
  DEFAULT_API_TRANSLATION_CONFIG,
  PROVIDERS,
  describeApiError,
  directionOf,
  getProvider,
  langPair,
  normalizeConfig,
  testConnection,
  translateTexts
} from '../../src/core/translate/index'

describe('DEFAULT_API_TRANSLATION_CONFIG', () => {
  it('字段与默认值符合约定', () => {
    expect(DEFAULT_API_TRANSLATION_CONFIG).toEqual({
      enabled: false,
      provider: 'youdao',
      direction: 'en2zh',
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: '',
      model: '',
      temperature: 0,
      batchSize: 20,
      proxyPrefix: '',
      systemPrompt: '',
      bingKey: '',
      bingRegion: 'global'
    })
  })

  it('冻结，避免被误改', () => {
    expect(Object.isFrozen(DEFAULT_API_TRANSLATION_CONFIG)).toBe(true)
  })
})

describe('PROVIDERS', () => {
  it('四个服务商的元数据', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['youdao', 'mymemory', 'openai', 'bing'])
    const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]))
    expect(byId.youdao).toMatchObject({ batch: true, needsKey: false })
    expect(byId.mymemory).toMatchObject({ batch: false, needsKey: false })
    expect(byId.openai).toMatchObject({ batch: true, needsKey: true, needsBaseUrl: true, needsModel: true })
    expect(byId.bing).toMatchObject({ batch: true, needsKey: true })
    for (const provider of PROVIDERS) expect(typeof provider.labelKey).toBe('string')
  })

  it('getProvider 支持 id 字符串与对象，未知 id 抛错', () => {
    expect(getProvider('youdao').id).toBe('youdao')
    expect(getProvider({ id: 'bing' }).id).toBe('bing')
    expect(getProvider({ provider: 'openai' }).id).toBe('openai')
    expect(() => getProvider('ali')).toThrowError(/不支持的翻译服务/)
  })
})

describe('normalizeConfig', () => {
  it('合并默认值并保留新增字段', () => {
    const cfg = normalizeConfig({ provider: 'bing', direction: 'zh2en', bingKey: ' k ' })
    expect(cfg.provider).toBe('bing')
    expect(cfg.direction).toBe('zh2en')
    expect(cfg.bingKey).toBe('k')
    expect(cfg.bingRegion).toBe('global')
    expect(cfg.baseUrl).toBe('https://api.siliconflow.cn/v1')
  })

  it('direction 只认 zh2en，其余回落到 en2zh；provider 为空回落到 youdao', () => {
    expect(normalizeConfig({ direction: 'xx' }).direction).toBe('en2zh')
    expect(normalizeConfig({ direction: null }).direction).toBe('en2zh')
    expect(normalizeConfig({ provider: '  ' }).provider).toBe('youdao')
  })

  it('规整 baseUrl 末尾斜杠与空白，不改动入参', () => {
    const input = { baseUrl: ' https://a.com/v1/// ' }
    expect(normalizeConfig(input).baseUrl).toBe('https://a.com/v1')
    expect(input).toEqual({ baseUrl: ' https://a.com/v1/// ' })
  })

  it('非法 batchSize/temperature 回落默认', () => {
    expect(normalizeConfig({ batchSize: 0 }).batchSize).toBe(20)
    expect(normalizeConfig({ batchSize: '5' }).batchSize).toBe(5)
    expect(normalizeConfig({ temperature: 'x' }).temperature).toBe(0)
    expect(normalizeConfig({ temperature: 0.7 }).temperature).toBe(0.7)
  })

  it('支持 undefined', () => {
    expect(normalizeConfig()).toMatchObject({ provider: 'youdao', direction: 'en2zh', enabled: false })
  })
})

describe('directionOf / langPair', () => {
  it('默认英→中，显式 zh2en 才反向', () => {
    expect(directionOf({})).toBe('en2zh')
    expect(directionOf(null)).toBe('en2zh')
    expect(directionOf({ direction: 'zh2en' })).toBe('zh2en')
    expect(directionOf({ direction: 'en2zh' })).toBe('en2zh')
  })

  it('每个 provider 的两个方向语种取值', () => {
    expect(langPair('en2zh', 'youdao')).toEqual({ from: 'en', to: 'zh-CHS' })
    expect(langPair('zh2en', 'youdao')).toEqual({ from: 'zh-CHS', to: 'en' })
    expect(langPair('en2zh', 'mymemory')).toEqual({ from: 'en', to: 'zh-CN' })
    expect(langPair('zh2en', 'mymemory')).toEqual({ from: 'zh-CN', to: 'en' })
    expect(langPair('en2zh', 'bing')).toEqual({ from: 'en', to: 'zh-Hans' })
    expect(langPair('zh2en', 'bing')).toEqual({ from: 'zh-Hans', to: 'en' })
    expect(langPair('en2zh', 'openai')).toEqual({ from: 'en', to: 'zh-CN' })
    expect(langPair('zh2en', 'openai')).toEqual({ from: 'zh-CN', to: 'en' })
  })

  it('未知方向按英→中处理', () => {
    expect(langPair('nope', 'youdao')).toEqual({ from: 'en', to: 'zh-CHS' })
  })
})

describe('未配置不发请求', () => {
  it('未知 provider 报配置错误', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts(['a'], { provider: 'ali' }, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.translations).toEqual([''])
    expect(result.errors[0]).toContain('不支持的翻译服务')
  })

  it('必应无密钥时报明确错误且不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts(['a'], { provider: 'bing', bingKey: '' }, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.translations).toEqual([''])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('密钥')
    expect(result.errors[0]).toContain('token 接口已失效')
  })

  it('OpenAI 兼容缺 model 时不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts(['a'], { provider: 'openai', baseUrl: 'https://a.com/v1', model: '' }, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.errors[0]).toContain('模型名')
  })

  it('无可用 fetch 时报配置错误', async () => {
    const result = await translateTexts(['a'], { provider: 'youdao' }, { fetchImpl: null })
    expect(result.errors[0]).toContain('fetch')
  })

  it('translations 与入参等长', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts(['a', 'b', 'c'], { provider: 'bing' }, { fetchImpl })
    expect(result.translations).toHaveLength(3)
    expect(result.translations).toEqual(['', '', ''])
  })
})

describe('describeApiError', () => {
  it('网络/CORS 失败', () => {
    const message = describeApiError(new TypeError('Failed to fetch'))
    expect(message).toContain('网络')
    expect(message).toContain('CORS')
    expect(message).toContain('proxyPrefix')
  })

  it('401/403 指向密钥', () => {
    expect(describeApiError(Object.assign(new Error('x'), { status: 401 }))).toContain('密钥')
    expect(describeApiError(Object.assign(new Error('x'), { status: 403 }))).toContain('密钥')
  })

  it('404 指向接口地址', () => {
    const message = describeApiError(Object.assign(new Error('x'), { status: 404 }))
    expect(message).toContain('接口地址')
    expect(message).toContain('baseUrl')
  })

  it('429 指向频率/批量', () => {
    const message = describeApiError(Object.assign(new Error('x'), { status: 429 }))
    expect(message).toContain('频繁')
    expect(message).toContain('batchSize')
  })

  it('配额不足有专门提示', () => {
    const message = describeApiError({ code: API_ERROR_CODES.QUOTA, message: '今日免费额度用尽' })
    expect(message).toContain('配额')
    expect(message).toContain('今日免费额度用尽')
  })

  it('5xx 指向服务端并带响应体', () => {
    const message = describeApiError(Object.assign(new Error('x'), { status: 503, body: 'upstream down' }))
    expect(message).toContain('服务端错误')
    expect(message).toContain('upstream down')
  })

  it('响应格式不符', () => {
    expect(describeApiError({ code: API_ERROR_CODES.FORMAT, message: '不是数组' })).toContain('响应格式')
  })

  it('未配置', () => {
    const message = describeApiError({ code: API_ERROR_CODES.CONFIG, message: '缺少模型名（model）' })
    expect(message).toContain('未完成 API 翻译配置')
    expect(message).toContain('缺少模型名')
  })

  it('超时/中止', () => {
    const error = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    expect(describeApiError(error)).toContain('超时')
  })

  it('未知错误兜底', () => {
    expect(describeApiError(new Error('莫名其妙'))).toContain('莫名其妙')
    expect(describeApiError(null)).toContain('未知错误')
  })
})

describe('testConnection', () => {
  it('有道成功时返回 ok 与示例（en2zh 用 cat）', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push(new URLSearchParams(init.body).get('q'))
      return { ok: true, status: 200, json: async () => ({ translation: ['猫咪'] }) }
    }
    const result = await testConnection({ provider: 'youdao' }, { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('连接成功')
    expect(result.message).toContain('youdao')
    expect(result.message).toContain('猫咪')
    expect(calls).toEqual(['cat'])
  })

  it('zh2en 方向用「猫」做样本', async () => {
    let seen = null
    const fetchImpl = async (url, init) => {
      seen = new URLSearchParams(init.body).get('q')
      return { ok: true, status: 200, json: async () => ({ translation: ['cat'] }) }
    }
    const result = await testConnection({ provider: 'youdao', direction: 'zh2en' }, { fetchImpl })
    expect(result.ok).toBe(true)
    expect(seen).toBe('猫')
  })

  it('网络异常时返回失败原因', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    const result = await testConnection({ provider: 'youdao' }, { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('网络')
  })

  it('未配置时不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await testConnection({ provider: 'openai', baseUrl: 'https://a.com/v1', model: '' }, { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('模型名')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
