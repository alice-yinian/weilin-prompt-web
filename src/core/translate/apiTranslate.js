// API 翻译：把标签批量交给兼容 OpenAI Chat Completions 的服务翻译
// 本模块零 DOM、零 IO（fetch 由调用方注入），便于单测，也便于将来放进 Worker

// 默认配置：默认关闭，只有 baseUrl 有值、model/apiKey 需要用户填写
export const DEFAULT_API_TRANSLATION_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: '',
  temperature: 0,
  batchSize: 20,
  proxyPrefix: '',
  systemPrompt: ''
})

// 内置提示词：把「只输出 JSON 数组、长度一致、中文原样返回」写成硬约束，减少模型加解释文字
export const DEFAULT_SYSTEM_PROMPT = [
  '你是提示词标签翻译助手。',
  '用户会给出一个 JSON 字符串数组，每一项是一条待翻译的英文标签。',
  '把每条标签翻译成简体中文，并严格按以下要求输出：',
  '1. 只输出一个 JSON 数组，不要输出解释、前缀、后缀、Markdown 代码块或任何多余文字；',
  '2. 数组长度必须与输入完全一致，顺序一一对应，不得增删、合并或拆分条目；',
  '3. 本身已经是中文的标签原样返回；',
  '4. 无法翻译的专有名词、人名、作品名等按原文返回。',
  '示例：输入 ["1girl","猫耳"] → 输出 ["1女孩","猫耳"]'
].join('\n')

// 供 describeApiError 与测试使用；调用方也可据此判断错误类型
export const API_ERROR_CODES = Object.freeze({
  CONFIG: 'config',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  NOT_FOUND: 'notFound',
  RATE_LIMIT: 'rateLimit',
  BAD_REQUEST: 'badRequest',
  SERVER: 'server',
  FORMAT: 'format',
  EMPTY: 'empty',
  UNKNOWN: 'unknown'
})

// 浏览器 fetch 失败与 Node 侧的典型网络错误文案，用于把 TypeError 归类成「网络/CORS」
const NETWORK_HINT = /failed to fetch|networkerror|load failed|fetch failed|network request failed|econnrefused|econnreset|enotfound|etimedout|eai_again|socket hang up|proxy/i

function apiError(code, message, extra = {}) {
  const error = new Error(message || code)
  error.code = code
  return Object.assign(error, extra)
}

function normalizeBatchSize(value) {
  const size = Math.floor(Number(value))
  return Number.isFinite(size) && size > 0 ? size : DEFAULT_API_TRANSLATION_CONFIG.batchSize
}

/**
 * 合并默认配置：补全缺省字段、去掉 baseUrl 末尾斜杠、规整类型
 * @param {object} [partial]
 * @returns {typeof DEFAULT_API_TRANSLATION_CONFIG}
 */
export function normalizeConfig(partial) {
  const merged = { ...DEFAULT_API_TRANSLATION_CONFIG, ...(partial || {}) }
  const temperature = Number(merged.temperature)
  return {
    ...merged,
    enabled: Boolean(merged.enabled),
    baseUrl: String(merged.baseUrl == null ? '' : merged.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: String(merged.apiKey == null ? '' : merged.apiKey).trim(),
    model: String(merged.model == null ? '' : merged.model).trim(),
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_API_TRANSLATION_CONFIG.temperature,
    batchSize: normalizeBatchSize(merged.batchSize),
    proxyPrefix: String(merged.proxyPrefix == null ? '' : merged.proxyPrefix).trim(),
    systemPrompt: merged.systemPrompt == null ? '' : String(merged.systemPrompt)
  }
}

/**
 * 构造一次 Chat Completions 请求（不做网络调用）
 * @param {object} config
 * @param {string[]} texts
 * @returns {{url: string, init: {method: string, headers: Record<string, string>, body: string}}}
 */
export function buildChatRequest(config, texts) {
  const cfg = normalizeConfig(config)
  const list = (Array.isArray(texts) ? texts : []).map((text) => String(text == null ? '' : text))
  const body = {
    model: cfg.model,
    temperature: cfg.temperature,
    messages: [
      { role: 'system', content: cfg.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(list) }
    ]
  }
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(body)
  }
  return { url: `${cfg.proxyPrefix}${cfg.baseUrl}/chat/completions`, init }
}

