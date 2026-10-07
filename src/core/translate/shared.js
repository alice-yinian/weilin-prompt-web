// 翻译模块共享层：配置归一、错误分类、HTTP 细节与批次调度
// 零 DOM、零 IO（fetch 由调用方注入），便于单测与 Worker 复用

// 默认配置：默认关闭；provider 决定走哪家服务，direction 决定翻译方向
export const DEFAULT_API_TRANSLATION_CONFIG = Object.freeze({
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

// 供 describeApiError 与调用方判断错误类型
export const API_ERROR_CODES = Object.freeze({
  CONFIG: 'config',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  NOT_FOUND: 'notFound',
  RATE_LIMIT: 'rateLimit',
  QUOTA: 'quota',
  BAD_REQUEST: 'badRequest',
  SERVER: 'server',
  FORMAT: 'format',
  EMPTY: 'empty',
  UNKNOWN: 'unknown'
})

// 浏览器 fetch 失败与 Node 侧的典型网络错误文案，用于把 TypeError 归类成「网络/CORS」
const NETWORK_HINT = /failed to fetch|networkerror|load failed|fetch failed|network request failed|econnrefused|econnreset|enotfound|etimedout|eai_again|socket hang up|proxy/i

export function apiError(code, message, extra = {}) {
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
  const provider = String(merged.provider == null ? '' : merged.provider).trim()
  return {
    ...merged,
    enabled: Boolean(merged.enabled),
    provider: provider || DEFAULT_API_TRANSLATION_CONFIG.provider,
    direction: merged.direction === 'zh2en' ? 'zh2en' : 'en2zh',
    baseUrl: String(merged.baseUrl == null ? '' : merged.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: String(merged.apiKey == null ? '' : merged.apiKey).trim(),
    model: String(merged.model == null ? '' : merged.model).trim(),
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_API_TRANSLATION_CONFIG.temperature,
    batchSize: normalizeBatchSize(merged.batchSize),
    proxyPrefix: String(merged.proxyPrefix == null ? '' : merged.proxyPrefix).trim(),
    systemPrompt: merged.systemPrompt == null ? '' : String(merged.systemPrompt),
    bingKey: String(merged.bingKey == null ? '' : merged.bingKey).trim(),
    bingRegion: String(merged.bingRegion == null ? '' : merged.bingRegion).trim() || DEFAULT_API_TRANSLATION_CONFIG.bingRegion
  }
}

/**
 * 翻译方向：只有显式 zh2en 才反向，其余一律「英→中」
 * @param {object} [config]
 * @returns {'en2zh'|'zh2en'}
 */
export function directionOf(config) {
  return config && config.direction === 'zh2en' ? 'zh2en' : 'en2zh'
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

/**
 * 把二维文本批次转成带起始下标的批次，供 runBatches 回填
 * @param {string[][]} chunks
 * @returns {{start: number, texts: string[]}[]}
 */
export function toOffsetBatches(chunks) {
  let start = 0
  return (Array.isArray(chunks) ? chunks : []).map((texts) => {
    const batch = { start, texts }
    start += texts.length
    return batch
  })
}

export function bodyDetail(payload) {
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

export function httpError(status, payload) {
  return apiError(API_ERROR_CODES.UNKNOWN, `HTTP ${status}`, {
    status: Number(status) || 0,
    body: bodyDetail(payload)
  })
}

// 读取响应体：无论 json() 直接返回还是 text() 需要自己解析，都归一成对象
export async function readResponseJson(res) {
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
export async function requestJson(fetchImpl, url, init) {
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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带退避重试的请求：只对限流与网络错误重试（服务端 5xx、参数错误重试无意义）
 */
export async function requestJsonWithRetry(fetchImpl, url, init, { retries = 0, retryDelay = 300 } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await requestJson(fetchImpl, url, init)
    } catch (error) {
      const code = errorCodeOf(error)
      const retriable = code === API_ERROR_CODES.RATE_LIMIT || code === API_ERROR_CODES.NETWORK
      if (attempt >= retries || !retriable) throw error
      await sleep(retryDelay * 2 ** attempt)
      attempt += 1
    }
  }
}

// 把任意错误归类成 API_ERROR_CODES 之一，供 describeApiError 与重试判断复用
export function errorCodeOf(error) {
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
  if (!code && /quota|usage limit|额度|配额/i.test(message)) code = API_ERROR_CODES.QUOTA
  if (!code) code = API_ERROR_CODES.UNKNOWN
  return code
}

/**
 * 描述错误并给出排查建议（面向界面展示的人话，而不是堆栈）
 * @param {Error|{code?: string, status?: number, message?: string, body?: string}} error
 * @returns {string}
 */
export function describeApiError(error) {
  const status = Number(error && error.status) || 0
  const message = String((error && error.message) || '')
  const code = errorCodeOf(error)
  const detail = error && error.body ? `（服务端返回：${String(error.body).slice(0, 200)}）` : ''

  switch (code) {
    case API_ERROR_CODES.CONFIG:
      return `未完成 API 翻译配置：${message || '缺少接口地址、模型名或密钥'}。排查建议：到设置里补齐该服务商要求的信息，并确认已填写对应的密钥。`
    case API_ERROR_CODES.NETWORK:
      return '网络请求失败：无法访问翻译接口，多为跨域（CORS）被浏览器拦截或网络不通。排查建议：1) 确认接口地址能被浏览器直连；2) 服务商不允许跨域时填写代理前缀 proxyPrefix；3) 检查本机网络、防火墙或代理设置。'
    case API_ERROR_CODES.TIMEOUT:
      return '请求超时或被中止。排查建议：稍后重试；标签较多时把 batchSize 调小；确认接口地址当前可访问。'
    case API_ERROR_CODES.AUTH:
      return `密钥无效或无权限（HTTP ${status || 401}）。排查建议：检查密钥是否填对、有无多余空格或引号；确认账号已开通该服务且余额充足。${detail}`
    case API_ERROR_CODES.NOT_FOUND:
      return `接口地址不存在（HTTP ${status || 404}）。排查建议：baseUrl 只填到版本号（如 https://api.siliconflow.cn/v1），不要带 /chat/completions；确认服务商兼容 OpenAI 接口。${detail}`
    case API_ERROR_CODES.RATE_LIMIT:
      return `请求过于频繁（HTTP ${status || 429}）。排查建议：稍后重试，或把 batchSize 调小、降低请求频率；检查账户配额与并发限制。${detail}`
    case API_ERROR_CODES.QUOTA:
      return `接口配额已用尽：${message || '匿名或账户额度不足'}。排查建议：稍后重试，或到服务商处查看额度并充值/换用其他翻译服务。${detail}`
    case API_ERROR_CODES.SERVER:
      return `翻译服务端错误（HTTP ${status || 500}）。排查建议：稍后重试；持续失败可更换服务商。${detail}`
    case API_ERROR_CODES.BAD_REQUEST:
      return `请求被拒绝（HTTP ${status || 400}）。排查建议：确认 model 名称在服务商处可用、temperature 在允许范围内、单批标签数量不太多。${detail}`
    case API_ERROR_CODES.FORMAT:
      return `响应格式不符合预期：${message || '没能解析出译文'}。排查建议：确认所选服务商接口可用；OpenAI 兼容接口可换用指令遵循能力更强的模型，或在 systemPrompt 里强调「只输出 JSON 数组」。`
    case API_ERROR_CODES.EMPTY:
      return `翻译接口返回了空内容${message ? `：${message}` : ''}。排查建议：稍后重试；确认模型/服务可用、未被内容安全策略拦截。`
    default:
      return `翻译失败：${message || '未知错误'}。排查建议：检查网络与 API 配置后重试。`
  }
}

/**
 * 批次调度：按给定并发跑批次，逐批回填译文；单批失败只记账不中断
 * @param {{start: number, texts: string[]}[]} batches
 * @param {(texts: string[], index: number) => Promise<string[]>} requestBatch
 * @param {{concurrency?: number, total?: number, onProgress?: Function}} [options]
 * @returns {Promise<{translations: string[], errors: string[]}>}
 */
export async function runBatches(batches, requestBatch, options = {}) {
  const { concurrency = 1, onProgress } = options || {}
  const size = options.total == null ? batches.reduce((n, batch) => n + batch.texts.length, 0) : options.total
  const translations = new Array(size).fill('')
  const errorEntries = []
  let done = 0
  let next = 0

  async function worker() {
    for (;;) {
      const index = next
      next += 1
      if (index >= batches.length) return
      const batch = batches[index]
      let batchError = null
      try {
        const out = await requestBatch(batch.texts, index)
        for (let i = 0; i < batch.texts.length; i += 1) {
          translations[batch.start + i] = out[i] == null ? '' : String(out[i])
        }
      } catch (error) {
        batchError = describeApiError(error)
        errorEntries.push({ index, message: `第 ${index + 1}/${batches.length} 批：${batchError}` })
      }
      done += batch.texts.length
      if (typeof onProgress === 'function') {
        onProgress({ done, total: size, batchIndex: index, batchCount: batches.length, error: batchError })
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency || 1, batches.length || 1))
  await Promise.all(Array.from({ length: workerCount }, worker))
  errorEntries.sort((a, b) => a.index - b.index)
  return { translations, errors: errorEntries.map((entry) => entry.message) }
}
