import { uuidv7 } from 'uuidv7'

/** 新建条目的默认颜色（与上游 init 表默认值一致） */
export const DEFAULT_COLOR = 'rgba(255, 123, 2, .4)'

/** 生成 uuidv7：时间有序，与上游 `uuid_extensions.uuid7` 同源，便于按 uuid 排序兜底 */
export function uid() {
  return uuidv7()
}

let lastIssuedTime = 0

/**
 * 生成单调递增的 create_time（毫秒）。
 * 上游用 `int(time.time() * 1000) + random(0..999)` 保证唯一；这里改成严格递增，
 * 这样同一毫秒内连续新建也能得到确定的顺序（分组/二级升序、标签降序都是"新条目更大/更靠前"）。
 */
export function nextCreateTime(existingCreateTimes = []) {
  let max = 0
  for (const value of existingCreateTimes) {
    if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value
  }
  lastIssuedTime = Math.max(lastIssuedTime + 1, Date.now(), max + 1)
  return lastIssuedTime
}

/** 写操作前置校验：避免 uuid 链上出现无名节点 */
export function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`缺少必填字段: ${field}`)
  }
  return value
}

/** 把入参统一成数组（批量删除等接口同时接受单值与数组） */
export function toArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** 依 create_time 排序；同值时保持传入顺序，保证结果稳定 */
export function sortByCreateTime(records, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const diff = (a.record.create_time ?? 0) - (b.record.create_time ?? 0)
      if (diff !== 0) return diff * factor
      return a.index - b.index
    })
    .map((item) => item.record)
}

/**
 * 移动排序：沿用上游语义，把目标项的 create_time 重写成「参照项 ± 1」。
 * 分组/二级升序：before = ref - 1，after = ref + 1；标签降序：before = ref + 1，after = ref - 1。
 * 若撞值（连续移动后很容易出现）会让顺序不确定，此时对同级记录整体做保序重整（步长 1）。
 *
 * @param {Array<object>} records 同级全部记录（必须包含目标项与参照项）
 * @param {string} keyField 该级的 uuid 字段名（p_uuid / g_uuid / t_uuid）
 * @param {string} targetId 被移动项
 * @param {string} referenceId 参照项
 * @param {'before'|'after'} position 目标项落在参照项之前还是之后
 * @param {'asc'|'desc'} direction 该级的展示排序方向
 * @returns {Array<object>|null} 需要写回的记录（含新 create_time）；null 表示入参非法，未做任何修改
 */
export function computeMove(records, keyField, targetId, referenceId, position, direction) {
  if (position !== 'before' && position !== 'after') return null
  if (targetId === referenceId) return null
  const ordered = sortByCreateTime(records, direction)
  const target = ordered.find((record) => record[keyField] === targetId)
  if (!target) return null
  const without = ordered.filter((record) => record[keyField] !== targetId)
  const refIndex = without.findIndex((record) => record[keyField] === referenceId)
  if (refIndex < 0) return null

  const asc = direction !== 'desc'
  const delta = (asc ? -1 : 1) * (position === 'before' ? 1 : -1)
  const moved = { ...target, create_time: (without[refIndex].create_time ?? 0) + delta }
  const insertAt = position === 'before' ? refIndex : refIndex + 1

  const next = []
  for (let i = 0; i < without.length; i += 1) {
    if (i === insertAt) next.push(moved)
    next.push({ ...without[i] })
  }
  if (insertAt >= without.length) next.push(moved)

  const collide = next.some(
    (record) => record !== moved && record.create_time === moved.create_time
  )
  if (collide) {
    const times = next.map((record) => record.create_time ?? 0)
    const base = asc ? Math.min(...times) : Math.max(...times)
    next.forEach((record, index) => {
      record.create_time = asc ? base + index : base - index
    })
  }

  const previous = new Map(records.map((record) => [record[keyField], record.create_time]))
  return next.filter((record) => previous.get(record[keyField]) !== record.create_time)
}
