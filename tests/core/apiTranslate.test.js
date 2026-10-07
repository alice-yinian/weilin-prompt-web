import { describe, expect, it, vi } from 'vitest'
import {
  API_ERROR_CODES,
  DEFAULT_API_TRANSLATION_CONFIG,
  DEFAULT_SYSTEM_PROMPT,
  buildChatRequest,
  chunkTexts,
  describeApiError,
  normalizeConfig,
  parseChatResponse,
  testConnection,
  translateTexts
} from '../../src/core/translate/apiTranslate'

const BASE_CONFIG = {
  enabled: true,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  temperature: 0,
  batchSize: 20,
  proxyPrefix: '',
  systemPrompt: ''
}

// 构造一个 chat 响应体：choices[0].message.content 为字符串
function chatPayload(content) {
  return { choices: [{ message: { role: 'assistant', content } }] }
}

// 构造一个假 Response
function chatResponse(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => chatPayload(content)
  }
}

function httpErrorResponse(status, payload) {
  return {
    ok: false,
    status,
    json: async () => payload ?? { error: { message: `boom ${status}` } }
  }
}

// 假 fetch：按请求体里的用户消息回译，并记录每次调用
function makeFetch(respond) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    const texts = JSON.parse(body.messages[1].content)
    calls.push({ url, init, body, texts })
    return respond(texts, calls.length, { url, init, body })
  }
  return { fetchImpl, calls }
}

describe('DEFAULT_API_TRANSLATION_CONFIG', () => {
  it('字段与默认值符合约定', () => {
    expect(DEFAULT_API_TRANSLATION_CONFIG).toEqual({
      enabled: false,
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: '',
      model: '',
      temperature: 0,
      batchSize: 20,
      proxyPrefix: '',
      systemPrompt: ''
    })
  })

  it('冻结，避免被误改', () => {
    expect(Object.isFrozen(DEFAULT_API_TRANSLATION_CONFIG)).toBe(true)
  })
})

describe('normalizeConfig', () => {
  it('合并默认值', () => {
    const cfg = normalizeConfig({ model: 'm', apiKey: 'k' })
    expect(cfg.baseUrl).toBe('https://api.siliconflow.cn/v1')
    expect(cfg.model).toBe('m')
    expect(cfg.apiKey).toBe('k')
    expect(cfg.batchSize).toBe(20)
    expect(cfg.temperature).toBe(0)
  })

  it('去掉 baseUrl 末尾斜杠（含多个）与首尾空格', () => {
    expect(normalizeConfig({ baseUrl: ' https://a.com/v1/ ' }).baseUrl).toBe('https://a.com/v1')
    expect(normalizeConfig({ baseUrl: 'https://a.com/v1///' }).baseUrl).toBe('https://a.com/v1')
    expect(normalizeConfig({ baseUrl: '' }).baseUrl).toBe('')
  })

  it('非法 batchSize/temperature 回落到默认值', () => {
    expect(normalizeConfig({ batchSize: 0 }).batchSize).toBe(20)
    expect(normalizeConfig({ batchSize: -3 }).batchSize).toBe(20)
    expect(normalizeConfig({ batchSize: 'abc' }).batchSize).toBe(20)
    expect(normalizeConfig({ batchSize: '5' }).batchSize).toBe(5)
    expect(normalizeConfig({ temperature: 'x' }).temperature).toBe(0)
    expect(normalizeConfig({ temperature: 0.7 }).temperature).toBe(0.7)
  })

  it('不修改传入对象', () => {
    const input = { baseUrl: 'https://a.com/v1/', model: ' m ' }
    normalizeConfig(input)
    expect(input).toEqual({ baseUrl: 'https://a.com/v1/', model: ' m ' })
  })

  it('支持 undefined', () => {
    expect(normalizeConfig()).toMatchObject({ baseUrl: 'https://api.siliconflow.cn/v1', enabled: false })
  })
})

