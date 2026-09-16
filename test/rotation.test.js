/*
 * Rotation engine tests. Run: node --test test/
 *
 * The cases here are the worked examples and edge cases from docs/PRD.md §7.
 * If one of these ever fails, the board is lying to the house about whose
 * turn it is, so treat a failure here as the highest-severity kind.
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../app/rotation.js');

const IVAN = 'ivan', JETT = 'jett', DEM = 'demitrius';

function baseState(over) {
  return Object.assign({
    rotation: [IVAN, JETT, DEM],
    active: { [IVAN]: true, [JETT]: true, [DEM]: true },
    absences: [],
    weekStart: 1,
    balanceCovers: false,
    occurrences: {},
    chores: [trash()]
  }, over || {});
}

function trash(over) {
  return Object.assign({
    id: 'trash', name: 'Take out trash', day: 3, cadence: 'weekly',
    mode: 'rotate', anchorPerson: IVAN, anchorDate: '2026-09-07',
    isZone: false, order: 1
  }, over || {});
}

function who(state, through) {
  const a = R.assignAll(state, through).trash;
  return Object.keys(a).sort().map((d) => [d, a[d].assignee, a[d].coveringFor]);
}

/* ---------- date helpers ---------- */

test('date math does not drift across a DST boundary', () => {
  // US DST ends 2026-11-01. A weekly Wednesday chore must stay on Wednesday.
  let d = '2026-10-21';
  for (let i = 0; i < 6; i++) {
    assert.strictEqual(R.dayOfWeek(d), 3, `${d} should be a Wednesday`);
    d = R.addDays(d, 7);
  }
});

test('startOfWeek honours a Monday week start', () => {
  assert.strictEqual(R.startOfWeek('2026-09-14', 1), '2026-09-14'); // Monday
  assert.strictEqual(R.startOfWeek('2026-09-20', 1), '2026-09-14'); // Sunday
  assert.strictEqual(R.startOfWeek('2026-09-13', 1), '2026-09-07');
});

test('startOfWeek honours a Sunday week start', () => {
  assert.strictEqual(R.startOfWeek('2026-09-14', 0), '2026-09-13');
});

test('nthWeekdayOfMonth returns null when the month has no nth weekday', () => {
  assert.strictEqual(R.nthWeekdayOfMonth(2026, 9, 2, 5), '2026-09-29'); // 5th Tue
  assert.strictEqual(R.nthWeekdayOfMonth(2026, 9, 1, 5), null);         // no 5th Mon
});

/* ---------- PRD §7.4: the worked example ---------- */

test('PRD §7.4 — an absent person is skipped but keeps their place', () => {
  const state = baseState({
    absences: [{ housemateId: JETT, start: '2026-09-14', end: '2026-09-20' }]
  });
  assert.deepStrictEqual(who(state, '2026-09-30'), [
    ['2026-09-09', IVAN, null],
    ['2026-09-16', DEM, JETT],   // Jett away: Demitrius covers
    ['2026-09-23', JETT, null],  // Jett is back and still up next
    ['2026-09-30', DEM, null]
  ]);
});

test('PRD §7.4 — the four-week tally is Ivan 1, Jett 1, Demitrius 2', () => {
  const state = baseState({
    absences: [{ housemateId: JETT, start: '2026-09-14', end: '2026-09-20' }]
  });
  const t = R.tally(state, '2026-09-30', 4);
  assert.strictEqual(t[IVAN].assigned, 1);
  assert.strictEqual(t[JETT].assigned, 1);
  assert.strictEqual(t[DEM].assigned, 2);
  assert.strictEqual(t[DEM].covered, 1);
  assert.strictEqual(t[JETT].coveredForThem, 1);
});

test('with nobody away the rotation simply cycles', () => {
  assert.deepStrictEqual(who(baseState(), '2026-09-30'), [
    ['2026-09-09', IVAN, null],
    ['2026-09-16', JETT, null],
    ['2026-09-23', DEM, null],
    ['2026-09-30', IVAN, null]
  ]);
});

test('over a full cycle with no absences everyone is within one turn', () => {
  const t = R.tally(baseState(), '2026-11-25', 12);
  assert.ok(R.isBalanced(t), JSON.stringify(t));
});

/* ---------- edge cases, PRD §7.7 ---------- */

