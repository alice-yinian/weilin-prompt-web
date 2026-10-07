// OpenAI 兼容翻译：把标签批量交给兼容 Chat Completions 的服务翻译
// 本模块零 DOM、零 IO（fetch 由调用方注入），便于单测，也便于将来放进 Worker

import {
  API_ERROR_CODES,
  apiError,
  chunkTexts,
  directionOf,
  normalizeConfig,
  requestJson,
  toOffsetBatches
} from '../shared.js'

// 内置提示词：把「只输出 JSON 数组、长度一致」写成硬约束，减少模型加解释文字
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

// 中→英方向的提示词：与上面结构一致，只把目标语言反过来
export const DEFAULT_SYSTEM_PROMPT_ZH2EN = [
  '你是提示词标签翻译助手。',
  '用户会给出一个 JSON 字符串数组，每一项是一条待翻译的中文标签。',
  '把每条标签翻译成英文（Danbooru 风格的小写标签用词），并严格按以下要求输出：',
  '1. 只输出一个 JSON 数组，不要输出解释、前缀、后缀、Markdown 代码块或任何多余文字；',
  '2. 数组长度必须与输入完全一致，顺序一一对应，不得增删、合并或拆分条目；',
  '3. 本身已经是英文的标签原样返回；',
  '4. 无法翻译的专有名词、人名、作品名等按原文返回。',
  '示例：输入 ["1女孩","猫耳"] → 输出 ["1girl","cat ears"]'
].join('\n')

export function systemPromptFor(direction) {
  return direction === 'zh2en' ? DEFAULT_SYSTEM_PROMPT_ZH2EN : DEFAULT_SYSTEM_PROMPT
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
      { role: 'system', content: cfg.systemPrompt || systemPromptFor(directionOf(cfg)) },
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

export const openaiProvider = {
  id: 'openai',
  concurrency: 1,
  retries: 0,
  needsKey: true,
  needsBaseUrl: true,
  needsModel: true,
  validate(cfg) {
    if (!cfg.baseUrl) throw apiError(API_ERROR_CODES.CONFIG, '缺少翻译接口地址（baseUrl）')
    if (!cfg.model) throw apiError(API_ERROR_CODES.CONFIG, '缺少模型名（model）')
  },
  langPair(direction) {
    return direction === 'zh2en' ? { from: 'zh-CN', to: 'en' } : { from: 'en', to: 'zh-CN' }
  },
  buildBatches(texts, cfg) {
    return toOffsetBatches(chunkTexts(texts, cfg.batchSize))
  },
  async requestBatch(batch, cfg, fetchImpl) {
    const { url, init } = buildChatRequest(cfg, batch)
    const payload = await requestJson(fetchImpl, url, init)
    const parsed = parseChatResponse(payload, batch.length)
    if (!parsed.some((item) => String(item).trim())) {
      throw apiError(API_ERROR_CODES.EMPTY, '返回的数组里没有可用译文')
    }
    return parsed
  }
}
