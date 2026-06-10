import { useState } from 'react'
import Sheet from '../components/Sheet'
import type { Snapshot } from '../engine/derive'
import { atTime, dayKeyOf, fmtDur, fmtHM, fromLocalInput, toLocalInput } from '../engine/time'
import { fmtRelL, t, type Lang, type MsgKey } from '../i18n'
import { eventStore, useSettings } from '../store/store'
import type { AppEvent } from '../types'

type ActionKind = 'wake_morning' | 'feed' | 'asleep' | 'awake' | 'put_down' | 'solids' | 'burp' | 'note'

const ICON: Record<ActionKind, string> = {
  wake_morning: '☀️',
  feed: '🍼',
  asleep: '💤',
  awake: '🌅',
  put_down: '🛏️',
  solids: '🥄',
  burp: '💨',
  note: '📝',
}

const LABEL_KEY: Record<ActionKind, MsgKey> = {
  wake_morning: 'actStartDay',
  feed: 'actFed',
  asleep: 'actAsleep',
  awake: 'actAwake',
  put_down: 'actPutDown',
  solids: 'actSolids',
  burp: 'actBurp',
  note: 'actNote',
}

const OZ_CHIPS = [2, 2.5, 3, 3.5, 4, 4.5, 5]

function eventLabel(e: AppEvent, lang: Lang): string {
  if (e.type === 'feed') return `🍼 ${t(lang, 'fedLabel', { oz: e.oz ?? '?' })}`
  const kind = e.type as ActionKind
  return ICON[kind] ? `${ICON[kind]} ${t(lang, LABEL_KEY[kind])}` : e.type
}

