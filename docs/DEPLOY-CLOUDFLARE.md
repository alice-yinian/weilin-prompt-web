# 部署到 Cloudflare（wrangler / Workers 静态资源）

本项目是**纯静态站点**，Cloudflare 侧统一使用 **wrangler 方式**：
`npm run build` 产出 `dist/`，由 `wrangler.jsonc` 把它作为 **Workers 静态资源**发布。

- 没有服务端逻辑、没有 `main` 入口、没有 D1/KV/R2 绑定
- 词库、译文缓存、预览图都存在**访问者自己的浏览器**（IndexedDB），站点只负责发文件
- 客户端是 hash 路由（`/#/editor`），`not_found_handling: single-page-application` 只是兜底
- 体积：`dist/` 约 0.6 MB / 41 个文件（免费额度绰绰有余）

## 唯一配置源：`wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "weilin-prompt-web",
  "compatibility_date": "2026-10-06",
  "assets": {
    "directory": "./dist",                              // 必须是构建产物目录
    "not_found_handling": "single-page-application"     // 未知路径回 index.html
  }
}
```

| 项 | 说明 |
|---|---|
| `name` | Worker 名称，决定默认域名 `https://<name>.<子域>.workers.dev` |
| `assets.directory` | `./dist`，**部署前必须先 `npm run build`**（脚本已帮你串好） |
| `_headers` / `_redirects` | `dist/` 里的这两个文件会被静态资源服务读取；`_headers` 由 `public/_headers` 构建时复制过去 |

> 实测（`wrangler dev`）：`✨ Parsed 5 valid header rules`，
> `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`，
> `/` → `max-age=0, must-revalidate`，安全头（`nosniff` / `X-Frame-Options` / `Referrer-Policy`）均生效，
> 未知路径返回 200（SPA 回退）。

## 路径 A：Cloudflare 控制台 · Git 集成（推荐）

1. 打开 **https://dash.cloudflare.com** → **Workers & Pages** → **Create application**
2. 选 **Workers** 标签 → **Connect to Git**（新版界面为 *Import a repository*）
3. 授权 GitHub：首次会安装 *Cloudflare Workers* GitHub App
   - 选 **Only select repositories** → 勾选 `weilin-prompt-web`（私有仓库必须勾）
4. 填构建配置：

   | 界面字段 | 填什么 |
   |---|---|
   | Project name | `weilin-prompt-web` |
   | Production branch | `main` |
   | Build command | `npm ci && npm run build` |
   | Deploy command | `npx wrangler deploy`（默认值即是，`wrangler.jsonc` 会自动被读取） |
   | Root directory | 留空（仓库根目录） |
   | Environment variables | `NODE_VERSION` = `22`（Vite 6 需要 Node 18+；显式指定避免平台默认值变化） |

5. **Save and Deploy**。之后：

   - 推送到 `main` → 自动构建 + 部署（生产）
   - 其他分支 / PR → 自动生成 **preview URL**（用来验收）
   - 回滚：Worker 详情 → **Deployments** → 选历史版本 → **Rollback**

## 路径 B：本地 wrangler CLI

```bash
cd weilin-prompt-web
npm ci

# 首次登录（浏览器 OAuth）
npx wrangler login

# 构建 + 部署（脚本已串好：npm run build && wrangler deploy）
npm run deploy:cf

# 只校验配置、不上传
npm run check:cf          # = wrangler deploy --dry-run

# 本地预览（Worker 运行时 + 真实静态资源，含 _headers / SPA 回退）
npm run dev:cf            # = wrangler dev
```

CI / 无浏览器环境下可用 API Token：

```bash
export CLOUDFLARE_API_TOKEN=xxx     # 权限：Workers Scripts: Edit
export CLOUDFLARE_ACCOUNT_ID=xxx
npm run deploy:cf
```

## 自定义域名

Worker 详情 → **Settings → Domains & Routes → Add → Custom domain**：

- 域名已托管在 Cloudflare：一键绑定并自动签发证书；
- 域名在别处：按提示加 `CNAME` 指向 `<worker>.<account>.workers.dev`；
- 想挂在子路径（如 `example.com/tools/`）：`base: './'` 用的是相对路径，反代即可，无需改配置。

