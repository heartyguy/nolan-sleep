export const MIN = 60_000

export function addMin(d: Date, m: number): Date {
  return new Date(d.getTime() + m * MIN)
}

/** a - b in whole minutes */
export function diffMin(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MIN)
}

export function fmtHM(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** minutes -> 'H:MM' */
export function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** relative label for a target time, e.g. 'in 38m' / 'in 1h 12m' / 'now' / '12m ago' */
export function fmtRel(target: Date, now: Date): string {
  const m = diffMin(target, now)
  if (Math.abs(m) <= 1) return 'now'
  const abs = Math.abs(m)
  const txt = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`
  return m > 0 ? `in ${txt}` : `${txt} ago`
}

export function localYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Day key for an event: local date, shifted so times before cutoffHour belong to the previous day. */
export function dayKeyOf(ts: string, cutoffHour: number): string {
  return localYMD(new Date(new Date(ts).getTime() - cutoffHour * 3_600_000))
}

export function todayKey(now: Date, cutoffHour: number): string {
  return dayKeyOf(now.toISOString(), cutoffHour)
}

/** 'HH:MM' within a given day key -> absolute local Date. Times before the cutoff land on the next calendar date. */
export function atTime(dayKey: string, hm: string, cutoffHour: number): Date {
  const [y, mo, d] = dayKey.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const date = new Date(y, mo - 1, d, hh, mm, 0, 0)
  if (hh < cutoffHour) date.setDate(date.getDate() + 1)
  return date
}

export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(v: string): Date {
  return new Date(v)
}
