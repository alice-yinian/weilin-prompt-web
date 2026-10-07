# WeiLin 提示词助手 · 纯静态网页版 开发计划

> 状态：**已确认（2026-10-07）** —— 功能范围、数据方案、技术栈、界面形态、交付形态均已拍板
> 进度：**M0–M3 已交付**（骨架 / 核心逻辑 / 数据层 / 导入工具 / 编辑器可用），M4–M6 待继续
> 依据：上游仓库 `weilin9999/WeiLin-Comfyui-Tools`（克隆于 `../upstream-weilin`）、`weilin9999/WeiLin-Comfyui-Tools-panel`（克隆于 `../upstream-panel`）、数据仓库 `weilin9999/WeiLin-Comfyui-Tools-Prompt`
> 编写日期：2026-10-07

---

## 0. 决策摘要（已确认）

| 项 | 决策 |
|---|---|
| 功能范围 | **A 核心三件套**（提示词编辑器 / Tag 管理器 / 历史+收藏） + **C 翻译（词库离线翻译）+ 主标签片段** + **D 词典只读数据源（danbooru）** |
| 不做的模块 | Danbooru **管理界面**（词典仅作只读数据源）、随机模板库管理器、LoRA 文件/LoRA 管理器、云仓库、AI 对话窗口、图片转网页、ComfyUI 节点与悬浮球 |
| 数据存储 | 浏览器 **IndexedDB** |
| 原有数据导入 | **独立 Python CLI 小工具**：`.db` → JSON 数据包 →（网页内导入） |
| 技术栈 | **Vue 3 + Vite**，界面按 Web 习惯重新设计，仅移植纯逻辑 |
| 界面形态 | **常规单页应用**（左侧导航 + 主编辑器） |
| 交付形态 | **多文件静态站点**（默认） + **单 HTML 文件**（附加构建脚本） |
| 项目目录 | `weilin-prompt-web/`（可随时改名） |

---

## 1. 背景与目标

### 1.1 上游项目实测结构

| 维度 | 实测结果 |
|---|---|
| 前端 | Vue 3 + Vite SPA，`src/src/` 约 **29.4k 行**，单 UMD 产物注入 ComfyUI 页面 |
| 后端 | Python aiohttp，**83 条 HTTP 路由**全部集中在 `app/server/prompt_server.py`，前缀 `/weilin/prompt_ui/api/` |
| 宿主耦合 | 根 `__init__.py` 注册 3 个 ComfyUI 节点（依赖 `comfy.lora` / `folder_paths`），`js_node/weilin_prompt_ui_node.js` 注入 DOM widget —— **不可移植** |
| 数据 | 3 个 SQLite：`userdatas_<lang>_tags.db` / `_history.db` / `_danbooru.db`，另有旧版单文件 `userdatas_<lang>.db`（无 uuid 列） |
| 配置 | `init.json`（设置）、`tag_labels.json`（主标签片段）、`random_tag/*.json`（随机模板） |
| 词库规模 | 官方模板库实测：11 个一级分组 / 134 个二级分组 / 4086 个带中文释义的 tag / danbooru 表 **140,782** 行 |
| 许可 | 插件 GPL-2.0（LICENSE 为 GPLv2 全文，未声明 "or later"）；词库数据仓库 MIT；panel 仓库 GPL-3.0 |

### 1.2 目标

1. 做成一个**不依赖任何后端**的静态网页：双击/静态托管即可使用，数据全部留在浏览器。
2. 保留上游提示词编辑器的**手感与输出格式**（同样的权重语法、括号、隐藏逻辑、`<wlr:...>` 标签、末尾逗号规则），保证与 ComfyUI 工作流的提示词零差异。
3. 提供**独立导入工具**，把老用户已有的 `.db` 数据（含旧版单文件库）完整搬进浏览器。
4. 保留**与原插件互通**的导入导出能力（SQL / YAML / JSON / TXT），新项目里整理好的词库能导回原插件。

### 1.3 非目标

- ❌ 不做 ComfyUI 节点、节点列表窗口、`postMessage` 桥、悬浮球。
- ❌ 不做标签预览图生成（依赖 ComfyUI 队列）——导入包若带图，只做**展示**。
- ❌ 不做 LoRA 文件扫描 / Civitai 元数据 / LoRA 封面（浏览器读不到本地目录）。
- ❌ 不做 Danbooru 词库管理界面、随机模板库管理器、云仓库、AI 对话窗口。
- ❌ 不引入任何服务端组件；不承诺多设备同步。

---

## 2. 功能范围：上游 → 新版映射

图例：**移植**＝逻辑照搬并重写为纯前端；**重做**＝交互重新设计；**砍掉**＝不做。

### 2.1 提示词编辑器（保留，核心）

