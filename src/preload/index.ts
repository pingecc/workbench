import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  BackupSummary,
  GitInfo,
  Note,
  NoteInput,
  Project,
  ProjectInput,
  RunRecord,
  ScanCandidate,
  Script,
  ScriptGroup,
  ScriptInput,
  ScriptLogEvent,
  ScriptStatusEvent,
  Settings,
  Skill,
  SkillScanCandidate
} from '../shared/types'

const api = {
  listScripts: (): Promise<Script[]> => ipcRenderer.invoke('scripts:list'),
  createScript: (input: ScriptInput): Promise<Script> => ipcRenderer.invoke('script:create', input),
  updateScript: (id: number, input: Partial<ScriptInput>): Promise<Script> =>
    ipcRenderer.invoke('script:update', id, input),
  deleteScript: (id: number): Promise<void> => ipcRenderer.invoke('script:delete', id),

  listGroups: (): Promise<ScriptGroup[]> => ipcRenderer.invoke('groups:list'),
  createGroup: (name: string): Promise<ScriptGroup> => ipcRenderer.invoke('group:create', name),
  renameGroup: (id: number, name: string): Promise<ScriptGroup> => ipcRenderer.invoke('group:rename', id, name),
  deleteGroup: (id: number): Promise<void> => ipcRenderer.invoke('group:delete', id),

  scanScripts: (dir: string): Promise<ScanCandidate[]> => ipcRenderer.invoke('scripts:scan', dir),
  cancelScriptScan: (): Promise<void> => ipcRenderer.invoke('scripts:cancelScan'),
  addScriptsFromScan: (paths: string[]): Promise<number> => ipcRenderer.invoke('scripts:addFromScan', paths),

  runScript: (id: number): Promise<{ runId: number }> => ipcRenderer.invoke('script:run', id),
  stopScript: (id: number): Promise<void> => ipcRenderer.invoke('script:stop', id),
  scriptHistory: (id: number): Promise<RunRecord[]> => ipcRenderer.invoke('script:history', id),
  clearHistory: (id: number): Promise<void> => ipcRenderer.invoke('script:clearHistory', id),

  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  createProject: (input: ProjectInput): Promise<Project> => ipcRenderer.invoke('project:create', input),
  updateProject: (id: number, input: Partial<ProjectInput>): Promise<Project> =>
    ipcRenderer.invoke('project:update', id, input),
  deleteProject: (id: number): Promise<void> => ipcRenderer.invoke('project:delete', id),

  scanProjects: (dir: string): Promise<ScanCandidate[]> => ipcRenderer.invoke('projects:scan', dir),
  cancelProjectScan: (): Promise<void> => ipcRenderer.invoke('projects:cancelScan'),
  addProjectsFromScan: (paths: string[]): Promise<number> => ipcRenderer.invoke('projects:addFromScan', paths),
  refreshProjectGit: (paths: string[]): Promise<Project[]> => ipcRenderer.invoke('projects:refreshGit', paths),
  projectGit: (path: string): Promise<GitInfo> => ipcRenderer.invoke('project:git', path),
  openProject: (path: string, kind: 'folder' | 'terminal' | 'editor', techStack?: string[]): Promise<string> =>
    ipcRenderer.invoke('project:open', path, kind, techStack),
  copyProjectPath: (path: string): Promise<void> => ipcRenderer.invoke('project:copy', path),

  listNotes: (): Promise<Note[]> => ipcRenderer.invoke('notes:list'),
  createNote: (input: NoteInput): Promise<Note> => ipcRenderer.invoke('note:create', input),
  updateNote: (id: number, patch: Partial<NoteInput> & { done?: boolean }): Promise<Note> =>
    ipcRenderer.invoke('note:update', id, patch),
  deleteNote: (id: number): Promise<void> => ipcRenderer.invoke('note:delete', id),

  listSkills: (): Promise<Skill[]> => ipcRenderer.invoke('skills:list'),
  scanSkills: (root: string): Promise<SkillScanCandidate[]> => ipcRenderer.invoke('skills:scan', root),
  addSkillsFromScan: (paths: string[], sourceRoot: string): Promise<{ added: number; updated: number }> =>
    ipcRenderer.invoke('skills:addFromScan', paths, sourceRoot),
  deleteSkill: (id: number): Promise<void> => ipcRenderer.invoke('skill:delete', id),
  clearMissingSkills: (): Promise<number> => ipcRenderer.invoke('skills:clearMissing'),
  openSkill: (path: string, kind: 'folder' | 'editor'): Promise<string> =>
    ipcRenderer.invoke('skill:open', path, kind),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),

  exportBackup: (): Promise<BackupSummary | null> => ipcRenderer.invoke('backup:export'),
  importBackup: (): Promise<BackupSummary | null> => ipcRenderer.invoke('backup:import'),

  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir'),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),

  onScriptLog: (cb: (event: ScriptLogEvent) => void): (() => void) => {
    logSubs.add(cb)
    return () => {
      logSubs.delete(cb)
    }
  },
  onScriptStatus: (cb: (event: ScriptStatusEvent) => void): (() => void) => {
    statusSubs.add(cb)
    return () => {
      statusSubs.delete(cb)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

const logSubs = new Set<(event: ScriptLogEvent) => void>()
const statusSubs = new Set<(event: ScriptStatusEvent) => void>()

ipcRenderer.on('script:log', (_e: IpcRendererEvent, payload: ScriptLogEvent) => {
  for (const cb of logSubs) cb(payload)
})
ipcRenderer.on('script:status', (_e: IpcRendererEvent, payload: ScriptStatusEvent) => {
  for (const cb of statusSubs) cb(payload)
})
