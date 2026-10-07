# 部署到 Cloudflare Pages

本项目是**纯静态站点**：没有服务端、没有 Cloudflare Functions / D1 / KV 依赖。
词库、译文缓存、预览图都存在**访问者自己的浏览器**（IndexedDB）里，站点只负责发文件。

- 构建命令：`npm run build`
- 输出目录：`dist`
- 路由：hash 路由（`/#/editor`），所以**不需要** SPA 回退规则，也不会出现刷新 404
- 体积：`dist/` 约 0.6 MB（Pages 免费版限制是单文件 25 MB / 20000 个文件，余量很大）

---

## 路径 A：Git 集成（推荐，推代码自动部署）

1. 把仓库推到 GitHub / GitLab；
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**，选中仓库；
3. 构建配置填：

   | 项 | 值 |
   |---|---|
   | Framework preset | `Vue`（或 `None`，都一样） |
   | Build command | `npm ci && npm run build` |
   | Build output directory | `dist` |
   | Node version（环境变量） | `NODE_VERSION=22`（Vite 6 需要 Node 18+；不设也能跑，Cloudflare 默认已较新） |

4. Save and Deploy。之后每次 push 到生产分支会自动构建；其他分支/PR 会生成预览域名。

> 仓库里已带 `public/_headers`：`/assets/*` 长期缓存、`/` 与 `/index.html` 每次校验，
> 避免发版后访问者仍加载旧 bundle。

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

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 页面白屏、控制台 404 `assets/xxx.js` | 输出目录填错（应为 `dist`），或站点被挂在子路径且改了 `base`；保持 `base: './'` 即可 |
| 发版后界面没更新 | 检查 `_headers` 是否随构建产物上传（`dist/_headers` 是否存在）；确保 `/index.html` 是 `must-revalidate` |
| 刷新某个页面 404 | 不应该发生（hash 路由）；若你手动改成了 history 路由，需要加 `_redirects`：`/* /index.html 200` |
| 导入数据包失败/很慢 | 数据包有 10+ MB，属正常（导出流程实测约 30s 写入 14.5 万条）；建议本地导入一次后靠浏览器持久化保存，并在数据页点「申请持久化存储」 |
