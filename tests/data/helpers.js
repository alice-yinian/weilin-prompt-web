import 'fake-indexeddb/auto'
import { closeDB, deleteDatabase } from '../../src/data/db.js'
import { invalidateTagIndex } from '../../src/data/memoryIndex.js'

/** 每个用例前重置：关连接 → 删库 → 清内存索引缓存（dict 索引一并清） */
export async function resetDatabase() {
  await closeDB()
  await deleteDatabase()
  invalidateTagIndex()
}

export { closeDB }

/** 造一条"能进库"的最小分组链，返回 {group, subgroup} */
export async function seedGroupChain(createGroup, createSubgroup, names = {}) {
  const group = await createGroup({ name: names.group || '人物' })
  const subgroup = await createSubgroup({
    p_uuid: group.p_uuid,
    name: names.subgroup || '对象'
  })
  return { group, subgroup }
}

export function tagJson(prompt) {
  return JSON.stringify({ prompt, temp_prompt: [] })
}
