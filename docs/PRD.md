# Ephesus House Chores — Product Requirements Document

**Status:** Built — M0 through M4 shipped, see §12
**Date:** 2026-09-14
**Source of truth today:** the whiteboard on the fridge
(`docs/assets/whiteboard-2026-09.jpg`, with the reminders corner in
`docs/assets/whiteboard-2026-09-reminders.jpg`)

---

## 1. Problem

The house runs on a whiteboard. It works, but it has real gaps:

- **Rotation is manual.** "Rotation: Ivan | Jett | Demitrius" is written at the top, but who is *actually* on kitchen or bathroom this week depends on someone remembering to erase and rewrite names.
- **Absences break fairness.** When someone is out of town, either the chore doesn't get done or the next person covers it and nobody tracks that they now owe less. The board can't "calculate" around exceptions.
- **One-off tasks get lost.** The "Updates" corner (wipe down lights, planters build by the 25th, break down cardboard) has no owner, no due-date tracking, and no way to mark done without erasing history.
- **Nobody can check it from their phone.** The board is only visible in the kitchen.

## 2. Goal

A small, mobile-first web app that replaces the whiteboard and does the one thing the whiteboard can't: **compute who is responsible for what, this week, given who is actually home.**

### Success criteria

- Every housemate can open the app and in under 5 seconds see "what am I on this week / today?"
- Adding a one-off task ("update") takes under 15 seconds.
- Marking yourself away for a date range automatically re-assigns your chores and the app visibly rebalances so nobody ends up doing more than their share over time.
- Zero manual rotation edits after initial setup.

### Non-goals (v1)

- Payments, splitting bills, or chore "points" economies.
- Push notifications or SMS. (Later; see §10.)
- Multi-house / multi-tenant. One house, one shared board.
- Accounts with passwords. Trust model is "anyone with the link is a housemate."

## 3. Users

Three housemates: **Ivan, Jett, Demitrius.** All are equal admins. There is no landlord/parent role.

## 4. Seed content (transcribed from the whiteboard)

This is the initial data the app ships with. Everything here must be editable in-app.

### 4.1 Rotation order

`Ivan → Jett → Demitrius → (repeat)`

### 4.2 Recurring weekly chores

| Day | Chore | Notes / window |
|---|---|---|
| Monday | *(nothing scheduled)* | |
| Wednesday | Clean pool | *(moved from Tuesday, 2026-09-17)* |
| Wednesday | Take out trash (bins) | Between 4–8 PM |
| Wednesday | Deep clean the bathroom | Every week *(given a day 2026-09-23, see §4.3)* |
| Wednesday | Mop the floors | Every week *(given a day 2026-09-23, see §4.3)* |
| Thursday | Bring in cans | In the morning. Handles toward the street. |
| Friday | *(see reminders)* | Street sweeping — see §4.5. It is a standing reminder, not an assigned turn. |

### 4.3 Cleaning (added 2026-09-14, not from the board)

Split in two, because leaving it all unassigned did not work.

**On the rotation, every Wednesday.** The bathroom deep clean and mopping the
floors, a turn each week, shown on Wednesday in the week view like any other
chore. Their anchors are offset by one, so the same person is never on both in
the same week. With no undated owned work left, the "This fortnight" section no
longer appears.

Whoever has the bathroom gets nothing else that week. Every chore rotates, and
the anchors are offset so the week's five jobs always split the same way: the
bathroom alone for one person, pool and trash for the next, mopping and cans for
the third. Over any three weeks everyone does the same five.

| Week of | Bathroom | Pool, trash | Mopping, cans |
|---|---|---|---|
| 21 Sep | Jett | Demitrius | Ivan |
| 28 Sep | Demitrius | Ivan | Jett |
| 5 Oct | Ivan | Jett | Demitrius |