## 构建失败排查

| 报错 | 处理 |
|---|---|
| ``npm ci` can only install packages when your package.json and package-lock.json are in sync. Missing: @rollup/rollup-xxx from lock file` | 锁文件缺平台可选依赖。`npm install --package-lock-only --no-audit --no-fund` 后提交 `package-lock.json`；本地先 `npm run check-lock` 体检（CI 已前置该检查） |
| `Cannot find module 'vite'` / Node 版本错误 | 设 `NODE_VERSION=22` |
| 部署成功但页面白屏、控制台 404 | 构建命令没产出 `dist`，或 `wrangler.jsonc` 里 `assets.directory` 不是 `./dist` |
| `wrangler deploy` 报没有配置 | 确认仓库根目录有 `wrangler.jsonc`，且 Deploy command 是 `npx wrangler deploy` |
| 仓库列表里找不到自己的仓库 | GitHub → Settings → Applications → Cloudflare Workers → 把该仓库加入授权范围 |

## 与 GitHub Release 的关系（互不冲突）

| 流程 | 触发 | 做什么 |
|---|---|---|
| `.github/workflows/ci.yml` | 任意分支推送 / PR | 只测试 + 双形态构建（npm 11 严格安装 + 锁文件体检 + 版本号一致性） |
| `.github/workflows/release.yml` | `main` 上打 `v*.*.*` 标签 | 测试 → 构建 → 打 GitHub Release（多文件 zip / 单文件 html / 校验和） |
| **Cloudflare（wrangler）** | 推送到生产分支 `main`（Git 集成）或手动 `npm run deploy:cf` | 部署整站 |

日常推 `main` 就会更新线上站点；想留一个可下载的版本快照时再打标签发 Release。

## 部署后请留意

### 1. 每个访问者的词库是空的（重要）

数据在浏览器本地，站点本身不带词库。访问者第一次打开需要：

1. 本地用自己的原插件数据生成数据包：
   ```bash
   python3 tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \
       --out weilin-data-zh_CN.json
   ```
2. 打开站点 →「数据导入导出」→ 选择该文件导入（14 万余条约 30 秒），并点「申请持久化存储」。

想让**站点自带默认词库**（新访客打开即有标签）需要改代码，两种做法：

- **方案 1（推荐）**：把数据包放进 `public/`（如 `public/weilin-default.json`），数据页加一个「加载站点默认词库」按钮，
  `fetch('./weilin-default.json')` 后调用现有 `importBundle()`；
- **方案 2**：首次访问自动导入（需判断是否已导入过，并在数据页给「清除」入口）。

> 官方词库数据（`WeiLin-Comfyui-Tools-Prompt` 仓库，MIT）可随站点分发；但数据包约 12 MB（含 14 万条词典），
> 会让首次加载变重，建议只带标签库或按需拆分。

### 2. 翻译接口的跨域（CORS）

站点是 HTTPS，翻译由访问者浏览器直连第三方：

| 服务 | 部署后是否可用 |
|---|---|
| 有道（`aidemo.youdao.com`） | ✅ 实测可用（响应带 `Access-Control-Allow-Origin: *`） |
| MyMemory | ✅ 实测可用 |
| OpenAI 兼容（自建网关 / 支持 CORS 的服务） | 取决于对方是否回 CORS 头；不通时在设置里填 `代理前缀` 指向自建网关 |
| 必应（Azure） | 需 Azure 密钥；端点对浏览器放行 |

请求不经过你的 Worker，不占用额度；密钥只存在访问者本地 localStorage。

### 3. 其他

- **HTTPS 是必须的**（IndexedDB 持久化申请、剪贴板 API 需要安全上下文）——Cloudflare 默认 HTTPS ✓
- 静态资源带内容哈希，配合 `_headers` 的长缓存策略，发版后不会出现"旧 bundle 卡住"的问题
- 部署产物与 GitHub Release 里的 `*-multi.zip` 内容一致（同一个 `dist/`）