test('everyone away leaves the occurrence unassigned and holds the pointer', () => {
  const state = baseState({
    absences: [
      { housemateId: IVAN, start: '2026-09-14', end: '2026-09-20' },
      { housemateId: JETT, start: '2026-09-14', end: '2026-09-20' },
      { housemateId: DEM, start: '2026-09-14', end: '2026-09-20' }
    ]
  });
  const a = R.assignAll(state, '2026-09-23').trash;
  assert.strictEqual(a['2026-09-16'].assignee, null);
  assert.strictEqual(a['2026-09-16'].unassigned, true);
  assert.strictEqual(a['2026-09-16'].awayPerson, JETT);
  assert.strictEqual(a['2026-09-23'].assignee, JETT); // pointer never moved
});

test('one person home takes every turn and nothing is double-counted after', () => {
  const state = baseState({
    absences: [
      { housemateId: JETT, start: '2026-09-14', end: '2026-09-27' },
      { housemateId: DEM, start: '2026-09-14', end: '2026-09-27' }
    ]
  });
  const a = R.assignAll(state, '2026-10-07').trash;
  assert.strictEqual(a['2026-09-16'].assignee, IVAN);
  assert.strictEqual(a['2026-09-23'].assignee, IVAN);
  assert.strictEqual(a['2026-09-16'].coveringFor, JETT);
  assert.strictEqual(a['2026-09-30'].assignee, JETT); // back, still up next
  assert.strictEqual(a['2026-10-07'].assignee, DEM);
});

test('a deactivated person is dropped from future turns', () => {
  const state = baseState({ active: { [IVAN]: true, [JETT]: false, [DEM]: true } });
  const a = R.assignAll(state, '2026-09-23').trash;
  assert.strictEqual(a['2026-09-09'].assignee, IVAN);
  assert.strictEqual(a['2026-09-16'].assignee, DEM);
  assert.strictEqual(a['2026-09-23'].assignee, IVAN);
});

test('a chore anchored on a deactivated person falls to the next active one', () => {
  const state = baseState({
    active: { [IVAN]: false, [JETT]: true, [DEM]: true },
    chores: [trash({ anchorPerson: IVAN })]
  });
  assert.strictEqual(R.assignAll(state, '2026-09-09').trash['2026-09-09'].assignee, JETT);
});

test('a half-day absence still skips that day only', () => {
  const state = baseState({
    absences: [{ housemateId: IVAN, start: '2026-09-09', end: '2026-09-09' }]
  });
  const a = R.assignAll(state, '2026-09-16').trash;
  assert.strictEqual(a['2026-09-09'].assignee, JETT);
  assert.strictEqual(a['2026-09-09'].coveringFor, IVAN);
  assert.strictEqual(a['2026-09-16'].assignee, IVAN);
});

/* ---------- zones, PRD §7.6 ---------- */

const bathroom = (over) => Object.assign({
  id: 'bathroom', name: 'Bathroom', isZone: true, cadence: 'weekly',
  mode: 'rotate', anchorPerson: IVAN, anchorDate: '2026-09-14', order: 1
}, over || {});

test('a zone rotates once a week', () => {
  const state = baseState({ chores: [bathroom()] });
  const a = R.assignAll(state, '2026-10-05').bathroom;
  assert.strictEqual(a['2026-09-14'].assignee, IVAN);
  assert.strictEqual(a['2026-09-21'].assignee, JETT);
  assert.strictEqual(a['2026-09-28'].assignee, DEM);
  assert.strictEqual(a['2026-10-05'].assignee, IVAN);
});

test('a zone holder away three days of seven keeps the zone', () => {
  const state = baseState({
    chores: [bathroom()],
    absences: [{ housemateId: IVAN, start: '2026-09-14', end: '2026-09-16' }]
  });
  assert.strictEqual(R.assignAll(state, '2026-09-14').bathroom['2026-09-14'].assignee, IVAN);
});

test('a zone holder away four days of seven loses the week but not their place', () => {
  const state = baseState({
    chores: [bathroom()],
    absences: [{ housemateId: IVAN, start: '2026-09-14', end: '2026-09-17' }]
  });
  const a = R.assignAll(state, '2026-09-21').bathroom;
  assert.strictEqual(a['2026-09-14'].assignee, JETT);
  assert.strictEqual(a['2026-09-14'].coveringFor, IVAN);
  assert.strictEqual(a['2026-09-21'].assignee, IVAN);
});

