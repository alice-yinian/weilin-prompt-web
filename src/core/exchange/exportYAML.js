// 导出为 {tag文本: 中文释义} 的 YAML，格式与上游 tag_index.vue:1559-1566 一致
import { dump } from 'js-yaml'

// records: [{ text, desc }]
// 返回 js-yaml dump 后的 YAML 文本（可直接写入 .yaml 文件）
export function tagsToYAML(records) {
  const obj = {}
  for (const record of records || []) {
    obj[record.text] = record.desc != null ? record.desc : ''
  }
  return dump(obj)
}
