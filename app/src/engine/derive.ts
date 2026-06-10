import type { AppEvent, Settings } from '../types'
import { addMin, atTime, dayKeyOf, diffMin, fmtHM, todayKey } from './time'

export interface Session {
  id: string // id of the asleep event
  start: string
  end?: string
  kind: 'nap' | 'night'
  dayKey: string
  putDownTs?: string
  napIndex?: number
}

export interface FeedItem {
  id: string
  ts: string
  oz: number
}

export interface DayDerived {
  key: string
  morningWakeTs?: string
  feeds: FeedItem[]
  totalOz: number
  naps: Session[]
  nights: Session[]
  totalNapMin: number // open nap counted up to `now`
  overnightMin: number // closed night sessions only
  napsDone: number // closed naps
}

export type NowState =
  | { mode: 'sleeping'; session: Session; isNight: boolean; sinceMin: number }
  | { mode: 'settling'; putDownId: string; sinceTs: string; sinceMin: number }
  | { mode: 'awake'; lastWakeTs: string; awakeMin: number }

export type AwakeState = Extract<NowState, { mode: 'awake' }>

export interface Plan {
  isBedtime: boolean
  napNumber: number
  sleepGoal: Date
  routineAt: Date
  patFrom?: Date
  expect?: string
  feedAt: Date
  feedOzText: string // e.g. '4' or '2–3'
  feedCollision: boolean
  feedNoteKey?: 'topUp' | 'topUpSmall' | 'pulledEarly'
}

export interface NightInfo {
  nextFeedAt?: Date
  nextFeedOzText?: string
  guidanceKey: 'nightEvening' | 'nightLate' | 'night3am' | 'nightEarlyMorning'
  guidanceParams?: Record<string, string | number>
}

export type AlertKey =
  | 'pastWakeBy'
  | 'protectBedtime'
  | 'veryLongNap'
  | 'settle30'
  | 'settle20'
  | 'earlyWake'
  | 'tapStartDay'
  | 'pastGoal'
  | 'startRoutineNap'
  | 'startRoutineBedtime'
  | 'routineSoonNap'
  | 'routineSoonBedtime'
  | 'feedWindowOpen'

export interface Alert {
  level: 'now' | 'warn' | 'info'
  key: AlertKey
  params?: Record<string, string | number>
}

export interface Snapshot {
  resolved: AppEvent[]
  sessions: Session[]
  dayKey: string
  day: DayDerived
  state: NowState
  plan?: Plan
  nightInfo?: NightInfo
  alerts: Alert[]
  milk: { total: number; target: number; projected: number }
  nap: { totalMin: number; targetMin: number; napsLeft: number }
}

/** Apply corrections (latest wins) and drop voided events; return chronologically sorted. */
export function resolveEvents(raw: AppEvent[]): AppEvent[] {
  const corrections = new Map<string, AppEvent>()
  const voided = new Set<string>()
  for (const e of raw) {
    if (e.type === 'void' && e.voids) voided.add(e.voids)
    if (e.type === 'correction' && e.corrects) {
      const prev = corrections.get(e.corrects)
      if (!prev || e.ts > prev.ts) corrections.set(e.corrects, e)
    }
  }
  return raw
    .filter((e) => e.type !== 'void' && e.type !== 'correction' && !voided.has(e.id))
    .map((e) => {
      const c = corrections.get(e.id)
      return c && c.patch ? { ...e, ...c.patch } : e
    })
    .sort((a, b) => a.ts.localeCompare(b.ts))
}

