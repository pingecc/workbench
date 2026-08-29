import { promises as fsp } from 'fs'
import { basename, extname, join, resolve } from 'path'
import { getDb, nowIso } from '../db'
import type { RunRecord, ScanCandidate, Script, ScriptGroup, ScriptInput } from '../../shared/types'

interface ScriptRow {
  id: number
  name: string
  description: string
  group_id: number | null
  kind: 'file' | 'command'
  path: string
  cwd: string
  shell: 'zsh' | 'bash'
  icon: string
  color: string
  confirm: number
  run_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

interface GroupRow {
  id: number
  name: string
  sort_order: number
}

interface RunRow {
  id: number
  script_id: number
  status: RunRecord['status']
  exit_code: number | null
  duration_ms: number | null
  output: string
  started_at: string
  finished_at: string | null
}

function toScript(row: ScriptRow): Script {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupId: row.group_id,
    kind: row.kind,
    path: row.path,
    cwd: row.cwd,
    shell: row.shell,
    icon: row.icon,
    color: row.color,
    confirm: row.confirm === 1,
    runCount: row.run_count,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toGroup(row: GroupRow): ScriptGroup {
  return { id: row.id, name: row.name, sortOrder: row.sort_order }
}

function toRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    scriptId: row.script_id,
    status: row.status,
    exitCode: row.exit_code,
    durationMs: row.duration_ms,
    output: row.output,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  }
}

export function listScripts(): Script[] {
  const rows = getDb()
    .prepare('SELECT * FROM scripts ORDER BY group_id, name COLLATE NOCASE')
    .all() as unknown as ScriptRow[]
  return rows.map(toScript)
}

export function getScript(id: number): Script | null {
  const row = getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(id) as ScriptRow | undefined
  return row ? toScript(row) : null
}

export function createScript(input: ScriptInput): Script {
  if (!input.name.trim() || !input.path.trim()) {
    throw new Error('名称与执行内容不能为空')
  }
  const ts = nowIso()
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO scripts (name, description, group_id, kind, path, cwd, shell, icon, color, confirm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.description ?? '',
      input.groupId ?? null,
      input.kind ?? 'file',
      input.path.trim(),
      input.cwd ?? '',
      input.shell ?? 'zsh',
      input.icon ?? '📜',
      input.color ?? 'blue',
      input.confirm ? 1 : 0,
      ts,
      ts
    )
  const created = getScript(Number(result.lastInsertRowid))
  if (!created) throw new Error('创建脚本失败')
  return created
}

export function updateScript(id: number, input: Partial<ScriptInput>): Script {
  const existing = getScript(id)
  if (!existing) throw new Error('脚本不存在')
  const next = { ...existing, ...input }
  getDb()
    .prepare(
      `UPDATE scripts SET name = ?, description = ?, group_id = ?, kind = ?, path = ?, cwd = ?,
       shell = ?, icon = ?, color = ?, confirm = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      next.name,
      next.description ?? '',
      next.groupId ?? null,
      next.kind,
      next.path,
      next.cwd ?? '',
      next.shell,
      next.icon,
      next.color,
      next.confirm ? 1 : 0,
      nowIso(),
      id
    )
  return getScript(id) as Script
}

export function deleteScript(id: number): void {
  getDb().prepare('DELETE FROM scripts WHERE id = ?').run(id)
}

export function listGroups(): ScriptGroup[] {
  const rows = getDb().prepare('SELECT * FROM groups ORDER BY sort_order, name COLLATE NOCASE').all() as unknown as GroupRow[]
  return rows.map(toGroup)
}

export function createGroup(name: string): ScriptGroup {
  if (!name.trim()) throw new Error('分组名称不能为空')
  const db = getDb()
  const dup = db.prepare('SELECT id FROM groups WHERE name = ?').get(name.trim()) as GroupRow | undefined
  if (dup) throw new Error('分组已存在')
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM groups').get() as { m: number }
  const result = db.prepare('INSERT INTO groups (name, sort_order) VALUES (?, ?)').run(name.trim(), maxOrder.m + 1)
  const created = db.prepare('SELECT * FROM groups WHERE id = ?').get(Number(result.lastInsertRowid)) as GroupRow
  return toGroup(created)
}

export function renameGroup(id: number, name: string): ScriptGroup {
  getDb().prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), id)
  const row = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow
  return toGroup(row)
}

export function deleteGroup(id: number): void {
  getDb().prepare('DELETE FROM groups WHERE id = ?').run(id)
}

const SCRIPT_EXTS = new Set(['.sh', '.command', '.py', '.js'])
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'build',
  'dist',
  '.Trash',
  'Library'
])
const MAX_SCAN = 2000

let scanToken = 0

export function cancelScan(): void {
  scanToken++
}

export async function scanScripts(root: string): Promise<ScanCandidate[]> {
  const token = ++scanToken
  const out: ScanCandidate[] = []
  const seen = new Set<string>()
  const db = getDb()
  const existingRows = db.prepare('SELECT path FROM scripts').all() as unknown as Array<{ path: string }>
  for (const row of existingRows) seen.add(resolve(row.path))

  const walk = async (dir: string): Promise<void> => {
    if (scanToken !== token) throw new Error('cancelled')
    if (out.length >= MAX_SCAN) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (scanToken !== token) throw new Error('cancelled')
      if (out.length >= MAX_SCAN) return
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SCRIPT_EXTS.has(ext) && !seen.has(resolve(full))) {
          out.push({ path: full, name: entry.name, ext: ext.slice(1) })
        }
      }
    }
  }

  await walk(root)
  return out
}

export function addScriptsFromPaths(paths: string[]): number {
  const db = getDb()
  const existing = new Set(
    (db.prepare('SELECT path FROM scripts').all() as unknown as Array<{ path: string }>).map((r) => resolve(r.path))
  )
  let added = 0
  for (const p of paths) {
    const abs = resolve(p)
    if (existing.has(abs)) continue
    const name = basename(abs, extname(abs))
    createScript({ name, path: abs, kind: 'file' })
    existing.add(abs)
    added++
  }
  return added
}

export function runHistory(scriptId: number): RunRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM run_history WHERE script_id = ? ORDER BY id DESC LIMIT 5')
    .all(scriptId) as unknown as RunRow[]
  return rows.map(toRun)
}

export function clearHistory(scriptId: number): void {
  getDb().prepare('DELETE FROM run_history WHERE script_id = ?').run(scriptId)
}
