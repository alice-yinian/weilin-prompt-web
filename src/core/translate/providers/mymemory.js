// MyMemory 翻译（免配置公共接口）：单条文本一次请求，匿名有配额
// 实测：GET ?q=<text>&langpair=en|zh-CN，返回 {responseData:{translatedText}}；中文侧固定 zh-CN

import {
  API_ERROR_CODES,
  apiError,
  directionOf,
  normalizeConfig,
  requestJsonWithRetry
} from '../shared.js'

export const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'
// 匿名接口并发限制较严，控制在 3 以内
export const MYMEMORY_CONCURRENCY = 3

export function langPair(direction) {
  return direction === 'zh2en' ? { from: 'zh-CN', to: 'en' } : { from: 'en', to: 'zh-CN' }
}

/**
 * 构造一次 MyMemory 请求（单条文本）
 * @param {object} config
 * @param {string} text
 */
export function buildRequest(config, text) {
  const cfg = normalizeConfig(config)
  const { from, to } = langPair(directionOf(cfg))
  const query = `q=${encodeURIComponent(String(text == null ? '' : text))}&langpair=${encodeURIComponent(`${from}|${to}`)}`
  return {
    url: `${cfg.proxyPrefix}${MYMEMORY_ENDPOINT}?${query}`,
    init: { method: 'GET' }
  }
}

/**
 * 解析 MyMemory 响应，返回单条译文
 * @param {object} payload
 * @returns {string}
 */
export function parseResponse(payload) {
  if (!payload || typeof payload !== 'object') throw apiError(API_ERROR_CODES.FORMAT, 'MyMemory 响应格式不符')
  const status = Number(payload.responseStatus)
  const detail = String(payload.responseDetails == null ? '' : payload.responseDetails)
  if (Number.isFinite(status) && status >= 400) {
    if (status === 429 || /MYMEMORY WARNING|QUOTA|LIMIT/i.test(detail)) {
      throw apiError(API_ERROR_CODES.QUOTA, detail || `MyMemory 限流（HTTP ${status}）`)
    }
    throw apiError(API_ERROR_CODES.UNKNOWN, detail || `HTTP ${status}`)
  }
  const text = payload.responseData && payload.responseData.translatedText
  if (typeof text !== 'string' || !text.trim()) throw apiError(API_ERROR_CODES.EMPTY, 'MyMemory 返回了空译文')
  if (/MYMEMORY WARNING/i.test(text)) throw apiError(API_ERROR_CODES.QUOTA, text.trim())
  return text.trim()
}

export const mymemoryProvider = {
  id: 'mymemory',
  concurrency: MYMEMORY_CONCURRENCY,
  retries: 2,
  needsKey: false,
  needsBaseUrl: false,
  needsModel: false,
  validate() {},
  langPair,
  // 逐条：每条文本单独一批，失败可精确记到该条
  buildBatches(texts) {
    return (Array.isArray(texts) ? texts : []).map((text, index) => ({ start: index, texts: [text] }))
  },
  async requestBatch(batch, cfg, fetchImpl) {
    const { url, init } = buildRequest(cfg, batch[0])
    const payload = await requestJsonWithRetry(fetchImpl, url, init, { retries: mymemoryProvider.retries })
    return [parseResponse(payload)]
  }
}
