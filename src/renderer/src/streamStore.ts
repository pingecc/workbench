import type { RunStatus, ScriptLogEvent, ScriptStatusEvent } from '../../shared/types'

export interface ScriptStream {
  text: string
  runId: number | null
  status: RunStatus | null
  exitCode: number | null
  durationMs: number | null
}

type StreamMap = Record<number, ScriptStream>

let state: StreamMap = {}
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function set(fn: (prev: StreamMap) => StreamMap): void {
  state = fn(state)
  emit()
}

export function openStream(scriptId: number): void {
  set((prev) => {
    if (prev[scriptId]) return prev
    return { ...prev, [scriptId]: { text: '', runId: null, status: null, exitCode: null, durationMs: null } }
  })
}

export function resetStream(scriptId: number): void {
  set((prev) => ({
    ...prev,
    [scriptId]: { text: '', runId: null, status: null, exitCode: null, durationMs: null }
  }))
}

export function handleLog({ scriptId, line }: ScriptLogEvent): void {
  openStream(scriptId)
  set((prev) => {
    const stream = prev[scriptId]
    let text = stream.text + line
    if (text.length > 2_000_000) text = text.slice(-2_000_000)
    return { ...prev, [scriptId]: { ...stream, text } }
  })
}

export function handleStatus({ scriptId, runId, status, exitCode, durationMs }: ScriptStatusEvent): void {
  openStream(scriptId)
  set((prev) => {
    const stream = prev[scriptId]
    return { ...prev, [scriptId]: { ...stream, runId, status, exitCode, durationMs } }
  })
}

export function getStream(scriptId: number): ScriptStream {
  return (
    state[scriptId] ?? { text: '', runId: null, status: null, exitCode: null, durationMs: null }
  )
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getSnapshot(): StreamMap {
  return state
}
