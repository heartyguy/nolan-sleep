import { useEffect, useState } from 'react'
import { deriveSnapshot } from './engine/derive'
import { eventStore, settingsStore, useEvents, useSettings } from './store/store'
import ExportView from './views/ExportView'
import SettingsView from './views/SettingsView'
import TodayView from './views/TodayView'

type Tab = 'today' | 'export' | 'settings'

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
    const t = setInterval(() => setS(eventStore.sync ? eventStore.sync.status : 'off'), 2000)
    return () => clearInterval(t)
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
    const t = setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const snap = deriveSnapshot(events, settings, now)

  return (
    <div className="app">
      <header className="header">
        <div className="brand">🌙 Nolan</div>
        <ActorPicker />
        <SyncDot />
      </header>
      <main className="main">
        {tab === 'today' && <TodayView snap={snap} now={now} />}
        {tab === 'export' && <ExportView events={events} settings={settings} now={now} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <nav className="tabbar">
        {(
          [
            ['today', 'Today'],
            ['export', 'Trainer log'],
            ['settings', 'Settings'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