export default function TodayView({ snap, now }: { snap: Snapshot; now: Date }) {
  const settings = useSettings()
  const lang = settings.lang
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
    setToast({ id: ev.id, msg: `${ICON[kind]} ${t(lang, LABEL_KEY[kind])} · ${fmtHM(when)}` })
    setTimeout(() => setToast((x) => (x && x.id === ev.id ? null : x)), 6000)
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

  const bedWindow = `${fmtHM(atTime(snap.dayKey, settings.bedtimeEarliest, settings.dayCutoffHour))} – ${fmtHM(
    atTime(snap.dayKey, settings.bedtimeLatest, settings.dayCutoffHour),
  )}`

  return (
    <div className="today">
      {snap.alerts.map((a, i) => (
        <div key={i} className={'alert ' + a.level}>
          {t(lang, a.key, a.params)}
        </div>
      ))}

      {/* status hero */}
      {st.mode === 'sleeping' && (
        <div className="hero">
          <div className="hero-title">
            {st.isNight
              ? `🌙 ${t(lang, 'heroNight')}`
              : `😴 ${t(lang, 'heroNap', { n: st.session.napIndex ?? snap.day.napsDone + 1 })}`}
          </div>
          <div className="hero-timer">{fmtDur(st.sinceMin)}</div>
          <div className="hero-sub">
            {t(lang, 'asleepSince', { time: fmtHM(new Date(st.session.start)) })}
            {!st.isNight &&
              st.session.napIndex &&
              settings.napExpect[st.session.napIndex - 1] &&
              ` · ${t(lang, 'expectShort', { x: settings.napExpect[st.session.napIndex - 1] })}`}
          </div>
        </div>
      )}
      {st.mode === 'settling' && (
        <div className="hero">
          <div className="hero-title">🛏️ {t(lang, 'heroSettling')}</div>
          <div className="hero-timer">{st.sinceMin} min</div>
          <div className="hero-sub">{t(lang, 'settleLadder')}</div>
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
            {t(lang, 'pickedUp')}
          </button>
        </div>
      )}
      {st.mode === 'awake' && (
        <div className="hero">
          <div className="hero-title">🙂 {t(lang, 'heroAwake')}</div>
          <div className="hero-timer">{fmtDur(st.awakeMin)}</div>
          <div className="hero-sub">{t(lang, 'sinceTime', { time: fmtHM(new Date(st.lastWakeTs)) })}</div>
        </div>
      )}

      {/* plan */}
      {snap.plan && (
        <div className="card">
          <div className="card-row main-row">
            <span>
              😴 {snap.plan.isBedtime ? t(lang, 'bedtimeGoal') : t(lang, 'napGoal', { n: snap.plan.napNumber })}
            </span>
            <span>
              <b>{fmtHM(snap.plan.sleepGoal)}</b> <small>{fmtRelL(snap.plan.sleepGoal, now, lang)}</small>
            </span>
          </div>
          <div className="card-row">
            <span>{t(lang, 'routineAt')}</span>
            <span>
              <b>{fmtHM(snap.plan.routineAt)}</b> <small>{fmtRelL(snap.plan.routineAt, now, lang)}</small>
            </span>
          </div>
          {snap.plan.expect && (
            <div className="card-row">
              <span>{t(lang, 'expect')}</span>
              <span>{snap.plan.expect}</span>
            </div>
          )}
          {snap.plan.isBedtime && (
            <div className="card-row">
              <span>{t(lang, 'asleepWindow')}</span>
              <span>{bedWindow}</span>
            </div>
          )}
          <div className="card-row main-row">
            <span>🍼 {t(lang, 'nextFeed')}</span>
            <span>
              <b>{fmtHM(snap.plan.feedAt)}</b> <small>{fmtRelL(snap.plan.feedAt, now, lang)}</small> ·{' '}
              {snap.plan.feedOzText} {t(lang, 'ozUnit')}
            </span>
          </div>
          {snap.plan.feedNoteKey && <div className="card-note">{t(lang, snap.plan.feedNoteKey)}</div>}
        </div>
      )}

      {/* night plan */}
      {snap.nightInfo && (
        <div className="card night">
          <div className="card-row main-row">
            <span>🌙 {t(lang, 'nightPlan')}</span>
            <span>
              {snap.nightInfo.nextFeedAt
                ? t(lang, 'nightNextFeed', {
                    time: fmtHM(snap.nightInfo.nextFeedAt),
                    oz: snap.nightInfo.nextFeedOzText ?? '',
                  })
                : t(lang, 'noMoreFeeds')}
            </span>
          </div>
          <div className="card-note">{t(lang, snap.nightInfo.guidanceKey, snap.nightInfo.guidanceParams)}</div>
        </div>
      )}

      {/* budgets */}
      <div className="card">
        <Budget
          label={`🍼 ${t(lang, 'milkLabel')}`}
          value={snap.milk.total}
          max={snap.milk.target}
          text={t(lang, 'budgetMilk', {
            total: snap.milk.total,
            target: snap.milk.target,
            proj: snap.milk.projected,
          })}
        />
        <Budget
          label={`😴 ${t(lang, 'napsLabel')}`}
          value={snap.nap.totalMin}
          max={snap.nap.targetMin}
          text={t(lang, 'budgetNap', {
            cur: fmtDur(snap.nap.totalMin),
            target: fmtDur(snap.nap.targetMin),
            n: snap.nap.napsLeft,
          })}
        />
      </div>

      {/* actions */}
      {showDayStart && (
        <button className="btn day-start" onClick={() => setAction('wake_morning')}>
          ☀️ {t(lang, 'actStartDay')}
        </button>
      )}
      <div className="actions">
        {kinds.map((k) => (
          <button key={k} className="btn action" onClick={() => setAction(k)}>
            <span className="action-icon">{ICON[k]}</span>
            {t(lang, LABEL_KEY[k])}
          </button>
        ))}
      </div>

      {/* timeline */}
      <div className="card">
        <div className="card-title">{t(lang, 'todayTitle')}</div>
        {todays.length === 0 && <div className="card-note">{t(lang, 'emptyToday')}</div>}
        {todays.map((e) => (
          <button key={e.id} className="tl-row" onClick={() => setEditing(e)}>
            <span className="tl-time">{fmtHM(new Date(e.ts))}</span>
            <span className="tl-label">
              {eventLabel(e, lang)}
              {e.note ? <small> · {e.note}</small> : null}
            </span>
            <span className="tl-actor">{e.actor?.[0] ?? ''}</span>
          </button>
        ))}
      </div>

      {action && <LogSheet kind={action} snap={snap} now={now} onClose={() => setAction(null)} onSave={log} />}
      {editing && <EditSheet event={editing} onClose={() => setEditing(null)} />}

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          <button onClick={() => undo(toast.id)}>{t(lang, 'undo')}</button>
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
  const settings = useSettings()
  const lang = settings.lang
  const [when, setWhen] = useState(toLocalInput(now))
  const [oz, setOz] = useState(settings.fullFeedOz)
  const [note, setNote] = useState('')
  // waking from a night sleep in the morning → offer to start the day in one tap
  const nightWake =
    kind === 'awake' &&
    snap.state.mode === 'sleeping' &&
    snap.state.isNight &&
    now.getHours() >= 5 &&
    now.getHours() < 12
  const [startDay, setStartDay] = useState(nightWake && now.getHours() >= 6)

  const effectiveKind: ActionKind = nightWake && startDay ? 'wake_morning' : kind

  return (
    <Sheet title={`${ICON[kind]} ${t(lang, LABEL_KEY[kind])}`} onClose={onClose}>
      <label className="field">
        <span>{t(lang, 'whenLabel')}</span>
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
            <span>{t(lang, 'ouncesLabel')}</span>
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
          <span>{t(lang, 'morningWakeCheck')}</span>
        </label>
      )}
      {(kind === 'note' || kind === 'solids' || kind === 'feed') && (
        <label className="field">
          <span>{kind === 'note' ? t(lang, 'noteTrainer') : t(lang, 'noteOptional')}</span>
          <input
            type="text"
            value={note}
            placeholder={kind === 'solids' ? t(lang, 'solidsPlaceholder') : ''}
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
        {t(lang, 'save')}
      </button>
    </Sheet>
  )
}

function EditSheet({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const settings = useSettings()
  const lang = settings.lang
  const [when, setWhen] = useState(toLocalInput(new Date(event.ts)))
  const [oz, setOz] = useState(event.oz ?? settings.fullFeedOz)
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
    if (!confirm(t(lang, 'confirmDelete'))) return
    eventStore.append({ type: 'void', ts: new Date().toISOString(), actor: settings.actor, voids: event.id })
    onClose()
  }

  return (
    <Sheet title={`${t(lang, 'edit')} · ${eventLabel(event, lang)}`} onClose={onClose}>
      <label className="field">
        <span>{t(lang, 'whenLabel')}</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {event.type === 'feed' && (
        <label className="field">
          <span>{t(lang, 'ouncesLabel')}</span>
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
        <span>{t(lang, 'noteOptional')}</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row-2">
        <button className="btn danger" onClick={remove}>
          {t(lang, 'delete')}
        </button>
        <button className="btn primary" onClick={save}>
          {t(lang, 'save')}
        </button>
      </div>
    </Sheet>
  )
}