| 功能 | 上游实现 | 新版 |
|---|---|---|
| 提示词输入 + tag 卡片化 | `view/prompt_box/prompt_index.vue`（4189 行） | 重做（单页编辑器主区） |
| 权重 `(tag:1.2)`（支持负数） | `applyWeight()` :978-1115 | **移植** |
| 括号加/减层 `()[]{}<>` | `wrapWith()` / `removeLayer()` :1155-1193 | **移植** |
| 隐藏/禁用 tag（不进输出） | `toggleHidden()` :3989-4006 | **移植** |
| 拖拽排序 / 框选批量操作 | `handleDragStart` 等 | **移植** |
| 换行符 token | `handelLineToken` | **移植** |
| 全角→半角自动转换 | `handleInput` :1380-1392 | **移植**（设置可关） |
| Token 计数 | `calculateTokens()` :1510-1515（按空格切分） | **移植**（保持同口径） |
| 自动补全 | `triggerAutocomplete` + 后端打分 | **移植**打分算法，数据源改为本地词库 |
| LoRA 标签 `<wlr:...>` 编辑 | `applyLoraWeights()` :1136-1148、`lora_stack.vue` | **移植**（含 3/4 字段兼容） |
| 翻译（逐 tag / 整段） | 后端 `/prompt/local/translate` | **移植**离线算法（本地词库） |
| 历史记录自动保存 | `finishPromptPutItHistory()` :2122-2159 | **移植**（写入 IndexedDB） |
| 收藏 tag | `components/favour.vue` | **移植**（写入所选分组） |
| 一键清空 / 清空禁用标签 | `clearAllPrompt` / `clearDisabledTags` | **移植** |
| 一键随机 Tag | 模板引擎（后端） | **轻量重做**：选分组/二级分组 + 数量 → 随机抽取（见 §7.9） |
| 主标签片段（提示词片段） | `components/main_label_manager.vue` | **移植** + 重做界面 |
| 内嵌 Tag/LoRA 管理面板 | `prompt_index.vue` 内嵌段 | 拆成独立页面/抽屉（见 §8） |

### 2.2 Tag 管理器（保留）

| 功能 | 上游 | 新版 |
|---|---|---|
| 一级分组 / 二级分组 / 标签 CRUD | `tag_index.vue`（3068 行） | **移植** |
| 颜色、排序（移动插入） | `move_group` / `move_subgroup` / `move_tag`：靠重写 `create_time` | **移植同策略**（保证导出兼容） |
| 搜索 + 定位高亮 | `search_tags` | **移植**（前端内存索引） |
| 批量删除 / 批量选择 | `deleteSelectedTags` | **移植** |
| 导入 `.sql/.json/.txt/.yaml` | `import_tag.vue` | **移植**（改为本地解析写库） |
| 导出分组/二级分组/选中为 `.sql` | `shareCategory` / `shareCategorySecond` | **移植**（格式 1:1） |
| 导出选中为 `.yaml` | `shareSelectedTags` | **移植** |
| 标签预览图生成 | ComfyUI 队列 | **砍掉**（仅保留图片展示位） |
| 标签尺寸/显示选项 | localStorage | **移植** |

### 2.3 历史 / 收藏 / 主标签（保留）

| 功能 | 上游 | 新版 |
|---|---|---|
| 历史列表、搜索、删除、批量删除 | `history_manager/history_index.vue` | **移植**（软删除 → 真删除，导入时过滤已删除行） |
| 收藏列表、命名、改色、编辑、使用 | 同上 | **移植** |
| 一键载入历史到编辑器 | `useItem` | **移植** |
| 主标签片段 CRUD / 置顶 / 高亮 / 排序 / 导入导出 | `main_label_manager.vue` | **移植** + 重做界面 |

### 2.4 词典（danbooru，只读数据源 —— 已确认保留）

| 功能 | 上游 | 新版 |
|---|---|---|
| 词典数据（14 万条） | `danbooru_tag` 表 + `danbooru_manager.vue` 管理界面 | **保留数据、去掉管理界面**：由导入工具带出，网页内作为只读词典 |
| 离线翻译第二数据源 | `translate/local_translate.py` 回退查 `danbooru_tag` | **移植**（`tag_tags` 未命中 → 查词典） |
| 自动补全回退数据源 | `fast_autocomplete/autocomplete.py` tags 不足时补查 dict | **移植**（词库选择面板的搜索同样命中词典，只读结果标明来源） |
| 增删改 / 分页管理 / SQL 导入导出 | `danbooru_manager.vue`、`import_danbooru.vue` | **砍掉**（无写入口） |

### 2.5 明确砍掉的模块

`view/lora_manager/*`、`view/danbooru/*`、`view/cloud/*`、`view/ai_window/*`、`view/node_list/*`、`components/FloatingBall.vue`、`components/tranToWeb.vue`、`components/DraggableWindow.vue`（不再需要窗口系统）、`app/server/prompt_api/{lora_*,comfyui_workflow,tag_image_*,trigger_words,danbooru}.py` 的写接口、根 `__init__.py`、`js_node/`。

