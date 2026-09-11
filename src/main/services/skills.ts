import { existsSync, readFileSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import { shell } from 'electron'
import { getDb, nowIso } from '../db'
import type { Skill, SkillScanCandidate } from '../../shared/types'

interface SkillRow {
  id: number
  name: string
  description: string
  path: string
  source_root: string
  missing: number
  created_at: string
  last_seen_at: string
}

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    path: row.path,
    sourceRoot: row.source_root,
    userLevel: isUserLevelSkill(row.path),
    missing: row.missing === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  }
}

/** 读取 SKILL.md frontmatter 的 name / description；文件缺失或格式不整时返回空值 */
export function readSkillMeta(dir: string): { name: string; description: string; hasManifest: boolean } {
  const manifest = join(dir, 'SKILL.md')
  if (!existsSync(manifest)) return { name: basename(dir), description: '', hasManifest: false }
  let name = ''
  let description = ''
  try {
    const text = readFileSync(manifest, 'utf8')
    const lines = text.split(/\r?\n/)
    if (lines[0]?.trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim() === '---') break
        const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
        if (!m) continue
        const value = m[2].trim().replace(/^['"]|['"]$/g, '')
        if (m[1] === 'name') name = value
        if (m[1] === 'description') description = value
      }
    }
  } catch {
    /* 读不到就按无描述处理 */
  }
  return { name: name || basename(dir), description, hasManifest: true }
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.Trash',
  'Library',
  'target',
  'build',
  'dist',
  '__pycache__',
  '.venv',
  'venv'
])
const MAX_DEPTH = 8
const MAX_FOUND = 500

/** 扫描一个根目录：根目录本身或任意深度目录含 SKILL.md 即视为技能（.zcode 目录只深入其 skills 子目录） */
export function scanSkillRoot(root: string): SkillScanCandidate[] {
  const abs = root.trim()
  if (!abs || !existsSync(abs)) return []
  const found: string[] = []

  const walk = (dir: string, depth: number): void => {
    if (found.length >= MAX_FOUND || depth > MAX_DEPTH) return
    if (existsSync(join(dir, 'SKILL.md'))) {
      found.push(dir)
      return
    }
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (found.length >= MAX_FOUND) return
      if (!entry.isDirectory()) continue
      const name = entry.name
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      if (name === '.zcode') {
        const skillsDir = join(full, 'skills')
        if (existsSync(skillsDir)) walk(skillsDir, depth + 1)
        continue
      }
      if (name.startsWith('.')) continue
      walk(full, depth + 1)
    }
  }

  walk(abs, 0)

  const registered = new Set(
    (getDb().prepare('SELECT path FROM skills').all() as unknown as Array<{ path: string }>).map((r) => r.path)
  )
  return found.map((path) => {
    const meta = readSkillMeta(path)
    return { path, name: meta.name, description: meta.description, registered: registered.has(path) }
  })
}

/** 勾选登记：新技能插入，已登记的同步名称/描述；返回 { 新增, 更新 } */
export function addSkillsFromScan(paths: string[], sourceRoot: string): { added: number; updated: number } {
  const db = getDb()
  let added = 0
  let updated = 0
  const root = sourceRoot.trim()
  const ts = nowIso()
  for (const p of paths) {
    const abs = resolve(p)
    const meta = readSkillMeta(abs)
    const existing = db.prepare('SELECT id FROM skills WHERE path = ?').get(abs) as { id: number } | undefined
    if (existing) {
      db.prepare('UPDATE skills SET name = ?, description = ?, source_root = ?, missing = 0, last_seen_at = ? WHERE id = ?').run(
        meta.name,
        meta.description,
        root,
        ts,
        existing.id
      )
      updated++
    } else {
      db.prepare(
        `INSERT INTO skills (name, description, path, source_root, missing, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      ).run(meta.name, meta.description, abs, root, ts, ts)
      added++
    }
  }
  return { added, updated }
}

export function listSkills(): Skill[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM skills ORDER BY name COLLATE NOCASE').all() as unknown as SkillRow[]
  const out: Skill[] = []
  for (const row of rows) {
    // 磁盘是事实源：列表加载时校验存在性，标记失效/复活
    const missingNow = existsSync(row.path) ? 0 : 1
    if (row.missing !== missingNow) {
      db.prepare('UPDATE skills SET missing = ? WHERE id = ?').run(missingNow, row.id)
      row.missing = missingNow
    }
    out.push(toSkill(row))
  }
  return out
}

/** 删除技能：磁盘还在则移入废纸篓（可恢复），然后移除登记 */
export async function deleteSkill(id: number): Promise<void> {
  const row = getDb().prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined
  if (!row) throw new Error('技能不存在')
  if (existsSync(row.path)) {
    try {
      await shell.trashItem(row.path)
    } catch (err) {
      throw new Error(`移入废纸篓失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }
  getDb().prepare('DELETE FROM skills WHERE id = ?').run(id)
}

/** 清理失效登记（磁盘上已不存在的条目），返回清理数量 */
export function clearMissingSkills(): number {
  const db = getDb()
  const rows = db.prepare('SELECT id, path FROM skills WHERE missing = 1').all() as unknown as Array<{
    id: number
    path: string
  }>
  let removed = 0
  for (const row of rows) {
    if (!existsSync(row.path)) {
      db.prepare('DELETE FROM skills WHERE id = ?').run(row.id)
      removed++
    }
  }
  return removed
}

export function defaultSkillRoot(): string {
  return join(homedir(), '.zcode', 'skills')
}

export function isUserLevelSkill(path: string): boolean {
  return path.startsWith(join(homedir(), '.zcode'))
}
