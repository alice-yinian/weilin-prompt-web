# 安全说明

## 我们的做法

- 能修的依赖漏洞一律修掉，并在 CI 里前置校验（`npm run check-lock` + 用 npm 11 做严格安装校验）。
- 修不掉的（上游尚无修复版本）如实记录在这里，并说明影响面与是否需要行动。

## 已修复

| 告警 | 包 | 严重度 | 处理 |
|---|---|---|---|
| GHSA-*（tinypool ×2） | `tinypool`（≤2.1.0 / <2.1.2） | critical | 升级 `vitest` 3.2.7 → **4.1.11**，`tinypool` 不再出现在依赖树中 |
| GHSA-*（Vitest 路径穿越） | `vitest`、`@vitest/mocker`（<4.1.11） | medium | 同上，二者均升到 4.1.11 |

> 之所以要整体升 vitest：`tinypool` 与 `@vitest/mocker` 都是 vitest 的传递依赖，
> 单独升级其中一个（例如 Dependabot 的自动 PR）会与 `vitest 3.x` 版本冲突。升级后 260 个单测全绿。

## 已知但暂不处理的告警

| 告警 | 包 | 严重度 | 依赖路径 |
|---|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)（深层嵌套模式导致栈耗尽 DoS） | `braces`（**所有版本**） | high | `vite-plugin-singlefile` → `micromatch` → `braces` |

**为什么暂不处理：**

1. **上游没有修复版本**——advisory 覆盖 `braces: *`，`npm audit` 给出的唯一"修复"是把
   `vite-plugin-singlefile` 降级到 `0.9.0`（破坏性变更，且并不真正解决问题）。
2. **仅在构建期、仅 dev 依赖**——`braces` 只被单文件打包插件用于匹配文件名，
   不会进入浏览器产物，也不在运行时被调用。
3. **本仓库不可触发**——该 DoS 需要攻击者控制传入的 glob 模式；
   本项目的构建模式全部是仓库里硬编码的常量，没有用户输入参与。
4. GitHub 的 Dependabot **并未**对本仓库报出该告警（npm audit 与 Dependabot 的数据源不同）。

**后续**：上游发布修复版（或 `vite-plugin-singlefile` 去掉 `micromatch`）后，升级即可消除。
届时用 `npm audit --registry=https://registry.npmjs.org/` 复查。

> 备注：本项目曾尝试自行实现单文件内联插件以移除这条依赖链，但自研实现在真实浏览器里
> 无法正确渲染懒加载路由（`<script>` 替换的 `$&` 展开陷阱 + 路由解析行为差异），
> 权衡后回退到成熟插件——**能跑通的构建比少一条构建期告警更重要**。
