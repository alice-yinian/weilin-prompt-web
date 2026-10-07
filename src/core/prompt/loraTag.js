// LoRA 标签语法：<wlr:名称:模型权重:文本权重:触发词权重>
// 上游前端只生成/识别 3 字段，后端（__init__.py）识别 4 字段；本项目统一为
// “生成 4 字段、解析兼容 3/4 字段”，并在 NOTICE 中记录了该差异。

const LORA_TAG_RE = /^<wlr:([^:>]+):([^:>]+):([^:>]+)(?::([^>]+))?>$/
const LORA_TAG_GLOBAL_RE = /<wlr:[^>]*>/g

export const DEFAULT_LORA_WEIGHT = 1
export const LORA_NAME_PLACEHOLDER = 'lora_name'

export function normalizeLoraName(name) {
  return String(name || '')
    .trim()
    .replace(/\.safetensors$/i, '')
}

function normalizeWeight(value, fallback = DEFAULT_LORA_WEIGHT) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function buildLoraTag({ name, modelWeight, textWeight, triggerWeight } = {}) {
  const loraName = normalizeLoraName(name) || LORA_NAME_PLACEHOLDER
  const mw = normalizeWeight(modelWeight)
  const tw = normalizeWeight(textWeight)
  const gw = normalizeWeight(triggerWeight)
  return `<wlr:${loraName}:${mw}:${tw}:${gw}>`
}

export function isLoraTag(text) {
  return typeof text === 'string' && LORA_TAG_RE.test(text.trim())
}

export function parseLoraTag(text) {
  if (typeof text !== 'string') return null
  const matched = text.trim().match(LORA_TAG_RE)
  if (!matched) return null
  const [, name, modelWeight, textWeight, triggerWeight] = matched
  return {
    name: normalizeLoraName(name),
    modelWeight: normalizeWeight(modelWeight),
    textWeight: normalizeWeight(textWeight),
    // 旧 3 字段格式没有触发词权重，按上游后端做法沿用文本权重
    triggerWeight: triggerWeight === undefined ? normalizeWeight(textWeight) : normalizeWeight(triggerWeight),
    legacy: triggerWeight === undefined
  }
}

export function updateLoraTag(text, patch = {}) {
  const parsed = parseLoraTag(text)
  if (!parsed) return text
  return buildLoraTag({ ...parsed, ...patch })
}

// 与上游 __init__.py:392-399 一致：移除 LoRA 标签后收敛逗号
export function stripLoraTags(text) {
  if (!text) return ''
  return String(text)
    .replace(LORA_TAG_GLOBAL_RE, '')
    .replace(/,(\s*,)+/g, ',')
    .trim()
    .replace(/^,+\s*/, '')
    .replace(/\s*,+$/, '')
    .trim()
}
