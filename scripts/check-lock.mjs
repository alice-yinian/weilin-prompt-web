#!/usr/bin/env node
/**
 * 锁定文件体检：npm ci 在部分 npm 版本上会要求「父包声明的平台可选依赖」都存在于锁里。
 * 本脚本在**不联网、不依赖 node_modules** 的前提下，检查锁里每个包的 optionalDependencies
 * 是否都能在锁中找到对应条目（缺了就会让 npm ci / Cloudflare 构建失败）。
 *
 * 背景：曾出现 package-lock.json 只有 19/25 个 @rollup/rollup-* 平台包，
 * 导致 Cloudflare 的 `npm ci` 报 "Missing: @rollup/rollup-* from lock file"。
 */
import fs from 'node:fs'

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const packages = lock.packages || {}

// 已知会被 npm 正常裁剪成「仅当前平台」的包（napi 系预编译包按 libc 裁剪）
const ALLOW_MISSING = [/^@napi-rs\//]

function resolvePath(parentPath, depName) {
  // parentPath 形如 'node_modules/rollup' 或 ''（根）
  const base = parentPath ? parentPath.replace(/(^|\/)node_modules\/[^/]+$/, '') : ''
  const prefix = base ? `${base}/node_modules/` : 'node_modules/'
  return `${prefix}${depName}`
}

const missing = []
for (const [path, entry] of Object.entries(packages)) {
  const optional = entry?.optionalDependencies
  if (!optional || path === '') continue
  for (const depName of Object.keys(optional)) {
    if (ALLOW_MISSING.some((re) => re.test(depName))) continue
    if (!(resolvePath(path, depName) in packages)) {
      missing.push({ parent: path, dep: depName })
    }
  }
}

if (missing.length) {
  console.error(`✗ 锁定文件缺少 ${missing.length} 个被声明的可选依赖，npm ci 在严格 npm 上会失败：`)
  for (const item of missing.slice(0, 20)) console.error(`   ${item.parent} → ${item.dep}`)
  if (missing.length > 20) console.error(`   …（其余 ${missing.length - 20} 项省略）`)
  console.error('\n  修复：npm install --package-lock-only --no-audit --no-fund 后提交 package-lock.json')
  process.exit(1)
}

console.log(`✓ 锁定文件完整：${Object.keys(packages).length} 个包条目，可选依赖全部齐全`)