test('two zones anchored on different people stay independent', () => {
  const state = baseState({
    chores: [
      bathroom({ id: 'bathroom', anchorPerson: IVAN }),
      bathroom({ id: 'kitchen', anchorPerson: JETT })
    ]
  });
  const all = R.assignAll(state, '2026-09-14');
  assert.strictEqual(all.bathroom['2026-09-14'].assignee, IVAN);
  assert.strictEqual(all.kitchen['2026-09-14'].assignee, JETT);
});

/* ---------- assignment modes ---------- */

test('a fixed chore never rotates', () => {
  const state = baseState({ chores: [trash({ mode: 'fixed', fixedAssignee: DEM })] });
  const a = R.assignAll(state, '2026-09-23').trash;
  assert.strictEqual(a['2026-09-09'].assignee, DEM);
  assert.strictEqual(a['2026-09-23'].assignee, DEM);
});

test('a fixed chore flags the week its owner is away', () => {
  const state = baseState({
    chores: [trash({ mode: 'fixed', fixedAssignee: DEM })],
    absences: [{ housemateId: DEM, start: '2026-09-14', end: '2026-09-20' }]
  });
  assert.strictEqual(R.assignAll(state, '2026-09-16').trash['2026-09-16'].away, true);
});

test('an everyone chore has no assignee', () => {
  const state = baseState({ chores: [trash({ mode: 'everyone' })] });
  const e = R.assignAll(state, '2026-09-09').trash['2026-09-09'];
  assert.strictEqual(e.assignee, null);
  assert.strictEqual(e.shared, true);
});

test('a biweekly chore lands every other week', () => {
  const state = baseState({ chores: [trash({ cadence: 'biweekly' })] });
  assert.deepStrictEqual(Object.keys(R.assignAll(state, '2026-10-07').trash).sort(),
    ['2026-09-09', '2026-09-23', '2026-10-07']);
});

test('a monthly chore lands on its nth weekday', () => {
  const state = baseState({ chores: [trash({ cadence: 'monthly', day: 6, nth: 2 })] });
  assert.deepStrictEqual(Object.keys(R.assignAll(state, '2026-11-30').trash).sort(),
    ['2026-09-12', '2026-10-10', '2026-11-14']);
});

/* ---------- cover balancing, PRD §7.5 ---------- */

test('cover balancing spreads repeated covers instead of stacking them', () => {
  const absences = [{ housemateId: JETT, start: '2026-09-14', end: '2026-12-31' }];
  const plain = who(baseState({ absences }), '2026-10-07');
  const balanced = who(baseState({ absences, balanceCovers: true }), '2026-10-07');
  const coversIn = (rows) => rows.filter((r) => r[2] === JETT).map((r) => r[1]);

  // Without balancing the same neighbour absorbs every cover.
  assert.deepStrictEqual(new Set(coversIn(plain)), new Set([DEM]));
  // With balancing the covers are shared out.
  assert.ok(new Set(coversIn(balanced)).size > 1, JSON.stringify(balanced));
});

/* ---------- board assembly ---------- */

test('buildWeek lays out seven days and places the zone on the week', () => {
  const state = baseState({ chores: [trash(), bathroom()] });
  const wk = R.buildWeek(state, '2026-09-16');
  assert.strictEqual(wk.start, '2026-09-14');
  assert.strictEqual(wk.end, '2026-09-20');
  assert.strictEqual(wk.days.length, 7);
  assert.strictEqual(wk.days[2].items.length, 1);           // Wednesday
  assert.strictEqual(wk.days[2].items[0].chore.id, 'trash');
  assert.strictEqual(wk.days[0].items.length, 0);           // Monday is empty
  assert.strictEqual(wk.zones.length, 1);
  assert.strictEqual(wk.zones[0].assignee, IVAN);
});

test('buildWeek carries done state onto the occurrence', () => {
  const state = baseState({
    occurrences: { 'trash__2026-09-16': { doneAt: '2026-09-16T18:00:00Z', doneBy: JETT } }
  });
  const item = R.buildWeek(state, '2026-09-16').days[2].items[0];
  assert.strictEqual(item.doneBy, JETT);
  assert.ok(item.doneAt);
});

test('a swap overrides the computed assignee for that one occurrence', () => {
  const state = baseState({
    occurrences: { 'trash__2026-09-16': { swappedTo: DEM } }
  });
  const wk = R.buildWeek(state, '2026-09-16');
  assert.strictEqual(wk.days[2].items[0].assignee, DEM);
  assert.strictEqual(wk.days[2].items[0].swappedFrom, JETT);
  // The swap is one-off: the following week is untouched.
  assert.strictEqual(R.buildWeek(state, '2026-09-23').days[2].items[0].assignee, DEM);
});