describe('buildChatRequest', () => {
  it('拼出 OpenAI 兼容的 URL 与请求体', () => {
    const { url, init } = buildChatRequest(BASE_CONFIG, ['1girl', 'cat_ears'])
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer sk-test')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('test-model')
    expect(body.temperature).toBe(0)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(body.messages[1].role).toBe('user')
    expect(JSON.parse(body.messages[1].content)).toEqual(['1girl', 'cat_ears'])
  })

  it('内置提示词要求只输出 JSON 数组、长度一致、中文原样返回', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('JSON 数组')
    expect(DEFAULT_SYSTEM_PROMPT).toContain('长度必须与输入完全一致')
    expect(DEFAULT_SYSTEM_PROMPT).toContain('原样返回')
  })

  it('proxyPrefix 拼在 baseUrl 之前，末尾斜杠已归一', () => {
    const { url } = buildChatRequest({ ...BASE_CONFIG, baseUrl: 'https://api.example.com/v1/', proxyPrefix: 'https://proxy.local/' }, ['a'])
    expect(url).toBe('https://proxy.local/https://api.example.com/v1/chat/completions')
  })

  it('自定义 systemPrompt 覆盖内置提示词', () => {
    const { init } = buildChatRequest({ ...BASE_CONFIG, systemPrompt: '只输出 JSON' }, ['a'])
    expect(JSON.parse(init.body).messages[0].content).toBe('只输出 JSON')
  })

  it('缺省字段按默认配置补齐（无 baseUrl 时 URL 只有路径）', () => {
    const { url, init } = buildChatRequest({ baseUrl: '', model: 'm' }, [])
    expect(url).toBe('/chat/completions')
    expect(JSON.parse(init.body).messages[1].content).toBe('[]')
  })

  it('texts 里的非字符串被安全转成字符串', () => {
    const { init } = buildChatRequest(BASE_CONFIG, ['ok', 42, null, undefined])
    expect(JSON.parse(JSON.parse(init.body).messages[1].content)).toEqual(['ok', '42', '', ''])
  })
})

describe('parseChatResponse', () => {
  it('解析裸 JSON 数组', () => {
    expect(parseChatResponse(chatPayload('["1女孩","猫耳"]'))).toEqual(['1女孩', '猫耳'])
  })

  it('剥离 ```json 代码块围栏', () => {
    expect(parseChatResponse(chatPayload('```json\n["1女孩","猫耳"]\n```'))).toEqual(['1女孩', '猫耳'])
    expect(parseChatResponse(chatPayload('```\n["a","b"]\n```'))).toEqual(['a', 'b'])
  })

  it('容忍数组前后的说明文字', () => {
    const content = '好的，以下是翻译结果：\n```json\n["1女孩", "猫耳"]\n```\n希望有帮助！'
    expect(parseChatResponse(chatPayload(content))).toEqual(['1女孩', '猫耳'])
  })

  it('JSON 解析失败时按行切分', () => {
    expect(parseChatResponse(chatPayload('1女孩\n猫耳\n'))).toEqual(['1女孩', '猫耳'])
    expect(parseChatResponse(chatPayload('- 1女孩\n- 猫耳'))).toEqual(['1女孩', '猫耳'])
    expect(parseChatResponse(chatPayload('1. 1女孩\n2. 猫耳'))).toEqual(['1女孩', '猫耳'])
  })

  it('长度不足时按 expectedLength 用空串补齐', () => {
    expect(parseChatResponse(chatPayload('["只有一条"]'), 3)).toEqual(['只有一条', '', ''])
    expect(parseChatResponse(chatPayload('["多余长度不裁剪"]'), 1)).toEqual(['多余长度不裁剪'])
  })

  it('数组元素是对象时取常见字段', () => {
    expect(parseChatResponse(chatPayload('[{"translated":"猫"},{"text":"狗"}]'))).toEqual(['猫', '狗'])
  })

  it('choices[0].text 与 content 数组分片都能取到', () => {
    expect(parseChatResponse({ choices: [{ text: '["甲"]' }] })).toEqual(['甲'])
    expect(parseChatResponse({ choices: [{ message: { content: [{ type: 'text', text: '["乙"]' }] } }] })).toEqual(['乙'])
  })

  it('空响应返回空数组（给 expectedLength 则补齐）', () => {
    expect(parseChatResponse({ choices: [] })).toEqual([])
    expect(parseChatResponse(null, 2)).toEqual(['', ''])
    expect(parseChatResponse(chatPayload(''))).toEqual([])
  })

  it('解析纯字符串响应体', () => {
    expect(parseChatResponse('["a"]')).toEqual(['a'])
  })
})

