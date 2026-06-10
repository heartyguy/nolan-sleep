export type EventType =
  | 'wake_morning' // started the day
  | 'feed'         // milk bottle, oz
  | 'asleep'
  | 'awake'
  | 'put_down'     // put in crib to settle (start of pat/settle ladder)
  | 'solids'
  | 'burp'
  | 'note'
  | 'correction'   // patches an earlier event
  | 'void'         // removes an earlier event

export interface AppEvent {
  id: string
  ts: string // ISO UTC
  type: EventType
  actor?: string
  oz?: number
  note?: string
  corrects?: string
  patch?: { ts?: string; oz?: number; note?: string }
  voids?: string
  source?: 'app' | 'import'
}

export interface NightFeed {
  time: string // 'HH:MM' local, times before the day cutoff belong to the next calendar date
  oz: number
}

export interface Settings {
  actor: string
  actors: string[]
  lang: 'en' | 'zh'
  dayCutoffHour: number   // events at/after this hour belong to the new day
  wakeBy: string          // wake him by this time each morning
  awakeWindowsMin: number[] // [before nap1, nap2, nap3, bedtime]
  patNoEarlierMin: number // only start patting this long after last wake
  routineLeadMin: number  // start routine this many min before asleep goal
  feedIntervalMin: number // 4h feed windows
  topUpLeadMin: number    // bedtime top-up feed this many min before asleep goal
  fullFeedOz: number
  milkTargetOz: number
  milkMinOz: number
  milkMaxOz: number
  napTargetMin: number
  napMinMin: number
  napMaxMin: number
  napCount: number
  napExpect: string[]     // expected length text per nap
  nap3WakeBy: string      // wake from last nap by this time
  noNapAfter: string      // if the sleep goal lands after this, it's bedtime
  bedtimeEarliest: string
  bedtimeLatest: string
  nightStartHour: number  // sleep starting at/after this hour is night sleep
  nightFeedPlan: NightFeed[]
  earlyFeedCapOz: number  // cap for a 5–6 am feed
  supabaseUrl: string
  supabaseAnonKey: string
  familyCode: string
}

export const DEFAULT_SETTINGS: Settings = {
  actor: 'Mom',
  actors: ['Mom', 'Grandpa', 'Grandma'],
  lang: 'en',
  dayCutoffHour: 5,
  wakeBy: '07:15',
  awakeWindowsMin: [135, 150, 150, 150],
  patNoEarlierMin: 140,
  routineLeadMin: 10,
  feedIntervalMin: 240,
  topUpLeadMin: 40,
  fullFeedOz: 4,
  milkTargetOz: 28,
  milkMinOz: 25,
  milkMaxOz: 30,
  napTargetMin: 165,
  napMinMin: 120,
  napMaxMin: 240,
  napCount: 3,
  napExpect: ['45 min – 1:20', '1 – 1.5 h', '30 – 40 min'],
  nap3WakeBy: '17:30',
  noNapAfter: '17:45',
  bedtimeEarliest: '18:30',
  bedtimeLatest: '19:45',
  nightStartHour: 18,
  nightFeedPlan: [
    { time: '23:00', oz: 4 },
    { time: '03:00', oz: 4 },
  ],
  earlyFeedCapOz: 3,
  supabaseUrl: '',
  supabaseAnonKey: '',
  familyCode: 'nolan',
}
