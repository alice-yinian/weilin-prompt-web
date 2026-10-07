// 导入/导出模块共用的常量与小工具，保持纯函数、零副作用

export const DEFAULT_TAG_COLOR = 'rgba(255, 123, 2, .4)'

// 上游写 SQL 字符串字面量时把单引号转义为两个单引号（SQL 标准做法）
export function escapeSQLString(s) {
  return String(s ?? '').replace(/'/g, "''")
}