> Changed 2026-09-23: the bathroom deep clean moved from "any day this fortnight"
> to Wednesday, every other week, starting that day (23 Sep, 7 Oct, 21 Oct, ...).
> The cycle is anchored on the week of 21 Sep so the current week carries one;
> anchored on 14 Sep it fell on 16 Sep and 30 Sep, and the job vanished from the
> board in between. Jett, who held the fortnight, keeps the 23 Sep turn;
> Demitrius is up on 7 Oct. Made weekly the same day, and mopping moved from
> "any day this fortnight" to every Wednesday too: the fortnight window
> confused the house more than it helped.

**Nobody assigned.** The kitchen and the living and dining room still sit as a
standing list of jobs under "If you are free", collapsed and below the day-to-day.
Ticks clear monthly.

> Changed 2026-09-17: "the free thing keeps on failing". Unassigned work was not
> getting done, so the two jobs the house cared about most went back on the
> rotation. The unassigned treatment survives only for the areas the homeowner
> largely handles.

> Changed 2026-09-16: this began as a deep clean every two weeks, each area held
> by one person for a month. The house dropped the rotation — "we aren't going to
> do the deep clean any more, but if you are free then help out with those
> things" — so the schedule and the assignment went and the jobs stayed.

| Area | Jobs |
|---|---|
| Kitchen | Sweep and mop the floor · clear the counters and clean them fully, under everything · clean the inside of the sink · wipe down the tables · clean the stove |
| Bathroom | Clean the shower · clean the shower door · clean the toilet, and get behind it · clean the sink and counter · sweep and mop the floor |
| Living and dining room | Dust · dust the fans · vacuum · wipe down the tables |

> It was first a dated Saturday job, then a fortnightly window held for a month,
> and is now unassigned entirely. Each step removed scheduling the house did not
> want.

### 4.4 Rotating zones (removed)

The board named two standing assignments:

| Zone | Named on the board |
|---|---|
| Kitchen sink / dishes | Jett |
| Bathroom | Ivan |

> Removed, 2026-09-14: the house dropped these once the deep clean (§4.3) was
> added. The deep clean covers the same two areas and rotates across all three
> housemates, so a second standing assignment naming one person was redundant.
> Week-long zones remain a supported hold period (§7.6); there are simply none
> defined. Day-to-day dishes are now covered only by the kitchen reminders.

### 4.5 Special tasks (one-off)

| Task | Due | Notes |
|---|---|---|
| Wipe down lights | — | |
| Planters build | By the 25th | |
| Cardboard break down | — | All foam in one box |

### 4.6 Reminders (standing house rules, not assignable)

Transcribed from the second photo of the board, which shows more than the first.

**Bathroom**
- Close window (AC)
- No wet items on the cabinet (wood)
- Open both shower and bathroom door after use
- Leave toilet lid on
- Wash your hands *(added 2026-09-17)*
- Shave on a paper towel
- Squeegee shower glass
- Wipe the rail at the bottom of the shower window after showering *(added 2026-09-17)*

**Kitchen**
- Take the trash out if it is on the floor
- If it can't go in the dishwasher, do it by hand
- Empty the dishwasher if possible
- Take trash out when it is three quarters full
- Fan on in the kitchen when cooking

**Garage / House**
- Close fridge fully
- Close garage door
- Deadbolt locked on house
- Bags in the bin straight up
- Street sweeping is Friday, move the cars off the curb

> Correction, 2026-09-14: street sweeping was first transcribed from the board as
> a Friday chore. The house corrected it — nobody is assigned to it, everyone just
> has to move their own car — so it is a reminder, not a rotating turn.

## 5. Core concepts

