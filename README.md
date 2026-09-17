# Ephesus House

Chores board for the house. Replaces the whiteboard on the fridge.

It answers one question the whiteboard could not: **who is on what this week,
given who is actually home.** Mark someone away and the board reassigns their
turns and keeps the rotation fair, with no erasing and rewriting.

- **The board:** https://dmiysgmhwpkrunmswtrn.supabase.co/functions/v1/board/
  — the link to hand out. No account, no sign-in, any browser. Verified end to
  end: the page and every asset serve, and an anonymous visitor can both read
  the board and write to it.
- **Connection check:** https://dmiysgmhwpkrunmswtrn.supabase.co/functions/v1/board/check.html
- **On Claude:** https://claude.ai/artifact/AedHKUAS3UuH6fXWKzTqUN — the same
  app, but its store only works for people signed in to the owner's Claude
  organisation, so it is not the one to share.

- **Product requirements:** [`docs/PRD.md`](docs/PRD.md)
- **The original board:** [`docs/assets/whiteboard-2026-09.jpg`](docs/assets/whiteboard-2026-09.jpg)
  and [the reminders corner](docs/assets/whiteboard-2026-09-reminders.jpg)

## What it does

| Screen | What it is for |
|---|---|
| **Board** | Today, the week day by day, open special tasks, a collapsed panel of jobs anyone can pitch in on, a four-week fairness check, and every reminder |
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
time, and it can have **no set day** at all. Both are supported and tested, and
neither is currently in use: the three cleaning areas are `mode: everyone`, so
they belong to nobody and show as a plain list of jobs to help with. Availability over a held
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

## How it is served

`supabase/functions/board` is a Deno edge function that serves `app/` to anyone
with the link. It proxies the files straight from GitHub raw, so a push updates
the board with no redeploy; the pinned commit in `REFS` is the fallback. It runs
with `verify_jwt` off because there is nothing privileged to protect: it serves
public files and reads nothing from the caller.

The happy side effect is that the page and the database share an origin, so
there is no cross-site request to be blocked.

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