describe('chunkTexts', () => {
  it('按大小切分', () => {
    expect(chunkTexts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('空数组返回空', () => {
    expect(chunkTexts([], 3)).toEqual([])
  })

  it('size 大于长度时只有一批', () => {
    expect(chunkTexts(['a', 'b'], 10)).toEqual([['a', 'b']])
  })

  it('非法 size 退化为单批', () => {
    expect(chunkTexts(['a', 'b', 'c'], 0)).toEqual([['a', 'b', 'c']])
    expect(chunkTexts(['a', 'b', 'c'], undefined)).toEqual([['a', 'b', 'c']])
  })

  it('返回新数组，不改动入参', () => {
    const input = [1, 2]
    const chunks = chunkTexts(input, 1)
    chunks[0].push(9)
    expect(input).toEqual([1, 2])
  })
})

describe('translateTexts', () => {
  it('单批成功时按顺序返回译文', async () => {
    const { fetchImpl, calls } = makeFetch((texts) => chatResponse(JSON.stringify(texts.map((t) => `中:${t}`))))
    const result = await translateTexts(['1girl', 'cat_ears'], BASE_CONFIG, { fetchImpl })

    expect(result.errors).toEqual([])
    expect(result.translations).toEqual(['中:1girl', '中:cat_ears'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.example.com/v1/chat/completions')
    expect(calls[0].body.model).toBe('test-model')
    expect(calls[0].texts).toEqual(['1girl', 'cat_ears'])
  })

  it('按 batchSize 分批串行请求，顺序保持不变', async () => {
    const { fetchImpl, calls } = makeFetch((texts) => chatResponse(JSON.stringify(texts.map((t) => `译${t}`))))
    const texts = ['a', 'b', 'c', 'd', 'e']
    const result = await translateTexts(texts, { ...BASE_CONFIG, batchSize: 2 }, { fetchImpl })

    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.texts)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(result.translations).toEqual(['译a', '译b', '译c', '译d', '译e'])
    expect(result.errors).toEqual([])
  })

  it('某一批失败只记录 errors，其余批次继续', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const texts = JSON.parse(JSON.parse(init.body).messages[1].content)
      if (texts[0] === 'c') return httpErrorResponse(500)
      return chatResponse(JSON.stringify(texts.map((t) => `译${t}`)))
    })
    const texts = ['a', 'b', 'c', 'd', 'e']
    const result = await translateTexts(texts, { ...BASE_CONFIG, batchSize: 2 }, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.translations).toEqual(['译a', '译b', '', '', '译e'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('第 2/3 批')
    expect(result.errors[0]).toContain('服务端错误')
  })

  it('未配置 baseUrl/model 时直接返回错误且不发请求', async () => {
    const fetchImpl = vi.fn()
    const noModel = await translateTexts(['a'], { ...BASE_CONFIG, model: '' }, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(noModel.translations).toEqual([''])
    expect(noModel.errors).toHaveLength(1)
    expect(noModel.errors[0]).toContain('模型名')

    const noBase = await translateTexts(['a'], { ...BASE_CONFIG, baseUrl: '' }, { fetchImpl })
    expect(noBase.errors[0]).toContain('接口地址')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('模型返回条数不足时用空串补齐，多余条目被忽略', async () => {
    const fetchImpl = async () => chatResponse('["只有一条","第二条","第三条"]')
    const result = await translateTexts(['a', 'b'], BASE_CONFIG, { fetchImpl })
    expect(result.translations).toEqual(['只有一条', '第二条'])
    expect(result.errors).toEqual([])
  })

  it('响应不是合法 JSON 时记录格式错误', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      }
    })
    const result = await translateTexts(['a'], BASE_CONFIG, { fetchImpl })
    expect(result.errors[0]).toContain('响应格式')
  })

  it('返回空译文时记录空内容错误', async () => {
    const fetchImpl = async () => chatResponse('')
    const result = await translateTexts(['a'], BASE_CONFIG, { fetchImpl })
    expect(result.translations).toEqual([''])
    expect(result.errors[0]).toContain('空内容')
  })

  it('网络异常（fetch 抛 TypeError）被归类为网络问题', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    const result = await translateTexts(['a'], BASE_CONFIG, { fetchImpl })
    expect(result.errors[0]).toContain('网络')
    expect(result.errors[0]).toContain('排查建议')
  })

  it('onProgress 每批回调一次，带 done/total', async () => {
    const { fetchImpl } = makeFetch((texts) => chatResponse(JSON.stringify(texts.map((t) => `译${t}`))))
    const events = []
    await translateTexts(['a', 'b', 'c'], { ...BASE_CONFIG, batchSize: 2 }, { fetchImpl, onProgress: (e) => events.push(e) })

    expect(events).toEqual([
      { done: 2, total: 3, batchIndex: 0, batchCount: 2, error: null },
      { done: 3, total: 3, batchIndex: 1, batchCount: 2, error: null }
    ])
  })

  it('空输入不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await translateTexts([], BASE_CONFIG, { fetchImpl })
    expect(result).toEqual({ translations: [], errors: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('无可用 fetch 时报配置错误', async () => {
    const result = await translateTexts(['a'], BASE_CONFIG, { fetchImpl: null })
    expect(result.errors[0]).toContain('配置')
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

  it('5xx 指向服务端', () => {
    const message = describeApiError(Object.assign(new Error('x'), { status: 503, body: 'upstream down' }))
    expect(message).toContain('服务端错误')
    expect(message).toContain('upstream down')
  })

  it('400 指向模型名/参数', () => {
    expect(describeApiError(Object.assign(new Error('x'), { status: 400 }))).toContain('model')
  })

  it('响应格式不符', () => {
    expect(describeApiError({ code: API_ERROR_CODES.FORMAT, message: '不是数组' })).toContain('JSON 数组')
  })

  it('超时/中止', () => {
    const error = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    expect(describeApiError(error)).toContain('超时')
  })

  it('未配置', () => {
    const message = describeApiError({ code: API_ERROR_CODES.CONFIG, message: '缺少模型名（model）' })
    expect(message).toContain('未完成 API 翻译配置')
    expect(message).toContain('缺少模型名')
  })

  it('未知错误兜底', () => {
    expect(describeApiError(new Error('莫名其妙'))).toContain('莫名其妙')
    expect(describeApiError(null)).toContain('未知错误')
  })
})

describe('testConnection', () => {
  it('成功时返回 ok 与示例', async () => {
    const { fetchImpl, calls } = makeFetch(() => chatResponse('["猫"]'))
    const result = await testConnection(BASE_CONFIG, { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('连接成功')
    expect(result.message).toContain('test-model')
    expect(result.message).toContain('猫')
    expect(calls).toHaveLength(1)
    expect(calls[0].texts).toHaveLength(1)
  })

  it('HTTP 401 时返回失败原因', async () => {
    const result = await testConnection(BASE_CONFIG, { fetchImpl: async () => httpErrorResponse(401) })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('密钥')
  })

  it('网络异常时返回失败原因', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    const result = await testConnection(BASE_CONFIG, { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('网络')
  })

  it('未配置时不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await testConnection({ ...BASE_CONFIG, model: '' }, { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('模型名')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
