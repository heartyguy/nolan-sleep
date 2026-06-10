import { useEffect, useState } from 'react'
import { deriveSnapshot } from './engine/derive'
import { t } from './i18n'
import { eventStore, settingsStore, useEvents, useSettings } from './store/store'
import ExportView from './views/ExportView'
import HistoryView from './views/HistoryView'
import SettingsView from './views/SettingsView'
import TodayView from './views/TodayView'

type Tab = 'today' | 'history' | 'export' | 'settings'

function ActorPicker() {
  const settings = useSettings()
  return (
    <div className="actors">
      {settings.actors.map((a) => (
        <button
          key={a}
          className={'chip' + (a === settings.actor ? ' on' : '')}
          onClick={() => settingsStore.update({ actor: a })}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

function SyncDot() {
  const [s, setS] = useState<string>(eventStore.sync ? eventStore.sync.status : 'off')
  useEffect(() => {
    const timer = setInterval(() => setS(eventStore.sync ? eventStore.sync.status : 'off'), 2000)
    return () => clearInterval(timer)
  }, [])
  if (s === 'off') return null
  return <span className={'dot ' + s} title={'sync: ' + s} />
}

export default function App() {
  const events = useEvents()
  const settings = useSettings()
  const [now, setNow] = useState(() => new Date())
  const [tab, setTab] = useState<Tab>('today')

  // Clocks are absolute timestamps; this only refreshes the display —
  // including immediately when the tab comes back from the background.
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const snap = deriveSnapshot(events, settings, now)
  const lang = settings.lang

  return (
    <div className="app">
      <header className="header">
        <div className="brand">🌙 Nolan</div>
        <ActorPicker />
        <SyncDot />
      </header>
      <main className="main">
        {tab === 'today' && <TodayView snap={snap} now={now} />}
        {tab === 'history' && <HistoryView events={events} settings={settings} now={now} />}
        {tab === 'export' && <ExportView events={events} settings={settings} now={now} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <nav className="tabbar">
        {(
          [
            ['today', t(lang, 'tabToday')],
            ['history', t(lang, 'tabHistory')],
            ['export', t(lang, 'tabLog')],
            ['settings', t(lang, 'tabSettings')],
          ] as [Tab, string][]
        ).map(([tb, label]) => (
          <button key={tb} className={tab === tb ? 'on' : ''} onClick={() => setTab(tb)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
