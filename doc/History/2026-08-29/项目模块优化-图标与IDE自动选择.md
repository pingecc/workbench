# 项目模块优化：项目图标 + 按技术栈自动选择 IDE

> 类型：功能迭代 · 日期：2026-08-29

- 项目支持自定义图标（仿脚本模块）：编辑表单新增图标下拉（17 个预设 emoji）；扫描添加项目时按技术栈自动配图标（Java→☕ / Python→🐍 / React→⚛️ / Node.js→🟢 等，默认 📁）。
- DB 迁移 v2：`projects` 表新增 `icon` 列（默认 `📁`），老库启动时自动 ALTER，已有项目补默认图标；备份导出/导入同步 icon 字段。
- 「打开编辑器」改为按项目技术栈自动选择并回传实际使用的应用：Java / Gradle → IntelliJ IDEA（备选 IDEA CE），Python → PyCharm（备选 CE），React/Vue/Web/JS/TS/Node 等前端栈 → VS Code，未识别技术栈回退到设置里的默认编辑器；按 `/Applications` 与 `~/Applications` 实际安装探测，缺失时逐级回退，全缺失时给出中文错误提示。
- 修复一个判定陷阱：`javascript.includes('java')` 为真，曾导致 JS/TS 项目被误判为 Java；改为按 token 匹配（`Java`、`Java/Swing`、`Gradle`），验证矩阵 10 组用例全部正确。
- UI：项目卡片与列表行显示图标；编辑器按钮 tooltip 说明自动选择规则；点击后 Toast 提示实际使用的编辑器；设置页「默认编辑器」文案改为「技术栈无法匹配时使用」。
- 验证：typecheck / eslint / build / pack 通过；隔离实例（v1 旧库快照）启动后自动迁移到 v2，图标选择器与卡片渲染正常；端到端点击前端项目「编辑器」→ Toast「已用 Visual Studio Code 打开」；本机已装 IntelliJ IDEA / PyCharm / VS Code，三路解析均为首选应用。已重新打包 release .app 并重启应用。
