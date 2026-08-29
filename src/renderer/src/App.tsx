import { useCallback, useEffect, useState } from 'react'
import type { Settings, ThemeMode } from '../../shared/types'
import { api } from './api'
import ProjectsPage from './pages/ProjectsPage'
import ScriptsPage from './pages/ScriptsPage'
import SettingsPage from './pages/SettingsPage'
import { handleLog, handleStatus } from './streamStore'

type Tab = 'scripts' | 'projects' | 'settings'

function resolveTheme(mode: ThemeMode, osDark: boolean): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return osDark ? 'dark' : 'light'
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('scripts')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [scriptCount, setScriptCount] = useState(0)
  const [projectCount, setProjectCount] = useState(0)

  const loadSettings = useCallback(() => {
    void api.getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    void loadSettings()
    const offLog = api.onScriptLog(handleLog)
    const offStatus = api.onScriptStatus((event) => {
      handleStatus(event)
      void api.listScripts().then((s) => setScriptCount(s.length))
    })
    const onSettingsUpdated = (): void => loadSettings()
    window.addEventListener('settings-updated', onSettingsUpdated)
    void api.listScripts().then((s) => setScriptCount(s.length))
    void api.listProjects().then((p) => setProjectCount(p.length))
    return () => {
      offLog()
      offStatus()
      window.removeEventListener('settings-updated', onSettingsUpdated)
    }
  }, [loadSettings])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setOsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = resolveTheme(settings?.theme ?? 'system', osDark)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const notify = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const toggleTheme = (): void => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    void api.updateSettings({ theme: next }).then(setSettings)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🪛</span>
          <span>Workbench</span>
        </div>
        <div className="nav-label">工作台</div>
        <nav className="nav">
          <button className={`nav-item ${tab === 'scripts' ? 'active' : ''}`} onClick={() => setTab('scripts')}>
            <span className="nav-ic">📜</span>
            <span>脚本</span>
            <span className="nav-count">{scriptCount}</span>
          </button>
          <button className={`nav-item ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
            <span className="nav-ic">🗂️</span>
            <span>项目</span>
            <span className="nav-count">{projectCount}</span>
          </button>
          <button className={`nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            <span className="nav-ic">⚙️</span>
            <span>设置</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '🌙 切换到浅色' : '☀️ 切换到深色'}
          </button>
          <div className="version">v0.1.0 · M1</div>
        </div>
      </aside>
      <main className="main">
        <div className="content">
          {tab === 'scripts' && <ScriptsPage settings={settings} notify={notify} />}
          {tab === 'projects' && <ProjectsPage settings={settings} notify={notify} />}
          {tab === 'settings' && <SettingsPage settings={settings} onSaved={setSettings} notify={notify} />}
        </div>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
