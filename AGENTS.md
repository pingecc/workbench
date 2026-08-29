# AGENTS.md · 项目约定

## 项目简介

Workbench 是一个本地桌面工作台（Electron + React 18 + TypeScript + better-sqlite3，macOS 单平台），两个核心模块：

- 脚本管理：脚本登记 / 分组 / 一键执行 / 实时流式日志 / 历史 5 条。
- 项目仓库管理：Git 仓库扫描登记 / 技术栈猜测 / 图标 / 按技术栈自动选择 IDE（Java→IDEA、Python→PyCharm、前端→VS Code）。

## 文档与变更记录规则

- 所有重要变更、决策、迭代的功能必须记录到 `doc/History/`，禁止散落在聊天记录里。
- 记录格式：先按日期建文件夹（`doc/History/YYYY-MM-DD/`），再在该文件夹内按标题创建 md 文件（如 `doc/History/2026-08-29/日志功能修复.md`）；同一日期多个主题就多个文件，不要合并。
- 每个 md 文件：首行标题（`# 标题`），下面用「类型 / 日期」说明行，正文用要点列出变更内容与验证方式。
- 项目文档（PRD / Plan / Task / Test / Deploy）在 `doc/` 根目录维护；`doc/README.md` 是文档索引，改动文档结构时要同步更新。

## 常用命令

```bash
npm run typecheck                                   # TS 检查（主进程 + 渲染进程）
npx eslint src --max-warnings 0                     # 代码规范
npm run build                                       # 构建到 out/
npm run pack:mac                                    # 打包 arm64（release/mac-arm64）
npx electron-builder --mac --dir --arm64 --x64      # 双架构打包
```

## 注意事项

- 数据库在 `~/Library/Application Support/Workbench/workbench.db`，里面是用户的真实脚本/项目数据，**不要清除或改动**；测试永远用隔离的临时 userData 或拷贝库。
- `node_modules/`、`out/`、`release/`、`*.log` 已 gitignore，不要提交。
- 应用未签名：验证打包产物用 `open` 直接启动即可，首次打开如需“右键 → 打开”。
- 沙箱环境：`rm -rf` 会被拒绝，清理用 `mktemp -d` 新建临时目录代替。
