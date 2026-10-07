# 来源与许可声明（NOTICE）

## 代码来源

本项目的提示词编辑逻辑（分词/序列化/权重/括号/隐藏/LoRA 标签语法/自动补全打分/离线翻译算法）
与导入导出格式（SQL / YAML / JSON / TXT）**移植自上游项目**：

- WeiLin-Comfyui-Tools —— https://github.com/weilin9999/WeiLin-Comfyui-Tools
  许可：GNU General Public License v2.0（见 LICENSE，版权归原作者 weilin9999 所有）

因此本项目同样以 **GPL-2.0** 发布，并保留原作者版权与来源说明。

## 数据来源

- 词库 / Danbooru 数据：https://github.com/weilin9999/WeiLin-Comfyui-Tools-Prompt —— MIT License
  官方模板词库（`tags_templete/userdatas_zh_CN.db`）来自 https://github.com/weilin9999/WeiLin-Comfyui-Tools-panel
  仅作为可选的初始数据来源，使用时需保留上述出处。

## 差异说明

本项目为**纯静态**实现（无 Python 服务端、无 ComfyUI 依赖），数据存储在浏览器 IndexedDB 中，
与原插件在以下方面存在有意为之的差异：

- **不包含任何 LoRA 相关功能**（上游的 `<wlr:…>` 标签语法、LoRA 面板与 LoRA 堆均已移除）
- 标签预览图改为**用户上传**（上游依赖 ComfyUI 生成），图片保存在浏览器本地并随数据包导出
- 不提供 LoRA 文件扫描、云仓库、AI 对话等依赖服务端/本地文件系统的功能
