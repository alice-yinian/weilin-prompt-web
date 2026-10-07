// 导出为原插件可导入的 SQL。
// 语句格式与上游 tag_index.vue:1363-1413 逐字符一致，方便原插件 import_tag.vue 解析。
import { uuidv7 } from 'uuidv7'
import { escapeSQLString } from './constants.js'

// 上游只对非空 text/desc 做转义，空值写成空字符串
function textLiteral(value) {
  return value != null && String(value).length > 0 ? escapeSQLString(value) : ''
}

// group: { name, color, create_time, p_uuid }
export function buildGroupSQL(group) {
  return `INSERT OR REPLACE INTO "tag_groups" ("name", "color", "create_time", "p_uuid") VALUES ('${escapeSQLString(group.name)}', '${group.color}', ${group.create_time}, '${group.p_uuid}');`
}

// subgroup: { name, color, create_time, p_uuid, g_uuid }
export function buildSubgroupSQL(subgroup) {
  return `INSERT OR REPLACE INTO "tag_subgroups" ("name", "color", "create_time", "p_uuid", "g_uuid") VALUES ('${escapeSQLString(subgroup.name)}', '${subgroup.color}', ${subgroup.create_time}, '${subgroup.p_uuid}', '${subgroup.g_uuid}');`
}

// tag: { text, desc, color, create_time, g_uuid }
// 导出会重写 t_uuid（与原插件分享逻辑一致），由调用方通过 t_uuid 注入
export function buildTagSQL(tag, { t_uuid }) {
  return `INSERT OR REPLACE INTO "tag_tags" ("text", "desc", "color", "create_time", "g_uuid", "t_uuid") VALUES ('${textLiteral(tag.text)}', '${textLiteral(tag.desc)}', '${tag.color}', ${tag.create_time}, '${tag.g_uuid}', '${t_uuid}');`
}

// 把整棵标签树导成一段 SQL（语句以 \n 连接），二级分组挂在 p_uuid 下、tag 挂在 g_uuid 下。
// newTagUuids: { [旧 t_uuid]: 新 t_uuid }，用于固定导出结果（测试/批处理）；缺省逐个用 uuidv7 生成
export function exportTreeSQL({ groups = [], subgroups = [], tags = [], newTagUuids } = {}) {
  const statements = []
  for (const group of groups) {
    statements.push(buildGroupSQL(group))
  }
  for (const subgroup of subgroups) {
    statements.push(buildSubgroupSQL(subgroup))
  }
  for (const tag of tags) {
    const t_uuid = (newTagUuids && newTagUuids[tag.t_uuid]) || uuidv7()
    statements.push(buildTagSQL(tag, { t_uuid }))
  }
  return statements.join('\n')
}
