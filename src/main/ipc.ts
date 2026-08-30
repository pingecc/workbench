import { ipcMain } from 'electron'
import { runScript, stopScript } from './executor'
import { exportBackup, importBackup } from './services/backup'
import * as notes from './services/notes'
import * as projects from './services/projects'
import * as scripts from './services/scripts'
import { getSettings, updateSettings } from './services/settings'
import { copyPath, openEditor, openFolder, openTerminal, pickDirectory, pickFile } from './services/system'
import type { NoteInput, ProjectInput, ScriptInput } from '../shared/types'

export function registerIpc(): void {
  ipcMain.handle('scripts:list', () => scripts.listScripts())
  ipcMain.handle('script:create', (_e, input: ScriptInput) => scripts.createScript(input))
  ipcMain.handle('script:update', (_e, id: number, input: Partial<ScriptInput>) => scripts.updateScript(id, input))
  ipcMain.handle('script:delete', (_e, id: number) => scripts.deleteScript(id))

  ipcMain.handle('groups:list', () => scripts.listGroups())
  ipcMain.handle('group:create', (_e, name: string) => scripts.createGroup(name))
  ipcMain.handle('group:rename', (_e, id: number, name: string) => scripts.renameGroup(id, name))
  ipcMain.handle('group:delete', (_e, id: number) => scripts.deleteGroup(id))

  ipcMain.handle('scripts:scan', (_e, dir: string) => scripts.scanScripts(dir))
  ipcMain.handle('scripts:cancelScan', () => scripts.cancelScan())
  ipcMain.handle('scripts:addFromScan', (_e, paths: string[]) => scripts.addScriptsFromPaths(paths))

  ipcMain.handle('script:run', (_e, id: number) => {
    const script = scripts.getScript(id)
    if (!script) throw new Error('脚本不存在')
    return runScript(script)
  })
  ipcMain.handle('script:stop', (_e, id: number) => stopScript(id))
  ipcMain.handle('script:history', (_e, id: number) => scripts.runHistory(id))
  ipcMain.handle('script:clearHistory', (_e, id: number) => scripts.clearHistory(id))

  ipcMain.handle('projects:list', () => projects.listProjects())
  ipcMain.handle('project:create', (_e, input: ProjectInput) => projects.createProject(input))
  ipcMain.handle('project:update', (_e, id: number, input: Partial<ProjectInput>) => projects.updateProject(id, input))
  ipcMain.handle('project:delete', (_e, id: number) => projects.deleteProject(id))

  ipcMain.handle('projects:scan', (_e, dir: string) => projects.scanProjects(dir))
  ipcMain.handle('projects:cancelScan', () => projects.cancelProjectScan())
  ipcMain.handle('projects:addFromScan', (_e, paths: string[]) => projects.addProjectsFromPaths(paths))
  ipcMain.handle('projects:refreshGit', async (_e, paths: string[]) => {
    await projects.refreshGitInfos(paths)
    return projects.listProjects()
  })

  ipcMain.handle('project:git', (_e, path: string) => projects.gitInfo(path))
  ipcMain.handle('project:open', (_e, path: string, kind: 'folder' | 'terminal' | 'editor', techStack?: string[]) => {
    if (kind === 'folder') {
      openFolder(path)
      return '文件夹'
    }
    if (kind === 'terminal') {
      openTerminal(path)
      return '终端'
    }
    return openEditor(path, techStack ?? [])
  })
  ipcMain.handle('project:copy', (_e, path: string) => copyPath(path))

  ipcMain.handle('notes:list', () => notes.listNotes())
  ipcMain.handle('note:create', (_e, input: NoteInput) => notes.createNote(input))
  ipcMain.handle('note:update', (_e, id: number, patch: Partial<NoteInput> & { done?: boolean }) =>
    notes.updateNote(id, patch)
  )
  ipcMain.handle('note:delete', (_e, id: number) => notes.deleteNote(id))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch))

  ipcMain.handle('backup:export', () => exportBackup())
  ipcMain.handle('backup:import', () => importBackup())

  ipcMain.handle('dialog:pickDir', () => pickDirectory())
  ipcMain.handle('dialog:pickFile', () => pickFile())
}
