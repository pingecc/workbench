import { useCallback, useEffect, useState } from 'react'
import type { Note, NoteInput, NotePriority } from '../../../shared/types'
import { api } from '../api'
import Modal from '../components/Modal'

type Filter = 'all' | 'todo' | 'idea'

interface NotesPageProps {
  notify: (msg: string) => void
  onCountChange: (n: number) => void
}

const PRIORITY_LABEL: Record<NotePriority, string> = {
  high: '高优先级',
  mid: '中优先级',
  low: '低优先级'
}

const PRIORITY_RANK: Record<NotePriority, number> = { high: 0, mid: 1, low: 2 }

const byPriorityThenCreated = (a: Note, b: Note): number =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt.localeCompare(a.createdAt)

const EMPTY_FORM: NoteInput = {
  type: 'todo',
  title: '',
  body: '',
  dueDate: null,
  priority: 'mid'
}

function localToday(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function NotesPage({ notify, onCountChange }: NotesPageProps): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [doneCollapsed, setDoneCollapsed] = useState(true)
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [form, setForm] = useState<NoteInput>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const refresh = useCallback(async () => {
    const list = await api.listNotes()
    setNotes(list)
    onCountChange(list.length)
  }, [onCountChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const q = search.trim().toLowerCase()
  const match = (n: Note): boolean => !q || `${n.title} ${n.body}`.toLowerCase().includes(q)
  const pendingTodos = notes.filter((n) => n.type === 'todo' && !n.done && match(n)).sort(byPriorityThenCreated)
  const doneTodos = notes.filter((n) => n.type === 'todo' && n.done && match(n)).sort(byPriorityThenCreated)
  const ideas = notes
    .filter((n) => n.type === 'idea' && match(n))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const showTodo = filter !== 'idea'
  const showIdea = filter !== 'todo'
  const totalVisible =
    (showTodo ? pendingTodos.length + doneTodos.length : 0) + (showIdea ? ideas.length : 0)
  const todoCount = notes.filter((n) => n.type === 'todo').length

  const startNew = (): void => {
    setForm({ ...EMPTY_FORM })
    setEditing('new')
    setFormError('')
  }

  const startEdit = (note: Note): void => {
    setForm({
      type: note.type,
      title: note.title,
      body: note.body,
      dueDate: note.dueDate,
      priority: note.priority
    })
    setEditing(note)
    setFormError('')
  }

  const save = async (): Promise<void> => {
    if (!form.title.trim()) {
      setFormError('标题不能为空')
      return
    }
    try {
      if (editing && editing !== 'new') {
        await api.updateNote(editing.id, form)
      } else {
        await api.createNote(form)
      }
      setEditing(null)
      setFormError('')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleDone = async (note: Note): Promise<void> => {
    try {
      await api.updateNote(note.id, { done: !note.done })
      await refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (note: Note): Promise<void> => {
    if (!window.confirm(`删除备忘「${note.title}」？`)) return
    await api.deleteNote(note.id)
    await refresh()
  }

  const actions = (note: Note): JSX.Element => (
    <div className="row-actions">
      <button className="icon-btn" title="编辑" onClick={() => startEdit(note)}>
        ✏️
      </button>
      <button className="icon-btn" title="删除" onClick={() => void remove(note)}>
        🗑️
      </button>
    </div>
  )

  const todoMeta = (note: Note): JSX.Element => (
    <div className="note-meta">
      <span className={`pri-badge pri-${note.priority}`}>{PRIORITY_LABEL[note.priority]}</span>
      {note.dueDate && (
        <span className={`due-badge ${note.dueDate < localToday() ? 'overdue' : ''}`}>
          ⏰ 截止 {note.dueDate === localToday() ? '今天' : note.dueDate}
        </span>
      )}
      <span>{fmtDateTime(note.createdAt)}</span>
      {actions(note)}
    </div>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">备忘</h1>
          <p className="page-sub">随手记录想法，管理待办任务；数据全部本地保存</p>
        </div>
        <div className="toolbar">
          <button className="primary" onClick={startNew}>
            ＋ 新建
          </button>
        </div>
      </div>

      <div className="search-wrap">
        <span className="search-ic">🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索标题 / 正文…" />
      </div>

      <div className="chip-row">
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          全部 <span className="count">{notes.length}</span>
        </button>
        <button className={`chip ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>
          ✅ 待办 <span className="count">{todoCount}</span>
        </button>
        <button className={`chip ${filter === 'idea' ? 'active' : ''}`} onClick={() => setFilter('idea')}>
          💡 想法 <span className="count">{notes.length - todoCount}</span>
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-ic">📝</div>
          <div className="empty-title">还没有备忘</div>
          <div className="empty-hint">
            点击「＋ 新建」记录一个想法，或创建一条带截止日期与优先级的待办。
          </div>
          <button className="primary" onClick={startNew}>
            ＋ 新建第一条备忘
          </button>
        </div>
      ) : totalVisible === 0 ? (
        <div className="empty-state">
          <div className="empty-ic">🔍</div>
          <div className="empty-title">没有匹配的备忘</div>
          <div className="empty-hint">换个关键词，或切换筛选试试。</div>
        </div>
      ) : null}

      {showTodo && pendingTodos.length > 0 && (
        <div className="note-panel">
          <div className="section-head">
            <span className="sec-title">待办</span>
            <span className="sec-count">{pendingTodos.length} 未完成</span>
          </div>
          <div className="note-list">
            {pendingTodos.map((note) => (
              <div className="note-row" key={note.id}>
                <input
                  type="checkbox"
                  className="note-check"
                  checked={note.done}
                  onChange={() => void toggleDone(note)}
                  title="标记完成"
                />
                <div className="note-main">
                  <div className="note-title">{note.title}</div>
                  {note.body && <div className="note-excerpt">{note.body}</div>}
                </div>
                {todoMeta(note)}
              </div>
            ))}
          </div>
        </div>
      )}

      {showTodo && doneTodos.length > 0 && (
        <div className="note-panel">
          <button className="collapse-btn" onClick={() => setDoneCollapsed((v) => !v)}>
            <span>✅</span> 已完成 <span className="sec-count">{doneTodos.length}</span>
            <span className={`chev ${doneCollapsed ? '' : 'open'}`}>▾</span>
          </button>
          <div className={`note-list ${doneCollapsed ? 'collapsed' : ''}`}>
            {doneTodos.map((note) => (
              <div className="note-row done" key={note.id}>
                <input
                  type="checkbox"
                  className="note-check"
                  checked={note.done}
                  onChange={() => void toggleDone(note)}
                  title="取消完成"
                />
                <div className="note-main">
                  <div className="note-title">{note.title}</div>
                  {note.body && <div className="note-excerpt">{note.body}</div>}
                </div>
                {todoMeta(note)}
              </div>
            ))}
          </div>
        </div>
      )}

      {showIdea && ideas.length > 0 && (
        <div className="note-panel">
          <div className="section-head">
            <span className="sec-title">想法</span>
            <span className="sec-count">{ideas.length}</span>
          </div>
          <div className="note-list">
            {ideas.map((note) => (
              <div className="note-row" key={note.id}>
                <div className="note-ic idea-ic">💡</div>
                <div className="note-main">
                  <div className="note-title">{note.title}</div>
                  {note.body && <div className="note-excerpt">{note.body}</div>}
                </div>
                <div className="note-meta">
                  <span>{fmtDateTime(note.createdAt)}</span>
                  {actions(note)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing !== null && (
        <Modal
          title={editing === 'new' ? '新建备忘' : `编辑备忘 · ${editing.title}`}
          onClose={() => setEditing(null)}
        >
          <div className="modal-body">
            <div className="type-seg">
              <button
                className={form.type === 'todo' ? 'active' : ''}
                onClick={() => setForm({ ...form, type: 'todo' })}
              >
                ✅ 待办
              </button>
              <button
                className={form.type === 'idea' ? 'active' : ''}
                onClick={() => setForm({ ...form, type: 'idea' })}
              >
                💡 想法
              </button>
            </div>
            <div className="form-row">
              <label>标题 *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="一句话描述（想法或任务）"
              />
            </div>
            <div className="form-row">
              <label>正文（可选）</label>
              <textarea
                rows={3}
                value={form.body ?? ''}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="补充细节、背景或行动步骤…"
              />
            </div>
            {form.type === 'todo' && (
              <div className="form-grid">
                <div className="form-row">
                  <label>截止日期（可选）</label>
                  <input
                    type="date"
                    value={form.dueDate ?? ''}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })}
                  />
                </div>
                <div className="form-row">
                  <label>优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as NotePriority })}
                  >
                    <option value="high">高</option>
                    <option value="mid">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>
            )}
            {formError && <div className="error-text">{formError}</div>}
          </div>
          <div className="modal-foot">
            <button onClick={() => setEditing(null)}>取消</button>
            <button className="primary" onClick={() => void save()}>
              保存
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
