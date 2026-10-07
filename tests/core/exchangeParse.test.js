import { describe, it, expect } from 'vitest'
import {
  parseSQL,
  parseJSONText,
  parseTXTText,
  parseYAMLText,
  parseImportFile
} from '../../src/core/exchange/parseImport.js'
import { tagsToYAML } from '../../src/core/exchange/exportYAML.js'
import { DEFAULT_TAG_COLOR } from '../../src/core/exchange/constants.js'
import { load as yamlLoad } from 'js-yaml'

describe('exchange/parseSQL', () => {
  it('按表名分类并统计 skipped', () => {
    const text = [
      `INSERT OR REPLACE INTO "tag_groups" ("name", "color", "create_time", "p_uuid") VALUES ('人物', '${DEFAULT_TAG_COLOR}', 100, 'p-1');`,
      `INSERT OR REPLACE INTO "tag_subgroups" ("name", "color", "create_time", "p_uuid", "g_uuid") VALUES ('对象', '${DEFAULT_TAG_COLOR}', 101, 'p-1', 'g-1');`,
      `INSERT OR REPLACE INTO "tag_tags" ("text", "desc", "color", "create_time", "g_uuid", "t_uuid") VALUES ('1girl', '1女孩', '${DEFAULT_TAG_COLOR}', 102, 'g-1', 't-1');`,
      `CREATE TABLE x (a INTEGER);`
    ].join('\n')
    const parsed = parseSQL(text)
    expect(parsed.groups).toEqual([
      { name: '人物', color: DEFAULT_TAG_COLOR, create_time: 100, p_uuid: 'p-1' }
    ])
    expect(parsed.subgroups).toEqual([
      { name: '对象', color: DEFAULT_TAG_COLOR, create_time: 101, p_uuid: 'p-1', g_uuid: 'g-1' }
    ])
    expect(parsed.tags).toEqual([
      {
        text: '1girl',
        desc: '1女孩',
        color: DEFAULT_TAG_COLOR,
        create_time: 102,
        g_uuid: 'g-1',
        t_uuid: 't-1'
      }
    ])
    expect(parsed.skipped).toBe(1)
  })
})

describe('exchange/parseJSONText', () => {
  it('{text: desc} 对象 → tag 列表，颜色取默认值', () => {
    expect(parseJSONText('{"1girl":"1女孩","2girls":"2女孩"}')).toEqual({
      tags: [
        { text: '1girl', desc: '1女孩', color: DEFAULT_TAG_COLOR },
        { text: '2girls', desc: '2女孩', color: DEFAULT_TAG_COLOR }
      ]
    })
  })
})

describe('exchange/parseTXTText', () => {
  it('每行取前两段，逗号后可含中文', () => {
    const parsed = parseTXTText('1girl,一名女孩\nsolo,单人,多余的第三段\n\n')
    expect(parsed.tags).toEqual([
      { text: '1girl', desc: '一名女孩', color: DEFAULT_TAG_COLOR },
      { text: 'solo', desc: '单人', color: DEFAULT_TAG_COLOR }
    ])
  })

  it('缺少 desc 的行被跳过', () => {
    expect(parseTXTText('onlytext\n').tags).toEqual([])
  })
})

describe('exchange/parseYAMLText', () => {
  it('{tag: desc} 对象', () => {
    expect(parseYAMLText('1girl: 1女孩\n2girls: 2女孩\n')).toEqual({
      tags: [
        { text: '1girl', desc: '1女孩', color: DEFAULT_TAG_COLOR },
        { text: '2girls', desc: '2女孩', color: DEFAULT_TAG_COLOR }
      ]
    })
  })

  it('上游列表形式展开成三层，二级继承颜色', () => {
    const yamlText = [
      '- name: 人物',
      '  color: "#111"',
      '  groups:',
      '    - name: 对象',
      '      tags:',
      '        1girl: 1女孩',
      '    - name: 动作',
      '      color: "#222"',
      '      tags:',
      '        run: 跑',
      '- name: 场景',
      '  groups:',
      '    - name: 室内',
      '      tags:',
      '        room: 房间'
    ].join('\n')
    const parsed = parseYAMLText(yamlText)
    expect(parsed.groups).toEqual([
      { name: '人物', color: '#111' },
      { name: '场景', color: DEFAULT_TAG_COLOR }
    ])
    expect(parsed.subgroups).toEqual([
      { name: '对象', color: '#111', groupIndex: 0 },
      { name: '动作', color: '#222', groupIndex: 0 },
      { name: '室内', color: DEFAULT_TAG_COLOR, groupIndex: 1 }
    ])
    expect(parsed.tags).toEqual([
      { text: '1girl', desc: '1女孩', color: '#111', subgroupIndex: 0 },
      { text: 'run', desc: '跑', color: '#222', subgroupIndex: 1 },
      { text: 'room', desc: '房间', color: DEFAULT_TAG_COLOR, subgroupIndex: 2 }
    ])
  })

  it('导出的 {text: desc} YAML 能被读回', () => {
    const records = [
      { text: '1girl', desc: '1女孩' },
      { text: '2girls', desc: '2女孩' }
    ]
    const text = tagsToYAML(records)
    expect(yamlLoad(text)).toEqual({ '1girl': '1女孩', '2girls': '2女孩' })
    expect(parseYAMLText(text).tags).toEqual([
      { text: '1girl', desc: '1女孩', color: DEFAULT_TAG_COLOR },
      { text: '2girls', desc: '2女孩', color: DEFAULT_TAG_COLOR }
    ])
  })
})

describe('exchange/parseImportFile', () => {
  it('按扩展名分派', () => {
    expect(parseImportFile('a.txt', '1girl,1女孩').tags).toHaveLength(1)
    expect(parseImportFile('a.json', '{"1girl":"1女孩"}').tags).toHaveLength(1)
    expect(parseImportFile('a.yaml', '1girl: 1女孩\n').tags).toHaveLength(1)
    expect(parseImportFile('a.yml', '1girl: 1女孩\n').tags).toHaveLength(1)
    expect(parseImportFile('a.sql', 'CREATE TABLE x (a INTEGER);').skipped).toBe(1)
  })

  it('未知扩展名抛错', () => {
    expect(() => parseImportFile('a.docx', 'x')).toThrow(/不支持的导入文件类型/)
  })
})
