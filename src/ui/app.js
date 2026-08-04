// The page. No framework, no build step, no external request.
//
// Everything is rendered with textContent rather than innerHTML. The strings
// come from the user's own markdown, so they are not hostile — but a document is
// still untrusted input, and a dashboard that renders `<img onerror=...>` out of
// a PRD title is a bug waiting for someone to find it funny.
//
// Polling rather than a live stream. The server sends a fingerprint; the page
// sends it back and is told "unchanged" without anything being reparsed. For a
// local tool reading a few dozen markdown files this is cheaper than a watcher
// plus an event stream, and it has a property a stream has to work for: a failed
// poll is visible immediately, so the page cannot quietly show stale state and
// call it current.

(function () {
  'use strict';

  var POLL_MS = 2500;
  var state = null;
  var misses = 0;

  var el = function (id) { return document.getElementById(id); };

  function text(tag, className, value) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (value !== undefined && value !== null) n.textContent = String(value);
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- connection indicator -------------------------------------------------

  function setLive(status) {
    var dot = el('live-dot');
    dot.className = 'dot' + (status === 'ok' ? '' : status === 'stale' ? ' stale' : ' dead');
    dot.title =
      status === 'ok' ? 'connected' : status === 'stale' ? 'not responding' : 'monitor stopped';
  }

  // ---- gates ----------------------------------------------------------------

  var MARK = { green: '✔', red: '✘', blocked: '·' };

  function renderGates(gates) {
    var list = el('gates');
    clear(list);
    gates.forEach(function (g) {
      var li = text('li', 'gate ' + g.state);
      li.appendChild(text('span', 'mark', MARK[g.state] || '?'));
      li.appendChild(text('span', 'id', g.id));
      li.appendChild(text('span', 'title', g.title));

      var right = '';
      if (g.state === 'blocked') right = 'blocked by ' + g.blockedBy;
      else if (g.errors) right = g.errors + ' error' + (g.errors === 1 ? '' : 's');
      else if (g.warnings) right = g.warnings + ' warning' + (g.warnings === 1 ? '' : 's');
      li.appendChild(text('span', 'count', right));
      list.appendChild(li);
    });
  }

  // ---- findings: only the first red gate ------------------------------------

  function renderFindings(s) {
    var section = el('findings-section');
    var red = null;
    for (var i = 0; i < s.gates.length; i++) {
      if (s.gates[i].state === 'red') { red = s.gates[i]; break; }
    }
    if (!red || !red.findings.length) { section.hidden = true; return; }

    section.hidden = false;
    el('findings-gate').textContent = red.id + ' — ' + red.title;

    var list = el('findings');
    clear(list);
    red.findings.forEach(function (f) {
      var li = text('li', 'finding' + (f.severity === 'warning' ? ' warning' : ''));
      li.appendChild(text('div', 'code', f.code));
      li.appendChild(text('div', 'msg', f.message));
      if (f.file) {
        li.appendChild(text('div', 'where', f.file + (f.line ? ':' + f.line : '')));
      }
      list.appendChild(li);
    });
  }

  // ---- features -------------------------------------------------------------

  function bar(label, done, total) {
    var row = text('div', 'bar-row');
    row.appendChild(text('span', null, label));
    var track = text('div', 'bar');
    var fill = text('span');
    fill.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(text('span', 'n', done + ' / ' + total));
    return row;
  }

  function renderFeatures(features) {
    var host = el('features');
    clear(host);

    if (!features.length) {
      host.appendChild(
        text('p', 'empty', 'No features yet. Create one with: adp new <name>')
      );
      return;
    }

    features.forEach(function (f) {
      var card = text('div', 'feature');
      card.appendChild(text('h3', null, f.name));
      card.appendChild(text('div', 'path', f.dir));

      var docs = text('div', 'docs');
      [['PRD', f.hasPrd], ['RFC', f.hasRfc], ['TDD', f.hasTdd]].forEach(function (d) {
        docs.appendChild(text('span', 'doc ' + (d[1] ? 'present' : 'absent'), d[0]));
      });
      card.appendChild(docs);

      var bars = text('div', 'bars');
      bars.appendChild(bar('criteria proven', f.counts.proven, f.counts.criteria));
      bars.appendChild(bar('tasks done', f.counts.done, f.counts.tasks));
      card.appendChild(bars);

      // Task status breakdown, in the order work moves through it.
      var order = ['pending', 'in-progress', 'in-test', 'done'];
      var counts = {};
      f.tasks.forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
      var pills = text('div', 'statuses');
      order.forEach(function (st) {
        if (!counts[st]) return;
        var pill = text('span', 'pill');
        pill.appendChild(text('b', null, counts[st]));
        pill.appendChild(document.createTextNode(' ' + st));
        pills.appendChild(pill);
      });
      if (pills.childNodes.length) card.appendChild(pills);

      host.appendChild(card);
    });
  }

  // ---- errors ---------------------------------------------------------------

  function renderErrors(errors) {
    var section = el('errors-section');
    if (!errors || !errors.length) { section.hidden = true; return; }
    section.hidden = false;
    var list = el('errors');
    clear(list);
    errors.forEach(function (e) {
      var li = text('li', 'finding');
      li.appendChild(text('div', 'msg', e));
      list.appendChild(li);
    });
  }

  // ---- top line -------------------------------------------------------------

  function renderVerdict(s) {
    var v = el('verdict');
    v.className = 'verdict ' + (s.exitCode === 0 ? 'clean' : 'failing');
    v.textContent =
      s.exitCode === 0
        ? 'every gate clean — exit 0'
        : 'first red gate: ' + s.firstRed + ' — exit ' + s.exitCode;
    el('root').textContent = s.root;
  }

  function render(s) {
    state = s;
    renderVerdict(s);
    renderGates(s.gates);
    renderFindings(s);
    renderFeatures(s.features);
    renderErrors(s.errors);
    el('stamp').textContent =
      'read at ' + new Date(s.generatedAt).toLocaleTimeString() +
      ' · ' + s.totals.errors + ' error(s), ' + s.totals.warnings + ' warning(s)' +
      ' · ' + s.totals.principles + ' principles';
  }

  // ---- polling --------------------------------------------------------------

  function poll() {
    var url = '/api/state';
    if (state && state.fingerprint) url += '?since=' + encodeURIComponent(state.fingerprint);

    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        misses = 0;
        setLive('ok');
        if (!data.unchanged) render(data);
      })
      .catch(function () {
        misses++;
        // Two failures is a hiccup; more than that and the page must stop
        // claiming its data is current. Showing old numbers under a green light
        // is the one failure mode a dashboard must not have.
        setLive(misses > 2 ? 'dead' : 'stale');
      });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
