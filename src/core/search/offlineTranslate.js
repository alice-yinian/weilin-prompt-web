// 离线翻译：与上游 translate/local_translate.py 的贪心最长子短语匹配一致
//  - 按空白切词，从当前位置起尝试最长子短语
//  - 命中 tag_tags.text → 取 desc + color；否则命中 danbooru_tag.tag → 取 translate + color_id
//  - 都没命中则原样保留该单词
//  - 颜色取最后一个命中的非空值（上游行为）
// 反向（zh2en）复用同一套贪心循环，只是命中 desc/translate 反查表后输出英文 text

// 从 token 文本里剥掉权重后缀（上游 extractText）
export function extractText(input) {
  const text = String(input || '').trim()
  const matched = text.match(/([^:]+):[\d.]+/)
  return matched ? matched[1].trim() : text
}

// 反查表（中文 → 英文）：词典的 translate 字段可能是中文，也可能是带大小写的英文缩写，
// 统一按「去首尾空格 + 小写」建键，查表时做同样的归一化，否则 'R18' / 'r18' 会互相错过
function buildReverse(tags, dict) {
  const reverseByDesc = new Map()
  const put = (rawKey, value) => {
    const key = String(rawKey || '').trim().toLowerCase()
    if (!key || !value.text) return
    if (!reverseByDesc.has(key)) reverseByDesc.set(key, value)
  }
  for (const entry of tags || []) {
    if (!entry || !entry.text || !entry.desc) continue
    put(entry.desc, { text: entry.text, color: entry.color ?? null, colorId: null })
  }
  for (const entry of dict || []) {
    if (!entry || !entry.tag || !entry.translate) continue
    put(entry.translate, { text: entry.tag, color: null, colorId: entry.color_id ?? null })
  }
  return reverseByDesc
}

function buildLookup(tags, dict) {
  const tagMap = new Map()
  for (const entry of tags || []) {
    if (!entry || !entry.text) continue
    if (!tagMap.has(entry.text)) tagMap.set(entry.text, entry)
  }
  const dictMap = new Map()
  for (const entry of dict || []) {
    if (!entry || !entry.tag) continue
    if (!dictMap.has(entry.tag)) dictMap.set(entry.tag, entry)
  }
  return { tagMap, dictMap, reverseByDesc: buildReverse(tags, dict) }
}

// 中文 → 英文：与 en2zh 同构（按空白切词、从当前位置起贪心最长子短语），只是查反查表并输出英文
function translateToEnglish(phrase, reverseByDesc) {
  const words = String(phrase || '').split(/\s+/).filter(Boolean)

  let translated = ''
  let color = null
  let colorId = null
  let i = 0

  while (i < words.length) {
    let matched = false
    for (let j = words.length; j > i; j--) {
      const key = words.slice(i, j).join(' ').toLowerCase()
      const hit = reverseByDesc.get(key)
      if (hit) {
        translated += hit.text + ' '
        if (hit.color != null) color = hit.color
        if (hit.colorId != null) colorId = hit.colorId
        i = j
        matched = true
        break
      }
    }
    if (!matched) {
      translated += words[i] + ' '
      i += 1
    }
  }

  return {
    original: phrase,
    translated: translated.trim(),
    color,
    colorId
  }
}

/**
 * @param {string} phrase
 * @param {{tags?: Array, dict?: Array, direction?: 'en2zh'|'zh2en', maps?: {tagMap: Map, dictMap: Map, reverseByDesc: Map}}} sources
 * @returns {{original: string, translated: string, color: string|null, colorId: number|null}}
 */
export function translatePhrase(phrase, sources = {}) {
  const maps = sources.maps || buildLookup(sources.tags, sources.dict)
  if (sources.direction === 'zh2en') {
    // 手写的 maps 可能没带反查表，此时按传入的 tags/dict 现建
    return translateToEnglish(phrase, maps.reverseByDesc || buildReverse(sources.tags, sources.dict))
  }
  const { tagMap, dictMap } = maps
  const words = String(phrase || '').split(/\s+/).filter(Boolean)

  let translated = ''
  let color = null
  let colorId = null
  let i = 0

  while (i < words.length) {
    let matched = false
    for (let j = words.length; j > i; j--) {
      const subPhrase = words.slice(i, j).join(' ')
      const tagHit = tagMap.get(subPhrase)
      if (tagHit) {
        translated += (tagHit.desc || '') + ' '
        if (tagHit.color != null) color = tagHit.color
        i = j
        matched = true
        break
      }
      const dictHit = dictMap.get(subPhrase)
      if (dictHit) {
        translated += (dictHit.translate || '') + ' '
        if (dictHit.color_id != null) colorId = dictHit.color_id
        i = j
        matched = true
        break
      }
    }
    if (!matched) {
      translated += words[i] + ' '
      i += 1
    }
  }

  return {
    original: phrase,
    translated: translated.trim(),
    color,
    colorId
  }
}

export function createTranslationLookup(sources = {}) {
  return buildLookup(sources.tags, sources.dict)
}
