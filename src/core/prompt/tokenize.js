import { uuidv7 } from 'uuidv7'
import { convertFullwidth, DEFAULT_CONVERT_OPTIONS } from './convert'
import { isLoraTag } from './loraTag'

export const NEWLINE = '\n'
export const TAB = '\t'

// 与上游一致：按逗号与换行切分、trim、丢弃空段。
// 注意：上游的括号栈逻辑被注释掉了，所以括号内的逗号同样会被切分 —— 这里保持相同行为，
// 以保证输出与 ComfyUI 节点拿到的提示词完全一致。
export function splitSegments(text) {
  const segments = []
  let buffer = ''

  const flush = () => {
    const trimmed = buffer.trim()
    if (trimmed) segments.push(trimmed)
    buffer = ''
  }

  for (const char of String(text ?? '')) {
    if (char === NEWLINE) {
      flush()
      segments.push(NEWLINE)
      continue
    }
    if (char === TAB) {
      flush()
      segments.push(TAB)
      continue
    }
    if (char === ',') {
      flush()
      continue
    }
    buffer += char
  }
  flush()

  return segments
}

function makeToken(text, reused, createId) {
  const isRaw = text === NEWLINE || text === TAB
  return {
    id: reused?.id ?? createId(),
    text,
    isRaw,
    isNewline: text === NEWLINE,
    isHidden: false,
    isLoraTag: isRaw ? false : isLoraTag(text),
    translate: reused?.translate,
    color: reused?.color,
    colorId: reused?.colorId
  }
}

/**
 * 把输入文本解析成 token 列表。
 *
 * @param {string} input 输入文本
 * @param {Array} previous 上一轮的 token（用于复用 id / 翻译结果 / 隐藏状态）
 * @param {{convert?: object, createId?: () => string}} options
 * @returns {Array} tokens
 *
 * 关于隐藏 token 的处理与上游的差异（有意为之，已在 NOTICE 说明）：
 * 上游按纯文本匹配，导致新输入的相同文本会被复用为“隐藏”；这里改为
 * 可见 token 只与旧的可见 token 匹配，旧的隐藏 token 原样保留在隐藏区，
 * 因此隐藏项不会影响你对可见提示词的编辑。
 */
export function tokenize(input, previous = [], options = {}) {
  const { convert = DEFAULT_CONVERT_OPTIONS, createId = () => uuidv7() } = options
  const segments = splitSegments(convertFullwidth(input ?? '', convert))

  const visiblePool = new Map()
  for (const token of previous) {
    if (token.isHidden) continue
    if (!visiblePool.has(token.text)) visiblePool.set(token.text, [])
    visiblePool.get(token.text).push(token)
  }

  const takeReused = (text) => {
    const list = visiblePool.get(text)
    if (!list || list.length === 0) return null
    return list.shift()
  }

  const tokens = segments.map((segment) => makeToken(segment, takeReused(segment), createId))

  const carriedHidden = previous.filter((token) => token.isHidden)
  return tokens.concat(carriedHidden)
}

// 生成一个插入用的 token（点击词库 / 载入历史 / 收集时使用）
export function createToken(text, options = {}) {
  const { createId = () => uuidv7() } = options
  return makeToken(text, null, createId)
}

// 在末尾追加一个纯文本标签（编辑器插入 tag 时使用；序列化会自动补 ", "）
export function appendTagTokens(tokens, text, options = {}) {
  return tokens.concat(createToken(text, options))
}