---

## 3. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 框架 | Vue 3.5 + Vite 6 + Pinia 3 | 与上游同源，纯逻辑可对照移植；构建产物即静态文件 |
| 路由 | vue-router 4（History 模式 + hash 兜底） | 多页面导航（编辑器/词库/历史/设置） |
| i18n | vue-i18n 11（zh_CN / en_US） | 直接搬运上游 `i18n/locales/*.js` 文案，省一遍翻译 |
| 存储 | **IndexedDB**，封装层优先 `idb`（4KB，无魔法）；若需复杂查询再评估 Dexie | 词库 14 万级数据，localStorage 放不下 |
| 序列化 | `js-yaml`（YAML 导入导出）、`uuidv7`（新建 uuid，与原插件同源） | 与上游格式对齐 |
| 打包 | Vite 多文件产物 + `vite-plugin-singlefile`（单文件构建） | 满足双交付形态 |
| 测试 | Vitest（core/data 单测） + Playwright（编辑器关键流程冒烟） | 见 §10 |
| 工具 | 导入工具用 **Python 3 标准库**（`sqlite3`/`json`/`argparse`/`zipfile`/`hashlib`），零第三方依赖 | 用户机器上无需装包 |

> **许可**：因复用上游代码与文案，新项目必须以 **GPL-2.0** 发布，保留版权声明与来源说明；若打包官方词库（MIT），在 `NOTICE` 中注明数据来源。

---

## 4. 数据层设计（IndexedDB）

数据库名 `weilin-prompt-web`，版本 1。

| Object Store | keyPath | 字段 | 索引 |
|---|---|---|---|
| `meta` | `key` | `{key, value}`：schemaVersion、lastImport、settings 快照 | – |
| `groups` | `p_uuid` | `{p_uuid, name, color, create_time, src_id}` | `create_time` |
| `subgroups` | `g_uuid` | `{g_uuid, p_uuid, name, color, create_time, src_id}` | `p_uuid`, `create_time` |
| `tags` | `t_uuid` | `{t_uuid, g_uuid, text, desc, color, create_time, image_path, image_status, src_id}` | `g_uuid`, `text`, `create_time` |
| `history` | `id`（自增） | `{id, tag, name, color, create_time}`（`tag` 为上游 JSON 字符串） | `create_time` |
| `favorites` | `id`（自增） | 同上 + `{name, color}` | `create_time` |
| `labels` | `id` | `{id, name, content, createdAt, updatedAt, pinned, highlighted, order}` | `order` |
| `dict`（只读，已确认保留） | `tag` | `{tag, color_id, translate, hot, aliases}` | `translate` |
| `blobs`（可选） | `key` | `{key, blob}` 预览图（`tag_images/<t_uuid>.*`） | – |

### 4.1 与上游 SQLite 的字段映射

上游分层**靠 uuid 而非外键**（`app/server/dao/dao.py` 的 `update_uuids*`）：

```
tag_groups.p_uuid           = 一级分组自身 key
tag_subgroups.p_uuid        = 父分组 p_uuid      tag_subgroups.g_uuid = 二级分组自身 key
tag_tags.g_uuid             = 父二级分组 g_uuid  tag_tags.t_uuid      = tag 自身 key
```

- 一律以 uuid 建关联，`id_index / group_id / subgroup_id` 仅作为 `src_id` 保留（旧库中可能与 uuid 不一致）。
- 排序沿用上游策略：**以 `create_time` 为准**（分组/二级升序、tag 降序；"移动"即重写相对 `create_time = reference ± 1`）。这样导出的 SQL 语义与原插件完全一致。
- 颜色默认值 `rgba(255, 123, 2, .4)`。
- 预览图：`image_path` 相对 `user_data/`（如 `tag_images/<t_uuid>.png`），缩略图 `tag_thumbs/<t_uuid>.webp`，`image_status ∈ {pending, generating, ready, null}`；新版只读展示。

### 4.2 内存索引（补全与搜索）

IndexedDB 无法高效做"包含"匹配，因此：

- 启动后异步构建 **内存索引**：`tags` 的 `{t_uuid, g_uuid, text, descLower, textLower, color}` 轻量数组；`dict` 表**懒加载**（首次用到补全/翻译时再灌入）。
- 前缀命中走 IndexedDB `text` 索引（`IDBKeyRange.bound(q, q + '\uffff')`），包含匹配走内存索引。
- 预估内存：4086 tags ≈ 数百 KB；14 万 dict ≈ 6–10 MB，可接受；若超阈值自动退化为"仅在词典面板启用"。

---

