import { useState } from 'react'
import Sheet from '../components/Sheet'
import type { Snapshot } from '../engine/derive'
import { dayKeyOf, fmtDur, fmtHM, fmtRel, fromLocalInput, toLocalInput } from '../engine/time'
import { eventStore, useSettings } from '../store/store'
import type { AppEvent } from '../types'

type ActionKind = 'wake_morning' | 'feed' | 'asleep' | 'awake' | 'put_down' | 'solids' | 'burp' | 'note'

const META: Record<ActionKind, { icon: string; label: string }> = {
  wake_morning: { icon: '☀️', label: 'Start the day' },
  feed: { icon: '🍼', label: 'Fed' },
  asleep: { icon: '💤', label: 'Fell asleep' },
  awake: { icon: '🌅', label: 'Woke up' },
  put_down: { icon: '🛏️', label: 'Put down' },
  solids: { icon: '🥄', label: 'Solids' },
  burp: { icon: '💨', label: 'Burp' },
  note: { icon: '📝', label: 'Note' },
}

const OZ_CHIPS = [2, 2.5, 3, 3.5, 4, 4.5, 5]

function eventLabel(e: AppEvent): string {
  const m = META[e.type as ActionKind]
  const base = m ? `${m.icon} ${m.label}` : e.type
  if (e.type === 'feed') return `🍼 Fed ${e.oz ?? '?'} oz`
  return base
}

