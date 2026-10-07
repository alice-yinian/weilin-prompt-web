// 颜色工具：词库里的颜色一律存 rgba 字符串（与上游一致），
// 而原生 <input type="color"> 只认 #rrggbb，这里做互转。

const DEFAULT_HEX = '#ff7b02'

// 解析 rgba/rgb 字符串；解析不了返回 null（导入进来的颜色可能是任意 CSS 值）
function parseRgba(color) {
  const matched = String(color ?? '').match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/
  )
  if (!matched) return null
  const alpha = matched[4] === undefined ? 1 : Number(matched[4])
  return {
    r: Math.min(255, Number(matched[1])),
    g: Math.min(255, Number(matched[2])),
    b: Math.min(255, Number(matched[3])),
    a: Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1
  }
}

/** rgba 字符串 → #rrggbb（取色器用）；解析失败退回默认橙色 */
export function toHex(color) {
  const rgba = parseRgba(color)
  if (!rgba) return DEFAULT_HEX
  return `#${[rgba.r, rgba.g, rgba.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** 取透明度；解析失败用 fallback（词库默认色是 .4） */
export function alphaOf(color, fallback = 0.4) {
  const rgba = parseRgba(color)
  return rgba ? rgba.a : fallback
}

/** #rrggbb + 透明度 → rgba 字符串 */
export function toRgba(hex, alpha = 0.4) {
  const raw = String(hex ?? '').replace(/^#/, '')
  const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
  const value = /^[0-9a-f]{6}$/i.test(full) ? parseInt(full, 16) : null
  if (value === null) return `rgba(255, 123, 2, ${alpha})`
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  const a = Math.round(Math.min(1, Math.max(0, Number(alpha) || 0)) * 100) / 100
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