| Term | Meaning |
|---|---|
| **Housemate** | A person in the rotation. Has a name, a color, and an active flag. |
| **Rotation** | The ordered list of housemates. Order is editable. |
| **Chore** | A recurring, assignable job. Has a schedule (day of week + optional time window), a description, and an assignment mode. |
| **Zone** | A chore whose assignment lasts a whole period (e.g., "Bathroom for the week") rather than a single day. Modeled as a chore with `hold_period = week`. |
| **Hold period** | How long one person owns a chore before it moves on: each occurrence (the default), a week, or a month. Independent of how often the chore comes round. A deep clean happens every two weeks but is held for a month, so the same person does both of that month's. |
| **Undated chore** | A chore with no day of the week. Its occurrence is the stretch it belongs to, keyed by the day that stretch opens, and it appears as a window with days remaining rather than in a day row. |
| **Special task** | A one-off task with an optional due date and an optional assignee. Not part of the rotation unless the creator asks the app to "assign to whoever is next." Called "Updates" on the whiteboard and in the first draft of this document; the house renamed it. The database collection is still `updates`. |
| **Reminder** | Static text grouped by area. Never assigned, never completed. Just rules. |
| **Absence** | A date range during which a housemate is not home. The core "exception" mechanism. |
| **Occurrence** | A concrete instance of a chore on a concrete date, with a computed assignee and a done/not-done state. |

## 6. Functional requirements

Priority: **P0** = must ship in v1. **P1** = should ship in v1 if cheap. **P2** = later.

### 6.1 Board view (home screen) — P0

- Shows **this week** as the default. Navigate previous / next week.
- Section "**Today**" pinned at top: every occurrence due today with its assignee and a done checkbox.
- Section "**This week**": Monday through Sunday, each day listing its chores and assignees.
- Section "**Zones this week**": any week-held chore and its holder. Hidden when
  there are none, which is the current state.
- Section "**If you are free**": collapsed by default and placed below the
  day-to-day, because the homeowner carries most of this and does not use the
  board. Open it for the areas, their checklists and who last logged a hand.
- Section "**Special tasks**": open one-off tasks, sorted by due date, overdue first.
- Section "**Reminders**": every group open, every item visible.
- A person filter ("just show me mine") that persists on the device.
- Absent housemates are shown with an "away" badge on days they are absent.

### 6.2 Chores — P0

- Create / edit / archive a chore.
- Fields: name, description, day(s) of week, optional time window (start–end), cadence (weekly | biweekly | monthly-on-nth-weekday), assignment mode.
- Assignment modes:
  - **rotate** — walks the rotation order (default).
  - **fixed** — always the same person (for something one person owns).
  - **everyone** — no assignee; a shared responsibility that just shows on the board.
- Marking an occurrence done records who and when. Anyone can mark any occurrence done (trust model), but the UI defaults the "done by" to the assignee.

### 6.3 Rotation — P0

- Editable ordered list of housemates. Drag to reorder.
- Each rotating chore keeps its own pointer into the rotation, so "trash" and "bathroom" can be on different people the same week. Pointers are seeded so the board matches the whiteboard on day one (Kitchen = Jett, Bathroom = Ivan).
- Rotation is **computed, not stored per week**, from: rotation order + chore pointer + completion history + absences. See §7.

### 6.4 Absences (exceptions) — P0

- A housemate marks themselves away with a start date and end date (inclusive). Optional note ("in SF for work").
- **A trip can be edited after it is saved**: dates, person and note. Plans change,
  and deleting and retyping a trip to come home two days early is not a feature.
  While editing, the preview compares against the board *without* that trip, so it
  shows what the change does rather than nothing at all.
- Each trip shows how many days it covers and whether it is running right now.
- The board itself names who is away in the week being viewed, above the day list.
- While away they are skipped for any occurrence whose date falls in the range.
- The app must show, on the board, that an occurrence was reassigned because of an absence (small "covering for Ivan" label).
- Editing or deleting an absence recomputes the affected weeks.
- Absences in the past cannot be retroactively used to un-assign completed occurrences; completed history is immutable.

### 6.5 Special tasks (one-off) — P0

- Create with: title, optional description, optional due date, optional assignee.
- "Assign to next in rotation" button: picks the person who would be up next across the general rotation and who is home on the due date. This consumes a turn so the general rotation stays fair.
- Mark done → moves to a "Done" list with timestamp and who did it. Not deleted.
- Overdue tasks are highlighted.

### 6.6 Reminders — P0

- Grouped text lists (Bathroom / Kitchen / Garage-House). Add, edit, reorder, delete.
- Shown on the board in full, all groups open. They are the things that have to
  be done every time, so hiding them behind a tap defeats the point.