/* ---------- absence preview ---------- */

test('previewAbsence reports the reassignment before it is saved', () => {
  const changes = R.previewAbsence(baseState(), {
    housemateId: JETT, start: '2026-09-14', end: '2026-09-20'
  });
  const first = changes[0];
  assert.strictEqual(first.choreId, 'trash');
  assert.strictEqual(first.date, '2026-09-16');
  assert.strictEqual(first.from, JETT);
  assert.strictEqual(first.to, DEM);
});

test('previewAbsence leaves earlier weeks alone', () => {
  const changes = R.previewAbsence(baseState(), {
    housemateId: JETT, start: '2026-09-14', end: '2026-09-20'
  });
  assert.ok(changes.every((c) => c.date >= '2026-09-14'));
});

/* ---------- one-off updates ---------- */

test('nextInRotation skips whoever is away on the due date', () => {
  const state = baseState({
    updatePointer: JETT,
    absences: [{ housemateId: JETT, start: '2026-09-20', end: '2026-09-30' }]
  });
  assert.strictEqual(R.nextInRotation(state, '2026-09-25'), DEM);
  assert.strictEqual(R.nextInRotation(state, '2026-10-05'), JETT);
});

/* ---------- month-long responsibilities (deep clean) ---------- */

const deep = (over) => Object.assign({
  id: 'deep-kitchen', name: 'Deep clean the kitchen', day: 6,
  cadence: 'biweekly', mode: 'rotate', holdPeriod: 'month',
  anchorPerson: IVAN, anchorDate: '2026-09-14', isZone: false, order: 1
}, over || {});

test('a month-held chore keeps the same person for every occurrence that month', () => {
  const a = R.assignAll(baseState({ chores: [deep()] }), '2026-10-31')['deep-kitchen'];
  assert.deepStrictEqual(Object.keys(a).sort(),
    ['2026-09-19', '2026-10-03', '2026-10-17', '2026-10-31']);
  assert.strictEqual(a['2026-09-19'].assignee, IVAN);            // September
  assert.strictEqual(a['2026-10-03'].assignee, JETT);            // October, all three
  assert.strictEqual(a['2026-10-17'].assignee, JETT);
  assert.strictEqual(a['2026-10-31'].assignee, JETT);
});

test('a month-held chore hands over at the month boundary, not per occurrence', () => {
  const a = R.assignAll(baseState({ chores: [deep()] }), '2026-12-31')['deep-kitchen'];
  const holder = (m) => Object.keys(a).filter((d) => d.startsWith(m)).map((d) => a[d].assignee);
  assert.deepStrictEqual(new Set(holder('2026-09')), new Set([IVAN]));
  assert.deepStrictEqual(new Set(holder('2026-10')), new Set([JETT]));
  assert.deepStrictEqual(new Set(holder('2026-11')), new Set([DEM]));
  assert.deepStrictEqual(new Set(holder('2026-12')), new Set([IVAN]));
});

test('three month-held areas anchored on three people give everyone exactly one', () => {
  const state = baseState({
    chores: [
      deep({ id: 'deep-kitchen', anchorPerson: IVAN }),
      deep({ id: 'deep-bathroom', anchorPerson: JETT }),
      deep({ id: 'deep-living', anchorPerson: DEM })
    ]
  });
  ['2026-09', '2026-10', '2026-11'].forEach((month) => {
    const held = R.heldThisMonth(state, month + '-15').map((x) => x.assignee);
    assert.strictEqual(new Set(held).size, 3, `${month} doubled someone up: ${held}`);
  });
});

test('away for most of the month loses that month but not the turn', () => {
  const state = baseState({
    chores: [deep()],
    absences: [{ housemateId: IVAN, start: '2026-09-01', end: '2026-09-24' }]
  });
  const a = R.assignAll(state, '2026-10-31')['deep-kitchen'];
  assert.strictEqual(a['2026-09-19'].assignee, JETT);
  assert.strictEqual(a['2026-09-19'].coveringFor, IVAN);
  assert.strictEqual(a['2026-10-03'].assignee, IVAN);   // back, and still up next
});

test('away for under half the month keeps it', () => {
  const state = baseState({
    chores: [deep()],
    absences: [{ housemateId: IVAN, start: '2026-09-14', end: '2026-09-21' }]
  });
  assert.strictEqual(R.assignAll(state, '2026-09-19')['deep-kitchen']['2026-09-19'].assignee, IVAN);
});

