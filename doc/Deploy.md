# Deploy · 打包与发布

> 状态：定稿（v1.0 · 2026-08-29） · 最近更新：2026-08-29

## 1. 目标平台与产物

- macOS 单平台：Apple Silicon（arm64）与 Intel（x64）双架构。
- 产物：`.app`（是否再出 .dmg 待定）；不做自动更新。
- 命名：应用名 Workbench，界面产品名“工作台”。

## 2. 打包与构建流程

- 构建：`npm run build`（electron-vite 构建渲染/主进程/预加载）→ `npx electron-builder --mac --dir --arm64 --x64`。
- 产物：`release/mac/Workbench.app`（x64）与 `release/mac-arm64/Workbench.app`（arm64）。
- 签名：一期未签名（打包时自动跳过签名），首次打开需“右键 → 打开”；后续如需可申请免费 Apple ID 签名。
- 图标：暂用 Electron 默认图标，自定义应用图标列入 M3。
- 质量门：打包前先跑完 Test.md 功能验收清单。

## 3. 数据目录与备份

- 数据目录：Electron userData，即 `~/Library/Application Support/Workbench/`；主数据库 `workbench.db`。
- 备份：应用内一键导出 JSON（用户自选保存位置）；导入前自动把当前数据导出存档，再覆盖导入。
- 升级：表结构变更走 schema_version 迁移；升级前建议先导出备份；版本号与变更记录维护在 `doc/History/`。

## 4. 发布检查清单

- [ ] 版本号更新。
- [ ] `doc/History/` 记录变更。
- [ ] Test.md 验收清单全部通过。
- [ ] arm64 / x64 双架构冒烟运行。
- [ ] 未签名安装说明：首次打开需右键 → 打开（或系统设置允许“任何来源”）。
