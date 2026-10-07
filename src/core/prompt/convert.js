// 输入自动转换：把中文全角标点换成 ASCII（与上游 prompt_index.vue 的 handleInput 行为一致）
export const DEFAULT_CONVERT_OPTIONS = {
  comma: true,
  period: true,
  brackets: true,
  parens: true,
  angle: true
}

const RULES = [
  ['comma', '，', ','],
  ['period', '。', '.'],
  ['brackets', '【', '['],
  ['brackets', '】', ']'],
  ['parens', '（', '('],
  ['parens', '）', ')'],
  ['angle', '《', '<'],
  ['angle', '》', '>']
]

export function convertFullwidth(text, options = DEFAULT_CONVERT_OPTIONS) {
  if (!text) return ''
  let out = text
  for (const [key, from, to] of RULES) {
    if (options[key]) out = out.split(from).join(to)
  }
  return out
}
