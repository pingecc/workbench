import { spawnSync } from 'child_process'
import { promises as fsp, existsSync, readFileSync, readdirSync } from 'fs'
import { basename, extname, join, resolve } from 'path'
import { getDb, nowIso } from '../db'
import type { GitInfo, Project, ProjectInput, ProjectStatus, ScanCandidate } from '../../shared/types'

interface ProjectRow {
  id: number
  name: string
  path: string
  description: string
  tech_stack: string
  tags: string
  status: ProjectStatus
  icon: string
  remote_url: string
  branch: string
  last_commit: string
  dirty: number
  created_at: string
  updated_at: string
}

function toProject(row: ProjectRow): Project {
  let techStack: string[] = []
  let tags: string[] = []
  try {
    techStack = JSON.parse(row.tech_stack)
    tags = JSON.parse(row.tags)
  } catch {
    /* keep empty */
  }
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    techStack: Array.isArray(techStack) ? techStack : [],
    tags: Array.isArray(tags) ? tags : [],
    status: row.status,
    icon: row.icon || '📁',
    remoteUrl: row.remote_url,
    branch: row.branch,
    lastCommit: row.last_commit,
    dirty: row.dirty === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY status, name COLLATE NOCASE')
    .all() as unknown as ProjectRow[]
  return rows.map(toProject)
}

export function getProject(id: number): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row ? toProject(row) : null
}

export function createProject(input: ProjectInput): Project {
  if (!input.name.trim() || !input.path.trim()) {
    throw new Error('名称与路径不能为空')
  }
  const ts = nowIso()
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO projects (name, path, description, tech_stack, tags, status, icon, remote_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      resolve(input.path.trim()),
      input.description ?? '',
      JSON.stringify(input.techStack ?? []),
      JSON.stringify(input.tags ?? []),
      input.status ?? 'active',
      input.icon?.trim() || iconForTechStack(input.techStack ?? []),
      input.remoteUrl ?? '',
      ts,
      ts
    )
  const created = getProject(Number(result.lastInsertRowid))
  if (!created) throw new Error('创建项目失败')
  return created
}