- Read-only on the board, editable from a settings page.

### 6.7 History and fairness — P1 (shipped)

- Per-person tally: chores completed in the last 4 / 12 weeks, chores covered for others, chores others covered for them.
- A "fairness" indicator on the board: green if everyone is within ±1 of each other over the trailing 4 weeks.

### 6.8 Swaps — P1 (engine only, no UI yet)

- Two housemates can swap an occurrence. Both must tap "agree" (or, given the trust model, one tap with an undo window). Swaps do not change the rotation pointer; they are one-off.

### 6.9 Settings — P0

- Housemates (add, rename, color, deactivate).
- Rotation order.
- Week start day (default Monday).
- Time zone (default America/Los_Angeles; it is a single-house app).

## 7. Rotation algorithm

This is the heart of the product and the thing the whiteboard cannot do.

### 7.1 Inputs

- `order`: the rotation list, e.g. `[Ivan, Jett, Demitrius]`.
- For each rotating chore, `pointer`: index into `order` of the person who is "up next" as of a stored anchor date.
- `absences`: set of (person, start, end).
- `history`: completed occurrences with (chore, date, assigned_to, done_by).

### 7.2 Rule

For each occurrence of a chore on date `d`, in chronological order:

1. Start at the chore's pointer.
2. Walk forward through `order` until you find a person who is **home on `d`** (not inside any absence range) and **active**.
3. Assign the occurrence to that person.
4. Advance the pointer **past the assigned person only**. Skipped people keep their place: they are still "up next."

That is: an absent person is skipped, not consumed. When they return they are immediately at the front of the queue again, so they naturally catch up on the chore they missed without anyone doing bookkeeping.

### 7.3 Why not "skip and forget"?

If the absent person simply lost their turn, the person after them would do two in a row over any absence. Over a month that compounds. The "skipped keep their place" rule guarantees that over any window longer than one full cycle, everyone home does the same number of turns, ±1.

### 7.4 Worked example — weekly trash, rotation Ivan → Jett → Demitrius

Jett is away Sept 14–20.

| Week of | Pointer at start | Home? | Assigned | Pointer after |
|---|---|---|---|---|
| Sept 7 | Ivan | all | Ivan | Jett |
| Sept 14 | Jett | Jett away | Demitrius (covering for Jett) | Jett |
| Sept 21 | Jett | all | Jett | Demitrius |
| Sept 28 | Demitrius | all | Demitrius | Ivan |

Note on Sept 14 the pointer stays on Jett after Demitrius covers. Jett takes it the following week, and Demitrius's turn comes around normally after. Over the four weeks: Ivan 1, Jett 1, Demitrius 2. Demitrius's extra is recorded as a "cover" in history (§6.7), and the fairness indicator shows it.

### 7.5 Cover balancing — P1

Pure skip-and-hold is fair over time but can leave one person with several covers in a row if the same neighbor in the rotation keeps being absent. When the walk in step 2 has to skip someone, and more than one person is home, prefer the home person with the **fewest covers in the trailing 8 weeks** rather than strictly the next in order. Ties go to rotation order. This is opt-in in settings ("Balance covers") and off by default so the v1 behavior is easy to reason about.

### 7.6 Held periods (zones and month-long responsibilities)

When a chore has a hold period, its occurrences are grouped into periods and the
pointer walk in §7.2 runs **once per period**, not once per occurrence. Everything
inside that period belongs to whoever holds it.

Availability over a period is one rule: **available if home for at least half of
it.** For a week that is the familiar "away 4 of 7 days loses it"; for a month it
is roughly a fortnight away. A holder skipped this way still keeps their place, so
they take the next period rather than losing the turn.

- **Zones** hold for a week, one occurrence per week at the week start. None are
  defined right now; the kitchen sink and bathroom zones were removed (§4.4).
- **The proper clean** is held by nobody: `mode: everyone`, so it carries no
  assignee and no countdown. The month-long hold is still supported and tested;
  it is simply not in use.

