# 部署到 Cloudflare Pages

本项目是**纯静态站点**：没有服务端、没有 Cloudflare Functions / D1 / KV 依赖。
词库、译文缓存、预览图都存在**访问者自己的浏览器**（IndexedDB）里，站点只负责发文件。

- 构建命令：`npm run build`（安装用 `npm ci`，锁文件已覆盖全部平台可选依赖，npm 10/11 均实测通过）
- 输出目录：`dist`
- 路由：hash 路由（`/#/editor`），所以**不需要** SPA 回退规则，也不会出现刷新 404
- 体积：`dist/` 约 0.6 MB（Pages 免费版限制是单文件 25 MB / 20000 个文件，余量很大）

---

## 路径 A：网页端从 GitHub 仓库导入（最常用）

> 前提：代码已经推到 GitHub（本仓库远端为 `alice-yinian/weilin-prompt-web`，`main` 分支）。

### 步骤

1. 打开 **https://dash.cloudflare.com** → 左侧选 **Workers & Pages**（新版叫 **Compute (Workers)** → Workers & Pages）
2. 点 **Create application** → 切到 **Pages** 标签 → **Connect to Git**
3. **授权 GitHub**：首次会跳转安装 *Cloudflare Pages* GitHub App
   - 选 **Only select repositories** → 勾选 `weilin-prompt-web`（私有仓库必须勾，否则 Pages 读不到代码）
   - 授权后回到 Cloudflare，列表里选中该仓库 → **Begin setup**
4. **Set up builds and deployments**（按下面这张表逐项填）：

   | 字段（界面原文） | 填什么 | 说明 |
   |---|---|---|
   | Project name | `weilin-prompt-web` | 决定默认域名 `https://weilin-prompt-web.pages.dev`；被占用会自动加后缀 |
   | Production branch | `main` | 推送到这个分支 = 生产部署 |
   | Framework preset | `Vue`（或 `None`） | 不影响结果，我们用自己的构建命令 |
   | Build command | `npm ci && npm run build` | 用 `npm ci` 保证锁文件版本一致 |
   | Build output directory | `dist` | **必须填 `dist`**，填错会白屏 |
   | Root directory | 留空（仓库根目录） | 本仓库代码就在根目录，不要填 `src` |
   | Environment variables | `NODE_VERSION` = `22` | Vite 6 需要 Node 18+；显式指定避免平台默认值变化 |
5. 点 **Save and deploy**。第一次构建约 30–60 秒，完成后给一个 `*.pages.dev` 域名。

### 之后怎么发版

- 往 `main` 推提交 → 自动生产部署（`https://weilin-prompt-web.pages.dev`）
- 往其他分支推 / 开 PR → 自动生成 **Preview 部署**（独立临时域名，用来验收）
  - 你仓库里若出现 Dependabot 分支（`dependabot/npm_and_yarn/...`），它会各自生成一套预览部署，无害；不需要就在 GitHub 上关掉/dependabot 分支删掉
- 回滚：Pages → 项目 → **Deployments** → 选历史上任意一次部署 → **Rollback**

### 这个项目在 Pages 上不需要做的事

| 常见配置 | 本项目 |
|---|---|
| SPA 回退规则 `_redirects`（`/* /index.html 200`） | **不需要**：用的是 hash 路由（`/#/editor`），刷新不会 404 |
| Functions / D1 / KV / R2 绑定 | **不需要**：纯静态，数据全在访问者浏览器 IndexedDB |
| 环境变量里的密钥 | **不需要**：翻译 API Key 由访问者在「设置」页自己填，存在他的浏览器里 |
| 构建产物里的 `_headers` | **已内置**（`public/_headers`），构建时自动复制到 `dist/`，平台自动读取 |

### 自定义域名

Pages 项目 → **Custom domains** → Add a custom domain。
- 域名已托管在 Cloudflare：一键绑定，自动签发证书；
- 域名在别处：按提示到域名商加 `CNAME` 指向 `weilin-prompt-web.pages.dev`。
- 想挂在子路径（如 `example.com/tools/`）：本项目 `base: './'` 用相对路径，直接反代到该路径即可，无需改配置。

### 构建失败的常见原因

| 报错 | 处理 |
|---|---|
| `npm ci` 报 `` `npm ci` can only install packages when your package.json and package-lock.json are in sync. Missing: @rollup/rollup-xxx from lock file `` | 锁文件缺「平台可选依赖」（本仓库 2026-10 遇到过一次：只有 19/25 个 `@rollup/rollup-*`）。修复：`npm install --package-lock-only --no-audit --no-fund` 后提交 `package-lock.json`；本地先用 `npm run check-lock` 体检 |
| `npm ci` 报 lock 与 package.json 版本/依赖不一致 | 同上，重新生成锁文件后提交 |
| `Cannot find module 'vite'` / Node 版本错误 | 设 `NODE_VERSION=22` |
| 部署成功但页面白屏、控制台 404 | Build output directory 不是 `dist`，或 Root directory 填错了 |
| GitHub 仓库列表里找不到自己的仓库 | 到 GitHub → Settings → Applications → Cloudflare Pages 里把该仓库加进授权范围 |

