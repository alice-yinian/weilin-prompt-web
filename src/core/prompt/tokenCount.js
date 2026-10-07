// Token 计数：上游是按空白切分的展示口径（非真实 CLIP tokenizer），这里保持同一口径
export function countTokens(text) {
  if (!text) return 0
  const trimmed = String(text).trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