/** Pair asleep/awake events into sessions. A wake_morning also closes an open session. */
export function buildSessions(resolved: AppEvent[], s: Settings): Session[] {
  const out: Session[] = []
  let open: Session | null = null
  let pendingPutDown: AppEvent | null = null
  for (const e of resolved) {
    if (e.type === 'put_down') {
      pendingPutDown = e
    } else if (e.type === 'asleep') {
      if (open) continue // already asleep; ignore duplicate taps
      const start = new Date(e.ts)
      const h = start.getHours()
      const kind: 'nap' | 'night' = h >= s.nightStartHour || h < s.dayCutoffHour ? 'night' : 'nap'
      let putDownTs: string | undefined
      if (pendingPutDown) {
        const lead = diffMin(start, new Date(pendingPutDown.ts))
        if (lead >= 0 && lead <= 90) putDownTs = pendingPutDown.ts
      }
      open = { id: e.id, start: e.ts, kind, dayKey: dayKeyOf(e.ts, s.dayCutoffHour), putDownTs }
      pendingPutDown = null
    } else if (e.type === 'awake' || e.type === 'wake_morning') {
      if (open) {
        if (e.ts > open.start) {
          open.end = e.ts
          out.push(open)
        }
        open = null
      }
      pendingPutDown = null
    }
  }
  if (open) out.push(open)

  const napsByDay = new Map<string, Session[]>()
  for (const sess of out) {
    if (sess.kind !== 'nap') continue
    const arr = napsByDay.get(sess.dayKey) ?? []
    arr.push(sess)
    napsByDay.set(sess.dayKey, arr)
  }
  for (const arr of napsByDay.values()) arr.forEach((sess, i) => (sess.napIndex = i + 1))
  return out
}

export function sessionDur(sess: Session, now: Date): number {
  const end = sess.end ? new Date(sess.end) : now
  return Math.max(0, diffMin(end, new Date(sess.start)))
}

export function deriveDay(
  resolved: AppEvent[],
  sessions: Session[],
  key: string,
  s: Settings,
  now: Date,
): DayDerived {
  const feeds: FeedItem[] = resolved
    .filter((e) => e.type === 'feed' && typeof e.oz === 'number' && dayKeyOf(e.ts, s.dayCutoffHour) === key)
    .map((e) => ({ id: e.id, ts: e.ts, oz: e.oz as number }))
  const totalOz = Math.round(feeds.reduce((a, f) => a + f.oz, 0) * 10) / 10

  const naps = sessions.filter((x) => x.kind === 'nap' && x.dayKey === key)
  const nights = sessions.filter((x) => x.kind === 'night' && x.dayKey === key)

  const wakeEvent = resolved.find((e) => e.type === 'wake_morning' && dayKeyOf(e.ts, s.dayCutoffHour) === key)
  let morningWakeTs = wakeEvent?.ts
  if (!morningWakeTs) {
    // fallback: a night sleep that ended this day between cutoff and ~11:30 am
    const candidates = sessions.filter((x) => {
      if (!x.end || x.kind !== 'night') return false
      if (dayKeyOf(x.end, s.dayCutoffHour) !== key) return false
      const end = new Date(x.end)
      const hm = end.getHours() + end.getMinutes() / 60
      return hm >= s.dayCutoffHour && hm <= 11.5
    })
    morningWakeTs = candidates.length ? candidates[candidates.length - 1].end : undefined
  }

  const totalNapMin = naps.reduce((a, x) => a + sessionDur(x, now), 0)
  const overnightMin = nights.filter((x) => x.end).reduce((a, x) => a + sessionDur(x, now), 0)
  const napsDone = naps.filter((x) => x.end).length
  return { key, morningWakeTs, feeds, totalOz, naps, nights, totalNapMin, overnightMin, napsDone }
}

export function nowState(
  resolved: AppEvent[],
  sessions: Session[],
  day: DayDerived,
  s: Settings,
  now: Date,
): NowState {
  const open = sessions.find((x) => !x.end)
  if (open) {
    return {
      mode: 'sleeping',
      session: open,
      isNight: open.kind === 'night',
      sinceMin: Math.max(0, diffMin(now, new Date(open.start))),
    }
  }
  // settling: a put_down with no sleep event after it, in the last 2h
  for (let i = resolved.length - 1; i >= 0; i--) {
    const e = resolved[i]
    if (e.type === 'asleep' || e.type === 'awake' || e.type === 'wake_morning') break
    if (e.type === 'put_down') {
      const m = diffMin(now, new Date(e.ts))
      if (m >= 0 && m <= 120) return { mode: 'settling', putDownId: e.id, sinceTs: e.ts, sinceMin: m }
      break
    }
  }
  const closed = sessions.filter((x) => x.end)
  const lastEnd = closed.length ? closed[closed.length - 1].end : undefined
  const candidates = [lastEnd, day.morningWakeTs].filter((x): x is string => !!x).sort()
  const lastWakeTs = candidates.pop() ?? resolved[0]?.ts ?? now.toISOString()
  return { mode: 'awake', lastWakeTs, awakeMin: Math.max(0, diffMin(now, new Date(lastWakeTs))) }
}