export default function TodayView({ snap, now }: { snap: Snapshot; now: Date }) {
  const settings = useSettings()
  const [action, setAction] = useState<ActionKind | null>(null)
  const [editing, setEditing] = useState<AppEvent | null>(null)
  const [toast, setToast] = useState<{ id: string; msg: string } | null>(null)

  const st = snap.state

  function log(kind: ActionKind, when: Date, oz?: number, note?: string) {
    const ev = eventStore.append({
      type: kind,
      ts: when.toISOString(),
      actor: settings.actor,
      ...(oz !== undefined ? { oz } : {}),
      ...(note ? { note } : {}),
    })
    setAction(null)
    setToast({ id: ev.id, msg: `${META[kind].icon} ${META[kind].label} · ${fmtHM(when)}` })
    setTimeout(() => setToast((t) => (t && t.id === ev.id ? null : t)), 6000)
  }

  function undo(id: string) {
    eventStore.append({ type: 'void', ts: new Date().toISOString(), voids: id, actor: settings.actor })
    setToast(null)
  }

  let kinds: ActionKind[]
  if (st.mode === 'sleeping') kinds = ['awake', 'feed', 'burp', 'note']
  else if (st.mode === 'settling') kinds = ['asleep', 'feed', 'burp', 'note']
  else kinds = ['put_down', 'asleep', 'feed', 'solids', 'burp', 'note']
  const showDayStart =
    st.mode !== 'sleeping' && !snap.day.morningWakeTs && now.getHours() >= 5 && now.getHours() < 12

  const todays = snap.resolved
    .filter((e) => dayKeyOf(e.ts, settings.dayCutoffHour) === snap.dayKey)
    .slice()
    .reverse()

  return (
    <div className="today">
      {snap.alerts.map((a, i) => (
        <div key={i} className={'alert ' + a.level}>
          {a.text}
        </div>
      ))}

      {/* status hero */}
      {st.mode === 'sleeping' && (
        <div className="hero">
          <div className="hero-title">
            {st.isNight ? '🌙 Night sleep' : `😴 Nap ${st.session.napIndex ?? snap.day.napsDone + 1}`}
          </div>
          <div className="hero-timer">{fmtDur(st.sinceMin)}</div>
          <div className="hero-sub">
            asleep since {fmtHM(new Date(st.session.start))}
            {!st.isNight &&
              st.session.napIndex &&
              settings.napExpect[st.session.napIndex - 1] &&
              ` · expect ${settings.napExpect[st.session.napIndex - 1]}`}
          </div>
        </div>
      )}
      {st.mode === 'settling' && (
        <div className="hero">
          <div className="hero-title">🛏️ Settling</div>
          <div className="hero-timer">{st.sinceMin} min</div>
          <div className="hero-sub">pat up to 20 min → break → try ~10 more</div>
          <button
            className="btn ghost"
            onClick={() => {
              eventStore.append({
                type: 'void',
                ts: new Date().toISOString(),
                voids: st.putDownId,
                actor: settings.actor,
              })
            }}
          >
            🤱 Picked him up (cancel settling)
          </button>
        </div>
      )}
      {st.mode === 'awake' && (
        <div className="hero">
          <div className="hero-title">🙂 Awake</div>
          <div className="hero-timer">{fmtDur(st.awakeMin)}</div>
          <div className="hero-sub">since {fmtHM(new Date(st.lastWakeTs))}</div>
        </div>
      )}

      {/* plan */}
      {snap.plan && (
        <div className="card">
          <div className="card-row main-row">
            <span>😴 {snap.plan.isBedtime ? 'Bedtime' : `Nap ${snap.plan.napNumber}`} goal</span>
            <span>
              <b>{fmtHM(snap.plan.sleepGoal)}</b> <small>{fmtRel(snap.plan.sleepGoal, now)}</small>
            </span>
          </div>
          <div className="card-row">
            <span>Routine at</span>
            <span>
              <b>{fmtHM(snap.plan.routineAt)}</b> <small>{fmtRel(snap.plan.routineAt, now)}</small>
            </span>
          </div>
          {snap.plan.expect && (
            <div className="card-row">
              <span>Expect</span>
              <span>{snap.plan.expect}</span>
            </div>
          )}
          {snap.plan.isBedtime && (
            <div className="card-row">
              <span>Asleep window</span>
              <span>6:30 – 7:45 pm</span>
            </div>
          )}
          <div className="card-row main-row">
            <span>🍼 Next feed</span>
            <span>
              <b>{fmtHM(snap.plan.feedAt)}</b> <small>{fmtRel(snap.plan.feedAt, now)}</small> · {snap.plan.feedOz}
            </span>
          </div>
          {snap.plan.feedNote && <div className="card-note">{snap.plan.feedNote}</div>}
        </div>
      )}

      {/* night plan */}
      {snap.nightInfo && (
        <div className="card night">
          <div className="card-row main-row">
            <span>🌙 Night plan</span>
            <span>
              {snap.nightInfo.nextFeedAt ? (
                <>
                  feed ~<b>{fmtHM(snap.nightInfo.nextFeedAt)}</b> · {snap.nightInfo.nextFeedOz}
                </>
              ) : (
                'no more planned feeds'
              )}
            </span>
          </div>
          <div className="card-note">{snap.nightInfo.guidance}</div>
        </div>
      )}

      {/* budgets */}
      <div className="card">
        <Budget
          label="🍼 Milk"
          value={snap.milk.total}
          max={snap.milk.target}
          text={`${snap.milk.total} / ${snap.milk.target} oz · projected ${snap.milk.projected}`}
        />
        <Budget
          label="😴 Naps"
          value={snap.nap.totalMin}
          max={snap.nap.targetMin}
          text={`${fmtDur(snap.nap.totalMin)} / ${fmtDur(snap.nap.targetMin)} · ${snap.nap.napsLeft} nap${
            snap.nap.napsLeft === 1 ? '' : 's'
          } left`}
        />
      </div>

      {/* actions */}
      {showDayStart && (
        <button className="btn day-start" onClick={() => setAction('wake_morning')}>
          ☀️ Start the day
        </button>
      )}
      <div className="actions">
        {kinds.map((k) => (
          <button key={k} className="btn action" onClick={() => setAction(k)}>
            <span className="action-icon">{META[k].icon}</span>
            {META[k].label}
          </button>
        ))}
      </div>

      {/* timeline */}
      <div className="card">
        <div className="card-title">Today</div>
        {todays.length === 0 && <div className="card-note">Nothing logged yet — tap ☀️ when he wakes up.</div>}
        {todays.map((e) => (
          <button key={e.id} className="tl-row" onClick={() => setEditing(e)}>
            <span className="tl-time">{fmtHM(new Date(e.ts))}</span>
            <span className="tl-label">
              {eventLabel(e)}
              {e.note ? <small> · {e.note}</small> : null}
            </span>
            <span className="tl-actor">{e.actor?.[0] ?? ''}</span>
          </button>
        ))}
      </div>

      {action && (
        <LogSheet
          kind={action}
          snap={snap}
          now={now}
          onClose={() => setAction(null)}
          onSave={log}
        />
      )}
      {editing && <EditSheet event={editing} onClose={() => setEditing(null)} />}

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          <button onClick={() => undo(toast.id)}>Undo</button>
        </div>
      )}
    </div>
  )
}

