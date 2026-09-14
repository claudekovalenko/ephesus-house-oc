# Ephesus House

Chores board for the house. Replaces the whiteboard on the fridge.

It answers one question the whiteboard could not: **who is on what this week,
given who is actually home.** Mark someone away and the board reassigns their
turns and keeps the rotation fair, with no erasing and rewriting.

- **Live app:** https://claude.ai/artifact/AedHKUAS3UuH6fXWKzTqUN
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
time. The deep clean happens every two weeks but holds for a month, so the same
person does both of that month's before it moves on. Availability over a held
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
  rotation.test.js   37 tests over the PRD's worked examples and edge cases
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

Shared state lives in the artifact's document store:

| Path | Holds |
|---|---|
| `config/house` | Housemates, rotation order, week start, time zone, settings |
| `config/reminders` | The standing house rules, grouped by area |
| `chores/<id>` | One recurring chore or zone |
| `absences/<id>` | One away range |
| `updates/<id>` | One special task. The collection keeps its original name; the screen is called Special tasks |
| `occurrences/<choreId>__<date>` | Done state and one-off swaps |

Only `occurrences` grows over time, at roughly 300 documents a year for six
chores against a 5,000 document cap. Prune finished years if it ever gets close.

`app/seed.json` is the starting board, transcribed from the photo. It is the
reference for a fresh setup, not something the app reads at runtime.
