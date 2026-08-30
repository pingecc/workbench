import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import { getDb, nowIso } from '../db'
import type { BackupSummary } from '../../shared/types'

interface BackupPayload {
  app: string
  version: number
  exportedAt: string
  groups: unknown[]
  scripts: unknown[]
  projects: unknown[]
  notes: unknown[]
  settings: unknown[]
  runHistory: unknown[]
}

function collect(): BackupPayload {
  const db = getDb()
  return {
    app: 'workbench',
    version: 1,
    exportedAt: nowIso(),
    groups: db.prepare('SELECT * FROM groups').all(),
    scripts: db.prepare('SELECT * FROM scripts').all(),
    projects: db.prepare('SELECT * FROM projects').all(),
    notes: db.prepare('SELECT * FROM notes').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    runHistory: db.prepare('SELECT * FROM run_history').all()
  }
}

export async function exportBackup(): Promise<BackupSummary | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const ts = nowIso().slice(0, 19).replace(/[:T]/g, '-')
  const result = await dialog.showSaveDialog(win, {
    title: '导出备份',
    defaultPath: join(app.getPath('desktop'), `workbench-backup-${ts}.json`),
    filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  const payload = collect()
  writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
  return {
    filePath: result.filePath,
    groups: payload.groups.length,
    scripts: payload.scripts.length,
    projects: payload.projects.length,
    runs: payload.runHistory.length,
    notes: payload.notes.length
  }
}

export async function importBackup(): Promise<BackupSummary | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: '导入备份',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null

  let payload: BackupPayload
  try {
    payload = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as BackupPayload
  } catch (err) {
    throw new Error(`备份文件解析失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!payload || !Array.isArray(payload.groups) || !Array.isArray(payload.projects) || !Array.isArray(payload.scripts)) {
    throw new Error('备份文件格式不正确')
  }

  const db = getDb()
  const backupDir = join(app.getPath('userData'), 'backups')
  mkdirSync(backupDir, { recursive: true })
  const prePath = join(backupDir, `pre-import-${nowIso().slice(0, 19).replace(/[:T]/g, '-')}.json`)
  writeFileSync(prePath, JSON.stringify(collect(), null, 2), 'utf8')
  const noteRows = Array.isArray(payload.notes) ? (payload.notes as Array<Record<string, unknown>>) : []

  db.transaction(() => {
    db.prepare('DELETE FROM run_history').run()
    db.prepare('DELETE FROM scripts').run()
    db.prepare('DELETE FROM groups').run()
    db.prepare('DELETE FROM projects').run()
    db.prepare('DELETE FROM notes').run()
    db.prepare('DELETE FROM settings').run()

    const insert = db.prepare(
      `INSERT INTO groups (id, name, sort_order) VALUES (@id, @name, @sort_order)`
    )
    for (const row of payload.groups as Array<Record<string, unknown>>) {
      insert.run({ id: row.id, name: row.name, sort_order: row.sort_order ?? 0 })
    }

    const insertScript = db.prepare(
      `INSERT INTO scripts (id, name, description, group_id, kind, path, cwd, shell, icon, color, confirm,
       run_count, last_run_at, created_at, updated_at)
       VALUES (@id, @name, @description, @group_id, @kind, @path, @cwd, @shell, @icon, @color, @confirm,
       @run_count, @last_run_at, @created_at, @updated_at)`
    )
    for (const row of payload.scripts as Array<Record<string, unknown>>) {
      insertScript.run({
        id: row.id,
        name: row.name ?? '',
        description: row.description ?? '',
        group_id: row.group_id ?? null,
        kind: row.kind ?? 'file',
        path: row.path ?? '',
        cwd: row.cwd ?? '',
        shell: row.shell ?? 'zsh',
        icon: row.icon ?? '📜',
        color: row.color ?? 'blue',
        confirm: row.confirm ?? 0,
        run_count: row.run_count ?? 0,
        last_run_at: row.last_run_at ?? null,
        created_at: row.created_at ?? nowIso(),
        updated_at: row.updated_at ?? nowIso()
      })
    }

    const insertProject = db.prepare(
      `INSERT INTO projects (id, name, path, description, tech_stack, tags, status, icon, remote_url, branch,
       last_commit, dirty, created_at, updated_at)
       VALUES (@id, @name, @path, @description, @tech_stack, @tags, @status, @icon, @remote_url, @branch,
       @last_commit, @dirty, @created_at, @updated_at)`
    )
    for (const row of payload.projects as Array<Record<string, unknown>>) {
      insertProject.run({
        id: row.id,
        name: row.name ?? '',
        path: row.path ?? '',
        description: row.description ?? '',
        tech_stack: row.tech_stack ?? '[]',
        tags: row.tags ?? '[]',
        status: row.status ?? 'active',
        icon: row.icon ?? '📁',
        remote_url: row.remote_url ?? '',
        branch: row.branch ?? '',
        last_commit: row.last_commit ?? '',
        dirty: row.dirty ?? 0,
        created_at: row.created_at ?? nowIso(),
        updated_at: row.updated_at ?? nowIso()
      })
    }

    const insertNote = db.prepare(
      `INSERT INTO notes (id, type, title, body, done, due_date, priority, created_at, updated_at, completed_at)
       VALUES (@id, @type, @title, @body, @done, @due_date, @priority, @created_at, @updated_at, @completed_at)`
    )
    for (const row of noteRows) {
      insertNote.run({
        id: row.id,
        type: row.type ?? 'idea',
        title: row.title ?? '',
        body: row.body ?? '',
        done: row.done ?? 0,
        due_date: row.due_date ?? null,
        priority: row.priority ?? 'mid',
        created_at: row.created_at ?? nowIso(),
        updated_at: row.updated_at ?? nowIso(),
        completed_at: row.completed_at ?? null
      })
    }

    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    for (const row of payload.settings as Array<{ key?: string; value?: string }>) {
      if (row.key && row.value) insertSetting.run(row.key, row.value)
    }

    const insertRun = db.prepare(
      `INSERT INTO run_history (id, script_id, status, exit_code, duration_ms, output, started_at, finished_at)
       VALUES (@id, @script_id, @status, @exit_code, @duration_ms, @output, @started_at, @finished_at)`
    )
    for (const row of payload.runHistory as Array<Record<string, unknown>>) {
      if (row.script_id == null) continue
      insertRun.run({
        id: row.id,
        script_id: row.script_id,
        status: row.status ?? 'success',
        exit_code: row.exit_code ?? null,
        duration_ms: row.duration_ms ?? null,
        output: row.output ?? '',
        started_at: row.started_at ?? nowIso(),
        finished_at: row.finished_at ?? null
      })
    }
  })()

  return {
    filePath: result.filePaths[0],
    groups: payload.groups.length,
    scripts: payload.scripts.length,
    projects: payload.projects.length,
    runs: payload.runHistory.length,
    notes: noteRows.length,
    preBackupPath: prePath
  }
}
