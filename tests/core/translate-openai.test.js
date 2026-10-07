import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_TRANSLATION_CONFIG,
  DEFAULT_SYSTEM_PROMPT,
  buildChatRequest,
  chunkTexts,
  parseChatResponse,
  testConnection,
  translateTexts
} from '../../src/core/translate/index.js'

const OPENAI = {
  enabled: true,
  provider: 'openai',
  direction: 'en2zh',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  temperature: 0,
  batchSize: 20,
  proxyPrefix: '',
  systemPrompt: ''
}

function chatPayload(content) {
  return { choices: [{ message: { role: 'assistant', content } }] }
}

function chatResponse(content, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => chatPayload(content) }
}

function httpErrorResponse(status, payload) {
  return { ok: false, status, json: async () => payload ?? { error: { message: `boom ${status}` } } }
}

function makeOpenaiFetch(respond) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    const texts = JSON.parse(body.messages[1].content)
    calls.push({ url, init, body, texts })
    return respond(texts, calls.length)
  }
  return { fetchImpl, calls }
}

describe('OpenAI 兼容：buildChatRequest', () => {
  it('拼出 URL、鉴权头与 JSON 请求体', () => {
    const { url, init } = buildChatRequest(OPENAI, ['1girl', 'cat_ears'])
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer sk-test')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('test-model')
    expect(body.temperature).toBe(0)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].content).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(JSON.parse(body.messages[1].content)).toEqual(['1girl', 'cat_ears'])
  })

  it('zh2en 方向换成英文目标提示词', () => {
    const { init } = buildChatRequest({ ...OPENAI, direction: 'zh2en' }, ['猫'])
    const prompt = JSON.parse(init.body).messages[0].content
    expect(prompt).toContain('翻译成英文')
    expect(prompt).not.toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('proxyPrefix 拼在 baseUrl 之前', () => {
    const { url } = buildChatRequest({ ...OPENAI, baseUrl: 'https://api.example.com/v1/', proxyPrefix: 'https://proxy.local/' }, ['a'])
    expect(url).toBe('https://proxy.local/https://api.example.com/v1/chat/completions')
  })

  it('自定义 systemPrompt 覆盖内置提示词', () => {
    const { init } = buildChatRequest({ ...OPENAI, systemPrompt: '只输出 JSON' }, ['a'])
    expect(JSON.parse(init.body).messages[0].content).toBe('只输出 JSON')
  })

  it('texts 里的非字符串被安全转成字符串', () => {
    const { init } = buildChatRequest(OPENAI, ['ok', 42, null, undefined])
    expect(JSON.parse(JSON.parse(init.body).messages[1].content)).toEqual(['ok', '42', '', ''])
  })
})

describe('OpenAI 兼容：parseChatResponse', () => {
  it('解析裸 JSON 数组与代码块围栏', () => {
    expect(parseChatResponse(chatPayload('["1女孩","猫耳"]'))).toEqual(['1女孩', '猫耳'])
    expect(parseChatResponse(chatPayload('```json\n["1女孩","猫耳"]\n```'))).toEqual(['1女孩', '猫耳'])
  })

  it('JSON 解析失败时按行切分', () => {
    expect(parseChatResponse(chatPayload('1女孩\n猫耳\n'))).toEqual(['1女孩', '猫耳'])
    expect(parseChatResponse(chatPayload('- 1女孩\n- 猫耳'))).toEqual(['1女孩', '猫耳'])
  })

  it('长度不足时补齐，多余不裁剪', () => {
    expect(parseChatResponse(chatPayload('["只有一条"]'), 3)).toEqual(['只有一条', '', ''])
    expect(parseChatResponse(chatPayload('["多余长度不裁剪"]'), 1)).toEqual(['多余长度不裁剪'])
  })

  it('对象元素取常见字段；content 数组分片可取', () => {
    expect(parseChatResponse(chatPayload('[{"translated":"猫"},{"text":"狗"}]'))).toEqual(['猫', '狗'])
    expect(parseChatResponse({ choices: [{ message: { content: [{ type: 'text', text: '["乙"]' }] } }] })).toEqual(['乙'])
  })

  it('空响应', () => {
    expect(parseChatResponse(chatPayload(''))).toEqual([])
    expect(parseChatResponse(null, 2)).toEqual(['', ''])
  })
})

