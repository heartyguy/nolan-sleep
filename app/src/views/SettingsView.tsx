import { useEffect, useRef, useState } from 'react'
import { t, type Lang } from '../i18n'
import { eventStore, settingsStore, useEvents, useSettings } from '../store/store'
import type { Settings } from '../types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="set-row">
      <span>{label}</span>
      {children}
    </label>
  )
}

export default function SettingsView() {
  const settings = useSettings()
  const events = useEvents()
  const lang = settings.lang
  const upd = (patch: Partial<Settings>) => settingsStore.update(patch)

  const num = (v: string, fallback: number) => {
    const x = parseFloat(v)
    return Number.isFinite(x) ? x : fallback
  }

  // sync form is applied on demand so we don't reconnect per keystroke
  const [url, setUrl] = useState(settings.supabaseUrl)
  const [key, setKey] = useState(settings.supabaseAnonKey)
  const [family, setFamily] = useState(settings.familyCode)
  const [syncStatus, setSyncStatus] = useState<string>(eventStore.sync ? eventStore.sync.status : 'off')
  const [linkCopied, setLinkCopied] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setSyncStatus(eventStore.sync ? eventStore.sync.status : 'off'), 1500)
    return () => clearInterval(timer)
  }, [])

  const fileRef = useRef<HTMLInputElement>(null)

  function downloadBackup() {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), events, settings }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nolan-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      const list = Array.isArray(parsed) ? parsed : parsed.events
      if (!Array.isArray(list)) throw new Error('no events array')
      const added = eventStore.importBackup(list)
      alert(t(lang, 'importedN', { n: added }))
    } catch (e) {
      alert(t(lang, 'importFailed', { err: e instanceof Error ? e.message : String(e) }))
    }
  }

  return (
    <div className="settings">
      <div className="card">
        <Row label={t(lang, 'langLabel')}>
          <div className="actors">
            {(['en', 'zh'] as Lang[]).map((l) => (
              <button
                key={l}
                className={'chip' + (lang === l ? ' on' : '')}
                onClick={() => upd({ lang: l })}
              >
                {l === 'en' ? 'English' : '中文'}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="card">
        <div className="card-title">{t(lang, 'secSchedule')}</div>
        <Row label={t(lang, 'setWakeBy')}>
          <input type="time" value={settings.wakeBy} onChange={(e) => upd({ wakeBy: e.target.value })} />
        </Row>
        <Row label={t(lang, 'setWin1')}>
          <input
            type="number"
            value={settings.awakeWindowsMin[0]}
            onChange={(e) => {
              const w = [...settings.awakeWindowsMin]
              w[0] = num(e.target.value, w[0])
              upd({ awakeWindowsMin: w })
            }}
          />
        </Row>
        <Row label={t(lang, 'setWinLater')}>
          <input
            type="number"
            value={settings.awakeWindowsMin[1]}
            onChange={(e) => {
              const v = num(e.target.value, settings.awakeWindowsMin[1])
              const w = settings.awakeWindowsMin.map((x, i) => (i === 0 ? x : v))
              upd({ awakeWindowsMin: w })
            }}
          />
        </Row>
        <Row label={t(lang, 'setFeedWin')}>
          <input
            type="number"
            value={settings.feedIntervalMin}
            onChange={(e) => upd({ feedIntervalMin: num(e.target.value, settings.feedIntervalMin) })}
          />
        </Row>
        <Row label={t(lang, 'setFullFeed')}>
          <input
            type="number"
            step="0.5"
            value={settings.fullFeedOz}
            onChange={(e) => upd({ fullFeedOz: num(e.target.value, settings.fullFeedOz) })}
          />
        </Row>
        <Row label={t(lang, 'setMilkTarget')}>
          <input
            type="number"
            value={settings.milkTargetOz}
            onChange={(e) => upd({ milkTargetOz: num(e.target.value, settings.milkTargetOz) })}
          />
        </Row>
        <Row label={t(lang, 'setNapTarget')}>
          <input
            type="number"
            value={settings.napTargetMin}
            onChange={(e) => upd({ napTargetMin: num(e.target.value, settings.napTargetMin) })}
          />
        </Row>
        <Row label={t(lang, 'setNap3By')}>
          <input type="time" value={settings.nap3WakeBy} onChange={(e) => upd({ nap3WakeBy: e.target.value })} />
        </Row>
        <Row label={t(lang, 'setBedEarliest')}>
          <input
            type="time"
            value={settings.bedtimeEarliest}
            onChange={(e) => upd({ bedtimeEarliest: e.target.value })}
          />
        </Row>
        <Row label={t(lang, 'setBedLatest')}>
          <input
            type="time"
            value={settings.bedtimeLatest}
            onChange={(e) => upd({ bedtimeLatest: e.target.value })}
          />
        </Row>
        <div className="card-title sub">{t(lang, 'secNightFeeds')}</div>
        {settings.nightFeedPlan.map((p, i) => (
          <div className="night-feed-row" key={i}>
            <input
              type="time"
              value={p.time}
              onChange={(e) => {
                const plan = settings.nightFeedPlan.map((x, j) => (j === i ? { ...x, time: e.target.value } : x))
                upd({ nightFeedPlan: plan })
              }}
            />
            <input
              type="number"
              step="0.5"
              value={p.oz}
              onChange={(e) => {
                const plan = settings.nightFeedPlan.map((x, j) =>
                  j === i ? { ...x, oz: num(e.target.value, x.oz) } : x,
                )
                upd({ nightFeedPlan: plan })
              }}
            />
            <button
              className="btn ghost"
              onClick={() => upd({ nightFeedPlan: settings.nightFeedPlan.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="btn ghost"
          onClick={() => upd({ nightFeedPlan: [...settings.nightFeedPlan, { time: '23:00', oz: 4 }] })}
        >
          {t(lang, 'addNightFeed')}
        </button>
      </div>

      <div className="card">
        <div className="card-title">{t(lang, 'secCaregivers')}</div>
        {settings.actors.map((a, i) => (
          <Row key={i} label={t(lang, 'caregiverN', { n: i + 1 })}>
            <input
              type="text"
              value={a}
              onChange={(e) => {
                const actors = settings.actors.map((x, j) => (j === i ? e.target.value : x))
                const patch: Partial<Settings> = { actors }
                if (settings.actor === a) patch.actor = e.target.value
                upd(patch)
              }}
            />
          </Row>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          {t(lang, 'secSync')} <span className={'dot ' + syncStatus} /> <small>{syncStatus}</small>
        </div>
        <p className="hint">{t(lang, 'syncHint')}</p>
        <Row label={t(lang, 'setSupaUrl')}>
          <input
            type="text"
            value={url}
            placeholder="https://xxxx.supabase.co"
            onChange={(e) => setUrl(e.target.value)}
          />
        </Row>
        <Row label={t(lang, 'setAnonKey')}>
          <input type="text" value={key} onChange={(e) => setKey(e.target.value)} />
        </Row>
        <Row label={t(lang, 'setFamily')}>
          <input type="text" value={family} onChange={(e) => setFamily(e.target.value)} />
        </Row>
        <button
          className="btn primary"
          onClick={() => upd({ supabaseUrl: url.trim(), supabaseAnonKey: key.trim(), familyCode: family.trim() })}
        >
          {t(lang, 'saveConnect')}
        </button>
        {settings.supabaseUrl && settings.supabaseAnonKey && (
          <button
            className="btn"
            onClick={async () => {
              const cfg = btoa(
                JSON.stringify({ u: settings.supabaseUrl, k: settings.supabaseAnonKey, f: settings.familyCode }),
              )
              await navigator.clipboard.writeText(`${location.origin}${location.pathname}#setup=${cfg}`)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 3000)
            }}
          >
            {linkCopied ? t(lang, 'linkCopied') : t(lang, 'shareSyncLink')}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-title">{t(lang, 'secData')}</div>
        <div className="row-2">
          <button className="btn" onClick={downloadBackup}>
            {t(lang, 'backupBtn')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t(lang, 'restoreBtn')}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importBackup(f)
            e.target.value = ''
          }}
        />
        <button
          className="btn danger"
          onClick={() => {
            if (!confirm(t(lang, 'confirmErase'))) return
            localStorage.removeItem('nolan.events.v1')
            localStorage.removeItem('nolan.outbox.v1')
            location.reload()
          }}
        >
          {t(lang, 'eraseBtn')}
        </button>
      </div>
    </div>
  )
}
