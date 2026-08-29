import { spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { dirname } from 'path'
import { homedir } from 'os'
import iconv from 'iconv-lite'
import { getDb, nowIso } from './db'
import { cleanLogText } from '../shared/logtext'
import type { RunStatus, Script } from '../shared/types'

export type NotifyFn = (channel: string, payload: unknown) => void

interface Session {
  scriptId: number
  runId: number
  proc: ChildProcess
  startedAt: number
  text: string
  raw: Buffer[]
  rawLen: number
  invalidUtf8: boolean
  stoppedManually: boolean
  finished: boolean
}

const sessions = new Map<number, Session>()
let notifier: NotifyFn = () => {}
let nextRunId = 1

export function setNotifier(fn: NotifyFn): void {
  notifier = fn
}

export function runScript(script: Script): { runId: number } {
  if (sessions.has(script.id)) {
    throw new Error('该脚本正在运行中')
  }

  const { shell, kind, path, cwd } = script
  const runDir = cwd || (kind === 'file' ? dirname(path) : homedir())
  const args = kind === 'file' ? [path] : ['-c', path]
  let proc: ChildProcess
  try {
    proc = spawn(shell, args, { cwd: runDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    throw new Error(`无法启动执行器：${err instanceof Error ? err.message : String(err)}`)
  }

  const runId = nextRunId++
  const session: Session = {
    scriptId: script.id,
    runId,
    proc,
    startedAt: Date.now(),
    text: '',
    raw: [],
    rawLen: 0,
    invalidUtf8: false,
    stoppedManually: false,
    finished: false
  }
  sessions.set(script.id, session)
  notifier('script:status', {
    runId,
    scriptId: script.id,
    status: 'running',
    exitCode: null,
    durationMs: null
  })

  attachStream(proc.stdout, session)
  attachStream(proc.stderr, session)

  proc.on('error', (err: Error) => {
    finish(script.id, 'failed', null, err.message)
  })
  proc.on('close', (code: number | null) => {
    finish(script.id, null, code, null)
  })

  return { runId }
}

function attachStream(stream: NodeJS.ReadableStream | null, session: Session): void {
  if (!stream) return
  const decoder = new StringDecoder('utf8')
  stream.on('data', (chunk: Buffer) => {
    if (session.finished) return
    session.raw.push(chunk)
    session.rawLen += chunk.length
    while (session.rawLen > 6_000_000 && session.raw.length > 1) {
      const dropped = session.raw.shift()
      if (dropped) session.rawLen -= dropped.length
    }
    let text = decoder.write(chunk)
    if (text.includes('\uFFFD')) {
      session.invalidUtf8 = true
      try {
        const gbk = iconv.decode(chunk, 'gbk')
        if (!gbk.includes('\uFFFD')) text = gbk
      } catch {
        /* keep utf8-decoded text */
      }
    }
    if (text) emitText(session, text)
  })
  stream.on('end', () => {
    const tail = decoder.end()
    if (tail) emitText(session, tail)
  })
}

function emitText(session: Session, text: string): void {
  if (session.finished) return
  const clean = cleanLogText(text)
  if (!clean) return
  session.text += clean
  if (session.text.length > 6_000_000) {
    session.text = session.text.slice(-6_000_000)
  }
  notifier('script:log', { runId: session.runId, scriptId: session.scriptId, line: clean })
}

function finish(scriptId: number, forcedStatus: RunStatus | null, code: number | null, errorMsg: string | null): void {
  const session = sessions.get(scriptId)
  if (!session || session.finished) return
  session.finished = true
  sessions.delete(scriptId)

  const durationMs = Date.now() - session.startedAt
  let status: RunStatus
  if (forcedStatus) {
    status = forcedStatus
  } else if (session.stoppedManually || code === null) {
    status = 'stopped'
  } else {
    status = code === 0 ? 'success' : 'failed'
  }

  if (errorMsg) {
    emitText(session, errorMsg)
  }

  const db = getDb()
  const finishedAt = nowIso()
  let output = cleanLogText(session.text)
  if (session.invalidUtf8) {
    try {
      const gbk = cleanLogText(iconv.decode(Buffer.concat(session.raw), 'gbk'))
      if (!gbk.includes('\uFFFD')) output = gbk
    } catch {
      /* keep utf8-decoded text */
    }
  }
  db.prepare(
    `INSERT INTO run_history (script_id, status, exit_code, duration_ms, output, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    scriptId,
    status,
    code,
    durationMs,
    output.slice(-5_000_000),
    new Date(session.startedAt).toISOString(),
    finishedAt
  )

  db.prepare(
    `DELETE FROM run_history WHERE script_id = ? AND id NOT IN (
       SELECT id FROM run_history WHERE script_id = ? ORDER BY id DESC LIMIT 5
     )`
  ).run(scriptId, scriptId)

  db.prepare('UPDATE scripts SET run_count = run_count + 1, last_run_at = ?, updated_at = ? WHERE id = ?').run(
    finishedAt,
    finishedAt,
    scriptId
  )

  notifier('script:status', {
    runId: session.runId,
    scriptId,
    status,
    exitCode: code,
    durationMs
  })
}

export function stopScript(scriptId: number): void {
  const session = sessions.get(scriptId)
  if (!session) return
  session.stoppedManually = true
  const pid = session.proc.pid
  if (pid != null) {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        session.proc.kill('SIGTERM')
      } catch {
        /* already exited */
      }
    }
  }
}

export function isRunning(scriptId: number): boolean {
  return sessions.has(scriptId)
}
