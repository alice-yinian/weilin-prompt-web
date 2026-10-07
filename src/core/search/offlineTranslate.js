// 离线翻译：与上游 translate/local_translate.py 的贪心最长子短语匹配一致
//  - 按空白切词，从当前位置起尝试最长子短语
//  - 命中 tag_tags.text → 取 desc + color；否则命中 danbooru_tag.tag → 取 translate + color_id
//  - 都没命中则原样保留该单词
//  - 颜色取最后一个命中的非空值（上游行为）

// 从 token 文本里剥掉权重后缀（上游 extractText）
export function extractText(input) {
  const text = String(input || '').trim()
  const matched = text.match(/([^:]+):[\d.]+/)
  return matched ? matched[1].trim() : text
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
  return { tagMap, dictMap }
}

/**
 * @param {string} phrase
 * @param {{tags?: Array, dict?: Array, maps?: {tagMap: Map, dictMap: Map}}} sources
 * @returns {{original: string, translated: string, color: string|null, colorId: number|null}}
 */
export function translatePhrase(phrase, sources = {}) {
  const { tagMap, dictMap } = sources.maps || buildLookup(sources.tags, sources.dict)
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
