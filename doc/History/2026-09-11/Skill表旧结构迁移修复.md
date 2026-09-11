# Skill 表旧结构迁移修复

> 类型：缺陷修复 · 日期：2026-09-11

## 现象

用户实测「扫描技能 → 勾选登记」时报错：`SqliteError: table skills has no column named source_root`。

## 原因

真实数据库（`~/Library/Application Support/Workbench/workbench.db`）中**早已存在一张旧结构的 `skills` 表**（含 `version` / `source` / `enabled` / `source_repo` / `source_commit` / `tags` 等列，推测为此前技能功能的实验残留；表内 0 行数据）。v4 迁移使用 `CREATE TABLE IF NOT EXISTS`，发现同名表即跳过建表，但仍把 `user_version` 推到 4——新代码按新结构 INSERT 时报列不存在。

## 修复

- `db.ts` 新增 **v5 自愈迁移** `ensureSkillsSchema`：
  - 检查 `PRAGMA table_info(skills)`，若表存在但缺 `source_root` 列（即旧结构），先 `ALTER TABLE skills RENAME TO skills_legacy_v0` **改名保留**（不删除任何东西；重名时用时间戳后缀兜底）；
  - 再按当前结构 `CREATE TABLE IF NOT EXISTS` 建表 + 索引。
- 用户重启应用时迁移自动执行，无需手动处理数据库。

## 验证方式

- **真实库拷贝冒烟**：把真实库复制到临时目录（userData 隔离），对其执行迁移——
  - `user_version` 变为 5；`skills` 表为当前结构（含 `source_root`）；旧表保留为 `skills_legacy_v0`；
  - 各表行数与迁移前快照完全一致（groups 0 / scripts 1 / projects 3 / notes 6 / run_history 5），数据无损；
  - 在迁移后的库上完成登记/读回，验证 `source_root` 插入正常。
- 原有技能服务冒烟（14 项断言）回归通过；`typecheck` / `eslint` / `build` 全部通过。

## 经验

- 对可能被外部/历史实验创建过的表名做迁移时，`CREATE TABLE IF NOT EXISTS` 会静默沿用不兼容结构；应当校验列结构（`PRAGMA table_info`），不符时改名重建，而不是假设表不存在。