function contentToText(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : ''))
      .join('')
  }
  if (typeof content === 'object' && typeof content.text === 'string') return content.text
  return ''
}

// 兼容 OpenAI 风格的 choices[0].message.content，以及少数服务商的 choices[0].text / delta
function extractContent(json) {
  if (json == null) return ''
  if (typeof json === 'string') return json
  if (Array.isArray(json)) return ''
  const choice = Array.isArray(json.choices) ? json.choices[0] : null
  if (choice) {
    const text = choice.message ? contentToText(choice.message.content) : ''
    if (text) return text
    if (typeof choice.text === 'string') return choice.text
    if (choice.delta) {
      const deltaText = contentToText(choice.delta.content)
      if (deltaText) return deltaText
    }
  }
  if (typeof json.output_text === 'string') return json.output_text
  return ''
}

function stripCodeFence(text) {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1] : text
}

// 从文本里抠出第一个 JSON 数组（允许前后有说明文字）
function tryParseArray(text) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const ITEM_TEXT_KEYS = ['translated', 'translation', 'text', 'target', 'zh', 'value']

function itemToText(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item.trim()
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)
  if (Array.isArray(item)) return item.map(itemToText).join('')
  if (typeof item === 'object') {
    for (const key of ITEM_TEXT_KEYS) {
      if (typeof item[key] === 'string') return item[key].trim()
    }
    for (const value of Object.values(item)) {
      if (typeof value === 'string') return value.trim()
    }
  }
  return ''
}

