import { useEffect, useState } from 'react'
import type { Settings, ThemeMode, ViewMode } from '../../../shared/types'
import { api } from '../api'

interface SettingsPageProps {
  settings: Settings | null
  onSaved: (settings: Settings) => void
  notify: (msg: string) => void
}

export default function SettingsPage({ settings, onSaved, notify }: SettingsPageProps): JSX.Element {
  const [form, setForm] = useState<Settings | null>(settings)
  const [newRoot, setNewRoot] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  if (!form) return <div className="muted">加载设置中…</div>

  const save = async (): Promise<void> => {
    const saved = await api.updateSettings(form)
    onSaved(saved)
    notify('设置已保存')
  }

  const addRoot = (): void => {
    const root = newRoot.trim()
    if (!root) return
    if (form.scanRoots.includes(root)) {
      notify('该根目录已存在')
      return
    }
    setForm({ ...form, scanRoots: [...form.scanRoots, root] })
    setNewRoot('')
  }

  const doExport = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.exportBackup()
      if (result) notify(`已导出备份：${result.filePath}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (): Promise<void> => {
    if (!window.confirm('导入备份将覆盖当前数据（导入前会自动备份现有数据），继续？')) return
    setBusy(true)
    try {
      const result = await api.importBackup()
      if (result) {
        const fresh = await api.getSettings()
        onSaved(fresh)
        notify(`导入完成：${result.scripts} 脚本 / ${result.projects} 项目 / ${result.groups} 分组`)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="settings-section">
        <h3>扫描根目录</h3>
        {form.scanRoots.length === 0 && <div className="muted">还没有根目录，添加一个用于自动发现脚本和 Git 项目。</div>}
        {form.scanRoots.map((root) => (
          <div className="setting-row" key={root}>
            <span style={{ flex: 1 }}>{root}</span>
            <button
              onClick={() => setForm({ ...form, scanRoots: form.scanRoots.filter((r) => r !== root) })}
            >
              移除
            </button>
          </div>
        ))}
        <div className="setting-row">
          <input
            type="text"
            placeholder="输入绝对路径，如 /Users/you/code"
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addRoot()
            }}
          />
          <button onClick={addRoot}>添加</button>
        </div>
      </div>

      <div className="settings-section">
        <h3>打开方式</h3>
        <div className="form-grid" style={{ maxWidth: 420 }}>
          <div className="form-row">
            <label>默认编辑器（技术栈无法匹配时使用）</label>
            <input value={form.editorApp} onChange={(e) => setForm({ ...form, editorApp: e.target.value })} />
          </div>
          <div className="form-row">
            <label>默认终端</label>
            <input value={form.terminalApp} onChange={(e) => setForm({ ...form, terminalApp: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>外观</h3>
        <div className="form-grid" style={{ maxWidth: 420 }}>
          <div className="form-row">
            <label>主题</label>
            <select
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value as ThemeMode })}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div className="form-row">
            <label>脚本页视图</label>
            <select
              value={form.scriptView}
              onChange={(e) => setForm({ ...form, scriptView: e.target.value as ViewMode })}
            >
              <option value="card">卡片</option>
              <option value="list">列表</option>
            </select>
          </div>
          <div className="form-row">
            <label>项目页视图</label>
            <select
              value={form.projectView}
              onChange={(e) => setForm({ ...form, projectView: e.target.value as ViewMode })}
            >
              <option value="card">卡片</option>
              <option value="list">列表</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>数据备份</h3>
        <div className="setting-row">
          <button disabled={busy} onClick={() => void doExport()}>
            导出 JSON 备份
          </button>
          <button disabled={busy} onClick={() => void doImport()}>
            导入恢复
          </button>
          <span className="muted">导入前会自动备份当前数据到应用数据目录</span>
        </div>
      </div>

      <button className="primary" onClick={() => void save()}>
        保存设置
      </button>
    </>
  )
}