## 5. 数据导入方案（独立 Python 小工具）

### 5.1 用法

```bash
# 最简：指向插件根目录，自动发现 user_data/ 下的 db
python tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \
    --out weilin-data-zh_CN-20261007.json

# 也可直接指定三个文件（互不依赖，缺哪个少导哪个）
python tools/import_weilin_db.py \
    --tags-db  userdatas_zh_CN_tags.db \
    --history-db userdatas_zh_CN_history.db \
    --dict-db  userdatas_zh_CN_danbooru.db \
    --labels   tag_labels.json \
    --include-images --images-out images/ \
    --report import-report.txt

# 旧版单文件库（无 uuid 列）直接丢进来也行
python tools/import_weilin_db.py --tags-db userdatas_zh_CN.db --out old.json
```

参数：`--include-dict`（是否带 danbooru 词典，默认带）、`--include-images`（打包预览图）、`--keep-orphans`（孤儿行挂到"未分组"而非丢弃）、`--pretty`、`--out`、`--report`。

### 5.2 需要兼容的库版本

| 版本 | 特征 | 处理 |
|---|---|---|
| 旧版单文件 `userdatas_*.db` | `tag_groups/tag_subgroups/tag_tags` **无 uuid 列**；history/collect_history 同新版 | 生成 uuid 并按 `group_id` / `subgroup_id` 回填 |
| tags v2 | 有 uuid 列，但可能为 NULL/空/重复 | 补齐 + 去重（等价上游 `update_uuids` / `update_uuids_v3`） |
| tags v3 | 有 uuid 唯一索引，已清理 | 直接读 |
| tags v4 | 增加 `image_path` / `image_status` | 直接读 |
| danbooru v1/v2 | `hot` / `aliases` 可能缺列 | 缺列补默认 0 |

文件名匹配：`userdatas_*.db`，均支持 `default` / `zh_CN` / `en_US` 三种后缀；同时只取一套（优先带 lang 的）。

### 5.3 规范化步骤（工具内固定流水线）

1. 打开 db（只读，`file:...?mode=ro`，绝不修改用户原库），读取 `schema_version` 与 `PRAGMA table_info` 判定版本。
2. 缺失/空的 uuid → 生成 `uuid7` 并回填父引用。
3. 重复 uuid → 保留 `(create_time, id_index)` 最小者，其余改新 uuid 并重建其子级引用。
4. 孤儿行（父 uuid 查无此组）→ 记入报告；默认丢弃，`--keep-orphans` 时归入自动创建的「未分组」。
5. `history` / `collect_history`：剔除 `is_deleted = 1`；`tag` 字段尝试 `json.loads`，失败则按纯文本历史保留并在报告里标注。
6. `tag_labels.json`：解析 `{items, settings}`，同时兼容旧格式（纯数组）；旧 localStorage key `weilin_prompt_ui_main_labels_v1` 不在工具范围内（网页端提供粘贴导入）。
7. 图片：`--include-images` 时按 `t_uuid` 收集 `tag_images/`、`tag_thumbs/` 打进 zip 的 `images/` 目录。
8. 输出 bundle + 文本报告 + 数据校验和（sha256，按对象仓库分组）。

### 5.4 数据包格式（bundle）

```jsonc
{
  "format": "weilin-prompt-bundle",
  "formatVersion": 1,
  "generatedAt": 1759800000000,
  "generator": "import_weilin_db.py/1.0.0",
  "source": {
    "lang": "zh_CN",
    "dbFiles": [
      {"role": "tags", "file": "userdatas_zh_CN_tags.db", "schemaVersion": 4, "size": 4825088, "sha256": "…"}
    ],
    "hasImages": false
  },
  "counts": {"groups": 11, "subgroups": 134, "tags": 4086, "history": 21,
             "favorites": 0, "dict": 140782, "labels": 0, "images": 0},
  "data": {
    "groups":    [{"p_uuid": "…", "name": "人物", "color": "rgba(255, 123, 2, .4)",
                   "create_time": 1736580436, "src_id": 1}],
    "subgroups": [{"g_uuid": "…", "p_uuid": "…", "name": "对象", "color": "…",
                   "create_time": 1736580436, "src_id": 1}],
    "tags":      [{"t_uuid": "…", "g_uuid": "…", "text": "1girl", "desc": "1女孩",
                   "color": "…", "create_time": 1736580436,
                   "image_path": null, "image_status": null, "src_id": 1}],
    "history":   [{"tag": "{\"prompt\":\"…\",\"lora\":\"\",\"temp_prompt\":[…],\"temp_lora\":[]}",
                   "name": "", "color": "", "create_time": 1736589206, "src_id": 2}],
    "favorites": [],
    "dict":      [{"tag": "1girl", "color_id": 0, "translate": "", "hot": 0, "aliases": 0}],
    "labels":    {"items": [{"id": "…", "name": "…", "content": "…", "createdAt": 0,
                             "updatedAt": 0, "pinned": false, "highlighted": false, "order": 0}],
                  "settings": {"sortMode": "manual", "sortTimeDesc": true,
                               "sortNameAsc": true, "selectedId": null}}
  },
  "warnings": ["tag id_index=123 父二级分组不存在，已跳过"],
  "checksum": {"groups": "sha256:…", "subgroups": "sha256:…", "tags": "sha256:…"}
}
```

