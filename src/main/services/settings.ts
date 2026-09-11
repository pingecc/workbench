import { join } from 'path'
import { homedir } from 'os'
import { getDb, jsonGet, jsonSet } from '../db'
import type { Settings } from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  scanRoots: [join(homedir(), 'pinge-system/code')],
  editorApp: 'Visual Studio Code',
  terminalApp: 'Terminal',
  theme: 'system',
  scriptView: 'card',
  projectView: 'card',
  skillView: 'card',
  skillScanRoots: [join(homedir(), '.zcode/skills')]
}

export function getSettings(): Settings {
  const db = getDb()
  const stored = jsonGet<Partial<Settings>>(db, 'app_settings', {})
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const db = getDb()
  const next = { ...getSettings(), ...patch }
  jsonSet(db, 'app_settings', next)
  return next
}
