import { useMemo } from 'react'
import { buildSessions, deriveDay, resolveEvents } from '../engine/derive'
import { dayKeyOf, diffMin, fmtDur } from '../engine/time'
import { t } from '../i18n'
import type { AppEvent, Settings } from '../types'

export default function HistoryView({
  events,
  settings,
  now,
}: {
  events: AppEvent[]
  settings: Settings
  now: Date
}) {
  const lang = settings.lang
  const days = useMemo(() => {
    const resolved = resolveEvents(events)
    const sessions = buildSessions(resolved, settings)
    const keys = Array.from(new Set(resolved.map((e) => dayKeyOf(e.ts, settings.dayCutoffHour)))).sort().reverse()
    return keys.map((key) => {
      const day = deriveDay(resolved, sessions, key, settings, now)
      // night feeds: feeds in this day that happened during the night window
      const nightFeeds = day.feeds.filter((f) => {
        const h = new Date(f.ts).getHours()
        return h >= settings.nightStartHour || h < settings.dayCutoffHour
      })
      // settle time: put-down → asleep, averaged over sessions that tracked it
      const settles = [...day.naps, ...day.nights]
        .filter((x) => x.putDownTs)
        .map((x) => diffMin(new Date(x.start), new Date(x.putDownTs!)))
      const avgSettle = settles.length
        ? Math.round(settles.reduce((a, b) => a + b, 0) / settles.length)
        : undefined
      return { key, day, nightFeeds, avgSettle }
    })
  }, [events, settings, now])

  const locale = lang === 'zh' ? 'zh-CN' : 'en-US'

  if (!days.length) return <div className="card card-note">{t(lang, 'historyEmpty')}</div>

  return (
    <div className="history">
      {days.map(({ key, day, nightFeeds, avgSettle }) => {
        const [y, m, d] = key.split('-').map(Number)
        const label = new Date(y, m - 1, d).toLocaleDateString(locale, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const milkOk = day.totalOz >= settings.milkMinOz && day.totalOz <= settings.milkMaxOz
        const napOk = day.totalNapMin >= settings.napMinMin
        return (
          <div className="card" key={key}>
            <div className="card-title">{label}</div>
            <div className="card-row">
              <span>🍼 {t(lang, 'statMilk')}</span>
              <span className={milkOk ? 'stat good' : 'stat off'}>
                {day.totalOz} / {settings.milkTargetOz} {t(lang, 'ozUnit')}
              </span>
            </div>
            <div className="card-row">
              <span>😴 {t(lang, 'statNaps')}</span>
              <span className={napOk ? 'stat good' : 'stat off'}>
                {fmtDur(day.totalNapMin)} · {t(lang, 'napsCount', { n: day.naps.length })}
              </span>
            </div>
            {day.overnightMin > 0 && (
              <div className="card-row">
                <span>🌙 {t(lang, 'statOvernight')}</span>
                <span className="stat">{fmtDur(day.overnightMin)}</span>
              </div>
            )}
            {avgSettle !== undefined && (
              <div className="card-row">
                <span>⏱️ {t(lang, 'statSettle')}</span>
                <span className="stat">{avgSettle} min</span>
              </div>
            )}
            {nightFeeds.length > 0 && (
              <div className="card-row">
                <span>🌙🍼 {t(lang, 'statNightFeeds')}</span>
                <span className="stat">{nightFeeds.map((f) => f.oz).join(' + ')} {t(lang, 'ozUnit')}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
