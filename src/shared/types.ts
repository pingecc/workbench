export type ScriptKind = 'file' | 'command'
export type ScriptShell = 'zsh' | 'bash'
export type RunStatus = 'running' | 'success' | 'failed' | 'stopped'

export interface ScriptGroup {
  id: number
  name: string
  sortOrder: number
}

export interface Script {
  id: number
  name: string
  description: string
  groupId: number | null
  kind: ScriptKind
  path: string
  cwd: string
  shell: ScriptShell
  icon: string
  color: string
  confirm: boolean
  runCount: number
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScriptInput {
  name: string
  description?: string
  groupId?: number | null
  kind?: ScriptKind
  path: string
  cwd?: string
  shell?: ScriptShell
  icon?: string
  color?: string
  confirm?: boolean
}

export interface RunRecord {
  id: number
  scriptId: number
  status: RunStatus
  exitCode: number | null
  durationMs: number | null
  output: string
  startedAt: string
  finishedAt: string | null
}

export interface ScanCandidate {
  path: string
  name: string
  ext: string
  techStack?: string[]
  readmeDraft?: string
}

export type ProjectStatus = 'active' | 'maintaining' | 'archived'

export interface Project {
  id: number
  name: string
  path: string
  description: string
  techStack: string[]
  tags: string[]
  status: ProjectStatus
  icon: string
  remoteUrl: string
  branch: string
  lastCommit: string
  dirty: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  name: string
  path: string
  description?: string
  techStack?: string[]
  tags?: string[]
  status?: ProjectStatus
  icon?: string
  remoteUrl?: string
}

export interface GitInfo {
  branch: string
  lastCommit: string
  dirty: boolean
  remote: string
}

export type ThemeMode = 'system' | 'light' | 'dark'
export type ViewMode = 'card' | 'list'

export interface Settings {
  scanRoots: string[]
  editorApp: string
  terminalApp: string
  theme: ThemeMode
  scriptView: ViewMode
  projectView: ViewMode
}

export interface ScriptStatusEvent {
  runId: number
  scriptId: number
  status: RunStatus
  exitCode: number | null
  durationMs: number | null
}

export interface ScriptLogEvent {
  runId: number
  scriptId: number
  line: string
}

export interface BackupSummary {
  filePath: string
  groups: number
  scripts: number
  projects: number
  runs: number
  preBackupPath?: string
}