export function buildPlan(
  state: AwakeState,
  day: DayDerived,
  resolved: AppEvent[],
  s: Settings,
  now: Date,
): Plan {
  const lastWake = new Date(state.lastWakeTs)
  const idx = Math.min(day.napsDone, s.awakeWindowsMin.length - 1)
  let sleepGoal = addMin(lastWake, s.awakeWindowsMin[idx])
  const napNumber = day.napsDone + 1
  const noNapAfter = atTime(day.key, s.noNapAfter, s.dayCutoffHour)
  const isBedtime = day.napsDone >= s.napCount || sleepGoal.getTime() > noNapAfter.getTime()

  if (isBedtime) {
    sleepGoal = addMin(lastWake, s.awakeWindowsMin[s.awakeWindowsMin.length - 1])
    const lo = atTime(day.key, s.bedtimeEarliest, s.dayCutoffHour)
    const hi = atTime(day.key, s.bedtimeLatest, s.dayCutoffHour)
    if (sleepGoal < lo) sleepGoal = lo
    if (sleepGoal > hi) sleepGoal = hi
  }
  const routineAt = addMin(sleepGoal, -s.routineLeadMin)
  const patFrom = !isBedtime ? addMin(lastWake, s.patNoEarlierMin) : undefined
  const expect = !isBedtime ? s.napExpect[Math.min(napNumber - 1, s.napExpect.length - 1)] : undefined

  const lastFeed = [...resolved].reverse().find((e) => e.type === 'feed')
  const nextFeedDue = lastFeed ? addMin(new Date(lastFeed.ts), s.feedIntervalMin) : now
  let feedAt = nextFeedDue
  let feedCollision = false
  let feedOzText = String(s.fullFeedOz)
  let feedNoteKey: Plan['feedNoteKey']

  if (isBedtime) {
    feedAt = addMin(sleepGoal, -s.topUpLeadMin)
    feedNoteKey = 'topUp'
    if (lastFeed && diffMin(feedAt, new Date(lastFeed.ts)) < s.feedIntervalMin - 60) {
      feedOzText = '2–3'
      feedNoteKey = 'topUpSmall'
    }
  } else {
    const windowStart = addMin(sleepGoal, -s.topUpLeadMin)
    const windowEnd = addMin(sleepGoal, 120)
    if (nextFeedDue >= windowStart && nextFeedDue <= windowEnd) {
      feedAt = windowStart
      feedCollision = true
      feedNoteKey = 'pulledEarly'
    }
  }
  return { isBedtime, napNumber, sleepGoal, routineAt, patFrom, expect, feedAt, feedOzText, feedCollision, feedNoteKey }
}

