import { describe, expect, it } from 'vitest'
import { buildSessions, resolveEvents } from '../engine/derive'
import type { AppEvent } from '../types'
import { DEFAULT_SETTINGS as S } from '../types'
import { buildTrainerLog } from './trainerLog'

let n = 100
function ev(type: AppEvent['type'], d: number, hh: number, mm: number, extra: Partial<AppEvent> = {}): AppEvent {
  return { id: `t${n++}`, ts: new Date(2026, 5, d, hh, mm).toISOString(), type, actor: 'Mom', ...extra }
}

describe('trainer log export', () => {
  it('renders the nap table, feed totals and activity log for June 9', () => {
    const events = [
      ev('feed', 9, 5, 45, { oz: 4 }),
      ev('wake_morning', 9, 8, 30),
      ev('feed', 9, 9, 0, { oz: 4 }),
      ev('asleep', 9, 11, 0),
      ev('awake', 9, 11, 10),
      ev('asleep', 9, 12, 30),
      ev('awake', 9, 13, 40),
      ev('feed', 9, 13, 40, { oz: 4 }),
      ev('asleep', 9, 15, 10),
      ev('awake', 9, 17, 20),
      ev('feed', 9, 18, 0, { oz: 4.5 }),
      ev('feed', 9, 20, 10, { oz: 3 }),
      ev('put_down', 9, 20, 29),
      ev('asleep', 9, 20, 52),
      ev('awake', 9, 23, 40),
      ev('feed', 9, 23, 40, { oz: 4 }),
      ev('note', 9, 21, 30, { note: 'Do we need to brush his two teeth?' }),
    ]
    const resolved = resolveEvents(events)
    const sessions = buildSessions(resolved, S)
    const log = buildTrainerLog('2026-06-09', resolved, sessions, S, new Date(2026, 5, 10, 0, 0))

    expect(log).toContain('Nap 1')
    expect(log).toContain('Nap 3')
    expect(log).toContain('Bedtime')
    expect(log).toContain('Total naps\t\t\t\t3:30')
    expect(log).toContain('24h total\t23.5')
    expect(log).toContain('Awake for the day')
    expect(log).toContain('Do we need to brush his two teeth?')
    expect(log).toContain('\tMom') // caregiver attribution
    // awake-before column for nap 1: 8:30 wake -> 11:00 asleep = 2:30
    expect(log).toContain('2:30')
  })
})