export function updateProject(id: number, input: Partial<ProjectInput>): Project {
  const existing = getProject(id)
  if (!existing) throw new Error('项目不存在')
  const next = { ...existing, ...input }
  getDb()
    .prepare(
      `UPDATE projects SET name = ?, path = ?, description = ?, tech_stack = ?, tags = ?,
       status = ?, icon = ?, remote_url = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      next.name,
      resolve(next.path),
      next.description ?? '',
      JSON.stringify(next.techStack ?? []),
      JSON.stringify(next.tags ?? []),
      next.status,
      next.icon?.trim() || '📁',
      next.remoteUrl ?? '',
      nowIso(),
      id
    )
  return getProject(id) as Project
}

export function deleteProject(id: number): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export async function refreshGitInfos(paths: string[]): Promise<void> {
  for (const p of paths) {
    const info = gitInfo(p)
    getDb()
      .prepare('UPDATE projects SET branch = ?, last_commit = ?, dirty = ?, remote_url = ?, updated_at = ? WHERE path = ?')
      .run(info.branch, info.lastCommit, info.dirty ? 1 : 0, info.remote, nowIso(), resolve(p))
  }
}

export function gitInfo(path: string): GitInfo {
  const run = (args: string[]): string => {
    const res = spawnSync('git', ['-C', path, ...args], { encoding: 'utf8', timeout: 8000 })
    if (res.error || res.status !== 0) return ''
    return res.stdout.trim()
  }
  const branch = run(['branch', '--show-current'])
  const lastCommit = run(['log', '-1', '--format=%h %s (%ar)'])
  const dirty = run(['status', '--porcelain']).length > 0
  let remote = run(['remote', 'get-url', 'origin'])
  if (!remote) {
    const all = run(['remote', '-v'])
    remote = all.split('\n')[0]?.split(/\s+/)[1] ?? ''
  }
  return { branch, lastCommit, dirty, remote }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'target', 'build', 'dist', '.Trash', 'Library'])
const MAX_SCAN = 2000
const EXT_STACK: Array<[string, string]> = [
  ['.py', 'Python'],
  ['.java', 'Java'],
  ['.js', 'JavaScript'],
  ['.jsx', 'React'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'React'],
  ['.vue', 'Vue'],
  ['.go', 'Go'],
  ['.rs', 'Rust'],
  ['.rb', 'Ruby'],
  ['.php', 'PHP'],
  ['.swift', 'Swift'],
  ['.kt', 'Kotlin'],
  ['.c', 'C'],
  ['.h', 'C'],
  ['.cpp', 'C++'],
  ['.hpp', 'C++'],
  ['.cs', 'C#'],
  ['.sh', 'Shell'],
  ['.sql', 'SQL'],
  ['.html', 'Web'],
  ['.css', 'Web'],
  ['.scss', 'Web']
]
const FILE_STACK: Array<[string, string]> = [
  ['package.json', 'Node.js'],
  ['tsconfig.json', 'TypeScript'],
  ['pom.xml', 'Java'],
  ['build.gradle', 'Gradle'],
  ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'],
  ['requirements.txt', 'Python'],
  ['Pipfile', 'Python'],
  ['pyproject.toml', 'Python'],
  ['Gemfile', 'Ruby'],
  ['composer.json', 'PHP']
]

let scanToken = 0

export function cancelProjectScan(): void {
  scanToken++
}

export async function scanProjects(root: string): Promise<ScanCandidate[]> {
  const token = ++scanToken
  const out: ScanCandidate[] = []
  const seen = new Set<string>()
  const db = getDb()
  const existingRows = db.prepare('SELECT path FROM projects').all() as unknown as Array<{ path: string }>
  for (const row of existingRows) seen.add(resolve(row.path))

  const walk = async (dir: string): Promise<void> => {
    if (scanToken !== token) throw new Error('cancelled')
    if (out.length >= MAX_SCAN) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (scanToken !== token) throw new Error('cancelled')
      if (out.length >= MAX_SCAN) return
      if (entry.name.startsWith('.')) continue
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.name === '.git') {
        const repoPath = dir
        if (!seen.has(resolve(repoPath))) {
          seen.add(resolve(repoPath))
          out.push({
            path: repoPath,
            name: basename(repoPath),
            ext: 'git',
            techStack: guessTechStack(repoPath),
            readmeDraft: readReadmeDraft(repoPath)
          })
        }
        continue
      }
      await walk(full)
    }
  }

  await walk(root)
  return out
}

export function guessTechStack(dir: string): string[] {
  const labels = new Map<string, number>()
  const bump = (label: string): void => {
    labels.set(label, (labels.get(label) ?? 0) + 1)
  }
  try {
    const top = readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string
      isFile: () => boolean
      isDirectory: () => boolean
    }>
    let fileCount = 0
    for (const entry of top) {
      if (FILE_STACK.some(([f]) => f === entry.name)) {
        bump(FILE_STACK.find(([f]) => f === entry.name)![1])
      }
      if (entry.isFile()) {
        const label = EXT_STACK.find(([ext]) => ext === extname(entry.name).toLowerCase())?.[1]
        if (label) bump(label)
        fileCount++
        if (fileCount > 300) break
      }
    }
    // 第二级取样：每个子目录最多看 20 个文件
    let g = 0
    for (const entry of top) {
      if (!entry.isDirectory() || g >= 5) continue
      g++
      let inner: Array<{ name: string; isFile: () => boolean }> = []
      try {
        inner = readdirSync(join(dir, entry.name), { withFileTypes: true }) as typeof inner
      } catch {
        continue
      }
      let n = 0
      for (const e of inner) {
        if (e.isFile() && n < 20) {
          const label = EXT_STACK.find(([ext]) => ext === extname(e.name).toLowerCase())?.[1]
          if (label) bump(label)
          n++
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label)
}

const TECH_ICON: Array<[string, string]> = [
  ['Java', '☕'],
  ['Python', '🐍'],
  ['React', '⚛️'],
  ['Vue', '💚'],
  ['Node.js', '🟢'],
  ['TypeScript', '🔷'],
  ['JavaScript', '🟨'],
  ['Go', '🐹'],
  ['Rust', '🦀'],
  ['Kotlin', '🟣'],
  ['Swift', '🐦'],
  ['Web', '🌐'],
  ['Shell', '🐚'],
  ['SQL', '🗄️']
]

export function iconForTechStack(techStack: string[]): string {
  for (const [label, icon] of TECH_ICON) {
    if (techStack.includes(label)) return icon
  }
  return '📁'
}

export function readReadmeDraft(dir: string): string {
  try {
    const readme = ['README.md', 'readme.md', 'Readme.md', 'README.txt'].find((f) =>
      existsSync(join(dir, f))
    )
    if (!readme) return ''
    const text = readFileSync(join(dir, readme), 'utf8')
    const heading = text.split('\n').find((line) => line.startsWith('#'))
    const firstPara = text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0 && !s.startsWith('#'))
    const parts = [heading ? heading.replace(/^#+\s*/, '') : '', firstPara ?? ''].filter(Boolean)
    return parts.join('；').slice(0, 200)
  } catch {
    return ''
  }
}

export function addProjectsFromPaths(paths: string[]): number {
  const db = getDb()
  const existing = new Set(
    (db.prepare('SELECT path FROM projects').all() as unknown as Array<{ path: string }>).map((r) => resolve(r.path))
  )
  let added = 0
  for (const p of paths) {
    const abs = resolve(p)
    if (existing.has(abs)) continue
    const techStack = guessTechStack(abs)
    createProject({
      name: basename(abs),
      path: abs,
      description: readReadmeDraft(abs),
      techStack,
      icon: iconForTechStack(techStack)
    })
    existing.add(abs)
    added++
  }
  return added
}
