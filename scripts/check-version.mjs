#!/usr/bin/env node
/**
 * 版本号一致性检查：
 *   node scripts/check-version.mjs                  # 校验 package.json 与 src/utils/version.js 是否一致
 *   node scripts/check-version.mjs --expect 0.3.2   # 额外校验是否等于发布标签（不一致时只告警，不失败）
 *
 * 退出码：0 = 通过（可能伴随告警）；1 = 仓库内部版本号互相矛盾
 */
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const versionSource = fs.readFileSync('src/utils/version.js', 'utf8')
const matched = versionSource.match(/APP_VERSION\s*=\s*'([^']+)'/)

if (!matched) {
  console.error('✗ 无法从 src/utils/version.js 解析 APP_VERSION')
  process.exit(1)
}

const pkgVersion = String(pkg.version || '')
const appVersion = matched[1]

if (pkgVersion !== appVersion) {
  console.error(
    `✗ 版本号不一致：package.json=${pkgVersion}，src/utils/version.js=${appVersion}\n` +
      '  这两处必须一致（页面「关于」显示的是 src/utils/version.js 的值）'
  )
  process.exit(1)
}

console.log(`✓ 版本号一致：${pkgVersion}`)

const expectIndex = process.argv.indexOf('--expect')
if (expectIndex >= 0) {
  const expected = String(process.argv[expectIndex + 1] || '').replace(/^v/, '')
  if (!expected) {
    console.error('✗ --expect 缺少版本参数')
    process.exit(1)
  }
  if (expected !== pkgVersion) {
    console.log(
      `::warning::发布标签 v${expected} 与代码内版本 ${pkgVersion} 不一致；` +
        '产物文件名以标签为准，建议把 package.json 与 src/utils/version.js 一起更新后重新打标签'
    )
  } else {
    console.log(`✓ 与发布标签一致：v${expected}`)
  }
}