### 7.6b Undated chores

A chore may have no day. Its occurrences are then the period starts themselves,
aligned to the week start (every week, or every other week) or to the first of the
month. Such a chore never appears in a day row; it is shown as the window it is
currently in, with the days left before that window closes. The done state and
checklist ticks belong to that window, so a new fortnight starts clean.

This is the difference between work that has to happen *on Wednesday between four
and eight* and work that simply has to happen *before the fortnight is out*.

### 7.6b2 The record of what was done

Unassigned work has no owner to chase, so the board has to carry the evidence
instead. Two things are kept:

- **Who ticked each job**, stored alongside the tick, shown next to it.
- **When the area was last actually finished, and by whom**, read straight off
  the completed occurrences. Because a new window is a new occurrence, the record
  survives the monthly clear: last month's tick list goes, the fact that Jett
  finished the kitchen on the 20th stays.

An area shows `Jett helped, 4 weeks ago` when someone logged a hand, and says
nothing at all when nobody has.

> **Silence is not evidence.** The homeowner does most of this and will not be
> ticking boxes, so an empty tick list means only that nobody logged anything. An
> earlier version showed `not done yet` in red and turned the label red past six
> weeks. Both were removed: they read as an accusation about work that had almost
> certainly been done, just not by someone holding the app.

### 7.6c Checklists

A chore may carry a checklist of the jobs it involves. Ticks are stored per
occurrence, not per chore, so last fortnight's ticks do not carry over. An
occurrence is done exactly when every job on it is ticked, and ticking the
occurrence itself ticks or clears the whole list.

### 7.7 Edge cases

- **Everyone away.** Occurrence is assigned to nobody and shown as "unassigned – house away." Pointer does not move.
- **Only one person home.** They get everything that week. Pointer logic still applies so nothing is double-counted when others return.
- **Person deactivated.** Treated as permanently absent; removed from `order` for future computation; history retained.
- **Rotation order edited.** Pointers are re-anchored to the same *person* (not the same index) so nobody's turn changes unexpectedly.
- **Chore day changed.** Applies from the next occurrence forward.

## 8. Data model

```
Housemate   { id, name, color, active, sort_order }
Chore       { id, name, description, cadence, day_of_week[], time_start?, time_end?,
              assignment_mode (rotate|fixed|everyone), fixed_assignee_id?,
              rotation_pointer_person_id, pointer_anchor_date,
              hold_period (null|week|month), undated, checklist[], is_zone, archived }
Occurrence  { id, chore_id, date, assigned_to_id?, covering_for_id?,
              done_at?, done_by_id?, checked{index: true}, note? }
              -- materialized only when marked done or manually overridden;
              -- otherwise computed on read
Absence     { id, housemate_id, start_date, end_date, note? }
Update      { id, title, description?, due_date?, assignee_id?, created_by_id,
              created_at, done_at?, done_by_id? }
Reminder    { id, group (bathroom|kitchen|garage_house|custom), text, sort_order }
Swap        { id, occurrence_id, from_id, to_id, created_at }
Settings    { week_start, timezone, balance_covers }
```

Occurrences are computed on the fly for the visible range and only persisted when something happens to them (done, override, swap). This keeps the rotation a pure function of inputs and avoids a nightly job.

## 9. Screens

1. **Board** (`/`) — home; sections per §6.1. Bottom tab bar: Board · Special tasks · Away · Settings.
2. **Special task detail / new task** — sheet from the Special tasks tab.
3. **Away** — list of absences, "I'm away" button → date range picker → note. Shows a preview: "This will move Trash (Sept 16) to Demitrius."
4. **Chore editor** — from Settings.
5. **Settings** — housemates, rotation order (drag), reminders editor, week start, balance covers toggle.
6. **History** (P1) — per-person tallies and covers.

Design intent: it should look like the whiteboard, not like Jira. Big text, one accent color per housemate, no nested menus.

## 10. Non-functional