网页端导入流程：选择 `.json`（或含 `images/` 的 `.zip`）→ 校验 `format`/`formatVersion` → 事务分批写入（每批 1000 条 + 进度条）→ 冲突策略（默认：同 uuid 覆盖；可选合并/跳过）→ 重建内存索引 → 展示统计与告警。

---

## 6. 应用架构与目录结构

```
weilin-prompt-web/
├── index.html
├── package.json
├── vite.config.js                 # 多文件构建
├── vite.config.single.js          # 单文件构建（vite-plugin-singlefile）
├── src/
│   ├── main.js  App.vue  router.js
│   ├── core/                      # 纯逻辑，零 DOM / 零 IO，可单测
│   │   ├── prompt/
│   │   │   ├── convert.js         # 全角→半角
│   │   │   ├── tokenize.js        # 输入 → tokens（逗号/换行切分）
│   │   │   ├── serialize.js       # tokens → 提示词字符串（末尾逗号规则）
│   │   │   ├── weight.js          # (tag:1.2) 增删改
│   │   │   ├── brackets.js        # ()[]{}<> 加层/减层
│   │   │   ├── loraTag.js         # <wlr:name:mw:cw:tw> 生成/解析（兼容 3 字段）
│   │   │   └── tokenCount.js
│   │   ├── search/
│   │   │   ├── autocomplete.js    # 100/90/80/70/60/50 打分
│   │   │   └── offlineTranslate.js# 贪心最长子短语匹配
│   │   ├── random/pickRandom.js   # 轻量随机
│   │   └── exchange/              # 导入导出（与原插件 1:1 兼容）
│   │       ├── exportSQL.js  exportYAML.js
│   │       └── parseImport.js     # SQL/JSON/TXT/YAML → 记录
│   ├── data/
│   │   ├── db.js                  # IndexedDB 打开/升级/事务
│   │   ├── repos/{groups,subgroups,tags,history,favorites,labels,dict}.js
│   │   ├── bundle/{importBundle.js,exportBundle.js}
│   │   └── memoryIndex.js
│   ├── stores/{settings,editor,tags}.js     # Pinia
│   ├── ui/
│   │   ├── layout/{SideBar.vue,TopBar.vue}
│   │   ├── editor/{PromptEditor.vue,TagChip.vue,TagPickerPanel.vue,
│   │   │           LoraStackPanel.vue,SnippetPanel.vue,TranslatePanel.vue}
│   │   ├── pages/{TagManagerPage.vue,HistoryPage.vue,FavoritesPage.vue,
│   │   │          LabelsPage.vue,ImportExportPage.vue,SettingsPage.vue,AboutPage.vue}
│   │   └── common/{Dialog.vue,Toast.vue,ColorPicker.vue,EmptyState.vue}
│   └── i18n/{index.js,locales/{zh_CN.js,en_US.js}}   # 文案移植自上游
├── tools/import_weilin_db.py
└── docs/DEVELOPMENT-PLAN.md（本文件）
```

---

## 7. 核心逻辑移植规格（含上游定位）

> 以下规则来自对上游源码的逐行核对，是新版 `core/` 的**验收规格**。

### 7.1 分词与序列化

- **输入转换**（`prompt_index.vue:1558-1581`，各可开关）：`，`→`,`、`。`→`.`、`【】`→`[]`、`（）`→`()`、`《》`→`<>`。
- **分词**（`processInput()` :1518 / `parseNestedBrackets` :1584）：按 `,` 与 `\n` 切分、`trim()`、丢弃空段；**换行保留为独立 `\n` token**。
  - ⚠️ 上游括号栈逻辑被注释掉（:1598-1640），因此**括号内的逗号也会被切分**。新版默认保持此行为以确保输出一致，并把"括号保护"做成实验开关。
- **序列化**（`updateInputText()` :3894-3946，规范版本）：
  - 跳过 `isHidden` token；`\n` 原样输出；
  - 首个 token 无前缀，其余 `', ' + text`；
  - 当后一个非隐藏 token 是 `\n` 或已到末尾时补 `,`。
  - 结果形如：`a, b,` / `a,\nb, c,`（**每行末尾都带逗号，包括最后一行**）。
- 外部插入 tag（点击词库、载入历史、插入 LoRA）统一走 `', ' + tag + ','`（:3210-3268）。

