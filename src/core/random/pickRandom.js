// 一键随机的轻量实现：纯函数，随机源可注入以便测试

// 从 pool 中无放回地随机抽取 count 个元素。
// count 超过 pool 长度时返回 pool 的全部元素（保持原顺序）；count <= 0 返回空数组。
export function pickRandomTags(pool, count, rng = Math.random) {
  const items = Array.isArray(pool) ? pool.slice() : []
  const n = Math.floor(count)
  if (!Number.isFinite(n) || n <= 0) return []
  if (n >= items.length) return items
  const picked = []
  // 部分 Fisher-Yates：只洗前 n 个位置，保证不重复
  for (let i = 0; i < n; i++) {
    const j = Math.min(items.length - 1, i + Math.floor(rng() * (items.length - i)))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
    picked.push(items[i])
  }
  return picked
}

// 输出规则与上游一致：',' 连接 + 结尾补一个逗号
export function formatRandomTags(tags) {
  const list = Array.isArray(tags) ? tags : []
  if (list.length === 0) return ''
  return `${list.join(',')},`
}
