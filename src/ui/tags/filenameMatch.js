/**
 * 批量导入预览图时的文件名匹配规则。
 * 纯函数、零 DOM、零 IO：只吃文件名与 listAllTags() 的结果，便于单测。
 *
 * 匹配顺序：先按 t_uuid 精确匹配，再按标签文本匹配 ——
 * uuid 是随机串，不会被误当成文本；反过来文本标签也可能长得像 uuid，所以 uuid 必须优先。
 */

/** 去掉最后一个扩展名；无扩展名时原样返回（首尾空白先裁掉，文件系统偶尔会带上） */
export function stripExtension(fileName) {
  return String(fileName ?? '')
    .trim()
    .replace(/\.[^./\\]+$/, '')
}

/** 标签文本的匹配键：忽略大小写、首尾空白，空格与下划线互为等价（可混用、可连续出现） */
export function normalizeTagText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/**
 * 由 listAllTags() 的结果建索引：`{byUuid: Set, byText: Map}`。
 * 文本键重名时保留列表中先出现的一条（listAllTags 为 create_time 降序，即最新的一条），
 * 保证同一批文件多次导入落到同一个标签上。
 */
export function buildTagIndex(tags) {
  const byUuid = new Set()
  const byText = new Map()
  for (const tag of tags || []) {
    if (!tag) continue
    if (tag.t_uuid) byUuid.add(String(tag.t_uuid))
    const key = normalizeTagText(tag.text)
    if (key && !byText.has(key)) byText.set(key, tag.t_uuid)
  }
  return { byUuid, byText }
}

/**
 * 文件名 → 标签。返回 `{t_uuid, by: 'uuid'|'text'}`；都未命中返回 null。
 * @param {string} fileName 原始文件名（含扩展名）
 * @param {{byUuid: Set<string>, byText: Map<string, string>}} index buildTagIndex() 的结果
 */
export function matchTagFile(fileName, index) {
  const base = stripExtension(fileName)
  if (!base) return null
  if (index?.byUuid?.has(base)) return { t_uuid: base, by: 'uuid' }
  const t_uuid = index?.byText?.get(normalizeTagText(base))
  return t_uuid ? { t_uuid, by: 'text' } : null
}

/** 只接受图片：有 type 时必须是 image/*，没有 type 时按扩展名兜底判断 */
export function isImageFile(file) {
  const type = String(file?.type ?? '')
  if (type) return type.startsWith('image/')
  return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(String(file?.name ?? ''))
}
