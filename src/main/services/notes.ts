import { getDb, nowIso } from '../db'
import type { Note, NoteInput, NotePriority, NoteType } from '../../shared/types'

interface NoteRow {
  id: number
  type: NoteType
  title: string
  body: string
  done: number
  due_date: string | null
  priority: NotePriority
  created_at: string
  updated_at: string
  completed_at: string | null
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    done: row.done === 1,
    dueDate: row.due_date,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}

export function listNotes(): Note[] {
  const rows = getDb()
    .prepare('SELECT * FROM notes ORDER BY done ASC, created_at DESC')
    .all() as unknown as NoteRow[]
  return rows.map(toNote)
}

export function getNote(id: number): Note | null {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
  return row ? toNote(row) : null
}

export function createNote(input: NoteInput): Note {
  const title = input.title.trim()
  if (!title) throw new Error('标题不能为空')
  const type: NoteType = input.type === 'idea' ? 'idea' : 'todo'
  const ts = nowIso()
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO notes (type, title, body, done, due_date, priority, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL)`
    )
    .run(
      type,
      title,
      input.body ?? '',
      type === 'todo' ? input.dueDate || null : null,
      type === 'todo' ? input.priority ?? 'mid' : 'mid',
      ts,
      ts
    )
  const created = getNote(Number(result.lastInsertRowid))
  if (!created) throw new Error('创建备忘失败')
  return created
}

export function updateNote(id: number, patch: Partial<NoteInput> & { done?: boolean }): Note {
  const existing = getNote(id)
  if (!existing) throw new Error('备忘不存在')
  const type: NoteType = patch.type === 'idea' ? 'idea' : patch.type === 'todo' ? 'todo' : existing.type
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : existing.done ? 1 : 0
  const completedAt = patch.done !== undefined ? (patch.done ? nowIso() : null) : existing.completedAt
  getDb()
    .prepare(
      `UPDATE notes SET type = ?, title = ?, body = ?, done = ?, due_date = ?, priority = ?,
       updated_at = ?, completed_at = ? WHERE id = ?`
    )
    .run(
      type,
      patch.title !== undefined ? patch.title.trim() : existing.title,
      patch.body !== undefined ? patch.body : existing.body,
      done,
      type === 'todo' ? (patch.dueDate !== undefined ? patch.dueDate || null : existing.dueDate) : null,
      type === 'todo' ? patch.priority ?? existing.priority : 'mid',
      nowIso(),
      completedAt,
      id
    )
  const updated = getNote(id)
  if (!updated) throw new Error('更新备忘失败')
  return updated
}

export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}
