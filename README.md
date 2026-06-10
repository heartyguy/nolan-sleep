# Nolan Sleep

Sleep-training co-pilot for Nolan (6 months, Phase 1). Turns the sleep trainer's protocol
into a live "what do I do next" dashboard with one-tap logging and an auto-generated daily
log in the trainer's Excel format. See [SPEC.md](SPEC.md) for the full design.

**Live app: https://heartyguy.github.io/nolan-sleep/**

On each phone: open that link → Share → **Add to Home Screen**. Pick the caregiver chip at
the top (Mom / Grandpa / Grandma) and the language in Settings (English / 中文).

To redeploy after changes: `./deploy.sh`

## Run it

```bash
cd app
npm install
npm run dev        # local dev server
npm test           # engine tests (verified against the trainer-confirmed June 9 log)
npm run build      # production build into app/dist
```

## Deploy

Hosted on GitHub Pages from the `gh-pages` branch of
[heartyguy/nolan-sleep](https://github.com/heartyguy/nolan-sleep).
`./deploy.sh` rebuilds and force-pushes `app/dist` there; the site updates in ~1 minute
(the service worker picks new versions up silently on next open).

## Family sync (mom + grandpa + grandma on the same live day)

1. One person creates a free project at https://supabase.com
2. In the Supabase dashboard → SQL editor → paste and run [app/supabase.sql](app/supabase.sql)
3. In the app → Settings → Family sync: enter the project URL (Settings → API → Project URL),
   the `anon` public key, and any shared family code (e.g. `nolan`) → Save & connect
4. Everyone enters the same three values. The dot in the header turns green when syncing.

Works offline / before sync is set up — events queue locally and push when connected.

Note: anyone holding the URL + anon key can read/write the event table, so don't reuse that
Supabase project for anything else. For a baby's nap log this is an acceptable trade.

## Daily flow

- Tap ☀️ when he wakes → the day starts, budgets reset
- One tap per event: 🍼 Fed / 🛏️ Put down / 💤 Fell asleep / 🌅 Woke up / 🥄 Solids / 💨 Burp / 📝 Note
- The dashboard always shows: next sleep goal + when to start the routine, next feed (with
  collision handling), milk and nap budgets vs targets, and protocol alerts (wake by 7:15,
  protect bedtime, settle ladder, night-feed guidance)
- Mis-tap? Use the Undo toast, or tap any timeline row to edit/delete
- End of day: **Trainer log** tab → *Copy for Excel* → paste into the trainer's shared file
- Settings → Backup (JSON) once in a while; it's your raw data

## Architecture (for future-us)

- Append-only event log; edits/deletes are `correction`/`void` events, so multi-device sync
  is a conflict-free union by id (Supabase realtime + an offline outbox)
- All schedule logic is pure functions in `app/src/engine/derive.ts` with vitest coverage;
  protocol numbers (windows, targets, bedtime window, night feeds) live in Settings
- A "day" runs wake-to-wake with a 5:00 AM cutoff, matching how the trainer counts 24h intake
