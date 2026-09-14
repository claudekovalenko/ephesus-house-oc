/* Ephesus House — chores board.
   Renders the week from the rotation engine and keeps every housemate's
   view in sync. Falls back to this device only when shared storage is
   unavailable, so the page always works. */
(function () {
  'use strict';

  var R = window.Rotation;

  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CACHE_KEY = 'ephesus.cache.v1';
  var ME_KEY = 'ephesus.me';
  var LOCAL_KEY = 'ephesus.local.v1';

  /* ================= utilities ================= */

  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function pretty(iso) {
    if (!iso) return '';
    return MON_SHORT[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10));
  }
  function prettyFull(iso) {
    return DOW_SHORT[R.dayOfWeek(iso)] + ' ' + pretty(iso);
  }
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  function monthName(iso) { return MON_LONG[+iso.slice(5, 7) - 1]; }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function safeLocal(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  /* ================= store ================= */

  /* The shared board, over PostgREST. One row per document, keyed by
     "collection/id", which is the same shape the rest of the app already
     speaks. No client library: a handful of fetches is less to go wrong than
     a CDN dependency, and a five-second poll is invisible on a chore board. */
  var Cloud = {
    cfg: null,

    ok: function () { return !!(this.cfg && this.cfg.url && this.cfg.key); },

    base: function () {
      return this.cfg.url + '/rest/v1/' + (this.cfg.table || 'chores_docs');
    },

    head: function (extra) {
      var h = { apikey: this.cfg.key, 'Content-Type': 'application/json' };
      // PostgREST reads Authorization as a JWT. Sending a non-JWT key there is
      // a 401, so only set it when the key really is one.
      if (/^ey[A-Za-z0-9_-]/.test(this.cfg.key)) h.Authorization = 'Bearer ' + this.cfg.key;
      return Object.assign(h, extra || {});
    },

    /* Turn a failed response into an error that says what actually happened. */
    fail: function (res, what) {
      return res.text().catch(function () { return ''; }).then(function (body) {
        var detail = (body || res.statusText || '').replace(/\s+/g, ' ').slice(0, 160);
        throw new Error(what + ' failed: HTTP ' + res.status + (detail ? ' — ' + detail : ''));
      });
    },

    all: function () {
      return fetch(this.base() + '?select=path,data', {
        headers: this.head(), cache: 'no-store'
      }).then(function (res) {
        if (!res.ok) return Cloud.fail(res, 'Reading the board');
        return res.json();
      });
    },

    put: function (path, data) {
      var cut = path.indexOf('/');
      return fetch(this.base() + '?on_conflict=path', {
        method: 'POST',
        headers: this.head({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          path: path,
          collection: path.slice(0, cut),
          doc_id: path.slice(cut + 1),
          data: data
        })
      }).then(function (res) { if (!res.ok) return Cloud.fail(res, 'Saving'); });
    },

    del: function (path) {
      return fetch(this.base() + '?path=eq.' + encodeURIComponent(path), {
        method: 'DELETE',
        headers: this.head({ Prefer: 'return=minimal' })
      }).then(function (res) { if (!res.ok) return Cloud.fail(res, 'Deleting'); });
    }
  };

  var Store = {
    raw: { config: {}, chores: {}, absences: {}, updates: {}, occurrences: {} },
    ready: false,
    shared: false,
    offline: false,
    lastError: null,
    snapshotOf: null,
    pending: 0,
    onChange: function () {},

    start: function (onChange) {
      this.onChange = onChange;

      // Paint from whatever this browser saw last, so the board is never blank
      // while the first request is in the air.
      var cached = safeLocal(function () { return JSON.parse(localStorage.getItem(CACHE_KEY)); }, null);
      if (cached && cached.config) { this.raw = cached; this.ready = true; this.onChange(); }

      Cloud.cfg = window.EPHESUS || null;
      if (Cloud.ok()) this.startCloud();
      else this.startLocal();
    },

    startCloud: function () {
      var self = this;
      this.shared = true;
      this.pull();

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') self.pull();
      });
      setInterval(function () {
        if (document.visibilityState === 'visible') self.pull();
      }, (Cloud.cfg && Cloud.cfg.pollMs) || 5000);
    },

    /** Replace local state with the board as the server has it. */
    pull: function () {
      var self = this;
      if (this.pending) return Promise.resolve();   // our own write is still in flight
      return Cloud.all().then(function (rows) {
        var next = { config: {}, chores: {}, absences: {}, updates: {}, occurrences: {} };
        rows.forEach(function (row) {
          var cut = String(row.path).indexOf('/');
          if (cut < 0) return;
          var col = row.path.slice(0, cut), id = row.path.slice(cut + 1);
          if (!next[col]) next[col] = {};
          next[col][id] = row.data;
        });
        self.raw = next;
        self.offline = false;
        self.lastError = null;
        self.ready = true;
        self.persistLocal();
        self.onChange();
      }).catch(function (err) {
        self.offline = true;
        self.lastError = (err && err.message) ||
          'the request never completed (network, CORS, or the host is unreachable)';
        self.ready = true;
        self.onChange();
      });
    },

    /* No shared board reachable. Use whatever this browser holds; failing that,
       the snapshot shipped with the page, so it is never empty. */
    startLocal: function (force) {
      var self = this;
      this.shared = false;

      if (!force) {
        var saved = safeLocal(function () { return JSON.parse(localStorage.getItem(LOCAL_KEY)); }, null);
        if (saved && saved.config && saved.config.house) {
          this.raw = saved;
          this.ready = true;
          this.onChange();
          return;
        }
      }

      fetch('seed.json', { cache: 'no-cache' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (data && data.config && data.config.house) {
            self.raw = {
              config: data.config || {},
              chores: data.chores || {},
              updates: data.updates || {},
              absences: data.absences || {},
              occurrences: data.occurrences || {}
            };
            self.snapshotOf = data.exportedAt || null;
            self.persistLocal();
          }
          self.ready = true;
          self.onChange();
        })
        .catch(function () { self.ready = true; self.onChange(); });
    },

    /* Writes land locally first so the tap feels instant, then go up. */
    set: function (path, data) {
      var self = this;
      var cut = path.indexOf('/');
      var col = path.slice(0, cut), id = path.slice(cut + 1);
      if (!this.raw[col]) this.raw[col] = {};
      this.raw[col][id] = data;
      this.persistLocal();
      this.onChange();

      if (!Cloud.ok()) return Promise.resolve();
      this.pending++;
      return Cloud.put(path, data).then(function () {
        self.pending--;
        return self.pull();
      }).catch(function (err) {
        self.pending--;
        self.offline = true;
        self.lastError = (err && err.message) || 'the request never completed';
        self.onChange();
        App.flash('That did not save. ' + self.lastError);
      });
    },

    merge: function (path, patch) {
      var cut = path.indexOf('/');
      var col = path.slice(0, cut), id = path.slice(cut + 1);
      var bucket = this.raw[col] || {};
      return this.set(path, Object.assign({}, bucket[id] || {}, patch));
    },

    remove: function (path) {
      var self = this;
      var cut = path.indexOf('/');
      var col = path.slice(0, cut), id = path.slice(cut + 1);
      if (this.raw[col]) delete this.raw[col][id];
      this.persistLocal();
      this.onChange();

      if (!Cloud.ok()) return Promise.resolve();
      this.pending++;
      return Cloud.del(path).then(function () {
        self.pending--;
        return self.pull();
      }).catch(function (err) {
        self.pending--;
        self.offline = true;
        self.lastError = (err && err.message) || 'the request never completed';
        self.onChange();
        App.flash('That did not save. ' + self.lastError);
      });
    },

    persistLocal: function () {
      var raw = this.raw;
      safeLocal(function () { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); });
      if (!Cloud.ok()) safeLocal(function () { localStorage.setItem(LOCAL_KEY, JSON.stringify(raw)); });
    }
  };

  /* ================= state ================= */

  function buildState() {
    var raw = Store.raw;
    var house = raw.config.house || {};
    var housemates = house.housemates || {};
    var rotation = (house.rotation || []).filter(function (id) { return housemates[id]; });
    var active = {};
    Object.keys(housemates).forEach(function (id) { active[id] = housemates[id].active !== false; });

    var chores = Object.keys(raw.chores).map(function (id) {
      return Object.assign({ id: id }, raw.chores[id]);
    });
    var absences = Object.keys(raw.absences).map(function (id) {
      return Object.assign({ id: id }, raw.absences[id]);
    });
    var updates = Object.keys(raw.updates).map(function (id) {
      return Object.assign({ id: id }, raw.updates[id]);
    });

    return {
      rotation: rotation,
      housemates: housemates,
      active: active,
      weekStart: house.weekStart == null ? 1 : house.weekStart,
      timezone: house.timezone || 'America/Los_Angeles',
      balanceCovers: !!house.balanceCovers,
      updatePointer: house.updatePointer || rotation[0] || null,
      chores: chores,
      absences: absences,
      updates: updates,
      reminders: (raw.config.reminders && raw.config.reminders.groups) || [],
      occurrences: raw.occurrences || {}
    };
  }

  function person(state, id) {
    return state.housemates[id] || { name: 'Someone', color: '#64798a' };
  }
  function colorOf(state, id) { return person(state, id).color || '#64798a'; }
  function nameOf(state, id) { return person(state, id).name || 'Someone'; }

  /* ================= app ================= */

  var App = {
    view: 'board',
    weekOf: null,
    me: safeLocal(function () { return localStorage.getItem(ME_KEY); }, null),
    mineOnly: safeLocal(function () { return localStorage.getItem('ephesus.mine') === '1'; }, false),
    state: null,
    draft: {},
    editingChore: null,
    openItems: {},
    flashMsg: null,

    boot: function () {
      var self = this;
      Store.start(function () {
        self.state = buildState();
        if (!self.weekOf) self.weekOf = R.today(self.state.timezone);
        if (self.me && !self.state.housemates[self.me]) self.me = null;
        self.render();
      });
      document.addEventListener('click', this.onClick.bind(this));
      document.addEventListener('input', this.onInput.bind(this));
      document.addEventListener('change', this.onInput.bind(this));
    },

    flash: function (msg) {
      App.flashMsg = msg;
      App.render();
      clearTimeout(App._flashT);
      App._flashT = setTimeout(function () { App.flashMsg = null; App.render(); }, 5000);
    },

    today: function () { return R.today(this.state.timezone); },

    render: function () {
      if (!this.state) return;
      var focusId = document.activeElement && document.activeElement.id;
      var selStart = null;
      try { selStart = document.activeElement.selectionStart; } catch (e) {}

      el('view').innerHTML = this.renderView();
      el('tabbar').innerHTML = this.renderTabs();
      el('topbar').innerHTML = this.renderTop();

      if (focusId) {
        var again = el(focusId);
        if (again) {
          again.focus();
          if (selStart != null && again.setSelectionRange) {
            try { again.setSelectionRange(selStart, selStart); } catch (e) {}
          }
        }
      }
    },

    /* ---------- chrome ---------- */

    renderTop: function () {
      var s = this.state;
      var me = this.me;
      var chip = me
        ? '<button class="me" data-act="pickme"><span class="swatch" style="background:' +
          h(colorOf(s, me)) + '"></span>' + h(nameOf(s, me)) + '</button>'
        : '<button class="me" data-act="pickme">Who are you?</button>';
      return '<div class="wrap topbar-in"><div class="brand"><span class="dot"></span>' +
        '<h1>Ephesus House</h1></div>' + chip + '</div>';
    },

    renderTabs: function () {
      var s = this.state;
      var today = this.today();
      var openUpdates = s.updates.filter(function (u) { return !u.doneAt; }).length;
      var awayNow = s.absences.filter(function (a) { return a.end >= today; }).length;
      var icons = {
        board: '<path d="M3 5h18v16H3z"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        updates: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19.5" cy="17" r="2.2"/>',
        away: '<path d="M4 20h16"/><path d="M6.5 15.5 3 9l2.2-.6 2.6 2.4 4-1.1-4.2-5 2.6-.7 6 4.9 4-1.1a1.7 1.7 0 0 1 .9 3.3L6.5 15.5Z"/>',
        settings: '<path d="M5 8h14M5 16h14"/><circle cx="10" cy="8" r="2.3"/><circle cx="15" cy="16" r="2.3"/>'
      };
      var labels = { board: 'Board', updates: 'Special tasks', away: 'Away', settings: 'Settings' };
      var badges = { updates: openUpdates, away: awayNow };
      var self = this;
      return '<div class="tabbar-in">' + ['board', 'updates', 'away', 'settings'].map(function (k) {
        var n = badges[k];
        return '<button class="tab" data-act="tab" data-tab="' + k + '"' +
          (self.view === k ? ' aria-current="page"' : '') + '>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[k] + '</svg>' +
          '<span>' + labels[k] + '</span>' +
          (n ? '<span class="badge">' + n + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    },

    renderView: function () {
      var body;
      if (!Store.ready) {
        body = '<div class="empty">Loading the board…</div>';
      } else if (!this.state.rotation.length) {
        body = this.renderFirstRun();
      } else {
        body = { board: this.renderBoard, updates: this.renderUpdates,
                 away: this.renderAway, settings: this.renderSettings }[this.view].call(this);
      }
      var flash = this.flashMsg
        ? '<div class="banner"><b>Heads up</b> ' + h(this.flashMsg) + '</div>' : '';

      var notice = '';
      if (Store.offline) {
        notice = '<div class="banner"><b>Cannot reach the board.</b> ' +
          'Showing the last copy this phone saw; changes will not save. ' +
          (Store.lastError ? '<br><span class="why">' + h(Store.lastError) + '</span>' : '') +
          '<br><a href="check.html">Run the connection check</a></div>';
      } else if (Store.ready && !Store.shared) {
        notice = '<div class="banner"><b>This device only.</b> ' +
          (Store.snapshotOf ? 'Copy of the house board as it stood on ' +
            pretty(Store.snapshotOf) + '. ' : '') +
          'Nothing you tick here reaches the other phones.</div>';
      }

      return '<div class="wrap">' + flash + notice + body + '</div>';
    },

    renderFirstRun: function () {
      return '<div class="sec"><div class="panel"><div class="empty">' +
        'No housemates yet.</div>' +
        '<div class="form"><button class="btn primary" data-act="tab" data-tab="settings">Open Settings</button></div></div></div>';
    },

    /* ---------- board ---------- */

    renderBoard: function () {
      var s = this.state;
      var today = this.today();
      var wk = R.buildWeek(s, this.weekOf);
      var isThisWeek = wk.start === R.startOfWeek(today, s.weekStart);

      var out = '';

      /* week navigator */
      out += '<div class="weeknav">' +
        '<button class="arrow" data-act="week" data-d="-7" aria-label="Previous week">‹</button>' +
        '<div class="label">' + (isThisWeek ? 'This week' : 'Week of ' + pretty(wk.start)) +
        '<small>' + pretty(wk.start) + ' – ' + pretty(wk.end) + '</small></div>' +
        '<button class="arrow" data-act="week" data-d="7" aria-label="Next week">›</button>' +
        '</div>';

      if (!isThisWeek) {
        out += '<div class="btn-row" style="justify-content:center;margin-bottom:6px">' +
          '<button class="thisweek" data-act="week" data-d="0">Back to this week</button></div>';
      }

      /* today */
      if (isThisWeek) {
        var day = wk.days.filter(function (d) { return d.date === today; })[0];
        var items = day ? day.items : [];
        out += '<div class="sec"><div class="today">' +
          '<div class="today-head"><h2>' + DOW_LONG[R.dayOfWeek(today)] + '</h2>' +
          '<span class="date">' + pretty(today) + '</span></div>' +
          (items.length
            ? '<div class="items">' + items.map(this.itemHTML, this).join('') + '</div>'
            : '<div class="today-empty">Nothing scheduled today. Check the special tasks.</div>') +
          '</div></div>';
      }

      /* zones */
      if (wk.zones.length) {
        out += '<div class="sec"><div class="sec-head"><h2>Zones this week</h2></div>' +
          '<div class="zones">' + wk.zones.map(function (z) {
            var c = z.assignee ? colorOf(s, z.assignee) : 'var(--muted)';
            var tags = '';
            if (z.coveringFor) tags += '<span class="tag cover">covering ' + h(nameOf(s, z.coveringFor)) + '</span>';
            if (z.unassigned) tags += '<span class="tag away">house away</span>';
            if (z.doneAt) tags += '<span class="tag quiet">done</span>';
            return '<div class="zone" style="--c:' + h(c) + '">' +
              '<h3>' + h(z.chore.name) + '</h3>' +
              '<div class="holder"><span class="swatch"></span><span class="nm">' +
              h(z.assignee ? nameOf(s, z.assignee) : 'Nobody') + '</span></div>' +
              (tags ? '<div class="foot">' + tags + '</div>' : '') +
              '</div>';
          }).join('') + '</div></div>';
      }

      /* standing work with no set day */
      var standing = R.standing(s, today);
      if (standing.length) {
        var holdNote = standing.some(function (x) { return R.holdOf(x.chore) === 'month'; })
          ? 'Whoever holds an area keeps it for the whole month, then it moves on. ' +
            'Do it any time before the window runs out.'
          : 'Do it any time before the window runs out.';
        out += '<div class="sec"><div class="sec-head"><h2>Deep clean</h2>' +
          '<span class="aside">' + monthName(today) + '</span></div>' +
          '<div class="panel"><div class="items">' +
          standing.map(this.itemHTML, this).join('') + '</div></div>' +
          '<p class="hint" style="margin-top:8px">' + holdNote + '</p></div>';
      }

      /* the week */
      var mineOnly = this.mineOnly && this.me;
      out += '<div class="sec"><div class="sec-head"><h2>The week</h2>' +
        (this.me ? '<button class="btn sm" data-act="mine" aria-pressed="' + (this.mineOnly ? 'true' : 'false') +
          '">' + (this.mineOnly ? 'Showing mine' : 'Just mine') + '</button>' : '') +
        '</div><div class="week">';

      out += wk.days.map(function (day) {
        var items = day.items;
        if (mineOnly) {
          items = items.filter(function (i) { return i.assignee === this.me; }, this);
        }
        var cls = 'day';
        if (day.date === today) cls += ' is-today';
        else if (day.date < today) cls += ' is-past';
        var awayHere = s.absences.filter(function (a) {
          return day.date >= a.start && day.date <= a.end;
        }).map(function (a) { return a.housemateId; });

        var body = items.length
          ? items.map(this.itemHTML, this).join('')
          : '<div class="day-empty">' + (mineOnly ? 'nothing of yours' : '—') + '</div>';

        var awayNote = awayHere.length
          ? '<div class="day-empty" style="padding-top:0">' + awayHere.map(function (id) {
              return h(nameOf(s, id)) + ' away';
            }).join(' · ') + '</div>'
          : '';

        return '<div class="' + cls + '"><div class="day-label">' +
          '<span class="dn">' + DOW_SHORT[day.dow] + '</span>' +
          '<span class="dd">' + pretty(day.date) + '</span></div>' +
          '<div class="day-body">' + body + awayNote + '</div></div>';
      }, this).join('');

      out += '</div></div>';

      /* open updates preview */
      var open = s.updates.filter(function (u) { return !u.doneAt; })
        .sort(this.updateSort.bind(this));
      if (open.length) {
        out += '<div class="sec"><div class="sec-head"><h2>Special tasks</h2>' +
          '<span class="aside">' + open.length + ' open</span></div>' +
          '<div class="panel">' + open.slice(0, 3).map(this.updateHTML, this).join('') +
          (open.length > 3
            ? '<div class="empty" style="padding:12px"><button class="btn sm" data-act="tab" data-tab="updates">See all ' +
              open.length + '</button></div>' : '') +
          '</div></div>';
      }

      /* fairness */
      out += this.renderFairness();

      /* reminders */
      if (s.reminders.length) {
        var remCount = s.reminders.reduce(function (n, g) { return n + (g.items || []).length; }, 0);
        out += '<div class="sec"><div class="sec-head"><h2>Reminders</h2>' +
          '<span class="aside">' + remCount + ' standing rules</span></div><div class="panel">' +
          s.reminders.map(function (g) {
            return '<section class="rem-block"><h3>' + h(g.label) + '</h3><ul>' +
              (g.items || []).map(function (t) { return '<li>' + h(t) + '</li>'; }).join('') +
              '</ul></section>';
          }).join('') + '</div></div>';
      }

      return out;
    },

    itemHTML: function (item) {
      var s = this.state;
      var c = item.assignee ? colorOf(s, item.assignee) : 'var(--muted)';
      var ch = item.chore;

      var meta = '';
      if (item.span) {
        meta += '<span class="when">' + pretty(item.span.start) + ' \u2013 ' +
          pretty(item.span.end) + '</span>';
        if (item.daysLeft != null && !item.doneAt) {
          meta += '<span class="tag ' + (item.daysLeft <= 3 ? 'late' : 'quiet') + '">' +
            (item.daysLeft < 0 ? 'window closed'
              : item.daysLeft === 0 ? 'last day'
              : item.daysLeft + ' days left') + '</span>';
        }
      } else if (ch.window) {
        meta += '<span class="when">' + h(ch.window) + '</span>';
      }
      if (item.coveringFor) {
        meta += '<span class="tag cover">covering ' + h(nameOf(s, item.coveringFor)) + '</span>';
      }
      if (item.swappedFrom) {
        meta += '<span class="tag swap">swapped from ' + h(nameOf(s, item.swappedFrom)) + '</span>';
      }
      if (item.away) meta += '<span class="tag away">away</span>';
      if (item.unassigned) meta += '<span class="tag away">house away</span>';
      if (item.doneAt && item.doneBy) {
        meta += '<span class="tag quiet">done by ' + h(nameOf(s, item.doneBy)) + '</span>';
      }

      var who = item.shared
        ? '<span class="who nobody">everyone</span>'
        : item.assignee
          ? '<span class="who"><span class="swatch"></span>' + h(nameOf(s, item.assignee)) + '</span>'
          : '<span class="who nobody">unassigned</span>';

      var list = ch.checklist || [];
      var sub = '';
      if (list.length) {
        var ticked = 0;
        for (var n = 0; n < list.length; n++) if (item.checked[n]) ticked++;
        var isOpen = !!this.openItems[item.key];
        sub = '<div class="sublist">' +
          '<button class="sub-toggle" data-act="expand" data-key="' + h(item.key) +
          '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
          ticked + ' of ' + list.length + ' done' +
          '<span class="caret">' + (isOpen ? '\u25be' : '\u25b8') + '</span></button>' +
          (isOpen
            ? '<ul class="checklist">' + list.map(function (txt, n2) {
                var on = !!item.checked[n2];
                return '<li><button class="tick tiny' + (on ? ' on' : '') +
                  '" data-act="check" data-key="' + h(item.key) + '" data-i="' + n2 +
                  '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + h(txt) + '">\u2713</button>' +
                  '<span' + (on ? ' class="struck"' : '') + '>' + h(txt) + '</span></li>';
              }).join('') + '</ul>'
            : '') +
          '</div>';
      }

      return '<div class="item' + (item.doneAt ? ' is-done' : '') + '" style="--c:' + h(c) + '">' +
        '<button class="tick' + (item.doneAt ? ' on' : '') + '" data-act="tick" data-key="' + h(item.key) +
        '" aria-pressed="' + (item.doneAt ? 'true' : 'false') +
        '" aria-label="' + (item.doneAt ? 'Mark not done' : 'Mark done') + ': ' + h(ch.name) + '">✓</button>' +
        '<div class="item-main"><div class="item-name">' + h(ch.name) + '</div>' +
        (ch.note ? '<div class="item-note">' + h(ch.note) + '</div>' : '') +
        (meta ? '<div class="item-meta">' + meta + '</div>' : '') + sub + '</div>' +
        who + '</div>';
    },

    renderFairness: function () {
      var s = this.state;
      if (s.rotation.length < 2) return '';
      var t = R.tally(s, this.today(), 4);
      var max = 1;
      s.rotation.forEach(function (id) { max = Math.max(max, t[id] ? t[id].assigned : 0); });
      var balanced = R.isBalanced(t);

      return '<div class="sec"><div class="sec-head"><h2>Last four weeks</h2></div><div class="fair">' +
        s.rotation.map(function (id) {
          var row = t[id] || { assigned: 0, covered: 0 };
          return '<div class="fair-row" style="--c:' + h(colorOf(s, id)) + '">' +
            '<span class="nm">' + h(nameOf(s, id)) + '</span>' +
            '<span class="fair-bar"><span style="width:' + Math.round(row.assigned / max * 100) + '%"></span></span>' +
            '<span class="n">' + row.assigned + (row.covered ? ' (+' + row.covered + ')' : '') + '</span></div>';
        }).join('') +
        '<p class="fair-note' + (balanced ? '' : ' warn') + '">' +
        (balanced
          ? 'Everyone is within one turn of everyone else.'
          : 'Turns are uneven right now. Numbers in brackets are turns covered for someone away.') +
        '</p></div></div>';
    },

    /* ---------- updates ---------- */

    updateSort: function (a, b) {
      var ad = a.due || '9999-99-99', bd = b.due || '9999-99-99';
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    },

    updateHTML: function (u) {
      var s = this.state;
      var today = this.today();
      var overdue = u.due && !u.doneAt && u.due < today;
      var meta = '';
      if (u.due) {
        meta += '<span class="due">' + (overdue ? 'was due ' : 'due ') + pretty(u.due) + '</span>';
      }
      if (overdue) meta += '<span class="tag late">overdue</span>';
      if (u.assignee && s.housemates[u.assignee]) {
        meta += '<span class="who" style="--c:' + h(colorOf(s, u.assignee)) + '">' +
          '<span class="swatch"></span>' + h(nameOf(s, u.assignee)) + '</span>';
      }
      if (u.doneAt && u.doneBy) meta += '<span class="tag quiet">done by ' + h(nameOf(s, u.doneBy)) + '</span>';

      return '<div class="update' + (u.doneAt ? ' is-done' : '') + '">' +
        '<button class="tick' + (u.doneAt ? ' on' : '') + '" data-act="utick" data-id="' + h(u.id) +
        '" aria-pressed="' + (u.doneAt ? 'true' : 'false') +
        '" aria-label="' + (u.doneAt ? 'Reopen' : 'Mark done') + ': ' + h(u.title) + '">✓</button>' +
        '<div class="u-main"><div class="u-title">' + h(u.title) + '</div>' +
        (u.note ? '<div class="u-meta">' + h(u.note) + '</div>' : '') +
        (meta ? '<div class="u-meta">' + meta + '</div>' : '') + '</div>' +
        '<button class="u-del" data-act="udel" data-id="' + h(u.id) + '" aria-label="Delete ' + h(u.title) + '">✕</button>' +
        '</div>';
    },

    renderUpdates: function () {
      var s = this.state;
      var open = s.updates.filter(function (u) { return !u.doneAt; }).sort(this.updateSort.bind(this));
      var done = s.updates.filter(function (u) { return u.doneAt; })
        .sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; });
      var d = this.draft;

      var out = '<div class="sec"><div class="sec-head"><h2>New special task</h2></div>' +
        '<div class="panel"><div class="form">' +
        '<div class="field"><label for="u-title">What needs doing</label>' +
        '<input type="text" id="u-title" data-draft="uTitle" value="' + h(d.uTitle || '') +
        '" placeholder="Wipe down the lights"></div>' +
        '<div class="row2">' +
        '<div class="field"><label for="u-due">Due (optional)</label>' +
        '<input type="date" id="u-due" data-draft="uDue" value="' + h(d.uDue || '') + '"></div>' +
        '<div class="field"><label for="u-who">Who</label><select id="u-who" data-draft="uWho">' +
        '<option value="">Nobody yet</option><option value="__next__"' +
        (d.uWho === '__next__' ? ' selected' : '') + '>Next in rotation</option>' +
        s.rotation.map(function (id) {
          return '<option value="' + h(id) + '"' + (d.uWho === id ? ' selected' : '') + '>' +
            h(nameOf(s, id)) + '</option>';
        }).join('') + '</select></div></div>' +
        '<div class="field"><label for="u-note">Notes (optional)</label>' +
        '<input type="text" id="u-note" data-draft="uNote" value="' + h(d.uNote || '') +
        '" placeholder="All foam in one box"></div>' +
        '<div class="btn-row"><button class="btn primary" data-act="uadd">Add to the board</button></div>' +
        '</div></div></div>';

      out += '<div class="sec"><div class="sec-head"><h2>Open</h2>' +
        '<span class="aside">' + open.length + '</span></div><div class="panel">' +
        (open.length ? open.map(this.updateHTML, this).join('')
                     : '<div class="empty">Nothing outstanding.</div>') +
        '</div></div>';

      if (done.length) {
        out += '<div class="sec"><div class="sec-head"><h2>Done</h2>' +
          '<span class="aside">' + done.length + '</span></div><div class="panel">' +
          done.slice(0, 20).map(this.updateHTML, this).join('') + '</div></div>';
      }
      return out;
    },

    /* ---------- away ---------- */

    renderAway: function () {
      var s = this.state;
      var today = this.today();
      var d = this.draft;
      var whoDefault = d.aWho || this.me || s.rotation[0] || '';

      var preview = '';
      if (whoDefault && d.aStart && d.aEnd && d.aEnd >= d.aStart) {
        var all = R.previewAbsence(s, {
          housemateId: whoDefault, start: d.aStart, end: d.aEnd
        });
        var during = all.filter(function (c) { return c.date <= d.aEnd; });
        var after = all.filter(function (c) { return c.date > d.aEnd; });
        var choreName = function (id) {
          var c = s.chores.filter(function (x) { return x.id === id; })[0];
          return c ? c.name : id;
        };
        var line = function (c) {
          return '<p class="chg">' + h(choreName(c.choreId)) + ' · ' + prettyFull(c.date) + ' → ' +
            h(c.to ? nameOf(s, c.to) : 'nobody') + '</p>';
        };
        preview = '<div class="preview"><h4>While they are away</h4>' +
          (during.length
            ? during.slice(0, 5).map(line).join('') +
              (during.length > 5 ? '<p class="chg">and ' + (during.length - 5) + ' more</p>' : '')
            : '<p>Nothing moves. None of their turns fall in those dates.</p>') +
          (after.length
            ? '<h4 style="margin-top:6px">After they are back</h4>' +
              '<p>' + h(nameOf(s, whoDefault)) + ' picks up the turns they missed, so ' +
              after.length + ' later ' + (after.length === 1 ? 'turn shifts' : 'turns shift') +
              ' to keep everyone even.</p>'
            : '') +
          '</div>';
      }

      var out = '<div class="sec"><div class="sec-head"><h2>Mark someone away</h2></div>' +
        '<div class="panel"><div class="form">' +
        '<div class="field"><label>Who</label><div class="seg">' +
        s.rotation.map(function (id) {
          return '<button data-act="awho" data-id="' + h(id) + '" aria-pressed="' +
            (whoDefault === id ? 'true' : 'false') + '"><span class="swatch" style="background:' +
            h(colorOf(s, id)) + '"></span>' + h(nameOf(s, id)) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="row2">' +
        '<div class="field"><label for="a-start">From</label>' +
        '<input type="date" id="a-start" data-draft="aStart" value="' + h(d.aStart || '') + '"></div>' +
        '<div class="field"><label for="a-end">Through</label>' +
        '<input type="date" id="a-end" data-draft="aEnd" value="' + h(d.aEnd || '') + '"></div></div>' +
        '<div class="field"><label for="a-note">Note (optional)</label>' +
        '<input type="text" id="a-note" data-draft="aNote" value="' + h(d.aNote || '') +
        '" placeholder="In SF for work"></div>' +
        preview +
        '<div class="btn-row"><button class="btn primary" data-act="aadd">Save</button></div>' +
        '<p class="hint">Whoever is away is skipped but keeps their place, so they pick up ' +
        'their turn as soon as they are back.</p>' +
        '</div></div></div>';

      var upcoming = s.absences.filter(function (a) { return a.end >= today; })
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      var past = s.absences.filter(function (a) { return a.end < today; })
        .sort(function (a, b) { return a.start > b.start ? -1 : 1; });

      function row(a) {
        return '<div class="absence"><span class="swatch" style="background:' +
          h(colorOf(s, a.housemateId)) + '"></span><div class="a-main">' +
          '<div class="a-when">' + h(nameOf(s, a.housemateId)) + ' · ' +
          pretty(a.start) + ' – ' + pretty(a.end) + '</div>' +
          (a.note ? '<div class="a-note">' + h(a.note) + '</div>' : '') + '</div>' +
          '<button class="u-del" data-act="adel" data-id="' + h(a.id) +
          '" aria-label="Remove this absence">✕</button></div>';
      }

      out += '<div class="sec"><div class="sec-head"><h2>Current and upcoming</h2></div><div class="panel">' +
        (upcoming.length ? upcoming.map(row).join('') : '<div class="empty">Everyone is home.</div>') +
        '</div></div>';

      if (past.length) {
        out += '<div class="sec"><div class="sec-head"><h2>Past</h2></div><div class="panel">' +
          past.slice(0, 10).map(row).join('') + '</div></div>';
      }
      return out;
    },

    /* ---------- settings ---------- */

    renderSettings: function () {
      var s = this.state;
      var out = '';

      /* identity */
      out += '<div class="sec"><div class="sec-head"><h2>This device</h2></div><div class="panel">' +
        '<div class="form"><div class="field"><label>I am</label><div class="seg">' +
        s.rotation.map(function (id) {
          return '<button data-act="setme" data-id="' + h(id) + '" aria-pressed="' +
            (this.me === id ? 'true' : 'false') + '"><span class="swatch" style="background:' +
            h(colorOf(s, id)) + '"></span>' + h(nameOf(s, id)) + '</button>';
        }, this).join('') + '</div></div></div></div></div>';

      /* rotation order */
      out += '<div class="sec"><div class="sec-head"><h2>Rotation order</h2>' +
        '<span class="aside">who follows whom</span></div><div class="panel">' +
        s.rotation.map(function (id, i) {
          return '<div class="ord"><span class="pos">' + (i + 1) + '</span>' +
            '<span class="swatch" style="background:' + h(colorOf(s, id)) + '"></span>' +
            '<span class="nm">' + h(nameOf(s, id)) + '</span>' +
            '<button class="btn sm" data-act="move" data-id="' + h(id) + '" data-d="-1"' +
            (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
            '<button class="btn sm" data-act="move" data-id="' + h(id) + '" data-d="1"' +
            (i === s.rotation.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
            '</div>';
        }).join('') + '</div></div>';

      /* housemates */
      var allMates = Object.keys(s.housemates);
      out += '<div class="sec"><div class="sec-head"><h2>Housemates</h2></div><div class="panel">' +
        (allMates.length ? allMates.map(function (id) {
          var p = person(s, id);
          return '<div class="setting"><div class="s-main" style="flex:1">' +
            '<input type="text" id="hm-' + h(id) + '" data-mate="' + h(id) +
            '" value="' + h(p.name) + '" aria-label="Name">' +
            '<div class="s-desc">' + (p.active === false ? 'Not in the rotation' : 'In the rotation') + '</div>' +
            '</div><div class="s-ctl">' +
            '<input type="color" id="hc-' + h(id) + '" data-mate-color="' + h(id) +
            '" value="' + h(p.color || '#64798a') + '" aria-label="Colour" ' +
            'style="width:34px;height:34px;padding:2px;border-radius:8px">' +
            '<button class="toggle" data-act="togactive" data-id="' + h(id) + '" aria-pressed="' +
            (p.active === false ? 'false' : 'true') + '" aria-label="In the rotation"></button>' +
            '<button class="u-del" data-act="hmdel" data-id="' + h(id) +
            '" aria-label="Remove ' + h(p.name) + '">\u2715</button>' +
            '</div></div>';
        }).join('') : '<div class="empty">Nobody yet.</div>') +
        '<div class="form"><button class="btn ghost" data-act="hmadd">+ Add a housemate</button></div>' +
        '</div></div>';

      /* chores */
      out += '<div class="sec"><div class="sec-head"><h2>Chores</h2></div><div class="panel">' +
        s.chores.slice().sort(function (a, b) {
          return (a.isZone ? 1 : 0) - (b.isZone ? 1 : 0) || (a.order || 0) - (b.order || 0);
        }).map(this.choreRowHTML, this).join('') +
        '<div class="form"><button class="btn ghost" data-act="chadd">+ Add a chore</button></div>' +
        '</div></div>';

      /* reminders */
      out += '<div class="sec"><div class="sec-head"><h2>Reminders</h2>' +
        '<span class="aside">house rules, never assigned</span></div><div class="panel">' +
        s.reminders.map(function (g, gi) {
          return '<section class="rem-block rem-edit"><h3>' + h(g.label) + '</h3><ul>' +
            (g.items || []).map(function (t, ti) {
              return '<li><span style="flex:1">' + h(t) + '</span>' +
                '<button class="u-del" data-act="remdel" data-g="' + gi + '" data-i="' + ti +
                '" aria-label="Remove reminder">✕</button></li>';
            }).join('') +
            '</ul><div class="rem-add"><input type="text" id="rem-add-' + gi + '" data-draft="rem' + gi +
            '" placeholder="Add a reminder" value="' + h(this.draft['rem' + gi] || '') + '">' +
            '<button class="btn sm" data-act="remadd" data-g="' + gi + '">Add</button></div>' +
            '</section>';
        }, this).join('') + '</div></div>';

      /* house settings */
      out += '<div class="sec"><div class="sec-head"><h2>House</h2></div><div class="panel">' +
        '<div class="setting"><div class="s-main"><div class="s-name">Week starts on</div>' +
        '<div class="s-desc">Which day the board and the zones roll over</div></div>' +
        '<div class="s-ctl"><select data-act="weekstart" id="set-weekstart">' +
        [1, 0].map(function (v) {
          return '<option value="' + v + '"' + (s.weekStart === v ? ' selected' : '') + '>' +
            DOW_LONG[v] + '</option>';
        }).join('') + '</select></div></div>' +

        '<div class="setting"><div class="s-main"><div class="s-name">Balance covers</div>' +
        '<div class="s-desc">When someone is away, give the extra turn to whoever has ' +
        'covered least lately instead of always the next in line</div></div>' +
        '<div class="s-ctl"><button class="toggle" data-act="togbalance" aria-pressed="' +
        (s.balanceCovers ? 'true' : 'false') + '" aria-label="Balance covers"></button></div></div>' +

        '<div class="setting stack"><div class="s-main"><div class="s-name">Time zone</div>' +
        '<div class="s-desc">Everything is computed here, never on the device clock</div></div>' +
        '<div class="s-ctl"><input type="text" id="set-tz" data-act="tz" value="' +
        h(s.timezone) + '"></div></div>' +
        '</div></div>';

      /* the original board */
      out += '<div class="sec"><div class="sec-head"><h2>The board this replaces</h2></div>' +
        '<div class="panel"><img src="whiteboard.jpg" alt="The original whiteboard on the fridge" ' +
        'loading="lazy" style="display:block;width:100%;height:auto"></div></div>';

      if (Store.shared) {
        out += '<div class="sec"><p class="hint">' +
          'Everything on this board is shared. Ivan, Jett and Demitrius all see the ' +
          'same thing within a few seconds of any change.</p></div>';
      } else {
        out += '<div class="sec"><div class="sec-head"><h2>This copy</h2></div>' +
          '<div class="panel"><div class="form">' +
          '<p class="hint" style="margin:0">Changes stay in this browser. Reloading the ' +
          'house board throws away anything you have changed here and starts again from ' +
          'the shared board\u2019s last export.</p>' +
          '<div class="btn-row"><button class="btn danger" data-act="reseed">' +
          'Reload the house board</button></div></div></div></div>';
      }

      return out;
    },

    choreRowHTML: function (c) {
      var s = this.state;
      var open = this.editingChore === c.id;
      var hold = R.holdOf(c);
      var cadenceWord = c.cadence === 'biweekly' ? 'every other week'
        : c.cadence === 'monthly' ? 'monthly' : 'weekly';
      var desc = c.isZone
        ? 'Zone · rotates weekly'
        : c.undated
          ? 'No set day · ' + cadenceWord
          : DOW_LONG[c.day] + ' · ' + cadenceWord + (c.window ? ' · ' + c.window : '');
      if (!c.isZone && hold === 'month') desc += ' · held for the month';
      if (!c.isZone && hold === 'week') desc += ' · held for the week';
      if (c.mode === 'fixed') desc += ' · always ' + nameOf(s, c.fixedAssignee);
      if (c.mode === 'everyone') desc += ' · everyone';
      if ((c.checklist || []).length) desc += ' · ' + c.checklist.length + ' jobs';

      var out = '<div class="chore-row"><div class="chore-head">' +
        '<span class="nm">' + h(c.name) + '</span>' +
        '<button class="btn sm" data-act="chedit" data-id="' + h(c.id) + '">' +
        (open ? 'Close' : 'Edit') + '</button></div>' +
        '<div class="s-desc">' + h(desc) + '</div>';

      if (open) {
        out += '<div class="chore-edit">' +
          '<div class="field"><label for="ch-name">Name</label>' +
          '<input type="text" id="ch-name" data-chore="' + h(c.id) + '" data-f="name" value="' +
          h(c.name) + '"></div>' +
          '<div class="field"><label for="ch-when">When it gets done</label>' +
          '<select id="ch-when" data-chore="' + h(c.id) + '" data-f="undated"' +
          (c.isZone ? ' disabled' : '') + '>' +
          [['false', 'On a set day'], ['true', 'Any time before it comes round again']]
            .map(function (o) {
              return '<option value="' + o[0] + '"' + ((c.undated ? 'true' : 'false') === o[0] ? ' selected' : '') +
                '>' + o[1] + '</option>';
            }).join('') + '</select></div>' +
          '<div class="row2">' +
          '<div class="field"><label for="ch-day">Day</label>' +
          '<select id="ch-day" data-chore="' + h(c.id) + '" data-f="day"' +
          (c.isZone || c.undated ? ' disabled' : '') + '>' +
          DOW_LONG.map(function (d, i) {
            return '<option value="' + i + '"' + (c.day === i ? ' selected' : '') + '>' + d + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label for="ch-cad">Repeats</label>' +
          '<select id="ch-cad" data-chore="' + h(c.id) + '" data-f="cadence"' + (c.isZone ? ' disabled' : '') + '>' +
          [['weekly', 'Weekly'], ['biweekly', 'Every other week'], ['monthly', 'Monthly']].map(function (o) {
            return '<option value="' + o[0] + '"' + (c.cadence === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></div></div>' +
          '<div class="row2">' +
          '<div class="field"><label for="ch-win">Time window</label>' +
          '<input type="text" id="ch-win" data-chore="' + h(c.id) + '" data-f="window" value="' +
          h(c.window || '') + '" placeholder="4–8 PM"></div>' +
          '<div class="field"><label for="ch-mode">Assigned</label>' +
          '<select id="ch-mode" data-chore="' + h(c.id) + '" data-f="mode">' +
          [['rotate', 'By rotation'], ['fixed', 'Always one person'], ['everyone', 'Everyone']].map(function (o) {
            return '<option value="' + o[0] + '"' + (c.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></div></div>' +
          (c.mode === 'fixed'
            ? '<div class="field"><label for="ch-fixed">Who</label>' +
              '<select id="ch-fixed" data-chore="' + h(c.id) + '" data-f="fixedAssignee">' +
              s.rotation.map(function (id) {
                return '<option value="' + h(id) + '"' + (c.fixedAssignee === id ? ' selected' : '') + '>' +
                  h(nameOf(s, id)) + '</option>';
              }).join('') + '</select></div>'
            : '') +
          (c.mode === 'rotate'
            ? '<div class="field"><label for="ch-anchor">Currently up next</label>' +
              '<select id="ch-anchor" data-chore="' + h(c.id) + '" data-f="anchorPerson">' +
              s.rotation.map(function (id) {
                return '<option value="' + h(id) + '"' + (c.anchorPerson === id ? ' selected' : '') + '>' +
                  h(nameOf(s, id)) + '</option>';
              }).join('') + '</select>' +
              '<p class="hint">Resets this chore’s place in the rotation from ' +
              pretty(c.anchorDate) + '.</p></div>'
            : '') +
          '<div class="field"><label for="ch-hold">One person holds it for</label>' +
          '<select id="ch-hold" data-chore="' + h(c.id) + '" data-f="holdPeriod"' +
          (c.isZone ? ' disabled' : '') + '>' +
          [['', 'Just that one time'], ['week', 'The whole week'], ['month', 'The whole month']]
            .map(function (o) {
              return '<option value="' + o[0] + '"' + ((hold || '') === o[0] ? ' selected' : '') +
                '>' + o[1] + '</option>';
            }).join('') + '</select>' +
          '<p class="hint">Held for a month means the same person does every one of these ' +
          'that comes round before it moves on.</p></div>' +
          '<div class="field"><label for="ch-note">Note</label>' +
          '<input type="text" id="ch-note" data-chore="' + h(c.id) + '" data-f="note" value="' +
          h(c.note || '') + '" placeholder="Handles toward the street"></div>' +
          '<div class="field"><label>What the job involves</label>' +
          '<ul class="joblist">' + (c.checklist || []).map(function (t, ti) {
            return '<li><span style="flex:1">' + h(t) + '</span>' +
              '<button class="u-del" data-act="cldel" data-id="' + h(c.id) + '" data-i="' + ti +
              '" aria-label="Remove this job">✕</button></li>';
          }).join('') + '</ul>' +
          '<div class="rem-add"><input type="text" id="cl-add-' + h(c.id) + '" data-draft="cl' +
          h(c.id) + '" placeholder="Add a job" value="' + h(this.draft['cl' + c.id] || '') + '">' +
          '<button class="btn sm" data-act="cladd" data-id="' + h(c.id) + '">Add</button></div></div>' +
          '<div class="btn-row"><button class="btn sm danger" data-act="chdel" data-id="' +
          h(c.id) + '">Remove this chore</button></div>' +
          '</div>';
      }
      return out + '</div>';
    },

    /* ---------- events ---------- */

    onInput: function (e) {
      var t = e.target;
      if (!t) return;

      if (t.dataset && t.dataset.draft) {
        this.draft[t.dataset.draft] = t.value;
        // Re-render only where the preview depends on the value.
        if (this.view === 'away' && /^a(Start|End)$/.test(t.dataset.draft)) this.render();
        return;
      }

      if (t.dataset && t.dataset.chore) {
        var id = t.dataset.chore, f = t.dataset.f;
        var val = f === 'day' ? +t.value : t.value;
        if (f === 'holdPeriod' && val === '') val = null;
        if (f === 'undated') val = (t.value === 'true');
        var patch = {};
        patch[f] = val;
        if (f === 'anchorPerson') {
          // Re-anchor from the start of the current week so the change takes
          // effect now rather than being replayed from the original anchor.
          patch.anchorDate = R.startOfWeek(this.today(), this.state.weekStart);
        }
        Store.merge('chores/' + id, patch);
        return;
      }

      if (t.dataset && (t.dataset.mate || t.dataset.mateColor)) {
        var mid = t.dataset.mate || t.dataset.mateColor;
        var mates = JSON.parse(JSON.stringify(this.state.housemates));
        if (!mates[mid]) return;
        if (t.dataset.mate) mates[mid].name = t.value;
        else mates[mid].color = t.value;
        Store.merge('config/house', { housemates: mates });
        return;
      }

      if (t.dataset && t.dataset.act === 'weekstart') {
        Store.merge('config/house', { weekStart: +t.value });
        return;
      }
      if (t.dataset && t.dataset.act === 'tz') {
        var tz = t.value.trim();
        try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch (err) { return; }
        Store.merge('config/house', { timezone: tz });
      }
    },

    onClick: function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.dataset.act;
      var s = this.state;
      var today = this.today();

      var handlers = {
        tab: function () { this.view = btn.dataset.tab; window.scrollTo(0, 0); this.render(); },

        week: function () {
          var d = +btn.dataset.d;
          this.weekOf = d === 0 ? today : R.addDays(this.weekOf, d);
          this.render();
        },

        mine: function () {
          this.mineOnly = !this.mineOnly;
          safeLocal(function () { localStorage.setItem('ephesus.mine', App.mineOnly ? '1' : '0'); });
          this.render();
        },

        pickme: function () { this.view = 'settings'; window.scrollTo(0, 0); this.render(); },

        setme: function () {
          this.me = btn.dataset.id;
          safeLocal(function () { localStorage.setItem(ME_KEY, App.me); });
          this.render();
        },

        tick: function () {
          var key = btn.dataset.key;
          var rec = s.occurrences[key];
          var parts = key.split('__');
          var chore = s.chores.filter(function (c) { return c.id === parts[0]; })[0];
          var list = (chore && chore.checklist) || [];

          if (rec && rec.doneAt) {
            var rest = Object.assign({}, rec);
            delete rest.doneAt; delete rest.doneBy;
            if (list.length) rest.checked = {};      // ticking off clears the checklist too
            var meaningful = Object.keys(rest).filter(function (k) {
              return k !== 'choreId' && k !== 'date' &&
                !(k === 'checked' && !Object.keys(rest.checked || {}).length);
            });
            if (meaningful.length) Store.set('occurrences/' + key, rest);
            else Store.remove('occurrences/' + key);
          } else {
            var all = {};
            for (var n = 0; n < list.length; n++) all[n] = true;
            Store.set('occurrences/' + key, Object.assign({}, rec, {
              choreId: parts[0], date: parts[1],
              checked: list.length ? all : (rec && rec.checked) || {},
              doneAt: new Date().toISOString(),
              doneBy: this.me || null
            }));
          }
        },

        expand: function () {
          var key = btn.dataset.key;
          this.openItems[key] = !this.openItems[key];
          this.render();
        },

        check: function () {
          var key = btn.dataset.key, idx = btn.dataset.i;
          var rec = s.occurrences[key] || {};
          var parts = key.split('__');
          var chore = s.chores.filter(function (c) { return c.id === parts[0]; })[0];
          var total = ((chore && chore.checklist) || []).length;

          var checked = Object.assign({}, rec.checked || {});
          if (checked[idx]) delete checked[idx]; else checked[idx] = true;

          // The occurrence is done exactly when every job on it is done.
          var complete = total > 0 && Object.keys(checked).length >= total;
          Store.set('occurrences/' + key, Object.assign({}, rec, {
            choreId: parts[0], date: parts[1], checked: checked,
            doneAt: complete ? (rec.doneAt || new Date().toISOString()) : null,
            doneBy: complete ? (rec.doneBy || this.me || null) : null
          }));
        },

        uadd: function () {
          var title = (this.draft.uTitle || '').trim();
          if (!title) { this.flash('Give the update a name first.'); return; }
          var who = this.draft.uWho || '';
          var due = this.draft.uDue || '';
          if (who === '__next__') {
            who = R.nextInRotation(s, due || today);
            if (who) {
              var order = s.rotation;
              var at = order.indexOf(who);
              Store.merge('config/house', { updatePointer: order[(at + 1) % order.length] });
            }
          }
          Store.set('updates/' + uid('u'), {
            title: title, note: (this.draft.uNote || '').trim(),
            due: due || null, assignee: who || null,
            createdAt: new Date().toISOString(), createdBy: this.me || null,
            doneAt: null, doneBy: null
          });
          this.draft.uTitle = ''; this.draft.uNote = ''; this.draft.uDue = ''; this.draft.uWho = '';
          this.render();
        },

        utick: function () {
          var u = s.updates.filter(function (x) { return x.id === btn.dataset.id; })[0];
          if (!u) return;
          Store.merge('updates/' + u.id, u.doneAt
            ? { doneAt: null, doneBy: null }
            : { doneAt: new Date().toISOString(), doneBy: this.me || null });
        },

        udel: function () { Store.remove('updates/' + btn.dataset.id); },

        awho: function () { this.draft.aWho = btn.dataset.id; this.render(); },

        aadd: function () {
          var who = this.draft.aWho || this.me || s.rotation[0];
          var start = this.draft.aStart, end = this.draft.aEnd;
          if (!who || !start || !end) { this.flash('Pick a person and both dates.'); return; }
          if (end < start) { this.flash('The end date is before the start date.'); return; }
          Store.set('absences/' + uid('a'), {
            housemateId: who, start: start, end: end,
            note: (this.draft.aNote || '').trim(), createdAt: new Date().toISOString()
          });
          this.draft.aStart = ''; this.draft.aEnd = ''; this.draft.aNote = '';
          this.render();
        },

        adel: function () { Store.remove('absences/' + btn.dataset.id); },

        move: function () {
          var id = btn.dataset.id, d = +btn.dataset.d;
          var order = s.rotation.slice();
          var at = order.indexOf(id);
          var to = at + d;
          if (at < 0 || to < 0 || to >= order.length) return;
          order.splice(at, 1);
          order.splice(to, 0, id);
          Store.merge('config/house', { rotation: order });
        },

        togactive: function () {
          var id = btn.dataset.id;
          var mates = JSON.parse(JSON.stringify(s.housemates));
          mates[id].active = mates[id].active === false;
          Store.merge('config/house', { housemates: mates });
        },

        hmadd: function () {
          var palette = ['#dd6b36', '#14907e', '#a8478b', '#3f7fd0', '#b8892b', '#6b5bd2'];
          var mates = JSON.parse(JSON.stringify(s.housemates));
          var id = uid('h');
          mates[id] = {
            name: 'New housemate', active: true,
            color: palette[Object.keys(mates).length % palette.length]
          };
          Store.merge('config/house', {
            housemates: mates,
            rotation: s.rotation.concat([id])
          });
        },

        hmdel: function () {
          var id = btn.dataset.id;
          var mates = JSON.parse(JSON.stringify(s.housemates));
          delete mates[id];
          Store.merge('config/house', {
            housemates: mates,
            rotation: s.rotation.filter(function (x) { return x !== id; })
          });
        },

        reseed: function () {
          safeLocal(function () {
            localStorage.removeItem(LOCAL_KEY);
            localStorage.removeItem(CACHE_KEY);
          });
          Store.startLocal(true);
        },

        togbalance: function () {
          Store.merge('config/house', { balanceCovers: !s.balanceCovers });
        },

        chedit: function () {
          this.editingChore = this.editingChore === btn.dataset.id ? null : btn.dataset.id;
          this.render();
        },

        chadd: function () {
          var id = uid('c');
          Store.set('chores/' + id, {
            name: 'New chore', day: 1, cadence: 'weekly', mode: 'rotate',
            anchorPerson: s.rotation[0] || null,
            anchorDate: R.startOfWeek(today, s.weekStart),
            isZone: false, undated: false, note: '', window: '',
            holdPeriod: null, checklist: [],
            order: s.chores.length + 1
          });
          this.editingChore = id;
          this.render();
        },

        cladd: function () {
          var id = btn.dataset.id;
          var text = (this.draft['cl' + id] || '').trim();
          if (!text) return;
          var chore = s.chores.filter(function (c) { return c.id === id; })[0];
          if (!chore) return;
          this.draft['cl' + id] = '';
          Store.merge('chores/' + id, { checklist: (chore.checklist || []).concat([text]) });
        },

        cldel: function () {
          var id = btn.dataset.id;
          var chore = s.chores.filter(function (c) { return c.id === id; })[0];
          if (!chore) return;
          var next = (chore.checklist || []).slice();
          next.splice(+btn.dataset.i, 1);
          Store.merge('chores/' + id, { checklist: next });
        },

        chdel: function () {
          Store.remove('chores/' + btn.dataset.id);
          this.editingChore = null;
          this.render();
        },

        remadd: function () {
          var gi = +btn.dataset.g;
          var text = (this.draft['rem' + gi] || '').trim();
          if (!text) return;
          var groups = JSON.parse(JSON.stringify(s.reminders));
          groups[gi].items = (groups[gi].items || []).concat([text]);
          this.draft['rem' + gi] = '';
          Store.set('config/reminders', { groups: groups });
          this.render();
        },

        remdel: function () {
          var groups = JSON.parse(JSON.stringify(s.reminders));
          groups[+btn.dataset.g].items.splice(+btn.dataset.i, 1);
          Store.set('config/reminders', { groups: groups });
        }
      };

      if (handlers[act]) { e.preventDefault(); handlers[act].call(this); }
    }
  };

  window.App = App;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.boot(); });
  } else {
    App.boot();
  }
})();
