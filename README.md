# Ephesus House

Chores board for the house. Replaces the whiteboard on the fridge.

It answers one question the whiteboard could not: **who is on what this week,
given who is actually home.** Mark someone away and the board reassigns their
turns and keeps the rotation fair, with no erasing and rewriting.

- **The board (Claude):** https://claude.ai/artifact/AedHKUAS3UuH6fXWKzTqUN
  — works today. Syncs through Claude, so it needs a Claude account that can
  reach the owner's organisation.
- **The board (GitHub Pages):** https://claudekovalenko.github.io/ephesus-house-oc/
  — same app against Postgres, shared with anyone who has the link, no account.
  **Not confirmed reachable yet**: every layer reports success (workflow, upload,
  deployment, environment URL) but the site does not answer. If it 404s, check
  Settings → Pages → Build and deployment → Source is set to *GitHub Actions*.
- **Connection check:** https://claudekovalenko.github.io/ephesus-house-oc/check.html
  — open this if the board misbehaves. It reports, in order, whether the settings
  file loaded, whether the key is the right shape, and what the database actually
  answered for a read, a write and a delete.

- **Product requirements:** [`docs/PRD.md`](docs/PRD.md)
- **The original board:** [`docs/assets/whiteboard-2026-09.jpg`](docs/assets/whiteboard-2026-09.jpg)
  and [the reminders corner](docs/assets/whiteboard-2026-09-reminders.jpg)

## What it does

| Screen | What it is for |
|---|---|
| **Board** | Today, the deep clean, the week day by day, open special tasks, every reminder, and a four-week fairness check |
| **Special tasks** | One-off tasks with due dates. "Next in rotation" picks whoever is up and home |
| **Away** | Date ranges per housemate, with a preview of exactly what moves before you save |
| **Settings** | Housemates, rotation order, chores, reminders, week start, time zone |

## The rule that makes it work

A housemate who is away is **skipped, but keeps their place.** The rotation
pointer only advances when the person it points at actually takes the turn. So
whoever misses a week is still up next when they get back, and the person who
covered does not silently end up doing more forever.

Worked through in [`docs/PRD.md`](docs/PRD.md) §7, and locked down by the tests.

A chore can also be **held** for a week or a month rather than reassigned every
time, and it can have **no set day** at all. The deep clean is both: it comes round
every two weeks and is held for a month, so the same person does both of that
month's before it moves on, and each one is a window to finish rather than a dated
job. The board shows it as days remaining, not a date. Availability over a held
period is one rule: you keep it if you are home for at least half of it. A
week-long hold is a zone; none are defined at the moment, but the board still
shows them if you add one.

## Layout

```
app/
  index.html         standalone page, serveable by any static host
  styles.css         one token set, light and dark
  rotation.js        the engine: pure functions, no I/O, no DOM
  app.js             store, views, event handling
  seed.json          the whiteboard, transcribed — the board's starting state
  build-artifact.js  strips the document wrapper for publishing
  whiteboard.jpg     the original board
test/
  rotation.test.js   43 tests over the PRD's worked examples and edge cases
docs/
  PRD.md             requirements, algorithm, data model, milestones
```

`rotation.js` never touches storage or the DOM, so the same file runs in the
browser and under Node in the tests. Nothing about whose turn it is is ever
stored: it is recomputed from the rotation order, each chore's anchor, and the
current absences. Change an absence and every affected week corrects itself.

## Working on it

```bash
npm test      # run the rotation engine tests
npm run serve # http://localhost:8080 — runs against this browser's storage
npm run build # regenerate dist/artifact.html after editing app/index.html
```

With no shared storage available the app falls back to this browser alone and
says so on the board, so the page always works.

## Data

Shared state lives in Postgres (Supabase), one row per document in
`public.chores_docs`, keyed by `collection/id`:

| Path | Holds |
|---|---|
| `config/house` | Housemates, rotation order, week start, time zone, settings |
| `config/reminders` | The standing house rules, grouped by area |
| `chores/<id>` | One recurring chore or zone |
| `absences/<id>` | One away range |
| `updates/<id>` | One special task. The collection keeps its original name; the screen is called Special tasks |
| `occurrences/<choreId>__<date>` | Done state, checklist ticks, one-off swaps |

Every phone reads the whole board and re-reads it every five seconds while the
tab is open, plus immediately on focus and after its own writes. Writes are
last-one-wins, which is the right trade for three people ticking chores.

`app/config.js` holds the project URL and Supabase's publishable key. Both are
public by design; row-level security on the server is what decides access, not
the key.

**The board is open to anyone who has the URL.** The policies let any visitor
read and write, because there is no login. It holds first names and household
chores, nothing else, and the page is unlisted rather than secret. If that ever
stops being acceptable, the fix is a shared passphrase or real auth, not hiding
the key.

Only `occurrences` grows over time, at roughly 300 documents a year for six
chores against a 5,000 document cap. Prune finished years if it ever gets close.

`app/seed.json` is a snapshot of the board. It is what the page falls back to if
the database is unreachable on a first visit, so a cold open is never blank.
Refresh it after changing the house setup:

```bash
# export the live collections to a directory, one JSON file per document,
# then:
node tools/assemble-seed.js <export-dir>
```

Progress is deliberately not carried into the snapshot. Who ticked what is live
state; freezing one evening's checkmarks into every new visitor's board would
only mislead. Setup — housemates, rotation, chores, reminders, special tasks — is
carried in full.
