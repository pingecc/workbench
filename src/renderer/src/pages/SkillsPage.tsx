import { useCallback, useEffect, useState } from 'react'
import type { Settings, Skill, SkillScanCandidate } from '../../../shared/types'
import { api } from '../api'
import Modal from '../components/Modal'

interface SkillsPageProps {
  settings: Settings | null
  notify: (msg: string) => void
  onCountChange?: (count: number) => void
}

export default function SkillsPage({ settings, notify, onCountChange }: SkillsPageProps): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanDir, setScanDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState<SkillScanCandidate[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [clearing, setClearing] = useState(false)

  const refresh = useCallback(async () => {
    const list = await api.listSkills()
    setSkills(list)
    onCountChange?.(list.length)
  }, [onCountChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const missingCount = skills.filter((s) => s.missing).length

  const open = (s: Skill, kind: 'folder' | 'editor'): void => {
    void api
      .openSkill(s.path, kind)
      .then((label) => {
        if (kind === 'editor') notify(`已用 ${label} 打开`)
      })
      .catch((err) => notify(err instanceof Error ? err.message : String(err)))
  }

  const remove = async (s: Skill): Promise<void> => {
    const msg = s.missing
      ? `技能「${s.name}」在磁盘上已不存在，仅移除登记？（不影响磁盘）`
      : `删除技能「${s.name}」？\n\n整个目录将移入废纸篓（可在废纸篓找回）：\n${s.path}`
    if (!window.confirm(msg)) return
    try {
      await api.deleteSkill(s.id)
      await refresh()
      notify(s.missing ? '已移除登记' : '已移入废纸篓')
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const clearMissing = async (): Promise<void> => {
    if (missingCount === 0) return
    if (!window.confirm(`有 ${missingCount} 个技能在磁盘上已不存在，清理它们的登记？`)) return
    setClearing(true)
    try {
      const removed = await api.clearMissingSkills()
      await refresh()
      notify(`已清理 ${removed} 条失效登记`)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setClearing(false)
    }
  }

  const roots = settings?.skillScanRoots ?? []
  const scanDirValue = scanDir || roots[0] || ''

  const openScan = (): void => {
    setScanDir('')
    setCandidates([])
    setChecked(new Set())
    setScanOpen(true)
  }

  const pickRoot = (): void => {
    void api.pickDirectory().then((p) => {
      if (!p) return
      setScanDir(p)
      if (!roots.includes(p)) {
        void api.updateSettings({ skillScanRoots: [...roots, p] }).then(() => {
          window.dispatchEvent(new CustomEvent('settings-updated'))
          notify('已添加为扫描根目录')
        })
      }
    })
  }

  const removeRoot = (): void => {
    if (!scanDirValue) return
    const next = roots.filter((r) => r !== scanDirValue)
    void api.updateSettings({ skillScanRoots: next }).then(() => {
      window.dispatchEvent(new CustomEvent('settings-updated'))
      setScanDir(next[0] ?? '')
      notify('已移除该扫描根目录')
    })
  }

  const startScan = async (dir: string): Promise<void> => {
    setScanning(true)
    setCandidates([])
    try {
      setCandidates(await api.scanSkills(dir))
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  const addChecked = async (): Promise<void> => {
    const paths = [...checked]
    if (paths.length === 0) return
    try {
      const { added, updated } = await api.addSkillsFromScan(paths, scanDirValue)
      setScanOpen(false)
      await refresh()
      notify(`新增 ${added} 个技能，更新 ${updated} 个`)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const q = search.trim().toLowerCase()
  const visible = skills.filter(
    (s) => !q || `${s.name} ${s.description} ${s.path}`.toLowerCase().includes(q)
  )
  const view = settings?.skillView ?? 'card'
  const found = candidates.filter((c) => !c.registered)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">技能</h1>
          <p className="page-sub">本机 AI 技能（SKILL.md）一张清单：看得见是干嘛的，可直接打开或删除</p>
        </div>
        <div className="toolbar">
          <div className="segmented">
            <button className={view === 'card' ? 'active' : ''} onClick={() => setSkillView('card')}>
              卡片
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setSkillView('list')}>
              列表
            </button>
          </div>
          <button className="primary" onClick={openScan}>
            扫描技能
          </button>
          {missingCount > 0 && (
            <button disabled={clearing} onClick={() => void clearMissing()}>
              {clearing ? '清理中…' : `清理失效（${missingCount}）`}
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="search"
          placeholder="搜索技能名称 / 描述 / 路径…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {skills.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">✨</div>
          <div className="empty-title">还没有登记技能</div>
          <div className="empty-hint">
            点击「扫描技能」自动发现 `~/.zcode/skills`（用户级）和各项目 `.zcode/skills`（项目级）里的技能，勾选后登记。
          </div>
          <button className="primary" onClick={openScan}>
            扫描技能
          </button>
        </div>
      )}

      {skills.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-ic">🔍</div>
          <div className="empty-title">没有匹配的技能</div>
          <div className="empty-hint">换个关键词试试。</div>
        </div>
      )}

      {view === 'card' ? (
        <div className="card-grid">
          {visible.map((s) => (
            <SkillCard key={s.id} skill={s} onOpen={open} onDelete={() => void remove(s)} />
          ))}
        </div>
      ) : (
        <div className="list-view">
          {visible.map((s) => (
            <div className="list-row" key={s.id}>
              <span className="icon-tile">✨</span>
              <span style={{ minWidth: 150, fontWeight: 600 }} title={s.path}>
                {s.name}
              </span>
              {s.missing && <span className="badge archived">已失效</span>}
              <span className="badge">{s.userLevel ? '用户级' : '项目级'}</span>
              <span className="card-desc" style={{ flex: 1, minHeight: 0 }}>
                {s.description || '未填写描述'}
              </span>
              <button className="icon-btn" title="打开文件夹" onClick={() => open(s, 'folder')}>
                📁
              </button>
              <button className="icon-btn" title="用编辑器打开" onClick={() => open(s, 'editor')}>
                🧑‍💻
              </button>
              <button className="icon-btn" title={s.missing ? '移除登记' : '删除（移入废纸篓）'} onClick={() => void remove(s)}>
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {scanOpen && (
        <Modal title="扫描技能" onClose={() => setScanOpen(false)} width={720}>
          <div className="modal-body">
            <div className="form-row">
              <label>扫描根目录</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={scanDirValue} onChange={(e) => setScanDir(e.target.value)}>
                  {roots.length === 0 && <option value="">（选择下方目录以添加根目录）</option>}
                  {roots.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button onClick={pickRoot}>选择目录…</button>
                {scanDirValue && roots.includes(scanDirValue) && (
                  <button onClick={removeRoot} title="从扫描根目录中移除（不影响磁盘）">
                    移除此根目录
                  </button>
                )}
              </div>
            </div>
            <div className="form-row">
              <button className="primary" disabled={scanning || !scanDirValue} onClick={() => void startScan(scanDirValue)}>
                {scanning ? '扫描中…' : '开始扫描'}
              </button>
              <span className="muted">识别规则：目录内含 SKILL.md 即为技能；插件缓存目录不参与扫描</span>
            </div>
            <div className="scan-list">
              {candidates.length === 0 && !scanning && (
                <div className="muted">扫描结果会显示在这里，勾选后登记；勾选已登记的技能可重新同步名称与描述。</div>
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
                      {c.registered && <span className="badge" style={{ marginLeft: 8 }}>已登记</span>}
                    </div>
                    <div className="path">{c.description || '未填写描述'}</div>
                    <div className="path">{c.path}</div>
                  </div>
                </label>
              ))}
            </div>
            {candidates.length > 0 && found.length === 0 && (
              <div className="muted">该目录下的技能都已登记，可勾选它们重新同步名称与描述。</div>
            )}
          </div>
          <div className="modal-foot">
            <button onClick={() => setScanOpen(false)}>取消</button>
            <button className="primary" disabled={checked.size === 0} onClick={() => void addChecked()}>
              登记所选（{checked.size}）
            </button>
          </div>
        </Modal>
      )}
    </>
  )

  function setSkillView(v: 'card' | 'list'): void {
    void api.updateSettings({ skillView: v }).then(() => {
      window.dispatchEvent(new CustomEvent('settings-updated'))
    })
  }
}

interface SkillCardProps {
  skill: Skill
  onOpen: (skill: Skill, kind: 'folder' | 'editor') => void
  onDelete: () => void
}

function SkillCard({ skill, onOpen, onDelete }: SkillCardProps): JSX.Element {
  return (
    <div className="card">
      <div className="card-head">
        <span className="icon-tile">✨</span>
        <span className="badge">{skill.userLevel ? '用户级' : '项目级'}</span>
        {skill.missing && <span className="badge archived">已失效</span>}
        <span className="card-title" title={skill.path}>
          {skill.name}
        </span>
      </div>
      <div className="card-desc">{skill.description || '未填写描述'}</div>
      <div className="card-meta">
        <span className="muted">{skill.path}</span>
      </div>
      <div className="card-actions">
        <button className="icon-btn" title="打开文件夹" onClick={() => onOpen(skill, 'folder')}>
          📁 文件夹
        </button>
        <button className="icon-btn" title="用默认编辑器（VS Code）打开" onClick={() => onOpen(skill, 'editor')}>
          🧑‍💻 编辑器
        </button>
        <button className="icon-btn" title={skill.missing ? '移除登记' : '删除（移入废纸篓）'} onClick={onDelete}>
          🗑️ 删除
        </button>
      </div>
    </div>
  )
}
