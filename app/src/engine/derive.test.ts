import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../types'
import { DEFAULT_SETTINGS as S } from '../types'
import {
  buildPlan,
  buildSessions,
  deriveDay,
  nowState,
  resolveEvents,
  type AwakeState,
} from './derive'
import { dayKeyOf } from './time'

let n = 0
function ev(type: AppEvent['type'], mo: number, d: number, hh: number, mm: number, extra: Partial<AppEvent> = {}): AppEvent {
  return { id: `e${n++}`, ts: new Date(2026, mo - 1, d, hh, mm).toISOString(), type, ...extra }
}

/** Nolan's real June 9 log — totals confirmed by the trainer (23.5 oz, naps 3:30). */
function june9(): AppEvent[] {
  return [
    ev('feed', 6, 9, 5, 45, { oz: 4 }), // pre-wake early feed, counts toward June 9
    ev('wake_morning', 6, 9, 8, 30),
    ev('feed', 6, 9, 9, 0, { oz: 4 }),
    ev('asleep', 6, 9, 11, 0),
    ev('awake', 6, 9, 11, 10),
    ev('asleep', 6, 9, 12, 30),
    ev('awake', 6, 9, 13, 40),
    ev('feed', 6, 9, 13, 40, { oz: 4 }),
    ev('asleep', 6, 9, 15, 10),
    ev('awake', 6, 9, 17, 20),
    ev('feed', 6, 9, 18, 0, { oz: 4.5 }),
    ev('feed', 6, 9, 20, 10, { oz: 3 }),
    ev('put_down', 6, 9, 20, 29),
    ev('asleep', 6, 9, 20, 52),
    ev('awake', 6, 9, 23, 40),
    ev('feed', 6, 9, 23, 40, { oz: 4 }),
    ev('asleep', 6, 9, 23, 55),
  ]
}

describe('June 9 fixture (matches trainer-confirmed totals)', () => {
  const now = new Date(2026, 5, 10, 0, 30)
  const resolved = resolveEvents(june9())
  const sessions = buildSessions(resolved, S)
  const day = deriveDay(resolved, sessions, '2026-06-09', S, now)

  it('counts 23.5 oz incl. night + pre-wake feeds', () => {
    expect(day.totalOz).toBe(23.5)
  })

  it('finds 3 naps totalling 3:30', () => {
    expect(day.naps.length).toBe(3)
    expect(day.totalNapMin).toBe(210)
  })

  it('classifies evening sleeps as night with put-down attached', () => {
    expect(day.nights.length).toBe(2)
    expect(day.nights[0].putDownTs).toBeDefined()
    expect(day.overnightMin).toBe(168) // 20:52 -> 23:40
  })

  it('is "sleeping at night" at 00:30', () => {
    const st = nowState(resolved, sessions, day, S, now)
    expect(st.mode).toBe('sleeping')
    if (st.mode === 'sleeping') expect(st.isNight).toBe(true)
  })
})

describe('day boundary (5 am cutoff)', () => {
  it('assigns 3 am to the prior day and 5:30 am to the new day', () => {
    expect(dayKeyOf(new Date(2026, 5, 10, 3, 0).toISOString(), 5)).toBe('2026-06-09')
    expect(dayKeyOf(new Date(2026, 5, 10, 5, 30).toISOString(), 5)).toBe('2026-06-10')
  })
})

describe('plan clocks', () => {
  it('after the 3rd nap, projects a clamped bedtime + top-up feed 40 min before', () => {
    const events = june9().slice(0, 10) // through the 17:20 wake-up
    const now = new Date(2026, 5, 9, 17, 30)
    const resolved = resolveEvents(events)
    const sessions = buildSessions(resolved, S)
    const day = deriveDay(resolved, sessions, '2026-06-09', S, now)
    const st = nowState(resolved, sessions, day, S, now) as AwakeState
    expect(st.mode).toBe('awake')
    const plan = buildPlan(st, day, resolved, S, now)
    expect(plan.isBedtime).toBe(true)
    // 17:20 + 2:30 = 19:50 -> clamped to 19:45; feed at 19:05
    expect([plan.sleepGoal.getHours(), plan.sleepGoal.getMinutes()]).toEqual([19, 45])
    expect([plan.feedAt.getHours(), plan.feedAt.getMinutes()]).toEqual([19, 5])
  })

  it('pulls a colliding feed to goal − 40 min', () => {
    const events = [
      ev('wake_morning', 6, 9, 7, 0),
      ev('feed', 6, 9, 8, 0, { oz: 4 }),
      ev('asleep', 6, 9, 9, 15),
      ev('awake', 6, 9, 9, 45),
    ]
    const now = new Date(2026, 5, 9, 10, 0)
    const resolved = resolveEvents(events)
    const sessions = buildSessions(resolved, S)
    const day = deriveDay(resolved, sessions, '2026-06-09', S, now)
    const st = nowState(resolved, sessions, day, S, now) as AwakeState
    const plan = buildPlan(st, day, resolved, S, now)
    // goal 9:45 + 2:30 = 12:15; next feed due 12:00 collides -> 11:35
    expect(plan.isBedtime).toBe(false)
    expect(plan.feedCollision).toBe(true)
    expect([plan.feedAt.getHours(), plan.feedAt.getMinutes()]).toEqual([11, 35])
  })
})

describe('corrections and voids', () => {
  it('a correction overrides oz; a void removes the event', () => {
    const events = june9()
    const target = events.find((e) => e.oz === 4.5)!
    const victim = events.find((e) => e.oz === 3)!
    events.push({
      id: 'c1',
      ts: new Date(2026, 5, 9, 21, 0).toISOString(),
      type: 'correction',
      corrects: target.id,
      patch: { oz: 4 },
    })
    events.push({ id: 'v1', ts: new Date(2026, 5, 9, 21, 1).toISOString(), type: 'void', voids: victim.id })
    const resolved = resolveEvents(events)
    const sessions = buildSessions(resolved, S)
    const day = deriveDay(resolved, sessions, '2026-06-09', S, new Date(2026, 5, 10, 0, 30))
    expect(day.totalOz).toBe(20) // 23.5 - 0.5 - 3
  })
})
