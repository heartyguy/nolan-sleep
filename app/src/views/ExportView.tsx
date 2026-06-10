import { useMemo, useState } from 'react'
import { buildSessions, resolveEvents } from '../engine/derive'
import { dayKeyOf, todayKey } from '../engine/time'
import { buildTrainerLog } from '../export/trainerLog'
import type { AppEvent, Settings } from '../types'

export default function ExportView({
  events,
  settings,
  now,
}: {
  events: AppEvent[]
  settings: Settings
  now: Date
}) {
  const resolved = useMemo(() => resolveEvents(events), [events])
  const sessions = useMemo(() => buildSessions(resolved, settings), [resolved, settings])

  const keys = useMemo(() => {
    const set = new Set(resolved.map((e) => dayKeyOf(e.ts, settings.dayCutoffHour)))
    set.add(todayKey(now, settings.dayCutoffHour))
    return Array.from(set).sort()
  }, [resolved, settings, now])

  const [sel, setSel] = useState<string | null>(null)
  const key = sel && keys.includes(sel) ? sel : keys[keys.length - 1]
  const idx = keys.indexOf(key)

  const text = buildTrainerLog(key, resolved, sessions, settings, now)
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="export">
      <div className="day-nav">
        <button className="btn ghost" disabled={idx <= 0} onClick={() => setSel(keys[idx - 1])}>
          ←
        </button>
        <span className="day-label">{key}</span>
        <button className="btn ghost" disabled={idx >= keys.length - 1} onClick={() => setSel(keys[idx + 1])}>
          →
        </button>
      </div>
      <button className="btn primary" onClick={copy}>
        {copied ? '✓ Copied — paste into the Excel' : '📋 Copy for Excel'}
      </button>
      <p className="hint">
        Copies the day as a tab-separated grid. In the trainer's Excel, tap a cell and paste — it fills the
        columns. Questions you logged as 📝 notes are included.
      </p>
      <pre className="export-pre">{text}</pre>
    </div>
  )
}
