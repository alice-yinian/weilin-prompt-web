// 自动补全打分：与上游 fast_autocomplete/autocomplete.py 的 CASE 打分表一致
//   text 完全 100 / 前缀 90 / 包含 80 ; desc 完全 70 / 前缀 60 / 包含 50
export const SCORE_TEXT_EXACT = 100
export const SCORE_TEXT_PREFIX = 90
export const SCORE_TEXT_CONTAINS = 80
export const SCORE_DESC_EXACT = 70
export const SCORE_DESC_PREFIX = 60
export const SCORE_DESC_CONTAINS = 50

export const DEFAULT_AUTOCOMPLETE_LIMIT = 25
export const MAX_AUTOCOMPLETE_QUERY_LENGTH = 20

export function scoreEntry(query, text, desc) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return 0
  const t = String(text || '').toLowerCase()
  const d = String(desc || '').toLowerCase()

  if (t === q) return SCORE_TEXT_EXACT
  if (t.startsWith(q)) return SCORE_TEXT_PREFIX
  if (t.includes(q)) return SCORE_TEXT_CONTAINS
  if (d === q) return SCORE_DESC_EXACT
  if (d.startsWith(q)) return SCORE_DESC_PREFIX
  if (d.includes(q)) return SCORE_DESC_CONTAINS
  return 0
}

// 把编辑器里当前正在输入的片段清洗成查询词（上游会剥离 []{} 并转小写）
export function normalizeQuery(raw) {
  return String(raw || '')
    .replace(/[[\]{}()<>]/g, ' ')
    .trim()
    .slice(0, MAX_AUTOCOMPLETE_QUERY_LENGTH)
}

/**
 * 在词库与词典里查找匹配项。
 *
 * @param {string} query
 * @param {{tags?: Array, dict?: Array}} sources
 *   tags: [{text, desc, color}]  dict: [{tag, translate, color_id}]
 * @param {number} limit
 * @returns {Array<{text, desc, color, colorId, source, score}>}
 */
export function searchEntries(query, sources = {}, limit = DEFAULT_AUTOCOMPLETE_LIMIT) {
  const q = normalizeQuery(query)
  if (!q) return []

  const scored = []

  for (const entry of sources.tags || []) {
    const score = scoreEntry(q, entry.text, entry.desc)
    if (score > 0) {
      scored.push({
        text: entry.text,
        desc: entry.desc || '',
        color: entry.color || null,
        colorId: -1,
        source: 'tags',
        score
      })
    }
  }

  let remaining = limit - Math.min(scored.length, limit)
  if (remaining > 0) {
    const seen = new Set(scored.map((entry) => entry.text))
    const dictScored = []
    for (const entry of sources.dict || []) {
      if (seen.has(entry.tag)) continue
      const score = scoreEntry(q, entry.tag, entry.translate)
      if (score > 0) {
        dictScored.push({
          text: entry.tag,
          desc: entry.translate || '',
          color: null,
          colorId: entry.color_id ?? null,
          source: 'dict',
          score
        })
      }
    }
    dictScored.sort((a, b) => b.score - a.score)
    scored.push(...dictScored.slice(0, remaining))
  }

  // 稳定排序：同分时保持 tags 在前、词典在后
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
