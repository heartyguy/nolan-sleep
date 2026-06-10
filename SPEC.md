# Nolan Sleep — Co-pilot for sleep training

A mobile-first web app that turns the sleep trainer's protocol into a live "what do I do
next, and how am I tracking" dashboard, with one-tap logging and an auto-generated daily
log in the trainer's format.

Baby: Nolan, 6 months (as of June 2026). Currently **Phase 1**.

---

## The core insight

The trainer's method is already an algorithm. It rests on **two forward-projecting clocks**
and **two running budgets**, plus a set of guardrails. If we model those, the app can tell
the caregiver exactly what to do next and how the day is tracking — instead of doing mental
math at 3am.

### Two clocks (project forward from every event)

| Clock | Anchored on | Projects | Routine cue |
|-------|-------------|----------|-------------|
| **Sleep clock** | last wake time | `next_sleep_goal = wake + awake_window` | routine −10 min, rocking −5 min; don't try before 2:20 awake |
| **Feed clock** | last feed *start* | `next_feed = feed_start + 4h` | — |

**Awake window (AT):**
- After morning wake → **2:15** to nap 1
- After nap 1, nap 2, nap 3 → **2:30** to next sleep / bedtime

**Collision rule:** if `next_feed` lands within ~40 min *before* `next_sleep_goal`, cheat the
feed **30–40 min early** so baby is fed → burped → routine → asleep. The bedtime feed is
always pulled to **~40 min before the sleep goal** ("top-up milk").

### Two budgets (reset at morning wake)

| Budget | Target (Phase 1) | App shows |
|--------|------------------|-----------|
| **Milk** | 28 oz / 24h (range 25–30) | consumed · remaining · on-track projection |
| **Nap** | 2:45 across 3 naps (range 2–3h, up to 4h) | accumulated · remaining · naps left |

### Guardrails → alerts

- Still asleep past **7:15am** → "Wake him to start the day."
- Nap 3 running past **5:30pm** → "Wake to protect bedtime."
- Bedtime target between **6:30–7:45pm**.
- Night feeds (Phase 1): aim **11pm (3–4oz)** and **3am (3–4oz)**; a **5:30am** feed should be
  only **2–3oz** so he's hungry for a 4oz feed at the 7:15am start.
- Goal: shift oz from night → day; reduce to 2 night feeds.
- Settle ladder: pat up to **20 min** → break / leave room → **10 min** more → if still awake,
  small feed **1–3oz** to make drowsy (not a full feed).
- "When in doubt, err on the side of awake too long, not too early."

---

## Data model (logged events)

Everything is an **event** with a timestamp. Keep logging to one tap where possible.

- `wake_morning` — starts the 24h cycle, resets budgets
- `feed` — { oz, type: milk|solids, location?, refused?, burped? }
- `asleep` — start of a nap or bedtime
- `awake` — end of a sleep (pairs with the preceding `asleep` → nap duration)
- `night_waking` — { fed?, oz?, settled_by: pat|feed|rock }
- `burp`, `solids`, `note`

Derived per day: total oz, total nap time, # naps, awake windows, longest night stretch.

## What the dashboard shows (the "now" screen)

1. **Next sleep** — goal time, countdown, "start routine at HH:MM"
2. **Next feed** — window time, suggested oz, collision warning if it overlaps sleep
3. **Milk today** — `X / 28 oz` with remaining + simple projection to 6am
4. **Naps today** — `H:MM / 2:45`, naps left
5. **One-tap log buttons** — Fed · Asleep · Awake · Solids · Burp
6. **Today's timeline** — running list, editable

## Killer feature: auto-generated trainer log

The trainer wants a daily log in a specific table format (Activity log + Nap table + Feed
table + daily totals). The app already has every event — so it can **render that exact format
for copy/paste or share**. Zero extra work for the caregiver. (Trainer even said: "you don't
need to put those exact timings in — want to make it easier for you." → logging must be
effortless, totals automatic.)

---

## Excel bridge (the trainer's shared file)

The trainer works out of a shared Excel file: caregiver types the daily log in, the trainer reads
it and writes feedback/comments inline — it's a **two-way channel**, not just a log. Access lasts
~12 more days (through ~June 22, 2026). Typing that log by hand every day is the biggest pain.

**Decision: flip the direction.** The app is the system of record (one-tap logging, even at 3am);
Excel becomes an *output*:

- **Copy for Excel** — render the finished day as a TSV grid matching her layout (activity
  narrative + nap table + feed table + totals + questions) → paste into the shared file in ~30s.
- **Download .xlsx** (SheetJS) as an alternative.
- **Optional backfill import** — parse already-logged days (e.g. June 9) from the existing file once.
- **Live API sync rejected** for now: the file is trainer-owned, OAuth/Graph API setup outweighs
  ~12 days of remaining use, and programmatic writes risk clobbering her inline comments. Revisit
  only if it's actually a Google Sheet the user can script.
- Questions to the trainer are first-class: `note` events flow into the export so her Q&A workflow
  is unchanged. After the 12 days end, the app keeps working — it owns the data.

## Day boundary rule

A "day" runs morning-wake → next morning-wake with a **5:00 AM cutoff**: events at/after 5:00 AM
count toward the new day. This matches the trainer's accounting — 11pm and 3am feeds belong to the
prior day's 24h intake; a 5:30am feed counts toward the new day.

---

## Open design decisions (to align on before building)

1. **Single device vs multi-caregiver sync.** Mom, grandpa, and grandma all care for Nolan and
   all need to log. Shared live data is arguably a real requirement, not a nice-to-have.
   - *Simple:* one phone / localStorage, no backend. Free, offline, but data stuck on one device.
   - *Synced:* small backend (e.g. Supabase) so everyone sees the same day in real time.
2. **Reminders.** Active push ("start nap routine now") vs. a glanceable "what's next" dashboard.
   Web push is unreliable on iOS — affects the approach.
3. **v1 scope.** Start with logging + live dashboard + trainer-log export? Add auto-adjust /
   notifications / history later?
4. **Phones.** iOS or Android (each parent)? Affects PWA install + notifications.

## Phasing (proposed)

- **v1 (MVP):** mobile PWA, one-tap logging, live dashboard (2 clocks + 2 budgets + guardrail
  alerts), today's timeline, trainer-log export. Local storage first.
- **v2:** multi-caregiver sync, push reminders, multi-day history & trends.
- **v3:** Phase 2 schedule (all sleep in crib + sleep sack, monitor), pattern insights.
