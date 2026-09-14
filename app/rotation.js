/*
 * Ephesus House — rotation engine.
 *
 * Pure functions, no I/O, no DOM. Given the rotation order, each chore's
 * anchor, and the set of absences, this computes who is on what, on any date.
 *
 * The one rule that matters (PRD 7.2): a person who is away is SKIPPED, not
 * consumed. The pointer only advances when the person it points at actually
 * takes the turn. So someone who misses a week is still up next when they get
 * back, and nobody has to keep score on the whiteboard.
 *
 * Dates are 'YYYY-MM-DD' strings in house time. All arithmetic runs on UTC
 * midnight so daylight saving can never shift a chore onto the wrong day.
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rotation = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;

  /* ---------- date helpers ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toMs(iso) {
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function toISO(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(iso, n) { return toISO(toMs(iso) + n * DAY_MS); }

  function dayOfWeek(iso) { return new Date(toMs(iso)).getUTCDay(); } // 0 Sun .. 6 Sat

  function diffDays(from, to) { return Math.round((toMs(to) - toMs(from)) / DAY_MS); }

  function startOfWeek(iso, weekStart) {
    var ws = weekStart == null ? 1 : weekStart;
    return addDays(iso, -((dayOfWeek(iso) - ws + 7) % 7));
  }

  function firstOnOrAfter(iso, dow) {
    return addDays(iso, (dow - dayOfWeek(iso) + 7) % 7);
  }

  function nthWeekdayOfMonth(year, month, dow, nth) {
    var d = addDays(firstOnOrAfter(year + '-' + pad(month) + '-01', dow), (nth - 1) * 7);
    return +d.slice(5, 7) === month ? d : null;
  }

  /** Today in the house time zone, as YYYY-MM-DD. */
  function today(timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      return toISO(Date.now());
    }
  }

  /* ---------- absences ---------- */

  function isAway(absences, personId, iso) {
    for (var i = 0; i < absences.length; i++) {
      var a = absences[i];
      if (a.housemateId === personId && iso >= a.start && iso <= a.end) return true;
    }
    return false;
  }

  function awayDaysInWeek(absences, personId, weekStartISO) {
    var n = 0;
    for (var i = 0; i < 7; i++) {
      if (isAway(absences, personId, addDays(weekStartISO, i))) n++;
    }
    return n;
  }

  /* ---------- occurrence dates ---------- */

  /** Every date this chore lands on, from its anchor through `through`. */
  function occurrenceDates(chore, ctx, through) {
    var out = [];
    var cur;

    if (chore.isZone) {
      // A zone is held for a whole week; its occurrence is the week start.
      cur = startOfWeek(chore.anchorDate, ctx.weekStart);
      while (cur <= through) { out.push(cur); cur = addDays(cur, 7); }
      return out;
    }

    if (chore.cadence === 'monthly') {
      var y = +chore.anchorDate.slice(0, 4);
      var m = +chore.anchorDate.slice(5, 7);
      var guard = 0;
      while (guard++ < 600) {
        var d = nthWeekdayOfMonth(y, m, chore.day, chore.nth || 1);
        if (d && d > through) break;
        if (d && d >= chore.anchorDate) out.push(d);
        if (++m > 12) { m = 1; y++; }
      }
      return out;
    }

    var step = chore.cadence === 'biweekly' ? 14 : 7;
    cur = firstOnOrAfter(chore.anchorDate, chore.day);
    while (cur <= through) { out.push(cur); cur = addDays(cur, step); }
    return out;
  }

  /* ---------- assignment ---------- */

  function homeTestFor(chore, ctx, iso) {
    if (chore.isZone) {
      // A zone holder keeps the week unless they are gone for most of it.
      var ws = startOfWeek(iso, ctx.weekStart);
      return function (p) { return awayDaysInWeek(ctx.absences, p, ws) < 4; };
    }
    return function (p) { return !isAway(ctx.absences, p, iso); };
  }

  function coversSince(log, iso, windowDays) {
    if (!log) return 0;
    var cutoff = addDays(iso, -windowDays), n = 0;
    for (var i = 0; i < log.length; i++) if (log[i] >= cutoff) n++;
    return n;
  }

  function activeOrder(ctx) {
    return ctx.order.filter(function (id) { return ctx.active[id] !== false; });
  }

  /** Where this chore's pointer starts, tolerating a deactivated anchor. */
  function startPointer(chore, ctx, order) {
    var at = order.indexOf(chore.anchorPerson);
    if (at >= 0) return at;
    var full = ctx.order;
    var fullAt = full.indexOf(chore.anchorPerson);
    if (fullAt < 0) return 0;
    for (var k = 0; k < full.length; k++) {
      var idx = order.indexOf(full[(fullAt + k) % full.length]);
      if (idx >= 0) return idx;
    }
    return 0;
  }

  /**
   * Assignments for one chore, keyed by date.
   * Each value: {assignee, coveringFor, unassigned, awayPerson, shared}
   */
  function assignChore(chore, ctx, through) {
    var result = {};
    var dates = occurrenceDates(chore, ctx, through);
    var i;

    if (chore.mode === 'everyone') {
      for (i = 0; i < dates.length; i++) result[dates[i]] = { assignee: null, shared: true };
      return result;
    }

    if (chore.mode === 'fixed') {
      for (i = 0; i < dates.length; i++) {
        result[dates[i]] = {
          assignee: chore.fixedAssignee || null,
          away: chore.fixedAssignee ? isAway(ctx.absences, chore.fixedAssignee, dates[i]) : false
        };
      }
      return result;
    }

    var order = activeOrder(ctx);
    if (!order.length) return result;

    var n = order.length;
    var ptr = startPointer(chore, ctx, order);
    var coverLog = {};

    for (i = 0; i < dates.length; i++) {
      var iso = dates[i];
      var home = homeTestFor(chore, ctx, iso);
      var upNext = order[ptr];

      if (home(upNext)) {
        result[iso] = { assignee: upNext, coveringFor: null };
        ptr = (ptr + 1) % n;                       // they took it: advance
        continue;
      }

      var candidates = [];
      for (var k = 1; k < n; k++) {
        var p = order[(ptr + k) % n];
        if (home(p)) candidates.push(p);
      }

      if (!candidates.length) {
        result[iso] = { assignee: null, unassigned: true, awayPerson: upNext };
        continue;                                   // pointer holds
      }

      var pick = candidates[0];
      if (ctx.balanceCovers) {
        var fewest = Infinity;
        for (var c = 0; c < candidates.length; c++) {
          var cnt = coversSince(coverLog[candidates[c]], iso, 56);
          if (cnt < fewest) { fewest = cnt; pick = candidates[c]; }
        }
      }

      result[iso] = { assignee: pick, coveringFor: upNext };
      (coverLog[pick] || (coverLog[pick] = [])).push(iso);
      // pointer deliberately unchanged — the person skipped keeps their place
    }

    return result;
  }

  /** Assignments for every chore, keyed choreId -> date -> entry. */
  function assignAll(state, through) {
    var ctx = contextOf(state);
    var out = {};
    for (var i = 0; i < state.chores.length; i++) {
      var ch = state.chores[i];
      if (ch.archived) continue;
      out[ch.id] = assignChore(ch, ctx, through);
    }
    return out;
  }

  function contextOf(state) {
    return {
      order: state.rotation || [],
      active: state.active || {},
      absences: state.absences || [],
      weekStart: state.weekStart == null ? 1 : state.weekStart,
      balanceCovers: !!state.balanceCovers
    };
  }

  /* ---------- board ---------- */

  /**
   * The week containing `anyDateInWeek`, as the screen needs it:
   *   { start, end, days: [{date, dow, items:[...]}], zones: [...] }
   * An item carries its chore, computed assignee, cover note and done state.
   */
  function buildWeek(state, anyDateInWeek) {
    var ctx = contextOf(state);
    var start = startOfWeek(anyDateInWeek, ctx.weekStart);
    var end = addDays(start, 6);
    var all = assignAll(state, end);
    var done = state.occurrences || {};

    var days = [];
    for (var i = 0; i < 7; i++) {
      days.push({ date: addDays(start, i), dow: dayOfWeek(addDays(start, i)), items: [] });
    }
    var zones = [];

    for (var c = 0; c < state.chores.length; c++) {
      var chore = state.chores[c];
      if (chore.archived) continue;
      var byDate = all[chore.id] || {};

      if (chore.isZone) {
        var z = byDate[start];
        if (z) zones.push(decorate(chore, start, z, done, state));
        continue;
      }

      for (var d = 0; d < days.length; d++) {
        var entry = byDate[days[d].date];
        if (entry) days[d].items.push(decorate(chore, days[d].date, entry, done, state));
      }
    }

    days.forEach(function (day) {
      day.items.sort(function (a, b) { return (a.chore.order || 0) - (b.chore.order || 0); });
    });
    zones.sort(function (a, b) { return (a.chore.order || 0) - (b.chore.order || 0); });

    return { start: start, end: end, days: days, zones: zones };
  }

  function occurrenceKey(choreId, date) { return choreId + '__' + date; }

  function decorate(chore, date, entry, done, state) {
    var key = occurrenceKey(chore.id, date);
    var rec = done[key] || null;
    var swapTo = rec && rec.swappedTo ? rec.swappedTo : null;
    return {
      key: key,
      chore: chore,
      date: date,
      assignee: swapTo || entry.assignee,
      swappedFrom: swapTo ? entry.assignee : null,
      coveringFor: entry.coveringFor || null,
      unassigned: !!entry.unassigned,
      awayPerson: entry.awayPerson || null,
      shared: !!entry.shared,
      away: !!entry.away,
      doneAt: rec ? rec.doneAt : null,
      doneBy: rec ? rec.doneBy : null
    };
  }

  /* ---------- fairness ---------- */

  /**
   * Turns taken and turns covered per person over the trailing `weeks`.
   * "covered" counts turns taken on someone else's behalf.
   */
  function tally(state, throughDate, weeks) {
    var w = weeks || 4;
    var since = addDays(throughDate, -(w * 7));
    var all = assignAll(state, throughDate);
    var done = state.occurrences || {};
    var out = {};

    (state.rotation || []).forEach(function (id) {
      out[id] = { assigned: 0, covered: 0, coveredForThem: 0, completed: 0 };
    });

    Object.keys(all).forEach(function (choreId) {
      var byDate = all[choreId];
      Object.keys(byDate).forEach(function (date) {
        if (date < since || date > throughDate) return;
        var e = byDate[date];
        var rec = done[occurrenceKey(choreId, date)];
        var who = (rec && rec.swappedTo) || e.assignee;
        if (who && out[who]) {
          out[who].assigned++;
          if (e.coveringFor) out[who].covered++;
        }
        if (e.coveringFor && out[e.coveringFor]) out[e.coveringFor].coveredForThem++;
        if (rec && rec.doneBy && out[rec.doneBy]) out[rec.doneBy].completed++;
      });
    });

    return out;
  }

  /** True when everyone's turn count sits within 1 of everyone else's. */
  function isBalanced(tallies) {
    var counts = Object.keys(tallies).map(function (k) { return tallies[k].assigned; });
    if (counts.length < 2) return true;
    return Math.max.apply(null, counts) - Math.min.apply(null, counts) <= 1;
  }

  /* ---------- absence preview ---------- */

  /**
   * What adding `candidate` would change, so the Away screen can say
   * "this moves Trash (Sep 16) to Demitrius" before anyone commits to it.
   */
  function previewAbsence(state, candidate) {
    var through = addDays(candidate.end, 28);
    var before = assignAll(state, through);
    var after = assignAll(
      Object.assign({}, state, { absences: (state.absences || []).concat([candidate]) }),
      through
    );
    var changes = [];

    Object.keys(after).forEach(function (choreId) {
      var a = after[choreId], b = before[choreId] || {};
      Object.keys(a).forEach(function (date) {
        if (date < candidate.start) return;
        var wasWho = b[date] ? b[date].assignee : null;
        var nowWho = a[date].assignee;
        if (wasWho !== nowWho) {
          changes.push({
            choreId: choreId, date: date, from: wasWho, to: nowWho,
            unassigned: !!a[date].unassigned
          });
        }
      });
    });

    changes.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    return changes;
  }

  /** Whoever is up next overall — used by "assign to next in rotation". */
  function nextInRotation(state, onDate) {
    var ctx = contextOf(state);
    var order = activeOrder(ctx);
    if (!order.length) return null;
    var at = order.indexOf(state.updatePointer);
    if (at < 0) at = 0;
    for (var k = 0; k < order.length; k++) {
      var p = order[(at + k) % order.length];
      if (!isAway(ctx.absences, p, onDate)) return p;
    }
    return order[at];
  }

  return {
    DAY_MS: DAY_MS,
    toISO: toISO, toMs: toMs, addDays: addDays, dayOfWeek: dayOfWeek,
    diffDays: diffDays, startOfWeek: startOfWeek, firstOnOrAfter: firstOnOrAfter,
    nthWeekdayOfMonth: nthWeekdayOfMonth, today: today,
    isAway: isAway, awayDaysInWeek: awayDaysInWeek,
    occurrenceDates: occurrenceDates, assignChore: assignChore, assignAll: assignAll,
    buildWeek: buildWeek, occurrenceKey: occurrenceKey,
    tally: tally, isBalanced: isBalanced,
    previewAbsence: previewAbsence, nextInRotation: nextInRotation
  };
});
