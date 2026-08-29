import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RunRecord, Script } from '../../../shared/types'
import { api } from '../api'
import { getSnapshot, resetStream, subscribe } from '../streamStore'
import { cleanLogText } from '../../../shared/logtext'
import Modal from './Modal'

interface LogPanelProps {
  script: Script
  onClose: () => void
  notify: (msg: string) => void
}

export default function LogPanel({ script, onClose, notify }: LogPanelProps): JSX.Element {
  const streams = useSyncExternalStore(subscribe, getSnapshot)
  const stream = streams[script.id]
  const [history, setHistory] = useState<RunRecord[]>([])
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  const liveText = stream ? stream.text : ''
  const displayText = cleanLogText(selectedRun ? selectedRun.output : liveText)
  const running = stream?.status === 'running'
  const status = selectedRun?.status ?? stream?.status ?? 'idle'

  useEffect(() => {
    void api.scriptHistory(script.id).then(setHistory)
  }, [script.id])

  useEffect(() => {
    return api.onScriptStatus((e) => {
      if (e.scriptId === script.id && e.status !== 'running') {
        void api.scriptHistory(script.id).then(setHistory)
      }
    })
  }, [script.id])

  useEffect(() => {
    if (!selectedRun) {
      requestAnimationFrame(() => {
        const el = liveRef.current
        if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
      })
    }
  }, [liveText, selectedRun])

  const onLogScroll = (): void => {
    const el = liveRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const copy = (): void => {
    void navigator.clipboard.writeText(displayText || '(空)')
    notify('已复制到剪贴板')
  }

  return (
    <Modal title={`日志 · ${script.name}`} onClose={onClose} width={780}>
      <div className="log-panel">
        <div className="terminal-chrome">
          <span className="traffic">
            <i />
            <i />
            <i />
          </span>
          <span className="terminal-title">
            {script.name} · {script.path}
          </span>
          <button onClick={() => void api.stopScript(script.id)} disabled={!running}>
            停止
          </button>
          <button onClick={copy}>复制日志</button>
          <button onClick={() => resetStream(script.id)}>清空实时区</button>
          <button disabled={!selectedRun} onClick={() => setSelectedRun(null)}>
            回到实时
          </button>
        </div>

        {history.length > 0 && (
          <div className="history-bar">
            <span className="muted">历史（最近 {history.length} 次，点击查看）：</span>
            {history.map((run) => (
              <span
                key={run.id}
                className={`badge ${run.status} ${selectedRun?.id === run.id ? 'running' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedRun(run)}
                title={`${run.startedAt}${run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}`}
              >
                {run.status}
                {run.durationMs != null ? ` ${(run.durationMs / 1000).toFixed(1)}s` : ''}
              </span>
            ))}
          </div>
        )}

        <div ref={liveRef} className="log-area" onScroll={onLogScroll}>
          {displayText ? (
            displayText
          ) : (
            <div className="log-empty">暂无输出{running ? '，等待脚本输出…' : ''}</div>
          )}
        </div>

        <div className="terminal-foot">
          <span className={`badge ${status}`}>{status}</span>
          {selectedRun?.exitCode != null && <span>退出码 {selectedRun.exitCode}</span>}
          {stream?.exitCode != null && selectedRun == null && <span>退出码 {stream.exitCode}</span>}
          {(selectedRun?.durationMs ?? stream?.durationMs) != null && (
            <span>耗时 {((selectedRun?.durationMs ?? stream?.durationMs ?? 0) / 1000).toFixed(1)}s</span>
          )}
          <span className="muted" style={{ marginLeft: 'auto' }}>
            stdout + stderr 合并显示
          </span>
        </div>
      </div>
    </Modal>
  )
}
