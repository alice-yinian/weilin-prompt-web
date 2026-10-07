// 有道翻译（aidemo 免配置接口）：把一批标签用换行拼成一段文本，一次请求翻完
// 实测：application/x-www-form-urlencoded，字段 q/from/to，返回 {translation:["译文"]}，多行一次请求即可

import {
  API_ERROR_CODES,
  apiError,
  directionOf,
  normalizeConfig,
  requestJson,
  toOffsetBatches
} from '../shared.js'

export const YOUDAO_ENDPOINT = 'https://aidemo.youdao.com/trans'
// 单请求文本长度上限，留出余量避免被截断
export const YOUDAO_MAX_CHARS = 4000

export function langPair(direction) {
  return direction === 'zh2en' ? { from: 'zh-CHS', to: 'en' } : { from: 'en', to: 'zh-CHS' }
}

// 标签内部若含换行会破坏「一行对一条」的对齐，先折叠成空格
function flatten(text) {
  return String(text == null ? '' : text).replace(/\r?\n/g, ' ')
}

/**
 * 按字符数拆批：批次内再用 \n 拼接，返回与入参等长的条目序列（顺序一致）
 * @param {string[]} texts
 * @param {number} [maxChars]
 * @returns {string[][]}
 */
export function buildYoudaoBatches(texts, maxChars = YOUDAO_MAX_CHARS) {
  const limit = Math.floor(Number(maxChars))
  const max = Number.isFinite(limit) && limit > 0 ? limit : YOUDAO_MAX_CHARS
  const list = Array.isArray(texts) ? texts : []
  const batches = []
  let current = []
  let length = 0
  for (const raw of list) {
    const text = flatten(raw)
    if (current.length && length + 1 + text.length > max) {
      batches.push(current)
      current = []
      length = 0
    }
    length += (current.length ? 1 : 0) + text.length
    current.push(text)
  }
  if (current.length) batches.push(current)
  return batches
}

/**
 * 构造一次有道请求
 * @param {object} config
 * @param {string[]} texts 同一批的标签（会被 \n 连接）
 */
export function buildRequest(config, texts) {
  const cfg = normalizeConfig(config)
  const { from, to } = langPair(directionOf(cfg))
  const q = (Array.isArray(texts) ? texts : []).map(flatten).join('\n')
  const body = new URLSearchParams({ q, from, to })
  return {
    url: `${cfg.proxyPrefix}${YOUDAO_ENDPOINT}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }
  }
}

/**
 * 解析有道响应，按行对回原文
 * @param {{translation?: string[]}} payload
 * @param {number} expectedLength
 * @returns {string[]}
 */
export function parseResponse(payload, expectedLength) {
  if (payload && payload.errorCode != null && String(payload.errorCode) !== '0') {
    throw apiError(API_ERROR_CODES.UNKNOWN, `有道返回错误码 ${payload.errorCode}`)
  }
  const parts = payload && Array.isArray(payload.translation) ? payload.translation : null
  if (!parts || !parts.length) throw apiError(API_ERROR_CODES.FORMAT, '有道返回里没有 translation')
  const lines = parts.map((part) => String(part == null ? '' : part)).join('\n').split('\n')
  const count = Math.floor(Number(expectedLength))
  const total = Number.isFinite(count) && count > 0 ? count : lines.length
  const out = new Array(total)
  for (let i = 0; i < total; i += 1) out[i] = lines[i] == null ? '' : lines[i].trim()
  return out
}

export const youdaoProvider = {
  id: 'youdao',
  concurrency: 1,
  retries: 0,
  needsKey: false,
  needsBaseUrl: false,
  needsModel: false,
  validate() {},
  langPair,
  buildBatches(texts) {
    return toOffsetBatches(buildYoudaoBatches(texts))
  },
  async requestBatch(batch, cfg, fetchImpl) {
    const { url, init } = buildRequest(cfg, batch)
    const payload = await requestJson(fetchImpl, url, init)
    return parseResponse(payload, batch.length)
  }
}
