// 必应翻译：旧的 edge.microsoft.com/translate/auth token 接口已 404 失效
// 改用 Azure 认知服务翻译端点，必须由用户自备 Azure 密钥（Ocp-Apim-Subscription-Key + Region）
// 实测：POST ?api-version=3.0&from=&to=，body [{Text}] → [{translations:[{text}]}]，CORS 放行

import {
  API_ERROR_CODES,
  apiError,
  chunkTexts,
  directionOf,
  normalizeConfig,
  requestJson,
  toOffsetBatches
} from '../shared.js'

export const BING_ENDPOINT = 'https://api-edge.cognitive.microsofttranslator.com/translate'
// Azure 翻译单次请求的条数上限
export const BING_MAX_BATCH = 50

export function langPair(direction) {
  return direction === 'zh2en' ? { from: 'zh-Hans', to: 'en' } : { from: 'en', to: 'zh-Hans' }
}

/**
 * 构造一次 Azure 翻译请求
 * @param {object} config
 * @param {string[]} texts
 */
export function buildRequest(config, texts) {
  const cfg = normalizeConfig(config)
  const { from, to } = langPair(directionOf(cfg))
  const list = (Array.isArray(texts) ? texts : []).map((text) => ({ Text: String(text == null ? '' : text) }))
  return {
    url: `${cfg.proxyPrefix}${BING_ENDPOINT}?api-version=3.0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': cfg.bingKey,
        'Ocp-Apim-Subscription-Region': cfg.bingRegion
      },
      body: JSON.stringify(list)
    }
  }
}

/**
 * 解析 Azure 翻译响应，按顺序取回译文
 * @param {Array} payload
 * @param {number} expectedLength
 * @returns {string[]}
 */
export function parseResponse(payload, expectedLength) {
  if (!Array.isArray(payload)) throw apiError(API_ERROR_CODES.FORMAT, '必应返回格式不符')
  const items = payload.map((item) => {
    const first = item && Array.isArray(item.translations) ? item.translations[0] : null
    return first && typeof first.text === 'string' ? first.text : ''
  })
  const count = Math.floor(Number(expectedLength))
  if (Number.isFinite(count) && count > items.length) {
    return items.concat(new Array(count - items.length).fill(''))
  }
  return items
}

export const bingProvider = {
  id: 'bing',
  concurrency: 1,
  retries: 0,
  needsKey: true,
  needsBaseUrl: false,
  needsModel: false,
  validate(cfg) {
    if (!cfg.bingKey) {
      throw apiError(
        API_ERROR_CODES.CONFIG,
        '必应翻译需要 Azure 密钥：旧的 token 接口已失效，请填写 Azure 密钥（bingKey）与区域'
      )
    }
  },
  langPair,
  buildBatches(texts, cfg) {
    const size = Math.min(cfg.batchSize > 0 ? cfg.batchSize : BING_MAX_BATCH, BING_MAX_BATCH)
    return toOffsetBatches(chunkTexts(texts, size))
  },
  async requestBatch(batch, cfg, fetchImpl) {
    const { url, init } = buildRequest(cfg, batch)
    const payload = await requestJson(fetchImpl, url, init)
    return parseResponse(payload, batch.length)
  }
}
