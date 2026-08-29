import { useCallback, useEffect, useState } from 'react'
import type { Project, ProjectInput, ProjectStatus, ScanCandidate, Settings } from '../../../shared/types'
import { api } from '../api'
import Modal from '../components/Modal'

interface ProjectsPageProps {
  settings: Settings | null
  notify: (msg: string) => void
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '活跃',
  maintaining: '维护中',
  archived: '归档'
}

const PROJECT_ICON_PRESETS = ['📁', '🗂️', '☕', '🐍', '⚛️', '💚', '🟢', '🟨', '🔷', '🌐', '🚀', '🛠️', '🤖', '📊', '🧪', '🦀', '🐹', '🗄️']

interface FormState extends ProjectInput {
  techStackText: string
  tagsText: string
}

const EMPTY_FORM: FormState = {
  name: '',
  path: '',
  description: '',
  techStackText: '',
  tagsText: '',
  status: 'active',
  icon: '📁',
  remoteUrl: ''
}

export default function ProjectsPage({ settings, notify }: ProjectsPageProps): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanDir, setScanDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState<ScanCandidate[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setProjects(await api.listProjects())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startEdit = (p: Project): void => {
    setForm({
      name: p.name,
      path: p.path,
      description: p.description,
      techStackText: p.techStack.join(', '),
      tagsText: p.tags.join(', '),
      status: p.status,
      icon: p.icon || '📁',
      remoteUrl: p.remoteUrl
    })
    setEditing(p)
    setFormError('')
  }

  const startNew = (): void => {
    setForm({ ...EMPTY_FORM })
    setEditing('new')
    setFormError('')
  }

  const save = async (): Promise<void> => {
    const input: ProjectInput = {
      ...form,
      techStack: form.techStackText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: form.tagsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    try {
      if (editing && editing !== 'new') {
        await api.updateProject(editing.id, input)
      } else {
        await api.createProject(input)
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (p: Project): Promise<void> => {
    if (!window.confirm(`删除项目「${p.name}」？（仅从工作台移除，不影响本地文件）`)) return
    await api.deleteProject(p.id)
    await refresh()
  }

  const open = (p: Project, kind: 'folder' | 'terminal' | 'editor'): void => {
    void api
      .openProject(p.path, kind, kind === 'editor' ? p.techStack : undefined)
      .then((app) => {
        if (kind === 'editor') notify(`已用 ${app} 打开`)
      })
      .catch((err) => notify(err instanceof Error ? err.message : String(err)))
  }

  const copy = (p: Project): void => {
    void api.copyProjectPath(p.path)
    notify('路径已复制')
  }

  const refreshAllGit = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const updated = await api.refreshProjectGit(projects.map((p) => p.path))
      setProjects(updated)
      notify('Git 信息已刷新')
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  const startScan = async (dir: string): Promise<void> => {
    setScanning(true)
    setCandidates([])
    try {
      const found = await api.scanProjects(dir)
      setCandidates(found)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  const addChecked = async (): Promise<void> => {
    const paths = [...checked]
    if (paths.length === 0) return
    const added = await api.addProjectsFromScan(paths)
    setScanOpen(false)
    await refresh()
    notify(`已添加 ${added} 个项目`)
  }

  const q = search.trim().toLowerCase()
  const visible = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (
      q &&
      !`${p.name} ${p.description} ${p.tags.join(' ')} ${p.techStack.join(' ')} ${p.path}`.toLowerCase().includes(q)
    ) {
      return false
    }
    return true
  })
  const view = settings?.projectView ?? 'card'
  const roots = settings?.scanRoots ?? []
  const scanDirValue = scanDir || roots[0] || ''
  const countOf = (s: 'all' | ProjectStatus): number =>
    s === 'all' ? projects.length : projects.filter((p) => p.status === s).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">项目</h1>
          <p className="page-sub">把分散的代码仓库集中起来，随时想起每个项目是干嘛的</p>
        </div>
        <div className="toolbar">
          <div className="segmented">
            <button className={view === 'card' ? 'active' : ''} onClick={() => setProjectView('card')}>
              卡片
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setProjectView('list')}>
              列表
            </button>
          </div>
          <button className="primary" onClick={startNew}>
            ＋ 添加项目
          </button>
          <button onClick={() => setScanOpen(true)}>扫描根目录</button>
          <button disabled={refreshing} onClick={() => void refreshAllGit()}>
            {refreshing ? '刷新中…' : '刷新 Git 信息'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="search"
          placeholder="搜索项目名称 / 用途 / 标签 / 技术栈…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chip-row">
        {(['all', 'active', 'maintaining', 'archived'] as const).map((s) => (
          <button
            key={s}
            className={`chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? '全部' : STATUS_LABEL[s]} <span className="count">{countOf(s)}</span>
          </button>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">🗂️</div>
          <div className="empty-title">还没有项目</div>
          <div className="empty-hint">
            点击「＋ 添加项目」手动登记，或用「扫描根目录」自动发现 `~/pinge-system/code` 下的 Git 仓库（会自动读取 README 和猜测技术栈）。
          </div>
          <button className="primary" onClick={startNew}>
            ＋ 添加第一个项目
          </button>
        </div>
      )}

      {projects.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">🔍</div>
          <div className="empty-title">没有匹配的项目</div>
          <div className="empty-hint">换个关键词或状态筛选试试。</div>
        </div>
      )}

      {view === 'card' ? (
        <div className="card-grid">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={(kind) => open(p, kind)}
              onCopy={() => copy(p)}
              onEdit={() => startEdit(p)}
              onDelete={() => void remove(p)}
            />
          ))}
        </div>
      ) : (
        <div className="list-view">
          {visible.map((p) => (
            <div className="list-row" key={p.id}>
              <span className="icon-tile">{p.icon || '📁'}</span>
              <span style={{ minWidth: 150, fontWeight: 600 }}>{p.name}</span>
              <span className={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span>
              <span className="card-desc" style={{ flex: 1, minHeight: 0 }}>
                {p.description || p.path}
              </span>
              {p.branch && <span className="badge">{p.branch}</span>}
              {p.dirty && <span className="badge dirty">未提交</span>}
              <button className="icon-btn" title="打开文件夹" onClick={() => open(p, 'folder')}>
                📁
              </button>
              <button
                className="icon-btn"
                title="打开编辑器（按技术栈：Java→IntelliJ IDEA / Python→PyCharm / 前端→VS Code）"
                onClick={() => open(p, 'editor')}
              >
                🧑‍💻
              </button>
              <button className="icon-btn" title="在终端打开" onClick={() => open(p, 'terminal')}>
                ⌨️
              </button>
              <button className="icon-btn" title="复制路径" onClick={() => copy(p)}>
                📋
              </button>
              <button className="icon-btn" title="编辑" onClick={() => startEdit(p)}>
                ✏️
              </button>
              <button className="icon-btn" title="删除" onClick={() => void remove(p)}>
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal title={editing === 'new' ? '添加项目' : `编辑项目 · ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-row">
                <label>名称 *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-row">
                <label>维护状态</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                >
                  <option value="active">活跃</option>
                  <option value="maintaining">维护中</option>
                  <option value="archived">归档</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <label>图标</label>
              <select value={form.icon ?? '📁'} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                {PROJECT_ICON_PRESETS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>本地路径 *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  placeholder="/path/to/project"
                />
                <button
                  onClick={() => {
                    void api.pickDirectory().then((p) => {
                      if (p) setForm({ ...form, path: p })
                    })
                  }}
                >
                  选择…
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>用途说明</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="这个项目是干嘛的（扫描添加时会自动读取 README 作草稿）"
              />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>语言 / 技术栈（逗号分隔）</label>
                <input
                  value={form.techStackText}
                  onChange={(e) => setForm({ ...form, techStackText: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>标签（逗号分隔）</label>
                <input value={form.tagsText} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <label>Git 远程地址（可选）</label>
              <input value={form.remoteUrl ?? ''} onChange={(e) => setForm({ ...form, remoteUrl: e.target.value })} />
            </div>
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

      {scanOpen && (
        <Modal title="扫描根目录发现 Git 项目" onClose={() => setScanOpen(false)} width={720}>
          <div className="modal-body">
            <div className="form-row">
              <label>扫描根目录</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={scanDirValue} onChange={(e) => setScanDir(e.target.value)}>
                  {roots.length === 0 && <option value="">（请在设置中添加扫描根目录）</option>}
                  {roots.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    void api.pickDirectory().then((p) => {
                      if (p) setScanDir(p)
                    })
                  }}
                >
                  选择目录…
                </button>
              </div>
            </div>
            <div className="form-row">
              <button className="primary" disabled={scanning || !scanDirValue} onClick={() => void startScan(scanDirValue)}>
                {scanning ? '扫描中…' : '开始扫描'}
              </button>
              {scanning && <button onClick={() => void api.cancelProjectScan()}>取消扫描</button>}
            </div>
            <div className="scan-list">
              {candidates.length === 0 && !scanning && (
                <div className="muted">扫描结果会显示在这里（只发现包含 .git 的仓库），勾选后添加。</div>
              )}
              {candidates.map((c) => (
                <label key={c.path} className="scan-item">
                  <input
                    type="checkbox"
                    checked={checked.has(c.path)}
                    onChange={(e) => {
                      const next = new Set(checked)
                      if (e.target.checked) next.add(c.path)
                      else next.delete(c.path)
                      setChecked(next)
                    }}
                  />
                  <div className="info">
                    <div>
                      {c.name}
                      {(c.techStack?.length ?? 0) > 0 && (
                        <span className="muted"> · {c.techStack?.join(' / ')}</span>
                      )}
                    </div>
                    <div className="path">{c.path}</div>
                    {c.readmeDraft && <div className="path">{c.readmeDraft}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-foot">
            <button onClick={() => setScanOpen(false)}>取消</button>
            <button className="primary" disabled={checked.size === 0} onClick={() => void addChecked()}>
              添加所选（{checked.size}）
            </button>
          </div>
        </Modal>
      )}
    </>
  )

  function setProjectView(v: 'card' | 'list'): void {
    void api.updateSettings({ projectView: v }).then(() => {
      window.dispatchEvent(new CustomEvent('settings-updated'))
    })
  }
}

interface ProjectCardProps {
  project: Project
  onOpen: (kind: 'folder' | 'terminal' | 'editor') => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}

function ProjectCard({ project, onOpen, onCopy, onEdit, onDelete }: ProjectCardProps): JSX.Element {
  return (
    <div className="card">
      <div className="card-head">
        <span className="icon-tile">{project.icon || '📁'}</span>
        <span className={`badge ${project.status}`}>{STATUS_LABEL[project.status]}</span>
        <span className="card-title" title={project.path}>
          {project.name}
        </span>
      </div>
      <div className="card-desc">{project.description || project.path}</div>
      <div className="card-meta">
        {project.techStack.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
        {project.tags.map((t) => (
          <span key={t} className="badge">
            {t}
          </span>
        ))}
      </div>
      <div className="card-meta">
        {project.branch && <span className="badge">分支 {project.branch}</span>}
        {project.lastCommit && <span className="badge">{project.lastCommit}</span>}
        {project.dirty && <span className="badge dirty">有未提交改动</span>}
      </div>
      <div className="card-actions">
        <button className="icon-btn" title="打开文件夹" onClick={() => onOpen('folder')}>
          📁 文件夹
        </button>
        <button className="icon-btn" title="在终端打开" onClick={() => onOpen('terminal')}>
          ⌨️ 终端
        </button>
        <button
          className="icon-btn"
          title="打开编辑器（按技术栈：Java→IntelliJ IDEA / Python→PyCharm / 前端→VS Code）"
          onClick={() => onOpen('editor')}
        >
          🧑‍💻 编辑器
        </button>
        <button className="icon-btn" title="复制路径" onClick={onCopy}>
          📋
        </button>
      </div>
      <div className="card-actions">
        <button className="icon-btn" title="编辑" onClick={onEdit}>
          ✏️ 编辑
        </button>
        <button className="icon-btn" title="删除" onClick={onDelete}>
          🗑️ 删除
        </button>
      </div>
    </div>
  )
}
