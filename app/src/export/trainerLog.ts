import type { AppEvent, Settings } from '../types'
import { deriveDay, sessionDur, type DayDerived, type Session } from '../engine/derive'
import { dayKeyOf, diffMin, fmtDur, fmtHM } from '../engine/time'

function awakeBeforeMin(sess: Session, sessions: Session[], day: DayDerived): number | undefined {
  const start = new Date(sess.start)
  const points: Date[] = []
  if (day.morningWakeTs) points.push(new Date(day.morningWakeTs))
  for (const x of sessions) {
    if (x.id === sess.id || !x.end) continue
    const end = new Date(x.end)
    if (end <= start) points.push(end)
  }
  if (!points.length) return undefined
  points.sort((a, b) => a.getTime() - b.getTime())
  return diffMin(start, points[points.length - 1])
}

function activityLabel(e: AppEvent): string {
  switch (e.type) {
    case 'wake_morning':
      return 'Wake up for the day'
    case 'feed':
      return `Feed — ${e.oz ?? '?'} oz${e.note ? ` (${e.note})` : ''}`
    case 'solids':
      return `Solids${e.note ? ` — ${e.note}` : ''}`
    case 'burp':
      return 'Burp'
    case 'put_down':
      return 'Put down to settle'
    case 'asleep':
      return 'Fell asleep'
    case 'awake':
      return 'Woke up'
    case 'note':
      return e.note ?? ''
    default:
      return e.type
  }
}

/**
 * Render one day in the trainer's format as a TSV grid.
 * Pasting into Excel/Google Sheets splits it into cells.
 */
export function buildTrainerLog(
  key: string,
  resolved: AppEvent[],
  sessions: Session[],
  s: Settings,
  now: Date,
): string {
  const day = deriveDay(resolved, sessions, key, s, now)
  const L: string[] = []
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  L.push(date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  L.push('')

  L.push(['Sleep', 'Put down', 'Asleep', 'Awake', 'Duration', 'Awake before'].join('\t'))
  L.push(
    ['Awake for the day', '', '', day.morningWakeTs ? fmtHM(new Date(day.morningWakeTs)) : '?', '', ''].join('\t'),
  )
  for (const nap of day.naps) {
    const ab = awakeBeforeMin(nap, sessions, day)
    L.push(
      [
        `Nap ${nap.napIndex}`,
        nap.putDownTs ? fmtHM(new Date(nap.putDownTs)) : '',
        fmtHM(new Date(nap.start)),
        nap.end ? fmtHM(new Date(nap.end)) : '(asleep)',
        nap.end ? fmtDur(sessionDur(nap, now)) : '',
        ab !== undefined ? fmtDur(ab) : '',
      ].join('\t'),
    )
  }
  for (const night of day.nights) {
    const ab = awakeBeforeMin(night, sessions, day)
    L.push(
      [
        'Bedtime',
        night.putDownTs ? fmtHM(new Date(night.putDownTs)) : '',
        fmtHM(new Date(night.start)),
        night.end ? fmtHM(new Date(night.end)) : '',
        night.end ? fmtDur(sessionDur(night, now)) : '',
        ab !== undefined ? fmtDur(ab) : '',
      ].join('\t'),
    )
  }
  L.push(['Total naps', '', '', '', fmtDur(day.totalNapMin), ''].join('\t'))
  if (day.overnightMin > 0) L.push(['Overnight (logged)', '', '', '', fmtDur(day.overnightMin), ''].join('\t'))
  L.push('')

  L.push(['Feed time', 'Amount (oz)'].join('\t'))
  for (const f of day.feeds) L.push([fmtHM(new Date(f.ts)), String(f.oz)].join('\t'))
  L.push(['24h total', String(day.totalOz)].join('\t'))
  L.push('')

  L.push(['Time', 'Activity', 'By'].join('\t'))
  for (const e of resolved.filter((x) => dayKeyOf(x.ts, s.dayCutoffHour) === key)) {
    L.push([fmtHM(new Date(e.ts)), activityLabel(e), e.actor ?? ''].join('\t'))
  }
  return L.join('\n')
}