// 兜底：按行切分，顺带剥掉代码块围栏、项目符号、序号、包裹引号与行尾逗号
function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^```/.test(line))
    .map((line) =>
      line
        .replace(/^(?:[-*•]|\d+\s*[.、)])\s*/, '')
        .replace(/^["'“”]/, '')
        .replace(/["'“”],?$/, '')
        .trim()
    )
    .filter(Boolean)
}

/**
 * 解析模型返回的 JSON，取出翻译数组
 * @param {object|string} json 响应体（或直接是 choices[0] 内容字符串）
 * @param {number} [expectedLength] 传入时，长度不足则用空串补齐
 * @returns {string[]}
 */
export function parseChatResponse(json, expectedLength) {
  const text = extractContent(json).trim()
  let items = []
  if (text) {
    const withoutFence = stripCodeFence(text)
    const parsed = tryParseArray(withoutFence) || (withoutFence === text ? null : tryParseArray(text))
    items = parsed ? parsed.map(itemToText) : parseLines(withoutFence)
  }
  const target = Math.floor(Number(expectedLength))
  if (Number.isFinite(target) && target > items.length) {
    return items.concat(new Array(target - items.length).fill(''))
  }
  return items
}

/**
 * 按固定大小切分（用于分批请求）
 * @param {string[]} texts
 * @param {number} size
 * @returns {string[][]}
 */
export function chunkTexts(texts, size) {
  const list = Array.isArray(texts) ? texts.slice() : []
  const batch = Math.floor(Number(size))
  const step = Number.isFinite(batch) && batch > 0 ? batch : Math.max(1, list.length)
  const chunks = []
  for (let i = 0; i < list.length; i += step) chunks.push(list.slice(i, i + step))
  return chunks
}

function bodyDetail(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload.error === 'string') return payload.error
  if (payload.error && typeof payload.error.message === 'string') return payload.error.message
  if (typeof payload.message === 'string') return payload.message
  try {
    return JSON.stringify(payload)
  } catch {
    return ''
  }
}

function httpError(status, payload) {
  return apiError(API_ERROR_CODES.UNKNOWN, `HTTP ${status}`, {
    status: Number(status) || 0,
    body: bodyDetail(payload)
  })
}

// 读取响应体：无论 json() 直接返回还是 text() 需要自己解析，都归一成对象
async function readResponseJson(res) {
  if (!res) throw apiError(API_ERROR_CODES.FORMAT, '响应为空')
  if (typeof res.json === 'function') {
    try {
      return await res.json()
    } catch (error) {
      throw apiError(API_ERROR_CODES.FORMAT, error && error.message ? error.message : '响应不是合法 JSON')
    }
  }
  if (typeof res.text === 'function') {
    const raw = await res.text()
    try {
      return JSON.parse(raw)
    } catch {
      throw apiError(API_ERROR_CODES.FORMAT, '响应不是合法 JSON')
    }
  }
  if ('body' in res) return res.body
  throw apiError(API_ERROR_CODES.FORMAT, '响应不是合法 JSON')
}

// 统一的一次请求：拿到解析后的 payload，并按 HTTP 状态码抛错
async function requestOnce(cfg, texts, fetchImpl) {
  const { url, init } = buildChatRequest(cfg, texts)
  const res = await fetchImpl(url, init)
  let payload = null
  let parseError = null
  try {
    payload = await readResponseJson(res)
  } catch (error) {
    parseError = error
  }
  if (res && res.ok === false) throw httpError(res.status, payload)
  if (parseError) throw parseError
  return payload
}

function requireReadyConfig(cfg) {
  if (!cfg.baseUrl || !cfg.model) {
    const missing = !cfg.baseUrl ? '翻译接口地址（baseUrl）' : '模型名（model）'
    throw apiError(API_ERROR_CODES.CONFIG, `缺少${missing}`)
  }
}

/**
 * 描述错误并给出排查建议（面向界面展示的人话，而不是堆栈）
 * @param {Error|{code?: string, status?: number, message?: string, body?: string}} error
 * @returns {string}
 */
export function describeApiError(error) {
  const status = Number(error && error.status) || 0
  const name = (error && error.name) || ''
  const message = String((error && error.message) || '')
  let code = (error && error.code) || ''

  // 'unknown' 是占位码，交回给状态码/错误类型继续判定
  if (code === API_ERROR_CODES.UNKNOWN || !Object.values(API_ERROR_CODES).includes(code)) code = ''
  if (!code) {
    if (status === 401 || status === 403) code = API_ERROR_CODES.AUTH
    else if (status === 404) code = API_ERROR_CODES.NOT_FOUND
    else if (status === 429) code = API_ERROR_CODES.RATE_LIMIT
    else if (status >= 500) code = API_ERROR_CODES.SERVER
    else if (status >= 400) code = API_ERROR_CODES.BAD_REQUEST
  }
  if (!code && (name === 'AbortError' || name === 'TimeoutError')) code = API_ERROR_CODES.TIMEOUT
  if (!code && error instanceof TypeError) code = API_ERROR_CODES.NETWORK
  if (!code && /abort|timeout|timed out/i.test(`${name} ${message}`)) code = API_ERROR_CODES.TIMEOUT
  if (!code && NETWORK_HINT.test(message)) code = API_ERROR_CODES.NETWORK
  if (!code) code = API_ERROR_CODES.UNKNOWN

  const detail = error && error.body ? `（服务端返回：${String(error.body).slice(0, 200)}）` : ''

  switch (code) {
    case API_ERROR_CODES.CONFIG:
      return `未完成 API 翻译配置：${message || '缺少接口地址或模型名'}。排查建议：到设置里填写接口地址 baseUrl 与模型名 model，并确认已填写该服务商的 apiKey。`
    case API_ERROR_CODES.NETWORK:
      return '网络请求失败：无法访问翻译接口，多为跨域（CORS）被浏览器拦截或网络不通。排查建议：1) 确认 baseUrl 能被浏览器直连；2) 服务商不允许跨域时填写代理前缀 proxyPrefix；3) 检查本机网络、防火墙或代理设置。'
    case API_ERROR_CODES.TIMEOUT:
      return '请求超时或被中止。排查建议：稍后重试；标签较多时把 batchSize 调小；确认接口地址当前可访问。'
    case API_ERROR_CODES.AUTH:
      return `密钥无效或无权限（HTTP ${status || 401}）。排查建议：检查 apiKey 是否填对、有无多余空格或引号；确认账号已开通该模型且余额充足。${detail}`
    case API_ERROR_CODES.NOT_FOUND:
      return `接口地址不存在（HTTP ${status || 404}）。排查建议：baseUrl 只填到版本号（如 https://api.siliconflow.cn/v1），不要带 /chat/completions；确认服务商兼容 OpenAI 接口。${detail}`
    case API_ERROR_CODES.RATE_LIMIT:
      return `请求过于频繁（HTTP ${status || 429}）。排查建议：稍后重试，或把 batchSize 调小、降低请求频率；检查账户配额与并发限制。${detail}`
    case API_ERROR_CODES.SERVER:
      return `翻译服务端错误（HTTP ${status || 500}）。排查建议：稍后重试；持续失败可更换模型或服务商。${detail}`
    case API_ERROR_CODES.BAD_REQUEST:
      return `请求被拒绝（HTTP ${status || 400}）。排查建议：确认 model 名称在服务商处可用、temperature 在允许范围内、单批标签数量不太多。${detail}`
    case API_ERROR_CODES.FORMAT:
      return `响应格式不符合预期：${message || '没能解析出 JSON 数组'}。排查建议：换用指令遵循能力更强的模型，或在 systemPrompt 里强调「只输出 JSON 数组」。`
    case API_ERROR_CODES.EMPTY:
      return `翻译接口返回了空内容${message ? `：${message}` : ''}。排查建议：稍后重试；确认模型可用、未被内容安全策略拦截。`
    default:
      return `翻译失败：${message || '未知错误'}。排查建议：检查网络与 API 配置后重试。`
  }
}