export function buildNightInfo(dayKey: string, s: Settings, now: Date): NightInfo {
  const plans = s.nightFeedPlan
    .map((p) => ({ at: atTime(dayKey, p.time, s.dayCutoffHour), oz: p.oz }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const next = plans.find((p) => diffMin(p.at, now) > -45)
  const h = now.getHours()
  let guidanceKey: NightInfo['guidanceKey']
  let guidanceParams: Record<string, string | number> | undefined
  if (h >= 18 && h < 22) guidanceKey = 'nightEvening'
  else if (h >= 22 || h < 2) guidanceKey = 'nightLate'
  else if (h >= 2 && h < s.dayCutoffHour) guidanceKey = 'night3am'
  else {
    guidanceKey = 'nightEarlyMorning'
    guidanceParams = { capOz: s.earlyFeedCapOz }
  }
  return { nextFeedAt: next?.at, nextFeedOzText: next ? String(next.oz) : undefined, guidanceKey, guidanceParams }
}

export function buildAlerts(
  state: NowState,
  day: DayDerived,
  plan: Plan | undefined,
  s: Settings,
  now: Date,
  todayK: string,
): Alert[] {
  const out: Alert[] = []
  const hour = now.getHours() + now.getMinutes() / 60

  if (state.mode === 'sleeping') {
    if (state.isNight) {
      const wakeBy = atTime(todayK, s.wakeBy, s.dayCutoffHour)
      if (now >= wakeBy && hour < 12) out.push({ level: 'now', key: 'pastWakeBy', params: { time: fmtHM(wakeBy) } })
    } else {
      if (state.session.napIndex === s.napCount && now >= atTime(day.key, s.nap3WakeBy, s.dayCutoffHour))
        out.push({ level: 'now', key: 'protectBedtime', params: { n: s.napCount } })
      if (state.sinceMin >= s.napMaxMin) out.push({ level: 'warn', key: 'veryLongNap' })
    }
  } else if (state.mode === 'settling') {
    if (state.sinceMin >= 30) out.push({ level: 'warn', key: 'settle30' })
    else if (state.sinceMin >= 20) out.push({ level: 'now', key: 'settle20' })
  } else {
    if (!day.morningWakeTs && hour >= s.dayCutoffHour && hour < 7.25) out.push({ level: 'info', key: 'earlyWake' })
    if (!day.morningWakeTs && hour >= 7.25 && hour < 12) out.push({ level: 'warn', key: 'tapStartDay' })
    if (plan) {
      const toGoal = diffMin(plan.sleepGoal, now)
      const toRoutine = diffMin(plan.routineAt, now)
      if (toGoal <= -15) out.push({ level: 'warn', key: 'pastGoal' })
      else if (toRoutine <= 0)
        out.push({
          level: 'now',
          key: plan.isBedtime ? 'startRoutineBedtime' : 'startRoutineNap',
          params: { time: fmtHM(plan.sleepGoal) },
        })
      else if (toRoutine <= 10)
        out.push({
          level: 'info',
          key: plan.isBedtime ? 'routineSoonBedtime' : 'routineSoonNap',
          params: { min: toRoutine },
        })
      const toFeed = diffMin(plan.feedAt, now)
      if (toFeed <= 0 && toFeed >= -120 && !plan.isBedtime)
        out.push({ level: 'info', key: 'feedWindowOpen', params: { oz: plan.feedOzText } })
    }
  }
  return out
}

export function deriveSnapshot(raw: AppEvent[], s: Settings, now: Date): Snapshot {
  const resolved = resolveEvents(raw)
  const sessions = buildSessions(resolved, s)
  const dayKey = todayKey(now, s.dayCutoffHour)
  const day = deriveDay(resolved, sessions, dayKey, s, now)
  const state = nowState(resolved, sessions, day, s, now)

  const hour = now.getHours()
  const isNightWindow = hour >= s.nightStartHour || hour < s.dayCutoffHour

  let plan: Plan | undefined
  if (state.mode === 'awake' && !isNightWindow) plan = buildPlan(state, day, resolved, s, now)
  const nightInfo =
    isNightWindow || (state.mode === 'sleeping' && state.isNight) ? buildNightInfo(dayKey, s, now) : undefined

  const alerts = buildAlerts(state, day, plan, s, now, dayKey)

  const remainingPlannedOz = s.nightFeedPlan
    .map((p) => ({ at: atTime(dayKey, p.time, s.dayCutoffHour), oz: p.oz }))
    .filter((p) => p.at > now)
    .reduce((a, p) => a + p.oz, 0)
  const milk = {
    total: day.totalOz,
    target: s.milkTargetOz,
    projected: Math.round((day.totalOz + remainingPlannedOz) * 10) / 10,
  }
  const nap = {
    totalMin: day.totalNapMin,
    targetMin: s.napTargetMin,
    napsLeft: Math.max(0, s.napCount - day.naps.length),
  }
  return { resolved, sessions, dayKey, day, state, plan, nightInfo, alerts, milk, nap }
}
