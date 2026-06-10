import { useSyncExternalStore } from 'react'
import type { AppEvent, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { SyncClient } from './sync'

const EVENTS_KEY = 'nolan.events.v1'
const SETTINGS_KEY = 'nolan.settings.v1'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

class EventStore {
  private events: AppEvent[] = loadJSON<AppEvent[]>(EVENTS_KEY, [])
  private listeners = new Set<() => void>()
  sync: SyncClient | null = null

  getEvents = () => this.events

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private persist() {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(this.events))
  }

  private notify() {
    this.listeners.forEach((f) => f())
  }

  append(e: Omit<AppEvent, 'id'> & { id?: string }): AppEvent {
    const ev = { id: e.id ?? crypto.randomUUID(), ...e } as AppEvent
    this.events = [...this.events, ev]
    this.persist()
    this.notify()
    this.sync?.push(ev)
    return ev
  }

  /** Union-merge events from sync or a backup file (dedup by id). */
  mergeRemote = (incoming: AppEvent[]) => {
    const known = new Set(this.events.map((x) => x.id))
    const fresh = incoming.filter((x) => x && x.id && !known.has(x.id))
    if (!fresh.length) return
    this.events = [...this.events, ...fresh]
    this.persist()
    this.notify()
  }

  importBackup(incoming: AppEvent[]): number {
    const known = new Set(this.events.map((x) => x.id))
    const fresh = incoming.filter((x) => x && x.id && !known.has(x.id))
    this.mergeRemote(incoming)
    for (const e of fresh) this.sync?.push(e)
    return fresh.length
  }

  configureSync(s: Settings) {
    this.sync?.stop()
    this.sync = null
    if (s.supabaseUrl && s.supabaseAnonKey && s.familyCode) {
      this.sync = new SyncClient(s.supabaseUrl, s.supabaseAnonKey, s.familyCode, this.mergeRemote)
      void this.sync.start(this.events)
    }
    this.notify()
  }
}

class SettingsStore {
  private settings: Settings = { ...DEFAULT_SETTINGS, ...loadJSON<Partial<Settings>>(SETTINGS_KEY, {}) }
  private listeners = new Set<() => void>()

  getSettings = () => this.settings

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    this.listeners.forEach((f) => f())
    if ('supabaseUrl' in patch || 'supabaseAnonKey' in patch || 'familyCode' in patch) {
      eventStore.configureSync(this.settings)
    }
  }
}

export const eventStore = new EventStore()
export const settingsStore = new SettingsStore()

export function useEvents(): AppEvent[] {
  return useSyncExternalStore(eventStore.subscribe, eventStore.getEvents)
}

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getSettings)
}

// boot: connect sync if configured
eventStore.configureSync(settingsStore.getSettings())
