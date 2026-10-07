// tokens -> 提示词字符串（canonical 序列化）
// 规则（与上游 updateInputText 一致）：
//  - 隐藏 token 不输出；换行/制表符原样输出
//  - 非首个文本 token 以 ", " 连接
//  - 每行末尾都补一个逗号（包括最后一行）
export function serialize(tokens) {
  const visible = (tokens || []).filter((token) => !token.isHidden)
  let out = ''
  let atLineStart = true

  for (let i = 0; i < visible.length; i++) {
    const token = visible[i]
    if (token.isRaw) {
      out += token.text
      // 换行/制表符之后视为新的一段，下一段不再补 ", " 前缀
      atLineStart = true
      continue
    }
    const next = visible[i + 1]
    const endOfLine = !next || next.isRaw
    out += (atLineStart ? '' : ', ') + token.text + (endOfLine ? ',' : '')
    atLineStart = false
  }

  return out
}
