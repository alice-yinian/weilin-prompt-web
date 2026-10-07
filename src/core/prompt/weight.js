// 权重语法：字面量文本 (tag:1.2)，支持负数；权重为 1 时去掉权重与外层括号
// 与上游 prompt_index.vue 的 applyWeight / findInnerWeight 行为对齐。

const WRAPPED_WEIGHT_RE = /^\(([\s\S]*):(-?\d+(?:\.\d+)?)\)$/
const TAIL_WEIGHT_RE = /:(-?\d+(?:\.\d+)?)$/

export function formatWeight(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '1'
  // 避免 0.1+0.2 之类的浮点尾巴
  return String(Number(num.toFixed(4)))
}

export function getWeight(text) {
  if (!text) return null
  const wrapped = String(text).match(WRAPPED_WEIGHT_RE)
  if (wrapped) return Number(wrapped[2])
  const tail = String(text).match(TAIL_WEIGHT_RE)
  return tail ? Number(tail[1]) : null
}

// 判断是否整体被一层括号包裹（考虑转义与平衡），用于权重 1 时的去括号
function isSingleParenWrapped(text) {
  if (!text.startsWith('(') || !text.endsWith(')')) return false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0 && i !== text.length - 1) return false
    }
  }
  return depth === 0
}

// 去掉权重：能拆出 (base:w) 时返回括号内层文本，否则去掉尾部 :w
export function stripWeight(text) {
  if (!text) return ''
  const str = String(text)
  const wrapped = str.match(WRAPPED_WEIGHT_RE)
  if (wrapped) return wrapped[1]
  const tail = str.match(TAIL_WEIGHT_RE)
  if (tail) return str.slice(0, tail.index)
  if (isSingleParenWrapped(str)) return str.slice(1, -1)
  return str
}

export function applyWeight(text, weight) {
  const num = Number(weight)
  if (!Number.isFinite(num)) return text
  const base = stripWeight(text)
  if (num === 1) return base
  return `(${base}:${formatWeight(num)})`
}

export function parseWeight(text) {
  const weight = getWeight(text)
  return weight === null ? null : { base: stripWeight(text), weight }
}

// 转义形式（如 ask_\(askzy\)）不参与括号增减，避免破坏转义
export function isEscapedParenText(text) {
  return typeof text === 'string' && text.includes('\\(') && text.includes('\\)')
}
