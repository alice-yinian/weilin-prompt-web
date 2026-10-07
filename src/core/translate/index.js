// 翻译统一入口：其余代码只依赖本文件
// 多翻译服务可切换（有道 / MyMemory / OpenAI 兼容 / 必应-Azure），支持英↔中双向

import {
  API_ERROR_CODES,
  DEFAULT_API_TRANSLATION_CONFIG,
  apiError,
  chunkTexts,
  describeApiError,
  directionOf as directionOfConfig,
  normalizeConfig,
  runBatches
} from './shared.js'
import { DEFAULT_SYSTEM_PROMPT, buildChatRequest, openaiProvider, parseChatResponse } from './providers/openai.js'
import { youdaoProvider } from './providers/youdao.js'
import { mymemoryProvider } from './providers/mymemory.js'
import { bingProvider } from './providers/bing.js'

// 纯函数与配置（唯一入口，providers/* 为各翻译服务实现）
export { API_ERROR_CODES, DEFAULT_API_TRANSLATION_CONFIG, chunkTexts, describeApiError, normalizeConfig, runBatches }
export { DEFAULT_SYSTEM_PROMPT, buildChatRequest, parseChatResponse }

// 面向设置界面：labelKey 交给 i18n，needs* 决定表单显示哪些字段，batch 表示是否支持一次多条的批量协议
export const PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'youdao',
    labelKey: 'settings.apiProvider.youdao',
    batch: true,
    needsKey: false,
    needsBaseUrl: false,
    needsModel: false
  }),
  Object.freeze({
    id: 'mymemory',
    labelKey: 'settings.apiProvider.mymemory',
    batch: false,
    needsKey: false,
    needsBaseUrl: false,
    needsModel: false
  }),
  Object.freeze({
    id: 'openai',
    labelKey: 'settings.apiProvider.openai',
    batch: true,
    needsKey: true,
    needsBaseUrl: true,
    needsModel: true
  }),
  Object.freeze({
    id: 'bing',
    labelKey: 'settings.apiProvider.bing',
    batch: true,
    needsKey: true,
    needsBaseUrl: false,
    needsModel: false
  })
])

const REGISTRY = {
  youdao: youdaoProvider,
  mymemory: mymemoryProvider,
  openai: openaiProvider,
  bing: bingProvider
}

/**
 * 取服务商实现；未知 id 抛配置错误（界面可据此提示）
 * @param {string|{id?: string, provider?: string}} provider
 */
export function getProvider(provider) {
  const id = typeof provider === 'string' ? provider : (provider && (provider.id || provider.provider)) || ''
  const impl = REGISTRY[id]
  if (!impl) throw apiError(API_ERROR_CODES.CONFIG, `不支持的翻译服务：${id || '(空)'}`)
  return impl
}

/**
 * 归一翻译方向（默认英→中）
 * @param {object} [config]
 * @returns {'en2zh'|'zh2en'}
 */
/**
 * 服务是否已具备发起翻译的条件：免配置服务只管总开关，
 * OpenAI 兼容需 baseUrl+model，必应需 Azure 密钥。
 */
export function isConfigured(config) {
  if (!config || config.enabled === false) return false
  let provider
  try {
    provider = getProvider(config.provider)
  } catch (error) {
    return false
  }
  if (provider.needsBaseUrl && !String(config.baseUrl || '').trim()) return false
  if (provider.needsModel && !String(config.model || '').trim()) return false
  if (provider.needsKey && provider.id === 'bing' && !String(config.bingKey || '').trim()) return false
  if (provider.needsKey && provider.id === 'openai' && !String(config.apiKey || '').trim()) {
    // 本地网关常常不需要密钥，这里只在既没 baseUrl 又没 key 时判为未配置
    return !!String(config.baseUrl || '').trim()
  }
  return true
}

export function directionOf(config) {
  return directionOfConfig(config)
}

/**
 * 方向 → 该服务商的语种取值
 * @param {string} direction 'en2zh' | 'zh2en'
 * @param {string} provider 服务商 id
 * @returns {{from: string, to: string}}
 */
export function langPair(direction, provider) {
  const impl = getProvider(provider)
  return impl.langPair(direction === 'zh2en' ? 'zh2en' : 'en2zh')
}

/**
 * 批量翻译：按 config.provider 分发；translations 与入参等长、顺序一致
 * 单批失败只记入 errors 并继续后续批次
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

  let provider
  try {
    provider = getProvider(cfg.provider)
    provider.validate(cfg)
    if (typeof fetchImpl !== 'function') throw apiError(API_ERROR_CODES.CONFIG, '当前环境没有可用的 fetch')
  } catch (error) {
    errors.push(describeApiError(error))
    return { translations, errors }
  }

  const batches = provider.buildBatches(list, cfg)
  const result = await runBatches(batches, (batch) => provider.requestBatch(batch, cfg, fetchImpl), {
    concurrency: provider.concurrency || 1,
    onProgress,
    total: list.length
  })
  for (let i = 0; i < translations.length; i += 1) translations[i] = result.translations[i]
  return { translations, errors: result.errors }
}

/**
 * 连通性自检：用一条最简文本发一次真实请求
 * @param {object} config
 * @param {{fetchImpl?: Function}} [options]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testConnection(config, options = {}) {
  const { fetchImpl = globalThis.fetch } = options || {}
  const cfg = normalizeConfig(config)
  const sample = directionOf(cfg) === 'zh2en' ? '猫' : 'cat'
  const { translations, errors } = await translateTexts([sample], cfg, { fetchImpl })
  if (errors.length) return { ok: false, message: errors[0] }
  const text = String(translations[0] == null ? '' : translations[0]).trim()
  if (!text) {
    return { ok: false, message: describeApiError(apiError(API_ERROR_CODES.EMPTY, '连接测试返回了空译文')) }
  }
  const label = cfg.provider === 'openai' && cfg.model ? `${cfg.provider} · ${cfg.model}` : cfg.provider
  return { ok: true, message: `连接成功：${label} 可用，返回示例「${text.slice(0, 50)}」` }
}
