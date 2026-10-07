// 导入落库：把 parseImportFile 的解析结果写进 IndexedDB。
// 分组/二级分组按名字复用已存在的记录，重复导入同一文件不会堆出重复结构；
// SQL 语句里的父级是「导出时的旧 uuid」，这里用 旧→新 映射把标签挂回正确位置。
import { createGroup } from '../../data/repos/groups'
import { createSubgroup } from '../../data/repos/subgroups'
import { createTag } from '../../data/repos/tags'

// 二级分组查重键：同一父分组下同名视为同一个
function subgroupKey(p_uuid, name) {
  return `${p_uuid}\u0000${name}`
}

/**
 * @param {{groups: Array, subgroups: Array, tags: Array, skipped?: number}} preview 解析结果
 * @param {object} context
 * @param {Array} context.groups 现存一级分组（按名字复用）
 * @param {Array} context.subgroups 现存二级分组
 * @param {string} context.activeGroupUuid 文件缺一级分组时的落点
 * @param {string} context.activeSubgroupUuid 文件缺分组信息时的落点（纯 {text:desc} 形式）
 * @param {string} context.defaultColor 新建条目缺颜色时的默认色
 * @returns {Promise<{groups: number, subgroups: number, tags: number, skipped: number}>} 实际写入条数
 */
export async function writeImport(preview, { groups, subgroups, activeGroupUuid, activeSubgroupUuid, defaultColor }) {
  // 纯 {text:desc} 形式只带 tags，这里统一补齐，调用方不必预加工
  const parsedGroups = preview.groups || []
  const parsedSubgroups = preview.subgroups || []
  const parsedTags = preview.tags || []
  const counts = { groups: 0, subgroups: 0, tags: 0, skipped: preview.skipped || 0 }
  const groupUuidByName = new Map((groups || []).map((group) => [group.name, group.p_uuid]))
  const groupUuidByOld = new Map()
  const groupUuidByIndex = new Map()
  const subgroupUuidByKey = new Map(
    (subgroups || []).map((subgroup) => [subgroupKey(subgroup.p_uuid, subgroup.name), subgroup.g_uuid])
  )
  const subgroupUuidByOld = new Map()
  const subgroupUuidByIndex = new Map()

  for (let index = 0; index < parsedGroups.length; index += 1) {
    const parsed = parsedGroups[index]
    const name = String(parsed.name ?? '').trim()
    if (!name) {
      counts.skipped += 1
      continue
    }
    let p_uuid = groupUuidByName.get(name)
    if (!p_uuid) {
      const created = await createGroup({ name, color: parsed.color || defaultColor })
      p_uuid = created.p_uuid
      groupUuidByName.set(name, p_uuid)
      counts.groups += 1
    }
    if (parsed.p_uuid) groupUuidByOld.set(parsed.p_uuid, p_uuid)
    groupUuidByIndex.set(index, p_uuid)
  }

  for (let index = 0; index < parsedSubgroups.length; index += 1) {
    const parsed = parsedSubgroups[index]
    const name = String(parsed.name ?? '').trim()
    let p_uuid = null
    if (parsed.groupIndex != null) p_uuid = groupUuidByIndex.get(parsed.groupIndex) ?? null
    else if (parsed.p_uuid) p_uuid = groupUuidByOld.get(parsed.p_uuid) ?? null
    // 文件里只有二级分组语句时，落到当前选中的一级分组
    if (!p_uuid) p_uuid = activeGroupUuid || null
    if (!name || !p_uuid) {
      counts.skipped += 1
      continue
    }
    const key = subgroupKey(p_uuid, name)
    let g_uuid = subgroupUuidByKey.get(key)
    if (!g_uuid) {
      const created = await createSubgroup({ p_uuid, name, color: parsed.color || defaultColor })
      g_uuid = created.g_uuid
      subgroupUuidByKey.set(key, g_uuid)
      counts.subgroups += 1
    }
    if (parsed.g_uuid) subgroupUuidByOld.set(parsed.g_uuid, g_uuid)
    subgroupUuidByIndex.set(index, g_uuid)
  }

  for (const parsed of parsedTags) {
    const text = String(parsed.text ?? '').trim()
    if (!text) {
      counts.skipped += 1
      continue
    }
    let g_uuid = null
    if (parsed.subgroupIndex != null) g_uuid = subgroupUuidByIndex.get(parsed.subgroupIndex) ?? null
    else if (parsed.g_uuid) g_uuid = subgroupUuidByOld.get(parsed.g_uuid) ?? null
    if (!g_uuid) g_uuid = activeSubgroupUuid || null
    if (!g_uuid) {
      counts.skipped += 1
      continue
    }
    await createTag({
      g_uuid,
      text,
      desc: parsed.desc ?? '',
      color: parsed.color || defaultColor
    })
    counts.tags += 1
  }

  return counts
}