### 7.2 权重与括号

- 权重写法就是字面量 `(tag:1.2)`；解析正则 `/:(-?\d+(\.\d+)?)$/`（:1005）、整体形式 `/^\((.*?):(-?\d+(\.\d+)?)\)$/`（:1033）。
- 权重设为 `1` 时移除权重并去掉一层外层括号（:1037-1046）。
- 括号层级 `(` `[` `{` `<` 成对加/减（:1160-1163）；转义形式 `tag_\(x\)` 需被正确识别（:1070-1081）。

### 7.3 隐藏 tag

- 双击或框选切换 `isHidden`；`\n` / `\t` token 不可隐藏（:3989-4006）。
- 隐藏 token **保留在 tokens 里但不进输出**，重新解析时重新锚定到最近的可见 token 之后/之前（:1765-1818）。

### 7.4 LoRA 标签

- 规范格式（4 字段）：`<wlr:<名称>:<模型权重>:<文本编码器权重>:<触发词权重>>`；生成端名称去掉 `.safetensors`，缺省权重为 `1`（`components/lora_stack.vue:300-319`、`lora_manager/lora_index.vue:721-740`）。
- 解析端**兼容旧 3 字段** `<wlr:name:mw:cw>`（上游后端 `__init__.py:344-405`：先匹配 4 字段，再匹配 3 字段，旧格式把 `tw := cw`）。
- ⚠️ 上游已知不一致：编辑器内识别 LoRA 的正则只认 3 字段（:1721），且 `applyLoraWeights` 重写时会把 4 字段降为 3 字段（:1127/:1139）。**新版统一为"生成 4 字段、解析兼容 3/4、编辑时保留 4 字段"**，并在变更日志中记录该差异。

### 7.5 自动补全

- 触发：取当前词、剥离 `[]{}`、小写、长度 ≤ 20（:3462-3500）。
- 打分（后端 `fast_autocomplete/autocomplete.py`）：`text` 精确 100 / 前缀 90 / 包含 80；`desc` 精确 70 / 前缀 60 / 包含 50；先查 tags，不足再从 dict（danbooru）补齐；按分数排序取前 `limit`（默认 **25**，可在设置里改）。
- 接受（:3575-3665）：回退到上一个 `[,\s]` 边界替换，写入 `tagText + ', '`，光标 +2。

### 7.6 离线翻译

- 算法（`translate/local_translate.py:28-51`）：按空白切词，从当前位置起**贪心尝试最长子短语**，先精确匹配 `tag_tags.text` → 返回 `desc` + `color`；否则匹配 `danbooru_tag.tag` → 返回 `translate` + `color_id`；都不命中则原样输出；结果按空格拼接。
- 取词前先剥离权重后缀 `:数字`（`extractText` :1256-1261）。

### 7.7 历史 / 收藏的数据结构

- 历史条目 `tag` 字段是 **JSON 字符串**：`{prompt, lora, temp_prompt, temp_lora}`，其中 `prompt` 为可见文本、`temp_prompt` 为完整 token 数组、`lora/temp_lora` 为可见/完整 LoRA 数组（:2122-2159）。
- 载入时兼容旧对象 `{tokens, lora}`（:3667-3710）。
- 收藏（`collect_history`）额外带 `name` 与 `color`；收藏 tag 功能写入的是 `tag_tags`（需选目标分组）。

### 7.8 主标签片段

- 条目结构：`{id, name, content, createdAt, updatedAt, pinned, highlighted, order}`；设置 `{sortMode, sortTimeDesc, sortNameAsc, selectedId}`（`main_label_manager.vue:115/132-183/372-391`）。
- 导入导出为 `weilin_prompt_labels_YYYYMMDD_HHMMSS.json`，兼容旧格式（纯数组）。
- 新版额外提供：从上游 localStorage key `weilin_prompt_ui_main_labels_v1` 粘贴导入（方便老用户迁移）。

### 7.9 一键随机（轻量版）

- 交互：在编辑器侧栏选「一级分组 / 二级分组（可多选）」+ 数量 N → 从这些范围里随机抽取 N 个 tag 文本，插入提示词。
- 输出规则与上游一致：`,` 连接 + **结尾补一个逗号**。
- 上游模板引擎 `random_tag_template.py:210-241` 有个怪癖：实际抽取数量是 `max - min + 1`（不是 min..max 随机）。轻量版不复制该行为；如未来要接模板系统，再按上游语义实现。

### 7.10 与原插件互通的导入导出

- **导出 SQL**（必须与上游 1:1，能被原插件 `import_tag.vue` 的解析器识别）：