/**
 * 分批（串行）翻译
 * @param {string[]} texts
 * @param {object} config
 * @param {{fetchImpl?: Function, onProgress?: Function}} [options]
 * @returns {Promise<{translations: string[], errors: string[]}>}
 */
export async function translateTexts(texts, config, options = {}) {
  const { fetchImpl = globalThis.fetch, onProgress } = options || {}
  const list = (Array.isArray(texts) ? texts : []).map((text) => String(text == null ? '' : text))
  const cfg = normalizeConfig(config)
  const translations = list.map(() => '')
  const errors = []
  if (!list.length) return { translations, errors }

  try {
    requireReadyConfig(cfg)
    if (typeof fetchImpl !== 'function') throw apiError(API_ERROR_CODES.CONFIG, '当前环境没有可用的 fetch')
  } catch (error) {
    errors.push(describeApiError(error))
    return { translations, errors }
  }

  const batches = chunkTexts(list, cfg.batchSize)
  let done = 0
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    const start = done
    let batchError = null
    try {
      const payload = await requestOnce(cfg, batch, fetchImpl)
      const parsed = parseChatResponse(payload, batch.length)
      if (!parsed.some((item) => String(item).trim())) {
        throw apiError(API_ERROR_CODES.EMPTY, '返回的数组里没有可用译文')
      }
      for (let i = 0; i < batch.length; i += 1) translations[start + i] = parsed[i] == null ? '' : String(parsed[i])
    } catch (error) {
      batchError = describeApiError(error)
      errors.push(`第 ${index + 1}/${batches.length} 批：${batchError}`)
    }
    done += batch.length
    if (typeof onProgress === 'function') {
      onProgress({ done, total: list.length, batchIndex: index, batchCount: batches.length, error: batchError })
    }
  }

  return { translations, errors }
}

/**
 * 连通性自检：发一条最简请求验证地址/密钥/模型是否可用
 * @param {object} config
 * @param {{fetchImpl?: Function}} [options]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testConnection(config, options = {}) {
  const { fetchImpl = globalThis.fetch } = options || {}
  const cfg = normalizeConfig(config)
  try {
    requireReadyConfig(cfg)
    if (typeof fetchImpl !== 'function') throw apiError(API_ERROR_CODES.CONFIG, '当前环境没有可用的 fetch')
    const payload = await requestOnce(cfg, ['cat'], fetchImpl)
    const parsed = parseChatResponse(payload, 1)
    if (!parsed.some((item) => String(item).trim())) {
      throw apiError(API_ERROR_CODES.EMPTY, '返回的数组里没有可用译文')
    }
    const sample = String(parsed[0]).slice(0, 50)
    return { ok: true, message: `连接成功：模型 ${cfg.model} 可用，返回示例「${sample}」` }
  } catch (error) {
    return { ok: false, message: describeApiError(error) }
  }
}
