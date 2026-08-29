import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { clipboard, dialog, BrowserWindow } from 'electron'
import { getSettings } from './settings'

export function openFolder(path: string): void {
  spawn('open', [path])
}

export function openTerminal(path: string): void {
  const app = getSettings().terminalApp
  spawn('open', ['-a', app, path])
}

const APP_DIRS = [join(homedir(), 'Applications'), '/Applications']

function appExists(name: string): boolean {
  return name !== '' && APP_DIRS.some((dir) => existsSync(join(dir, `${name}.app`)))
}

export function editorForTechStack(techStack: string[]): string[] {
  const stack = techStack.map((s) => s.toLowerCase())
  const isJava = (s: string): boolean => s.split(/[\s/,+.()：#]+/).includes('java') || s.includes('gradle')
  if (stack.some(isJava)) {
    return ['IntelliJ IDEA', 'IntelliJ IDEA CE']
  }
  if (stack.some((s) => s.includes('python'))) {
    return ['PyCharm', 'PyCharm CE']
  }
  if (
    stack.some((s) =>
      ['react', 'vue', 'web', 'frontend', 'javascript', 'typescript', 'node.js', 'nodejs', 'html', 'css', 'sass', 'scss', 'vite', 'npm', '前端'].includes(s)
    )
  ) {
    return ['Visual Studio Code']
  }
  return []
}

export function resolveEditorApp(techStack: string[], fallback: string): string {
  const candidates = [...editorForTechStack(techStack), fallback, 'Visual Studio Code'].filter(Boolean)
  for (const name of candidates) {
    if (appExists(name)) return name
  }
  return candidates[0] ?? 'Visual Studio Code'
}

export function openEditor(path: string, techStack: string[] = []): string {
  const app = resolveEditorApp(techStack, getSettings().editorApp)
  if (!appExists(app)) {
    throw new Error(`未找到编辑器「${app}」，请确认已安装，或在设置中更换默认编辑器`)
  }
  spawn('open', ['-a', app, path])
  return app
}

export function copyPath(path: string): void {
  clipboard.writeText(path)
}

export async function pickDirectory(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0] ?? null
}

export async function pickFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: '脚本', extensions: ['sh', 'command', 'py', 'js'] }]
  })
  return result.canceled ? null : result.filePaths[0] ?? null
}