function Budget({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  return (
    <div className="budget">
      <div className="budget-head">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div className="bar">
        <div className={'bar-fill' + (pct >= 100 ? ' done' : '')} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

function LogSheet({
  kind,
  snap,
  now,
  onClose,
  onSave,
}: {
  kind: ActionKind
  snap: Snapshot
  now: Date
  onClose: () => void
  onSave: (kind: ActionKind, when: Date, oz?: number, note?: string) => void
}) {
  const [when, setWhen] = useState(toLocalInput(now))
  const [oz, setOz] = useState(4)
  const [note, setNote] = useState('')
  // waking from a night sleep in the morning → offer to start the day in one tap
  const nightWake =
    kind === 'awake' && snap.state.mode === 'sleeping' && snap.state.isNight && now.getHours() >= 5 && now.getHours() < 12
  const [startDay, setStartDay] = useState(nightWake && now.getHours() >= 6)

  const effectiveKind: ActionKind = nightWake && startDay ? 'wake_morning' : kind

  return (
    <Sheet title={`${META[kind].icon} ${META[kind].label}`} onClose={onClose}>
      <label className="field">
        <span>When</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {kind === 'feed' && (
        <>
          <div className="oz-chips">
            {OZ_CHIPS.map((v) => (
              <button key={v} className={'chip' + (oz === v ? ' on' : '')} onClick={() => setOz(v)}>
                {v}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Ounces</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={oz}
              onChange={(e) => setOz(parseFloat(e.target.value) || 0)}
            />
          </label>
        </>
      )}
      {nightWake && (
        <label className="field check">
          <input type="checkbox" checked={startDay} onChange={(e) => setStartDay(e.target.checked)} />
          <span>☀️ This is the morning wake-up (start the day)</span>
        </label>
      )}
      {(kind === 'note' || kind === 'solids' || kind === 'feed') && (
        <label className="field">
          <span>{kind === 'note' ? 'Note / question for trainer' : 'Note (optional)'}</span>
          <input
            type="text"
            value={note}
            placeholder={kind === 'solids' ? 'e.g. 1–2 tbsp oatmeal' : ''}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      <button
        className="btn primary"
        onClick={() =>
          onSave(effectiveKind, fromLocalInput(when), kind === 'feed' ? oz : undefined, note || undefined)
        }
      >
        Save
      </button>
    </Sheet>
  )
}

function EditSheet({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const settings = useSettings()
  const [when, setWhen] = useState(toLocalInput(new Date(event.ts)))
  const [oz, setOz] = useState(event.oz ?? 4)
  const [note, setNote] = useState(event.note ?? '')

  function save() {
    eventStore.append({
      type: 'correction',
      ts: new Date().toISOString(),
      actor: settings.actor,
      corrects: event.id,
      patch: {
        ts: fromLocalInput(when).toISOString(),
        ...(event.type === 'feed' ? { oz } : {}),
        note: note || undefined,
      },
    })
    onClose()
  }

  function remove() {
    if (!confirm('Delete this entry?')) return
    eventStore.append({ type: 'void', ts: new Date().toISOString(), actor: settings.actor, voids: event.id })
    onClose()
  }

  return (
    <Sheet title={`Edit · ${eventLabel(event)}`} onClose={onClose}>
      <label className="field">
        <span>When</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {event.type === 'feed' && (
        <label className="field">
          <span>Ounces</span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={oz}
            onChange={(e) => setOz(parseFloat(e.target.value) || 0)}
          />
        </label>
      )}
      <label className="field">
        <span>Note</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row-2">
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
