# WeiLin 提示词助手 · 纯静态网页版

从 [WeiLin-Comfyui-Tools](https://github.com/weilin9999/WeiLin-Comfyui-Tools) 移植的**纯静态**提示词助手：
没有 Python 后端、不依赖 ComfyUI，所有数据保存在浏览器 **IndexedDB** 里，可部署到任意静态托管。

- 提示词编辑器：权重 `(tag:1.2)`、括号分层、隐藏标签、拖拽排序、框选批量操作、自动补全、离线翻译、LoRA 标签、一键随机、主标签片段
- 词库管理：一级分组 / 二级分组 / 标签 的增删改查、排序、搜索、导入导出（SQL / YAML / JSON / TXT，与原插件互通）
- 历史记录与收藏
- 导入原插件数据库：`tools/import_weilin_db.py` 把 `user_data/*.db` 转成数据包，再在网页里导入

## 快速开始

```bash
npm install
npm run dev          # 开发预览
npm run build        # 多文件静态站点 -> dist/
npm run build:single # 单 HTML 文件  -> dist-single/index.html
npm test             # 单元测试
python3 -m http.server -d dist 8000   # 预览构建产物
```

## 从原插件迁移数据

```bash
# 1) 转换（零第三方依赖，只读打开原库，不会修改你的数据）
python3 tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \
    --out weilin-data-zh_CN.json --report import-report.txt

# 需要预览图时打包成 zip（网页里可直接导入 zip）
python3 tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \
    --include-images --out weilin-data-zh_CN.json

# 2) 打开网页 -> 「数据导入导出」-> 选择数据包 -> 导入
```

工具支持：

- 新版三文件库 `userdatas_<lang>_{tags,history,danbooru}.db`
- 旧版单文件库 `userdatas_<lang>.db`（无 uuid 列，会自动补齐并按父子关系回填）
- 缺列 / 空 uuid / 重复 uuid / 孤儿行都会自动修复，并在报告中列出

## 与原插件的差异

详见 [NOTICE.md](./NOTICE.md)：LoRA 标签统一为 4 字段（兼容解析 3 字段）、隐藏标签的匹配策略更可预期、
不提供标签预览图生成 / LoRA 文件扫描 / 云仓库 / AI 对话等依赖服务端与本地文件系统的功能。

## 许可

GPL-2.0（见 [LICENSE](./LICENSE)），版权归上游作者 weilin9999 与本项目贡献者共同所有。