test('heldThisMonth reports the holder and the next date', () => {
  const held = R.heldThisMonth(baseState({ chores: [deep()] }), '2026-10-05');
  assert.strictEqual(held.length, 1);
  assert.strictEqual(held[0].assignee, JETT);
  assert.deepStrictEqual(held[0].dates, ['2026-10-03', '2026-10-17', '2026-10-31']);
  assert.strictEqual(held[0].next, '2026-10-17');
});

test('a week-held chore is still a zone, whichever field says so', () => {
  const viaZone = baseState({ chores: [bathroom()] });
  const viaHold = baseState({
    chores: [Object.assign({}, bathroom(), { isZone: true, holdPeriod: 'week' })]
  });
  assert.deepStrictEqual(
    R.assignAll(viaZone, '2026-10-05').bathroom,
    R.assignAll(viaHold, '2026-10-05').bathroom
  );
});

test('a month-held chore carries its checklist ticks onto the occurrence', () => {
  const state = baseState({
    chores: [deep({ checklist: ['Sweep and mop the floor', 'Clean the stove'] })],
    occurrences: { 'deep-kitchen__2026-09-19': { checked: { 0: true } } }
  });
  const item = R.buildWeek(state, '2026-09-19').days[5].items[0];
  assert.strictEqual(item.chore.checklist.length, 2);
  assert.deepStrictEqual(item.checked, { 0: true });
});

/* ---------- standing work with no set day ---------- */

const standingDeep = (over) => Object.assign(deep(), {
  undated: true, day: undefined, checklist: ['Sweep and mop the floor', 'Clean the stove']
}, over || {});

test('an undated chore lands on its window start, not a weekday', () => {
  const a = R.assignAll(baseState({ chores: [standingDeep()] }), '2026-11-30')['deep-kitchen'];
  assert.deepStrictEqual(Object.keys(a).sort(),
    ['2026-09-14', '2026-09-28', '2026-10-12', '2026-10-26', '2026-11-09', '2026-11-23']);
  Object.keys(a).forEach((d) => assert.strictEqual(R.dayOfWeek(d), 1, `${d} should open a week`));
});

test('an undated chore never appears in a day row', () => {
  const wk = R.buildWeek(baseState({ chores: [standingDeep(), trash()] }), '2026-09-16');
  const names = wk.days.flatMap((d) => d.items.map((i) => i.chore.id));
  assert.deepStrictEqual(names, ['trash']);
  assert.strictEqual(wk.zones.length, 0);
});

test('two fortnights a month means the month holder does both', () => {
  const a = R.assignAll(baseState({ chores: [standingDeep()] }), '2026-11-30')['deep-kitchen'];
  assert.strictEqual(a['2026-09-14'].assignee, IVAN);
  assert.strictEqual(a['2026-09-28'].assignee, IVAN);   // still September
  assert.strictEqual(a['2026-10-12'].assignee, JETT);
  assert.strictEqual(a['2026-10-26'].assignee, JETT);
  assert.strictEqual(a['2026-11-09'].assignee, DEM);
  assert.strictEqual(a['2026-11-23'].assignee, DEM);
});

test('standing reports the window you are in, not the next one', () => {
  const st = baseState({ chores: [standingDeep()] });
  const mid = R.standing(st, '2026-09-20')[0];
  assert.strictEqual(mid.span.start, '2026-09-14');
  assert.strictEqual(mid.span.end, '2026-09-27');
  assert.strictEqual(mid.daysLeft, 7);
  assert.strictEqual(mid.assignee, IVAN);
  assert.strictEqual(mid.nextStart, '2026-09-28');

  const rolled = R.standing(st, '2026-09-28')[0];
  assert.strictEqual(rolled.span.start, '2026-09-28');
  assert.strictEqual(rolled.daysLeft, 13);
});

test('standing carries the checklist state for the current window only', () => {
  const st = baseState({
    chores: [standingDeep()],
    occurrences: { 'deep-kitchen__2026-09-14': { checked: { 0: true } } }
  });
  assert.deepStrictEqual(R.standing(st, '2026-09-20')[0].checked, { 0: true });
  assert.deepStrictEqual(R.standing(st, '2026-09-28')[0].checked, {});  // fresh window
});

