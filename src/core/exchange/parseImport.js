// 解析上游导入文件（SQL / JSON / TXT / YAML）。纯函数，不做任何 IO。
// SQL 的识别规则与列顺序对齐上游 import_tag.vue，保证导出的 SQL 能被原样读回。
import { load as yamlLoad } from 'js-yaml'
import { DEFAULT_TAG_COLOR } from './constants.js'

// 上游按 VALUES 元组的位置取值，这里用同样的列顺序
const TAG_GROUP_COLUMNS = ['name', 'color', 'create_time', 'p_uuid']
const TAG_SUBGROUP_COLUMNS = ['name', 'color', 'create_time', 'p_uuid', 'g_uuid']
const TAG_TAG_COLUMNS = ['text', 'desc', 'color', 'create_time', 'g_uuid', 't_uuid']

// 把一个 VALUES 元组拆成原始值数组；单引号字符串内的逗号/括号不参与切分，'' 还原为 '
function splitValuesTuple(body) {
  const values = []
  let current = ''
  let inString = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (ch === "'") {
        if (body[i + 1] === "'") {
          current += "'"
          i++
        } else {
          inString = false
        }
      } else {
        current += ch
      }
    } else if (ch === "'") {
      inString = true
    } else if (ch === ',') {
      values.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current.trim())
  return values
}

function parseValues(statement) {
  const idx = statement.toUpperCase().indexOf('VALUES')
  if (idx < 0) return null
  const rest = statement.slice(idx + 'VALUES'.length)
  const open = rest.indexOf('(')
  const close = rest.lastIndexOf(')')
  if (open < 0 || close < open) return null
  const tuple = rest.slice(open + 1, close)
  return splitValuesTuple(tuple)
}

function buildRecord(columns, values) {
  if (!values) return null
  const record = {}
  for (let i = 0; i < columns.length; i++) {
    const key = columns[i]
    const value = values[i]
    record[key] = key === 'create_time' ? Number(value) : value
  }
  return record
}

// 按 ';' 切分语句，但忽略单引号字符串内的分号（如标签 ";p"）。
// 上游是直接 split(';')，遇到含分号的标签会丢数据，这里做兼容性增强。
function splitStatements(text) {
  const statements = []
  let current = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      current += ch
      if (ch === "'") {
        if (text[i + 1] === "'") {
          current += "'"
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
      continue
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) statements.push(current)
  return statements
}

// 逐条识别：含 tag_tags → tag；否则含 (tag_groups|tag_subgroups) 且有 p_uuid，
// 再靠是否含 g_uuid 区分一级/二级（与上游 import_tag.vue:311-360 一致）
export function parseSQL(text) {
  const result = { groups: [], subgroups: [], tags: [], skipped: 0 }
  const statements = splitStatements(String(text ?? ''))
  for (const statement of statements) {
    if (statement.includes('tag_tags')) {
      const record = buildRecord(TAG_TAG_COLUMNS, parseValues(statement))
      if (record) result.tags.push(record)
      else result.skipped++
    } else if (
      (statement.includes('tag_groups') || statement.includes('tag_subgroups')) &&
      statement.includes('p_uuid')
    ) {
      const isSubgroup = statement.includes('g_uuid')
      const columns = isSubgroup ? TAG_SUBGROUP_COLUMNS : TAG_GROUP_COLUMNS
      const record = buildRecord(columns, parseValues(statement))
      if (record) (isSubgroup ? result.subgroups : result.groups).push(record)
      else result.skipped++
    } else {
      result.skipped++
    }
  }
  return result
}

// 把 {tag文本: 中文释义} 对象转成统一 tag 列表
function objectToTags(obj) {
  return Object.entries(obj || {}).map(([text, desc]) => ({
    text,
    desc: desc == null ? '' : String(desc),
    color: DEFAULT_TAG_COLOR
  }))
}

// 上游 YAML 列表形式： [{ name, color?, groups: [{ name, color?, tags: {text: desc} }] }]
// 展开为三层（不含 uuid，导入时由数据层分配）：
//   groups:    [{ name, color }]
//   subgroups: [{ name, color, groupIndex }]              groupIndex → groups 下标
//   tags:      [{ text, desc, color, subgroupIndex }]     subgroupIndex → subgroups 下标
function expandListForm(list) {
  const groups = []
  const subgroups = []
  const tags = []
  for (const item of list || []) {
    const groupColor = item.color == null ? DEFAULT_TAG_COLOR : item.color
    const groupIndex = groups.length
    groups.push({ name: item.name, color: groupColor })
    for (const group of item.groups || []) {
      // 二级未给颜色时继承一级（上游 ymal_utils.py 的行为）
      const subColor = group.color == null ? groupColor : group.color
      const subgroupIndex = subgroups.length
      subgroups.push({ name: group.name, color: subColor, groupIndex })
      for (const [text, desc] of Object.entries(group.tags || {})) {
        tags.push({
          text,
          desc: desc == null ? '' : String(desc),
          color: subColor,
          subgroupIndex
        })
      }
    }
  }
  return { groups, subgroups, tags }
}

export function parseJSONText(text) {
  const data = JSON.parse(text)
  if (Array.isArray(data)) return expandListForm(data)
  return { tags: objectToTags(data) }
}

export function parseTXTText(text) {
  const tags = []
  const lines = String(text ?? '')
    .split('\n')
    .filter((line) => line.trim())
  for (const line of lines) {
    // 只取前两段：text,desc
    const [text, desc] = line.split(',')
    if (text && desc) {
      tags.push({ text: text.trim(), desc: desc.trim(), color: DEFAULT_TAG_COLOR })
    }
  }
  return { tags }
}

export function parseYAMLText(text) {
  const data = yamlLoad(text)
  if (Array.isArray(data)) return expandListForm(data)
  return { tags: objectToTags(data) }
}

export function parseImportFile(name, content) {
  const ext = String(name ?? '')
    .toLowerCase()
    .split('.')
    .pop()
  if (ext === 'sql') return parseSQL(content)
  if (ext === 'json') return parseJSONText(content)
  if (ext === 'txt') return parseTXTText(content)
  if (ext === 'yaml' || ext === 'yml') return parseYAMLText(content)
  throw new Error(`不支持的导入文件类型: .${ext}`)
}