describe('OpenAI 兼容：translateTexts', () => {
  it('按 batchSize 分批串行请求，顺序保持不变', async () => {
    const { fetchImpl, calls } = makeOpenaiFetch((texts) => chatResponse(JSON.stringify(texts.map((t) => `译${t}`))))
    const texts = ['a', 'b', 'c', 'd', 'e']
    const result = await translateTexts(texts, { ...OPENAI, batchSize: 2 }, { fetchImpl })

    expect(calls.map((c) => c.texts)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(result.translations).toEqual(['译a', '译b', '译c', '译d', '译e'])
    expect(result.errors).toEqual([])
  })

  it('某一批失败只记录 errors，其余批次继续', async () => {
    const { fetchImpl } = makeOpenaiFetch((texts) => {
      if (texts[0] === 'c') return httpErrorResponse(500)
      return chatResponse(JSON.stringify(texts.map((t) => `译${t}`)))
    })
    const result = await translateTexts(['a', 'b', 'c', 'd', 'e'], { ...OPENAI, batchSize: 2 }, { fetchImpl })

    expect(result.translations).toEqual(['译a', '译b', '', '', '译e'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('第 2/3 批')
    expect(result.errors[0]).toContain('服务端错误')
  })

  it('onProgress 每批回调一次，带 done/total', async () => {
    const { fetchImpl } = makeOpenaiFetch((texts) => chatResponse(JSON.stringify(texts.map((t) => `译${t}`))))
    const events = []
    await translateTexts(['a', 'b', 'c'], { ...OPENAI, batchSize: 2 }, { fetchImpl, onProgress: (e) => events.push(e) })

    expect(events).toEqual([
      { done: 2, total: 3, batchIndex: 0, batchCount: 2, error: null },
      { done: 3, total: 3, batchIndex: 1, batchCount: 2, error: null }
    ])
  })

  it('模型返回条数不足时用空串补齐，多余条目被忽略', async () => {
    const fetchImpl = async () => chatResponse('["只有一条","第二条","第三条"]')
    const result = await translateTexts(['a', 'b'], OPENAI, { fetchImpl })
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
    const result = await translateTexts(['a'], OPENAI, { fetchImpl })
    expect(result.errors[0]).toContain('响应格式')
  })

  it('返回空译文时记录空内容错误', async () => {
    const fetchImpl = async () => chatResponse('')
    const result = await translateTexts(['a'], OPENAI, { fetchImpl })
    expect(result.translations).toEqual([''])
    expect(result.errors[0]).toContain('空内容')
  })

  it('未配置 baseUrl/model 时不发请求', async () => {
    const fetchImpl = () => {
      throw new Error('不应发起请求')
    }
    const noModel = await translateTexts(['a'], { ...OPENAI, model: '' }, { fetchImpl })
    expect(noModel.translations).toEqual([''])
    expect(noModel.errors[0]).toContain('模型名')

    const noBase = await translateTexts(['a'], { ...OPENAI, baseUrl: '' }, { fetchImpl })
    expect(noBase.errors[0]).toContain('接口地址')
  })

  it('空输入直接返回空结果', async () => {
    const result = await translateTexts([], OPENAI, { fetchImpl: () => Promise.reject(new Error('no')) })
    expect(result).toEqual({ translations: [], errors: [] })
  })
})

describe('OpenAI 兼容：testConnection', () => {
  it('成功时返回 ok 与示例', async () => {
    const { fetchImpl, calls } = makeOpenaiFetch(() => chatResponse('["猫"]'))
    const result = await testConnection(OPENAI, { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('连接成功')
    expect(result.message).toContain('test-model')
    expect(result.message).toContain('猫')
    expect(calls).toHaveLength(1)
  })

  it('HTTP 401 时返回失败原因', async () => {
    const result = await testConnection(OPENAI, { fetchImpl: async () => httpErrorResponse(401) })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('密钥')
  })
})

describe('chunkTexts', () => {
  it('按大小切分，非法 size 退化为单批', () => {
    expect(chunkTexts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunkTexts(['a', 'b'], 10)).toEqual([['a', 'b']])
    expect(chunkTexts(['a', 'b', 'c'], 0)).toEqual([['a', 'b', 'c']])
    expect(chunkTexts([], 3)).toEqual([])
  })
})

