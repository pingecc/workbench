# Skill 管理模块设计

> 类型：需求与设计决议 · 日期：2026-09-11

## 背景

本机的 AI 编程技能（SKILL.md 目录）散落在用户级（`~/.zcode/skills`）、项目级（各项目 `.zcode/skills`）等目录，没有总览：不知道装了哪些、每个是干嘛的、想编辑或删除要手动翻目录。Workbench 已有「扫描 → 清单勾选 → 登记」的成熟交互（脚本/项目模块），将其复用到技能资产上。

## 设计过程（两轮收敛）

- 第一轮提案包含健康校验、同名遮蔽检测、启停、导入导出、新建向导、使用统计等完整能力。
- 用户决策：现阶段只做「简单管理」——**知道每个 skill 是干嘛的、可以直接打开、可以删除**，其余全部砍掉。
- 最终定位：Workbench 第 4 个页签「技能」= 技能的启动台 + 带废纸篓保护的删除器。

## 决议记录

| # | 事项 | 结论 |
| --- | --- | --- |
| 1 | 模块形态 | 侧边栏第 4 项「技能」（备忘之后、设置之前），卡片/列表视图 + 搜索 |
| 2 | 核心能力 | 扫描登记、清单展示（名称/描述/路径/来源）、打开（Finder/VS Code）、删除 |
| 3 | 描述来源 | 读取 SKILL.md frontmatter 的 `description`；无 SKILL.md 用目录名 + 「未填写描述」 |
| 4 | 扫描识别规则 | 目录内存在 `SKILL.md` 即视为技能；支持「根目录即技能目录」（如 `~/.zcode/skills`）与「根目录下任意深度的 `.zcode/skills`」（项目级）两种形态 |
| 5 | 扫描根目录 | 复用 settings 存储（`skillScanRoots`），与项目模块 `scanRoots` 同模式；默认 `~/.zcode/skills`；在技能页扫描弹窗内管理，不进设置页 |
| 6 | 插件缓存 | 不扫描 `~/.zcode/cli/plugins/cache`（归插件管，删了会被重新生成或破坏插件），从源头规避误删 |
| 7 | 删除安全 | 走 `shell.trashItem()` 移入废纸篓（可恢复），二次确认弹窗显示名称+完整路径；失效条目仅「删除登记」不动磁盘 |
| 8 | 失效处理 | 磁盘为事实源、数据库只是索引：列表加载时逐条校验存在性并标记「已失效」，提供「清理失效」一键移除登记 |
| 9 | 打开方式 | Finder 打开目录 + 设置页默认编辑器（VS Code）打开目录，复用 `system.openFolder/openEditor` |
| 10 | 数据模型 | 单表 `skills`（path 唯一）；扫描根目录存 settings，不建 `scan_root` 表 |
| 11 | 备份 | `skills` 表纳入 JSON 备份导出/导入 |
| 12 | 明确不做 | 启停、健康校验、遮蔽检测、新建向导、导入导出、使用统计、AI 优化（留待有真实痛点再做） |

## 变更内容

- PRD：新增 §3.5 技能管理、场景 6、技能模块验收标准。
- Task：新增 M5 任务 T19–T22。
- Test：新增技能模块验收清单。
- 代码：`skills` 表（v4 迁移）、`services/skills.ts`（扫描/frontmatter 解析/登记/废纸篓删除/失效清理）、IPC + preload、`SkillsPage.tsx` + 侧边栏入口、备份纳入 skills、`skillScanRoots`/`skillView` 设置项。

## 验证方式

- `npm run typecheck`、`npx eslint src --max-warnings 0`、`npm run build` 全部通过。
- 服务层冒烟测试（隔离 userData + 临时技能目录夹具，Electron 主进程内运行真实 service 代码）14 项断言全部通过：扫描发现/跳过无 SKILL.md 目录、frontmatter 解析与引号剥离、无 frontmatter 回退目录名、登记/重扫 registered 标记、重扫同步描述、项目级 `.zcode/skills` 发现、userLevel 判定、外部删除后失效标记、清理失效计数、根目录本身是技能目录。
  - 冒烟中发现并修复 1 个 bug：遍历曾把技能目录的子目录直接跳过，导致项目级技能扫不出来（子目录的 SKILL.md 检查正是在进入时进行的，去掉多余的下钻限制后修复）。
- 手工验收（Test.md 技能模块清单 H11–H14）：待用户实测。
