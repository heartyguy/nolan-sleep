import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { AppEvent } from '../types'

const OUTBOX_KEY = 'nolan.outbox.v1'

export type SyncStatus = 'connecting' | 'online' | 'error'

/**
 * Append-only sync: every device pushes its events (upsert by id, duplicates
 * ignored) and merges everything it sees. No conflicts are possible because
 * edits/deletes are themselves events (correction/void).
 */
export class SyncClient {
  private sb: SupabaseClient
  private channel: RealtimeChannel | null = null
  private outbox: AppEvent[] = []
  private timer: number | null = null
  private flushing = false
  status: SyncStatus = 'connecting'
  private statusListeners = new Set<(s: SyncStatus) => void>()

  constructor(
    url: string,
    key: string,
    private family: string,
    private onRemote: (events: AppEvent[]) => void,
  ) {
    this.sb = createClient(url, key)
    try {
      this.outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
    } catch {
      this.outbox = []
    }
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  private setStatus(s: SyncStatus) {
    this.status = s
    this.statusListeners.forEach((f) => f(s))
  }

  private persistOutbox() {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox))
  }

  async start(local: AppEvent[]) {
    this.setStatus('connecting')
    try {
      const { data, error } = await this.sb
        .from('events')
        .select('id, payload')
        .eq('family', this.family)
        .order('ts', { ascending: true })
      if (error) {
        this.setStatus('error')
      } else {
        const remoteIds = new Set((data ?? []).map((r: { id: string }) => r.id))
        this.onRemote((data ?? []).map((r: { payload: AppEvent }) => r.payload))
        const queued = new Set(this.outbox.map((e) => e.id))
        for (const e of local) if (!remoteIds.has(e.id) && !queued.has(e.id)) this.outbox.push(e)
        this.persistOutbox()
        this.setStatus('online')
      }
    } catch {
      this.setStatus('error')
    }
    void this.flush()

    this.channel = this.sb
      .channel('events-' + this.family)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `family=eq.${this.family}` },
        (payload: { new?: { payload?: AppEvent } }) => {
          if (payload.new?.payload) this.onRemote([payload.new.payload])
        },
      )
      .subscribe()

    this.timer = window.setInterval(() => void this.flush(), 30_000)
    window.addEventListener('online', this.flushHandler)
    document.addEventListener('visibilitychange', this.flushHandler)
  }

  private flushHandler = () => void this.flush()

  push(e: AppEvent) {
    this.outbox.push(e)
    this.persistOutbox()
    void this.flush()
  }

  async flush() {
    if (this.flushing || !this.outbox.length) return
    this.flushing = true
    try {
      const batch = [...this.outbox]
      const rows = batch.map((e) => ({ id: e.id, family: this.family, ts: e.ts, payload: e }))
      const { error } = await this.sb.from('events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      if (!error) {
        const sent = new Set(batch.map((e) => e.id))
        this.outbox = this.outbox.filter((e) => !sent.has(e.id))
        this.persistOutbox()
        if (this.status !== 'online') this.setStatus('online')
      } else {
        this.setStatus('error')
      }
    } catch {
      this.setStatus('error')
    } finally {
      this.flushing = false
    }
  }

  stop() {
    if (this.channel) void this.sb.removeChannel(this.channel)
    if (this.timer !== null) clearInterval(this.timer)
    window.removeEventListener('online', this.flushHandler)
    document.removeEventListener('visibilitychange', this.flushHandler)
  }
}