---

## 路径 B：CLI 直传（不想接 CI 时最快）

```bash
cd weilin-prompt-web
npm ci
npm run build

# 首次会让你登录（OAuth 打开浏览器）
npx wrangler pages deploy dist --project-name=weilin-prompt-web
# 也可以直接： npm run deploy:cf
```

- 不想登录交互式 OAuth，可用 API Token：
  ```bash
  export CLOUDFLARE_API_TOKEN=xxx        # 权限：Cloudflare Pages: Edit
  export CLOUDFLARE_ACCOUNT_ID=xxx
  npx wrangler pages deploy dist --project-name=weilin-prompt-web
  ```
- 也可以在本地预览 Pages 行为：`npx wrangler pages dev dist`

## 单文件版（可选）

`npm run build:single` 产出一个自包含的 `dist-single/index.html`（约 460 KB）。
适合：丢到任意静态托管、内网分享、或让人直接下载后双击打开（`file://` 下 IndexedDB 也能用）。
Pages 上更推荐多文件版（`dist`），因为 `index.html` 与 `assets/*` 能分开缓存。

---

## 部署后请留意

### 1. 每个访问者的词库是空的（重要）

数据在浏览器本地，站点本身不带词库。访问者第一次打开需要：

1. 本地用导入工具把自己的原插件数据转成数据包：
   ```bash
   python3 tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \
       --out weilin-data-zh_CN.json
   ```
2. 打开站点 →「数据导入导出」→ 选择该文件导入。

如果你想**让站点自带一套默认词库**（新访客打开就有标签，无需自己导入），有两种做法，需要改动代码：

- **方案 1（推荐）**：把数据包放进 `public/`（如 `public/weilin-default.json`），在数据页加一个「加载站点默认词库」按钮，
  用 `fetch('./weilin-default.json')` 取回后调用现有的 `importBundle()`；
- **方案 2**：首次访问时自动导入（需要判断是否已导入过，并在数据页给出「清除」入口）。

> 注意：官方词库数据（`WeiLin-Comfyui-Tools-Prompt` 仓库）是 MIT，可随站点分发；
> 但数据包约 12 MB（含 14 万条 danbooru 词典），首次加载会拉这个体积，建议按需拆分或只带标签库。
> 需要的话我可以实现。

### 2. 翻译接口的跨域（CORS）

站点是 HTTPS，翻译是浏览器直连第三方：

| 服务 | 部署后是否可用 |
|---|---|
| 有道（`aidemo.youdao.com`） | ✅ 实测可用（响应带 `Access-Control-Allow-Origin: *`） |
| MyMemory | ✅ 实测可用 |
| OpenAI 兼容（自建网关 / 支持 CORS 的服务） | 取决于对方是否回 CORS 头；不通时在设置里填 `代理前缀` 指向自建网关 |
| 必应（Azure） | 需要 Azure 密钥；端点对浏览器放行 |

请求都从访问者浏览器直接发出，**不经过你的 Cloudflare 站点**，所以不占用你的额度，也不会暴露密钥到服务端（密钥存在访问者本地 localStorage）。

### 3. 其他

- **HTTPS 是必须的**（IndexedDB 的持久化存储申请、剪贴板 API 需要安全上下文）。Pages 默认 HTTPS ✓；
  如果只是本地测试，`http://127.0.0.1` 也算安全上下文。
- **自定义域名**：Pages 项目 → Custom domains 绑定即可；`vite.config.js` 里 `base: './'` 用的是相对路径，
  部署在根域或子路径（如 `example.com/tools/`）都能正常加载资源。
- **不要把 `dist-single/index.html` 当唯一入口**再配一套反向代理，没必要——直接部署 `dist/`。

## 与 GitHub Release 的关系

仓库里有两套流程，互不冲突：

| 流程 | 触发 | 做什么 |
|---|---|---|
| `.github/workflows/ci.yml` | 任意分支推送 / PR | 只测试 + 双形态构建，不发布 |
| `.github/workflows/release.yml` | `main` 上打 `v*.*.*` 标签 | 测试 → 构建 → 打 GitHub Release（多文件 zip / 单文件 html / 校验和） |
| Cloudflare Pages | 推送到生产分支 `main` | 自动部署整站（与版本标签无关） |

也就是说：**日常推 `main` 就会更新站点**；想留一个可下载的版本快照时再打标签。

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 页面白屏、控制台 404 `assets/xxx.js` | 输出目录填错（应为 `dist`），或站点被挂在子路径且改了 `base`；保持 `base: './'` 即可 |
| 发版后界面没更新 | 检查 `_headers` 是否随构建产物上传（`dist/_headers` 是否存在）；确保 `/index.html` 是 `must-revalidate` |
| 刷新某个页面 404 | 不应该发生（hash 路由）；若你手动改成了 history 路由，需要加 `_redirects`：`/* /index.html 200` |
| 导入数据包失败/很慢 | 数据包有 10+ MB，属正常（导出流程实测约 30s 写入 14.5 万条）；建议本地导入一次后靠浏览器持久化保存，并在数据页点「申请持久化存储」 |
