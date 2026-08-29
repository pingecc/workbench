import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ScanCandidate, Script, ScriptGroup, ScriptInput, Settings } from '../../../shared/types'
import { api } from '../api'
import LogPanel from '../components/LogPanel'
import Modal from '../components/Modal'
import { getSnapshot, resetStream, subscribe } from '../streamStore'

interface ScriptsPageProps {
  settings: Settings | null
  notify: (msg: string) => void
}

const ICON_PRESETS = ['📜', '🐚', '🐍', '🟨', '🚀', '⚙️', '🛠️', '🗄️', '📊', '🤖']
const COLOR_PRESETS = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'gray']
const EMPTY_FORM: ScriptInput = {
  name: '',
  path: '',
  description: '',
  kind: 'file',
  cwd: '',
  shell: 'zsh',
  icon: '📜',
  color: 'blue',
  confirm: false,
  groupId: null
}

export default function ScriptsPage({ settings, notify }: ScriptsPageProps): JSX.Element {
  const [scripts, setScripts] = useState<Script[]>([])
  const [groups, setGroups] = useState<ScriptGroup[]>([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<'all' | 'ungrouped' | number>('all')
  const [editing, setEditing] = useState<Script | 'new' | null>(null)
  const [form, setForm] = useState<ScriptInput>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanDir, setScanDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState<ScanCandidate[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [viewLog, setViewLog] = useState<Script | null>(null)
  const streams = useSyncExternalStore(subscribe, getSnapshot)

  const refresh = useCallback(async () => {
    const [s, g] = await Promise.all([api.listScripts(), api.listGroups()])
    setScripts(s)
    setGroups(g)
  }, [])

  useEffect(() => {
    void refresh()
    return api.onScriptStatus(() => {
      void refresh()
      void api.listScripts().then((s) => setScripts(s))
    })
  }, [refresh])

  const startEdit = (script: Script): void => {
    setForm({
      name: script.name,
      path: script.path,
      description: script.description,
      kind: script.kind,
      cwd: script.cwd,
      shell: script.shell,
      icon: script.icon,
      color: script.color,
      confirm: script.confirm,
      groupId: script.groupId
    })
    setEditing(script)
    setFormError('')
  }

  const startNew = (): void => {
    setForm({ ...EMPTY_FORM })
    setEditing('new')
    setFormError('')
  }

  const save = async (): Promise<void> => {
    try {
      if (editing && editing !== 'new') {
        await api.updateScript(editing.id, form)
      } else {
        await api.createScript(form)
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    }
  }

  const run = async (script: Script): Promise<void> => {
    if (script.confirm && !window.confirm(`确认执行「${script.name}」？`)) return
    try {
      resetStream(script.id)
      setViewLog(script)
      await api.runScript(script.id)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const removeScript = async (script: Script): Promise<void> => {
    if (!window.confirm(`删除脚本「${script.name}」？`)) return
    await api.deleteScript(script.id)
    await refresh()
  }

  const addGroup = (): void => {
    const name = window.prompt('新分组名称：')
    if (!name || !name.trim()) return
    void api.createGroup(name).then(refresh).catch((e) => notify(String(e)))
  }

  const renameGroup = (group: ScriptGroup): void => {
    const name = window.prompt('重命名分组：', group.name)
    if (!name || !name.trim() || name.trim() === group.name) return
    void api.renameGroup(group.id, name.trim()).then(refresh).catch((e) => notify(String(e)))
  }

  const removeGroup = async (group: ScriptGroup): Promise<void> => {
    if (!window.confirm(`删除分组「${group.name}」？（组内脚本会变为未分组）`)) return
    await api.deleteGroup(group.id)
    if (groupFilter === group.id) setGroupFilter('all')
    await refresh()
  }

  const startScan = async (dir: string): Promise<void> => {
    setScanning(true)
    setCandidates([])
    try {
      const found = await api.scanScripts(dir)
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
    const added = await api.addScriptsFromScan(paths)
    setScanOpen(false)
    await refresh()
    notify(`已添加 ${added} 个脚本`)
  }

  const q = search.trim().toLowerCase()
  const visible = scripts.filter((s) => {
    if (groupFilter === 'ungrouped' && s.groupId !== null) return false
    if (typeof groupFilter === 'number' && s.groupId !== groupFilter) return false
    if (q && !`${s.name} ${s.description} ${s.path}`.toLowerCase().includes(q)) return false
    return true
  })
  const view = settings?.scriptView ?? 'card'
  const roots = settings?.scanRoots ?? []
  const scanDirValue = scanDir || roots[0] || ''
  const countOf = (gid: number | null): number =>
    scripts.filter((s) => (gid === null ? s.groupId === null : s.groupId === gid)).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">脚本</h1>
          <p className="page-sub">集中管理常用脚本，点击卡片即可一键执行</p>
        </div>
        <div className="toolbar">
          <div className="segmented">
            <button className={view === 'card' ? 'active' : ''} onClick={() => setScriptView('card')}>
              卡片
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setScriptView('list')}>
              列表
            </button>
          </div>
          <button className="primary" onClick={startNew}>
            ＋ 添加脚本
          </button>
          <button onClick={() => setScanOpen(true)}>扫描目录</button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="search"
          placeholder="搜索脚本名称 / 描述 / 路径…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chip-row">
        <button className={`chip ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => setGroupFilter('all')}>
          全部 <span className="count">{scripts.length}</span>
        </button>
        <button
          className={`chip ${groupFilter === 'ungrouped' ? 'active' : ''}`}
          onClick={() => setGroupFilter('ungrouped')}
        >
          未分组 <span className="count">{countOf(null)}</span>
        </button>
        {groups.map((g) => (
          <div key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button
              className={`chip ${groupFilter === g.id ? 'active' : ''}`}
              onDoubleClick={() => renameGroup(g)}
              title="双击重命名"
              onClick={() => setGroupFilter(g.id)}
            >
              {g.name} <span className="count">{countOf(g.id)}</span>
            </button>
            <button className="chip-group-del" title="删除分组" onClick={() => void removeGroup(g)}>
              ×
            </button>
          </div>
        ))}
        <button className="chip" onClick={addGroup}>
          ＋ 分组
        </button>
      </div>

      {scripts.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">📜</div>
          <div className="empty-title">还没有脚本</div>
          <div className="empty-hint">
            点击「＋ 添加脚本」手动登记，或用「扫描目录」从项目文件夹自动发现 `.sh` / `.command` / `.py` / `.js` 脚本。
          </div>
          <button className="primary" onClick={startNew}>
            ＋ 添加第一个脚本
          </button>
        </div>
      )}

      {scripts.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">🔍</div>
          <div className="empty-title">没有匹配的脚本</div>
          <div className="empty-hint">换个关键词，或切换分组试试。</div>
        </div>
      )}

      {view === 'card' ? (
        <div className="card-grid">
          {visible.map((s) => (
            <ScriptCard
              key={s.id}
              script={s}
              status={streams[s.id]?.status ?? null}
              onRun={() => void run(s)}
              onStop={() => void api.stopScript(s.id)}
              onLog={() => setViewLog(s)}
              onEdit={() => startEdit(s)}
              onDelete={() => void removeScript(s)}
            />
          ))}
        </div>
      ) : (
        <div className="list-view">
          {visible.map((s) => (
            <ScriptRow
              key={s.id}
              script={s}
              status={streams[s.id]?.status ?? null}
              onRun={() => void run(s)}
              onStop={() => void api.stopScript(s.id)}
              onLog={() => setViewLog(s)}
              onEdit={() => startEdit(s)}
              onDelete={() => void removeScript(s)}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal title={editing === 'new' ? '添加脚本' : `编辑脚本 · ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="modal-body">
            <div className="form-row">
              <label>名称 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：黄金价格提醒"
              />
            </div>
            <div className="form-row">
              <label>描述</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="一句话说明这个脚本是干嘛的"
              />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>执行方式</label>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as 'file' | 'command' })}
                >
                  <option value="file">脚本文件（zsh/bash 执行）</option>
                  <option value="command">自定义命令</option>
                </select>
              </div>
              <div className="form-row">
                <label>执行 Shell</label>
                <select
                  value={form.shell}
                  onChange={(e) => setForm({ ...form, shell: e.target.value as 'zsh' | 'bash' })}
                >
                  <option value="zsh">zsh（macOS 默认）</option>
                  <option value="bash">bash</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <label>{form.kind === 'file' ? '脚本文件路径 *' : '命令内容 *'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  placeholder={form.kind === 'file' ? '/path/to/script.sh' : '如：python3 ~/tools/backup.py'}
                />
                {form.kind === 'file' && (
                  <button
                    onClick={() => {
                      void api.pickFile().then((p) => {
                        if (p) setForm({ ...form, path: p })
                      })
                    }}
                  >
                    选择…
                  </button>
                )}
              </div>
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>运行目录（可选）</label>
                <input
                  value={form.cwd ?? ''}
                  onChange={(e) => setForm({ ...form, cwd: e.target.value })}
                  placeholder="留空则用脚本所在目录"
                />
              </div>
              <div className="form-row">
                <label>分组</label>
                <select
                  value={form.groupId == null ? '' : String(form.groupId)}
                  onChange={(e) =>
                    setForm({ ...form, groupId: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">未分组</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>图标</label>
                <select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                  {ICON_PRESETS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>颜色</label>
                <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                  {COLOR_PRESETS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.confirm ?? false}
                onChange={(e) => setForm({ ...form, confirm: e.target.checked })}
              />
              执行前需要确认
            </label>
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
        <Modal title="扫描目录添加脚本" onClose={() => setScanOpen(false)} width={680}>
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
              {scanning && <button onClick={() => void api.cancelScriptScan()}>取消扫描</button>}
            </div>
            <div className="scan-list">
              {candidates.length === 0 && !scanning && (
                <div className="muted">扫描结果会显示在这里，勾选后点击“添加所选”。</div>
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
                      {c.name} <span className="tag">{c.ext}</span>
                    </div>
                    <div className="path">{c.path}</div>
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

      {viewLog && <LogPanel script={viewLog} notify={notify} onClose={() => setViewLog(null)} />}
    </>
  )

  function setScriptView(v: 'card' | 'list'): void {
    void api.updateSettings({ scriptView: v }).then(() => {
      window.dispatchEvent(new CustomEvent('settings-updated'))
    })
  }
}

interface ActionProps {
  script: Script
  status: string | null
  onRun: () => void
  onStop: () => void
  onLog: () => void
  onEdit: () => void
  onDelete: () => void
}

function StatusBadge({ status }: { status: string | null }): JSX.Element | null {
  if (!status) return null
  const label = status === 'running' ? '运行中' : status === 'success' ? '成功' : status
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {label}
    </span>
  )
}

function ScriptCard({ script, status, onRun, onStop, onLog, onEdit, onDelete }: ActionProps): JSX.Element {
  const running = status === 'running'
  return (
    <div className={`card c-${script.color}`}>
      <div className="card-head">
        <span className="icon-tile">{script.icon}</span>
        <span className="card-title" title={script.path}>
          {script.name}
        </span>
      </div>
      <div className="card-desc">{script.description || script.path}</div>
      <div className="card-meta">
        <StatusBadge status={status} />
        <span className="badge">{script.shell}</span>
        {script.runCount > 0 && <span className="badge">已运行 {script.runCount} 次</span>}
      </div>
      <div className="card-actions">
        {running ? (
          <button className="danger run-btn" onClick={onStop}>
            ■ 停止
          </button>
        ) : (
          <button className="primary run-btn" onClick={onRun}>
            ▶ 运行
          </button>
        )}
        <button className="icon-btn" title="查看日志" onClick={onLog}>
          📄
        </button>
        <button className="icon-btn" title="编辑" onClick={onEdit}>
          ✏️
        </button>
        <button className="icon-btn" title="删除" onClick={onDelete}>
          🗑️
        </button>
      </div>
    </div>
  )
}

function ScriptRow({ script, status, onRun, onStop, onLog, onEdit, onDelete }: ActionProps): JSX.Element {
  const running = status === 'running'
  return (
    <div className="list-row">
      <span className={`icon-tile c-${script.color}`} style={{ width: 30, height: 30, fontSize: 15 }}>
        {script.icon}
      </span>
      <span style={{ minWidth: 130, fontWeight: 600 }}>{script.name}</span>
      <span className="card-desc" style={{ flex: 1, minHeight: 0 }}>
        {script.description || script.path}
      </span>
      <StatusBadge status={status} />
      <span className="badge">{script.shell}</span>
      {running ? (
        <button className="danger" onClick={onStop}>
          停止
        </button>
      ) : (
        <button className="primary" onClick={onRun}>
          运行
        </button>
      )}
      <button className="icon-btn" title="日志" onClick={onLog}>
        📄
      </button>
      <button className="icon-btn" title="编辑" onClick={onEdit}>
        ✏️
      </button>
      <button className="icon-btn" title="删除" onClick={onDelete}>
        🗑️
      </button>
    </div>
  )
}