```sql
INSERT OR REPLACE INTO "tag_groups" ("name", "color", "create_time", "p_uuid") VALUES ('人物', 'rgba(255, 123, 2, .4)', 1736580436, '<p_uuid>');
INSERT OR REPLACE INTO "tag_subgroups" ("name", "color", "create_time", "p_uuid", "g_uuid") VALUES ('对象', '…', 1736580436, '<p_uuid>', '<g_uuid>');
INSERT OR REPLACE INTO "tag_tags" ("text", "desc", "color", "create_time", "g_uuid", "t_uuid") VALUES ('1girl', '1女孩', '…', 1736580436, '<g_uuid>', '<t_uuid>');
```

  单引号按上游惯例转义为 `''`；导出 tag 时**重新生成 `t_uuid`**，但保留 `p_uuid` / `g_uuid`（与上游分享逻辑一致，`tag_index.vue:1363-1413`）。
- **导出 YAML**：`{tag文本: 中文释义}`，`js-yaml dump`。
- **导入 SQL**：按 `;` 切分，按语句中出现的表名分类，正则取 `name` 与末位 uuid（`import_tag.vue` 同规则）。
- **导入 JSON / TXT / YAML**：统一转成 `{text, desc}` 列表；TXT 每行 `text,desc` 取前两段；配色固定 `rgba(255, 123, 2, .4)`。

---

## 8. UI 设计（常规单页应用）

```
┌───────────────────────────────────────────────────────────────┐
│ TopBar：Logo │ 提示词编辑器 / 词库 / 历史 / 收藏 / 片段 / 设置  │  语言 · 主题 ·
├──────────┬──────────────────────────────────┬─────────────────┤
│ 侧栏      │  提示词编辑区                     │  右侧面板       │
│ ·一级分组  │  ┌ 大输入框（支持直接粘贴文本）┐   │  · 词库选择      │
│ ·二级分组  │  └────────────────────────────┘   │  · 补全/搜索      │
│ ·快捷动作  │  [tag 卡片流：拖拽 / 框选 / 权重] │  · 翻译结果      │
│  收藏/历史 │  隐藏区（灰显，不进输出）         │  · LoRA 标签      │
│          │  Token 计数 · 一键清空 · 复制      │  · 片段          │
└──────────┴──────────────────────────────────┴─────────────────┘
```

- **编辑器页**：中间主输入区 + tag 卡片流（点击选中、双击隐藏、拖拽排序、右键菜单：权重/括号/翻译/收藏/删除）；右侧抽屉式面板（词库/补全/翻译/LoRA/片段）可收起。
- **词库页**：左分组树 + 右侧标签网格（行内编辑、多选、批量删除/分享/导出），顶部导入导出入口。
- **历史页 / 收藏页**：列表 + 搜索 + 批量操作 + 一键载入编辑器。
- **片段页**：卡片式，支持置顶、高亮、拖拽排序、导入导出。
- **导入导出页**：数据包导入（进度条 + 报告）、整库导出备份、SQL/YAML/JSON/TXT 互转。
- **设置页**：语言、主题、自动转换开关、补全条数、默认分组颜色、数据清空与持久化存储申请（`navigator.storage.persist()`）。
- 响应式：≥1280px 三栏；<1024px 右侧面板变抽屉；编辑器在窄屏下全宽。

---

## 9. 构建与交付

| 产物 | 命令 | 说明 |
|---|---|---|
| 多文件站点 | `npm run build` | `dist/`，可部署任意静态托管或 `python -m http.server` |
| 单 HTML 文件 | `npm run build:single` | 内联 JS/CSS，`dist-single/index.html` |
| 导入工具 | 无构建 | `python tools/import_weilin_db.py` |

单文件模式的已知限制（需在 M6 实测确认，见 §12 风险 R3）：`file://` 下 IndexedDB / 动态导入 / `fetch` 行为因浏览器而异，必要时降级为「内存模式 + 手动导入导出 JSON」。

---

## 10. 测试与验收

### 10.1 单元测试（Vitest，`core/` 与 `data/`）

必须覆盖的对照样例（取自上游实现，作为回归基线）：

1. 序列化：`["a","b"]` → `a, b,`；`["a","\n","b","c"]` → `a,\nb, c,`；含隐藏 token 的输出。
2. 权重：`cat` + 1.2 → `(cat:1.2)`；`(cat:1.2)` 权重改 1 → `cat`；负数 `-1.5`；已转义括号 `a_\(b\)`。
3. 括号：`(a)[b]{c}<d>` 逐层加/减。
4. LoRA：生成 4 字段；解析 3 字段与 4 字段；名称去 `.safetensors`。
5. 补全打分排序与 limit；限制 20 字符。
6. 离线翻译：多词短语最长匹配、中英混合、未知词透传。
7. 导入导出：导出 SQL 文本快照比对；导入 SQL 解析回同样的记录集（round-trip）。
8. 历史 JSON 解析：新格式、旧格式 `{tokens, lora}`、损坏 JSON 容错。

