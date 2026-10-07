import { describe, it, expect } from 'vitest'
import {
  buildGroupSQL,
  buildSubgroupSQL,
  buildTagSQL,
  exportTreeSQL
} from '../../src/core/exchange/exportSQL.js'
import { DEFAULT_TAG_COLOR, escapeSQLString } from '../../src/core/exchange/constants.js'
import { parseSQL } from '../../src/core/exchange/parseImport.js'

const group = { name: '人物', color: DEFAULT_TAG_COLOR, create_time: 1736580436, p_uuid: 'p-1' }
const subgroup = {
  name: '对象',
  color: '#ffffff',
  create_time: 1736580437,
  p_uuid: 'p-1',
  g_uuid: 'g-1'
}
const tag = {
  text: '1girl',
  desc: '1女孩',
  color: '#ffffff',
  create_time: 1736580438,
  g_uuid: 'g-1',
  t_uuid: 't-old'
}

describe('exchange/exportSQL', () => {
  it('单条语句与上游 1:1', () => {
    expect(buildGroupSQL(group)).toBe(
      `INSERT OR REPLACE INTO "tag_groups" ("name", "color", "create_time", "p_uuid") VALUES ('人物', '${DEFAULT_TAG_COLOR}', 1736580436, 'p-1');`
    )
    expect(buildSubgroupSQL(subgroup)).toBe(
      `INSERT OR REPLACE INTO "tag_subgroups" ("name", "color", "create_time", "p_uuid", "g_uuid") VALUES ('对象', '#ffffff', 1736580437, 'p-1', 'g-1');`
    )
    expect(buildTagSQL(tag, { t_uuid: 't-new' })).toBe(
      `INSERT OR REPLACE INTO "tag_tags" ("text", "desc", "color", "create_time", "g_uuid", "t_uuid") VALUES ('1girl', '1女孩', '#ffffff', 1736580438, 'g-1', 't-new');`
    )
  })

  it('导出整棵树：语句快照比对', () => {
    const sql = exportTreeSQL({
      groups: [group],
      subgroups: [subgroup],
      tags: [tag],
      newTagUuids: { 't-old': 't-new' }
    })
    expect(sql).toBe(
      `INSERT OR REPLACE INTO "tag_groups" ("name", "color", "create_time", "p_uuid") VALUES ('人物', '${DEFAULT_TAG_COLOR}', 1736580436, 'p-1');\n` +
        `INSERT OR REPLACE INTO "tag_subgroups" ("name", "color", "create_time", "p_uuid", "g_uuid") VALUES ('对象', '#ffffff', 1736580437, 'p-1', 'g-1');\n` +
        `INSERT OR REPLACE INTO "tag_tags" ("text", "desc", "color", "create_time", "g_uuid", "t_uuid") VALUES ('1girl', '1女孩', '#ffffff', 1736580438, 'g-1', 't-new');`
    )
  })

  it('导出 tag 重新生成 t_uuid，但保留 p_uuid / g_uuid', () => {
    const sql = exportTreeSQL({ groups: [group], subgroups: [subgroup], tags: [tag] })
    const parsed = parseSQL(sql)
    expect(parsed.tags[0].t_uuid).not.toBe('t-old')
    expect(parsed.tags[0].t_uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(parsed.tags[0].g_uuid).toBe('g-1')
    expect(parsed.groups[0].p_uuid).toBe('p-1')
    expect(parsed.subgroups[0].p_uuid).toBe('p-1')
    expect(parsed.subgroups[0].g_uuid).toBe('g-1')
  })

  it('单引号转义为两个单引号', () => {
    expect(escapeSQLString("it's")).toBe("it''s")
    const quoted = { ...tag, text: "girl's", desc: "a'b" }
    expect(buildTagSQL(quoted, { t_uuid: 'x' })).toContain(`VALUES ('girl''s', 'a''b',`)
  })
})

describe('exchange SQL round-trip', () => {
  it('导出 → parseSQL 回读，uuid / 名称 / 时间一致', () => {
    const tree = {
      groups: [group, { ...group, name: '场景', p_uuid: 'p-2' }],
      subgroups: [subgroup],
      tags: [tag, { ...tag, text: '2girls', desc: '2女孩', t_uuid: 't-old2' }],
      newTagUuids: { 't-old': 't-new-1', 't-old2': 't-new-2' }
    }
    const parsed = parseSQL(exportTreeSQL(tree))
    expect(parsed.skipped).toBe(0)
    expect(parsed.groups).toEqual([
      { name: '人物', color: DEFAULT_TAG_COLOR, create_time: 1736580436, p_uuid: 'p-1' },
      { name: '场景', color: DEFAULT_TAG_COLOR, create_time: 1736580436, p_uuid: 'p-2' }
    ])
    expect(parsed.subgroups).toEqual([
      { name: '对象', color: '#ffffff', create_time: 1736580437, p_uuid: 'p-1', g_uuid: 'g-1' }
    ])
    expect(parsed.tags).toEqual([
      {
        text: '1girl',
        desc: '1女孩',
        color: '#ffffff',
        create_time: 1736580438,
        g_uuid: 'g-1',
        t_uuid: 't-new-1'
      },
      {
        text: '2girls',
        desc: '2女孩',
        color: '#ffffff',
        create_time: 1736580438,
        g_uuid: 'g-1',
        t_uuid: 't-new-2'
      }
    ])
  })

  it('含转义单引号与中文逗号的往返', () => {
    const tree = {
      groups: [{ ...group, name: "人'物" }],
      subgroups: [subgroup],
      tags: [{ ...tag, text: 'a,b', desc: "1'女孩" }],
      newTagUuids: { 't-old': 't-1' }
    }
    const parsed = parseSQL(exportTreeSQL(tree))
    expect(parsed.groups[0].name).toBe("人'物")
    expect(parsed.tags[0].text).toBe('a,b')
    expect(parsed.tags[0].desc).toBe("1'女孩")
  })
})