- **Mobile-first web app.** Installable as a PWA; works at 375px width.
- **Shared state.** All three housemates see the same board within a few seconds of any change.
- **Offline read.** Board renders from cache with no network; writes queue.
- **Auth.** A single house link with an unguessable slug. No passwords in v1. Each device picks "I am: Ivan / Jett / Demitrius" once and remembers it.
- **Time zone.** Everything is computed in the house time zone, never the device's.
- **Notifications (P2).** Daily 9 AM "you're on X today" and a 4 PM Wednesday trash nudge. Web push first, SMS never.

## 11. Suggested stack

Kept deliberately small so any housemate can maintain it.

- **Frontend:** Vite + React + TypeScript, Tailwind. PWA plugin for installability.
- **Backend / data:** Supabase (Postgres + Realtime). Tables per §8. Realtime subscription on `occurrence`, `update`, `absence` so the board updates live.
- **Rotation engine:** a pure TypeScript module (`packages/rotation`) with no I/O, unit-tested against the worked examples in §7. Runs in the browser; no server-side cron.
- **Hosting:** Vercel or Netlify static hosting. One environment.

Alternative if Supabase feels heavy: a single Node/Hono server with SQLite on Fly.io. Same data model. The rotation module is the same either way.

## 12. Milestones

| Milestone | Scope | Definition of done |
|---|---|---|
| **M0 — Engine** | `app/rotation.js` with tests | **Done.** 29 tests over the §7 examples and edge cases |
| **M1 — Board** | Board fed by the seed data in §4 | **Done.** This week renders exactly as the whiteboard reads |
| **M2 — Done + Updates** | Mark done, create and complete updates | **Done.** |
| **M3 — Absences** | Away flow with preview and reassignment | **Done.** The preview names each turn that moves before you save |
| **M4 — Settings** | Chore editor, rotation order, reminders editor, housemates | **Done.** |
| **M5 (P1)** | History, fairness, swaps, cover balancing | **Partly done.** Four-week fairness and cover balancing ship; swaps are supported by the engine and the data model but have no UI yet |

## 13. Open questions

These do not block M0–M2. Defaults are stated so work can proceed.

1. **Zone rotation cadence.** Weekly on Monday is assumed. If the house actually rotates zones every two weeks, it is a one-field change.
2. **Do all rotating chores share one pointer, or one pointer each?** Assumed *one per chore* (§6.3) because the whiteboard has Kitchen and Bathroom on different people simultaneously.
3. **Half-week rule for zones (§7.6).** The 4-of-7 threshold is a guess. Could instead be "reassign if away on the weekend."
4. **Should special tasks ever auto-rotate?** Assumed opt-in per task via the "assign to next" button, not automatic.
5. **Monday.** Currently empty on the board. Left empty; nothing to invent.


---

## 14. What shipped

Built and served at https://dmiysgmhwpkrunmswtrn.supabase.co/functions/v1/board/,
by an edge function that proxies `app/` from the repository. GitHub Pages was
tried first and abandoned: five deployments all reported success and the site
never answered a request.

Stack differs from §11 in one way: plain HTML, CSS and JavaScript rather than
Vite and React, which would have bought nothing at this size. Supabase is as
§11 proposed, reached over PostgREST directly rather than through the client
library — three fetches and a five-second poll beat a CDN dependency here, and
a chore board does not need sub-second sync.

It first shipped against the Claude artifact document store. That store is only
reachable from inside the Claude viewer and only by members of the owner's
organisation, so housemates without an account silently fell back to a private
per-device board — the ticks they made reached nobody. Moving to Postgres fixed
the actual requirement: one board, every phone, no account.

Still open from §13: the zone cadence, the half-week threshold in §7.6, and
whether updates should ever auto-rotate. All three are single settings to change
once the house has lived with the defaults for a few weeks.

Not built: swap UI (§6.8), notifications (§10, P2).

Added after the first build, at the house's request: special tasks (renamed from
updates), reminders shown open rather than collapsed, and the deep clean with
month-long holds, undated windows and per-occurrence checklists (§4.3, §7.6).
Street sweeping and the two named zones were removed (§4.2, §4.4).