### 10.2 端到端冒烟（Playwright）

编辑标签 → 改权重 → 隐藏 → 刷新页面（持久化）→ 载入历史 → 导出 SQL 文件内容断言 → 导入 bundle 后分组数/标签数断言。

### 10.3 真实数据验收

- 用官方模板库（`upstream-panel/tags_templete/userdatas_zh_CN.db`，4.7MB）跑完整导入：期望 **11 / 134 / 4086** 三级条数一致，报告无异常。
- 下载官方 danbooru SQL 包（14 万条）验证导入耗时与内存占用，并给出阈值（目标：桌面 Chrome 导入 < 20s）。
- **互通验收**：新版导出的 `.sql` 用上游 `import_tag.vue` 的解析规则（`;` 切分 + 表名分类 + 末位 uuid 提取）能 100% 识别；导出的 YAML 能被上游 `handleYAMLUpload` 读取。

---

## 11. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| **M0 骨架** | Vite + Vue3 + Pinia + Router + i18n（文案移植）+ 主题 + 单页布局壳 | `npm run dev` 出界面，中英切换、深浅色切换可用 |
| **M1 核心逻辑** | `core/` 全部模块 + 10.1 全部单测 | 单测全绿；序列化/权重/LoRA 输出与上游一致 |
| **M2 数据层 + 导入工具** | IndexedDB 封装、repos、bundle 导入导出、`tools/import_weilin_db.py` | 模板库 4.7MB 导入成功且条数吻合；词典 14 万条导入成功；报告生成 |
| **M3 编辑器页** | 主编辑区、tag 卡片流、右侧面板、补全、翻译、随机（轻量）、片段 | 手动冒烟全流程通过；刷新后状态保持 |
| **M4 词库页** | 分组/标签 CRUD、排序、搜索、批量操作、导入导出（SQL/YAML/JSON/TXT）、分享 | 导出 SQL 通过上游解析器互通验收 |
| **M5 历史/收藏/设置/导入导出页** | 历史与收藏管理、数据包导入 UI、整库备份、设置项 | 端到端冒烟（10.2）通过 |
| **M6 交付** | 单文件构建、README、NOTICE（GPL-2.0 + 数据来源）、性能与兼容性实测 | 两种产物均可用；许可与出处声明齐全 |

每完成一个里程碑，我会**实际跑起来验证**（构建 + 关键路径演示）再汇报，不交半成品。

---

## 12. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | **许可传染**：复用上游代码/文案 → 必须 GPL-2.0 | 新项目 `LICENSE` 用 GPL-2.0，`NOTICE` 注明来源仓库与版权；词库数据（MIT）单独注明 |
| R2 | 老库版本多样（无 uuid / 空 uuid / 重复 uuid / 孤儿行） | 导入工具按 §5.3 固定流水线处理，全部异常落进报告而非静默丢弃 |
| R3 | 单文件 + `file://` 下 IndexedDB 可能不可用 | M6 在 Chrome/Firefox/Safari 实测；不可用则单文件版降级为内存模式 + 手动 JSON 备份 |
| R4 | 14 万条词典的内存/导入开销 | 词典懒加载；超过阈值只在词典面板启用；给出导入耗时基准 |
| R5 | 浏览器清数据导致丢词库 | 设置页提供一键整库导出（bundle）；首次导入后提示申请持久化存储 |
| R6 | 与上游行为差异（括号保护、4 字段 LoRA） | 默认与上游一致；差异项做成开关并在 `CHANGELOG` 明确写出 |
| R7 | 在线翻译 CORS | 本期只保证**词库离线翻译**；在线 API 作为后续可选扩展，不列入验收 |
| R8 | i18n / 主题样式迁移量大 | 文案直接搬运上游 locale 文件，只补新增键；样式按新布局重写但复用配色变量 |

---

## 13. 决策定稿（2026-10-07）

| # | 事项 | 结论 |
|---|---|---|
| 1 | **danbooru 词典** | **保留**：导入工具带出词典数据，网页内作为**只读**数据源，用于离线翻译回退与自动补全回退（词库选择面板的搜索同样命中词典并标明来源）；不提供增删改与分页管理界面。 |
| 2 | **一键随机** | 采用**轻量版**（选一级/二级分组 + 数量随机抽取，输出以 `,` 连接并补结尾逗号），不实现上游模板库管理器。 |
| 3 | **项目/仓库命名** | `weilin-prompt-web`。 |

> 后续如需扩张范围（词典管理、随机模板系统、LoRA 列表导入、云仓库等），需单独确认并更新本计划。

---

*计划定稿。下一步：M0 骨架 → M1 核心逻辑 → M2 数据层与导入工具 → M3 编辑器 → M4 词库 → M5 历史/设置 → M6 交付；每个里程碑完成后跑真实验证再汇报。*