test('an undated chore still hands over at the month boundary when away', () => {
  const st = baseState({
    chores: [standingDeep()],
    absences: [{ housemateId: IVAN, start: '2026-09-01', end: '2026-09-30' }]
  });
  const a = R.assignAll(st, '2026-10-31')['deep-kitchen'];
  assert.strictEqual(a['2026-09-14'].assignee, JETT);
  assert.strictEqual(a['2026-09-14'].coveringFor, IVAN);
  assert.strictEqual(a['2026-10-12'].assignee, IVAN);  // back, still up next
});

/* ---------- unassigned standing work ("help out if you're free") ---------- */

test('an everyone-mode standing chore belongs to nobody', () => {
  const st = baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' })]
  });
  const item = R.standing(st, '2026-09-16')[0];
  assert.strictEqual(item.assignee, null);
  assert.strictEqual(item.shared, true);
  assert.strictEqual(item.coveringFor, null);
});

test('unassigned work never lands in anyone’s fairness count', () => {
  const st = baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' }), trash()]
  });
  const t = R.tally(st, '2026-10-31', 12);
  const total = Object.keys(t).reduce((n, k) => n + t[k].assigned, 0);
  // only the weekly trash counts; the clean is nobody's turn
  assert.strictEqual(total, Object.keys(R.assignAll(st, '2026-10-31').trash)
    .filter((d) => d >= R.addDays('2026-10-31', -84)).length);
});

test('a monthly standing chore clears its ticks each month', () => {
  const st = baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' })],
    occurrences: { 'deep-kitchen__2026-09-01': { checked: { 0: true, 1: true } } }
  });
  assert.deepStrictEqual(R.standing(st, '2026-09-20')[0].checked, { 0: true, 1: true });
  assert.deepStrictEqual(R.standing(st, '2026-10-05')[0].checked, {});
  assert.strictEqual(R.standing(st, '2026-10-05')[0].span.start, '2026-10-01');
});

test('unassigned standing work still stays out of the day rows', () => {
  const wk = R.buildWeek(baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' }), trash()]
  }), '2026-09-16');
  assert.deepStrictEqual(wk.days.flatMap((d) => d.items.map((i) => i.chore.id)), ['trash']);
});

/* ---------- the record of what actually got done ---------- */

test('lastDoneOf finds the most recent completion, not the newest window', () => {
  const st = baseState({
    chores: [standingDeep()],
    occurrences: {
      'deep-kitchen__2026-09-14': { doneAt: '2026-09-18T10:00:00Z', doneBy: JETT },
      'deep-kitchen__2026-09-28': { doneAt: '2026-10-02T09:00:00Z', doneBy: DEM },
      'deep-kitchen__2026-10-12': { checked: { 0: true } }          // started, not finished
    }
  });
  const last = R.lastDoneOf(st, 'deep-kitchen');
  assert.strictEqual(last.by, DEM);
  assert.strictEqual(last.on, '2026-10-02');
});

test('lastDoneOf is null when nothing was ever finished', () => {
  assert.strictEqual(R.lastDoneOf(baseState({ chores: [standingDeep()] }), 'deep-kitchen'), null);
});

test('lastDoneOf never picks up another chore', () => {
  const st = baseState({
    chores: [standingDeep()],
    occurrences: { 'deep-kitchen-extra__2026-09-14': { doneAt: '2026-09-18T10:00:00Z', doneBy: JETT } }
  });
  assert.strictEqual(R.lastDoneOf(st, 'deep-kitchen'), null);
});

test('the record outlives the window it was done in', () => {
  const st = baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' })],
    occurrences: { 'deep-kitchen__2026-09-01': { doneAt: '2026-09-20T12:00:00Z', doneBy: IVAN } }
  });
  const nextMonth = R.standing(st, '2026-10-15')[0];
  assert.deepStrictEqual(nextMonth.checked, {});            // fresh window
  assert.strictEqual(nextMonth.lastDone.by, IVAN);          // record still there
  assert.strictEqual(nextMonth.daysSinceDone, 25);
});

test('standing carries who ticked each individual job', () => {
  const st = baseState({
    chores: [Object.assign(standingDeep(), { mode: 'everyone', cadence: 'monthly' })],
    occurrences: { 'deep-kitchen__2026-09-01': { checked: { 0: true }, checkedBy: { 0: JETT } } }
  });
  assert.deepStrictEqual(R.standing(st, '2026-09-20')[0].checkedBy, { 0: JETT });
});
