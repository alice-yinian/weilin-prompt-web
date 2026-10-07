// 括号分层：支持 () [] {} <> 四种括号的加层与减层
export const BRACKET_TYPES = ['()', '[]', '{}', '<>']

const PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>'
}

export function normalizeBracketType(type) {
  if (BRACKET_TYPES.includes(type)) return type
  return null
}

export function isWrappedBy(text, type) {
  const normalized = normalizeBracketType(type)
  if (!normalized || !text) return false
  const [open, close] = normalized
  return String(text).startsWith(open) && String(text).endsWith(close)
}

export function addBracket(text, type) {
  const normalized = normalizeBracketType(type)
  if (!normalized) return text
  if (isWrappedBy(text, normalized)) return text
  const [open, close] = normalized
  return `${open}${text}${close}`
}

export function removeBracket(text, type) {
  const normalized = normalizeBracketType(type)
  if (!normalized || !text) return text
  if (!isWrappedBy(text, normalized)) return text
  return String(text).slice(1, -1)
}

export function toggleBracket(text, type) {
  return isWrappedBy(text, type) ? removeBracket(text, type) : addBracket(text, type)
}

// 返回从外到内的括号层（用于 UI 显示当前层状态）
export function listLayers(text) {
  const layers = []
  let current = String(text || '')
  let guard = 0
  while (guard++ < 16) {
    const pair = Object.keys(PAIRS).find(
      (open) => current.startsWith(open) && current.endsWith(PAIRS[open])
    )
    if (!pair) break
    layers.push(`${pair}${PAIRS[pair]}`)
    current = current.slice(1, -1)
  }
  return layers
}
