// build.js: fills the data parts of the page from window.GLANCE_DATA
// (data/glance_data.js, made by data_cleaning.R). Runs once, before glance.js,
// so the animations find a finished page.
//
// Plain ES5, no build step. Each part runs in its own try/catch, so a problem
// in one part only leaves that part empty. Check with `node --check js/build.js`.
// Page zoom (laptop screens get body { zoom: 0.9 } in glance.css). Pointer
// positions and getBoundingClientRect are in screen pixels, but positions set in
// CSS inside the page are in page pixels, so they are divided by the zoom.
window.glZoom = function () {
  var z = parseFloat(window.getComputedStyle(document.body).zoom);
  return z > 0 ? z : 1;
};
// getBoundingClientRect in page pixels, plus the zoom (z) to divide clientX/Y by
window.glRect = function (el) {
  var r = el.getBoundingClientRect(), z = window.glZoom();
  return { left: r.left / z, top: r.top / z, width: r.width / z, height: r.height / z, z: z };
};

(function () {
  'use strict';

  var D = window.GLANCE_DATA;
  if (!D || !D.meta) {
    var b = document.querySelector('.gl-banner-data');
    if (b) b.hidden = false;
    return;
  }

  // States with no statements in the data: on the globe they still get a hover name
  // and a card (flag, name, ratification, "no statements"). Signature and
  // ratification dates from the UN Treaty Collection. A state the data already has
  // is not added twice.
  var NO_STATEMENTS = [
    { isonum: '008', iso2: 'al', name: 'Albania', sig: '2025-02-20', rat: '2025-06-09' },
    { isonum: '020', iso2: 'ad', name: 'Andorra', sig: '2025-06-09', rat: null },
    { isonum: '070', iso2: 'ba', name: 'Bosnia and Herzegovina', sig: null, rat: null },
    { isonum: '268', iso2: 'ge', name: 'Georgia', sig: null, rat: null },
    { isonum: '499', iso2: 'me', name: 'Montenegro', sig: '2025-06-10', rat: null },
    { isonum: '688', iso2: 'rs', name: 'Serbia', sig: '2025-06-09', rat: '2026-07-29' },
    { isonum: '804', iso2: 'ua', name: 'Ukraine', sig: '2025-08-29', rat: null }
  ];
  if (D.countries) {
    var haveNum = {};
    D.countries.forEach(function (r) { haveNum[r.isonum] = true; });
    NO_STATEMENTS.forEach(function (r) {
      if (haveNum[r.isonum]) return;
      r.none = true; r.n = 0; r.ng = 0; r.groups = []; r.flag = true;
      r.point_lon = null; r.point_lat = null;
      D.countries.push(r);
    });
  }

  // ---- Colours and names --------------------------------------------------------
  var PAL = { igc: '#5cc79a', prepcom: '#f0b27f', cop: '#9cc8f0' };
  var CLASS_LABELS = { igc: 'IGCs', prepcom: 'PrepComs', cop: 'CoP' };
  // package elements on the cards, the IGC charts and the globe: muted, and checked
  // in a colour blindness simulation (deutan, protan, tritan: every pair, the 'none'
  // grey and the ocean stay clearly apart); MGR, the most discussed, gets the calm blue
  var PKG_COLS = { mgr: '#3f6f9f', abmt: '#b9a3d6', eia: '#8cc7ad', cb: '#d8a865' };   // MGR blue, ABMT purple, EIA green, CB&TMT orange (Emil, 2026-11-20)
  // Negotiation room: states in the inner rows, the other actor types in wedges in
  // the outer rows (ROOM_JOIN). Same colours and legend labels as the most active
  // chart (NGOs, scientific institutes and businesses share one colour and key).
  // Country blocs are not drawn.
  var ROOM = {
    state:  { col: '#1f5a9a', name: 'State' },
    un:     { col: '#a58bd8', name: 'UN body, agency or treaty' },
    igo:    { col: '#5a3d9a', name: 'Intergovernmental organisation' },
    nongov: { col: '#3fae7d', name: 'NGO, business or scientific institution' }
  };
  var ROOM_JOIN = { un: 'un', igo: 'igo', ngo: 'nongov', sci: 'nongov', bus: 'nongov' };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  // ---- Small helpers ------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  // A round number below n, for "more than": 1,009 becomes 1,000, 77 becomes 70
  function floorNice(n) {
    if (n >= 1000) return Math.floor(n / 100) * 100;
    if (n >= 20) return Math.floor(n / 10) * 10;
    return n;
  }
  // Down to the nearest 5 below n, for "more than" and "over": 126 to 125, 125 to 120
  function below5(n) { return n > 5 ? Math.floor((n - 1) / 5) * 5 : n; }
  function isoDays(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function longDate(s) { var p = s.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function part(name, f) {
    try { f(); } catch (e) { if (window.console) console.error('build.js: ' + name + ' failed', e); }
  }

  var M = D.meta;
  var A = D.actors || { states: 0, others: [] };
  var nonState = 0;
  (A.others || []).forEach(function (o) { if (o.key !== 'group') nonState += o.n; });
  // Numbers named in index.html by data-gl (counted up) and data-gl-text (plain)
  var nums = {
    n_statements: M.n_statements, n_observations: M.n_observations,
    hours_floor: floorNice(M.hours || 0),
    n_nonstate_floor: below5(nonState),
    // states that spoke in their own name, and all states reached (own name or via a bloc)
    n_states_own_floor: below5((D.countries || []).filter(function (c) { return c.n > 0; }).length),
    n_states_all_floor: below5((D.countries || []).filter(function (c) { return c.ng > 0; }).length),
    first_year: M.first_year,
    last_year: (M.last_date || '').slice(0, 4)
  };

  // ---- Numbers in the text --------------------------------------------------------
  part('numbers', function () {
    $$('[data-gl]').forEach(function (e) {
      var v = nums[e.getAttribute('data-gl')];
      if (v === undefined) return;
      e.setAttribute('data-to', v);         // counted up by glance.js
      e.textContent = fmt(v);
    });
    $$('[data-gl-text]').forEach(function (e) {
      var v = nums[e.getAttribute('data-gl-text')];
      if (v !== undefined) e.textContent = typeof v === 'number' ? fmt(v) : v;
    });
    var ln = $('#gl-lit-n');
    if (ln && M.n_papers) ln.textContent = fmt(M.n_papers) + ' papers';
  });

  // ---- Ratification sentence --------------------------------------------------------
  part('ratification', function () {
    var R = D.ratification, p = $('#gl-rat-text');
    if (!R || !p) return;
    function who(n, eu) { return fmt(n) + (n === 1 ? ' state' : ' states') + (eu ? ' and the EU' : ''); }
    p.textContent = 'To date, ' + who(R.states_signed, R.eu_signed) + ' have signed the Agreement, and ' +
      who(R.states_ratified, R.eu_ratified) + ' have ratified it.';
    var u = $('#gl-rat-updated');                         // when the list was last checked
    if (u) {
      if (R.as_of) {
        u.textContent = 'Signatures and ratifications last updated: ' + R.as_of + ' (';
        var a = document.createElement('a');              // link so readers can check the current list
        a.href = 'https://highseasalliance.org/treaty-ratification/';
        a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'High Seas Alliance';
        u.appendChild(a);
        u.appendChild(document.createTextNode('). '));
      } else u.hidden = true;
    }
  });

  // ---- The Agreement and the official meetings -----------------------------------
  // Builds the pieces; glance.js places them (absolutely positioned in
  // #gl-mo-stage). Each square carries data-pos (its place in date order, 0 =
  // first) and data-tip (name and dates); the stage carries data-agr, the place of
  // the Agreement between the meetings before and after its adoption.
  part('meetings', function () {
    var stage = $('#gl-mo-stage'), mt = D.meetings;
    if (!stage || !mt) return;
    var off = mt.official || [];
    var adopt = mt.adoption || '2023-06-19';
    var nBefore = 0;
    off.forEach(function (m) { if (m.start <= adopt) nBefore++; });
    stage.setAttribute('data-agr', nBefore - 0.5);

    var agr = el('a', 'gl-mo-agr');
    agr.href = 'https://www.un.org/bbnjagreement/en/bbnj-agreement/text-bbnj-agreement';
    agr.target = '_blank';
    agr.rel = 'noopener';
    agr.innerHTML = '<span class="gl-mo-cover"><span class="gl-mo-cover-k">Agreement</span>' +
      '<span class="gl-mo-cover-t">under the United Nations Convention on the Law of the Sea on the Conservation ' +
      'and Sustainable Use of Marine Biological Diversity of Areas beyond National Jurisdiction</span>' +
      '<span class="gl-mo-cover-d">Adopted 19 June 2023</span></span>';
    (stage.closest('.gl-mo') || stage).appendChild(agr);   // outside the stage: it travels between the two parts

    // Earth Negotiations Bulletin (ENB, IISD) summary report of each official
    // meeting, by meeting key. A square with a report is a link.
    var ENB = {
      igc1: 'https://enb.iisd.org/events/1st-session-intergovernmental-conference-igc-international-legally-binding-instrument-12',
      igc2: 'https://enb.iisd.org/events/2nd-session-intergovernmental-conference-igc-conservation-and-sustainable-use-marine/summary',
      igc3: 'https://enb.iisd.org/events/3rd-session-intergovernmental-conference-igc-conservation-and-sustainable-use-marine/summary',
      igc4: 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-igc4-summary',
      igc5: 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-igc5-summary',
      'igc5.2': 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-igc5-resumed-summary',
      'igc5.3': 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-igc5-further-resumed-summary',
      prepcom1: 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-cop-prepcom1-summary',
      prepcom2: 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-cop-prepcom2-briefing-note',
      prepcom3: 'https://enb.iisd.org/marine-biodiversity-beyond-national-jurisdiction-bbnj-cop-prepcom3-summary'
    };

    function square(m, pos, outline) {
      var url = m.key ? ENB[m.key] : null;
      var box = el(url ? 'a' : 'div', 'gl-meet is-hid' + (outline ? ' gl-meet-next' : '') + (url ? ' gl-meet-link' : ''));
      if (url) {
        box.href = url; box.target = '_blank'; box.rel = 'noopener';
        box.setAttribute('aria-label', m.label + ': Earth Negotiations Bulletin summary report');
        box.setAttribute('data-tip2', 'Click for the ENB summary report');
      }
      box.setAttribute('data-pos', pos);
      box.setAttribute('data-tip', m.tip);
      var sq = el('div', 'gl-meet-sq');
      if (!outline) sq.style.background = PAL[m.cls] || PAL.cop;
      box.appendChild(sq);
      box.appendChild(el('div', 'gl-meet-lbl', esc(m.label)));
      box.appendChild(el('div', 'gl-meet-yr', esc(m.years)));
      stage.appendChild(box);
    }
    off.forEach(function (m) { square(m, m.ord); });
    // COP-1 as an outline, last, until it is in the data
    if (!mt.has_cop) {
      square({ cls: 'cop', label: 'CoP-1', years: 'January 2027', tip: 'CoP-1: January 2027, New York' },
             off.length, true);
    }
    stage.appendChild(el('div', 'gl-mo-tip'));

    // colour key: one entry per meeting type in the row
    var leg = $('#gl-mo-legend');
    if (leg) {
      var have = { cop: true };
      off.forEach(function (m) { have[m.cls] = true; });
      ['igc', 'prepcom', 'cop'].forEach(function (c) {
        if (!have[c]) return;
        var next = c === 'cop' && !mt.has_cop;
        leg.appendChild(el('span', 'gl-chart-key gl-mo-key',
          '<span class="gl-legend-sw' + (next ? ' gl-legend-next' : '') + '" style="background:' +
          (next ? '#ffffff' : PAL[c]) + '"></span>' + esc(next ? 'CoP (next)' : CLASS_LABELS[c])));
      });
    }
  });

  // ---- Negotiation room -------------------------------------------------------------
  // A half circle of dots, one per actor: states in the inner rows, all other
  // actors in the outer rows, in wedges by type. The layout is worked out from
  // the counts, so any numbers fit:
  //  - the two bands share the space in proportion to their dots;
  //  - one dot spacing for both bands, the largest at which both still fit;
  //  - each row gets dots in proportion to its length.
  part('room', function () {
    var box = $('#gl-room');
    if (!box) return;
    var inner = A.states || 0;
    var outer = [], joined = {};
    (A.others || []).forEach(function (o) {
      var kk = ROOM_JOIN[o.key];                       // blocs (and any unknown type) are left out
      if (!kk || !(o.n > 0)) return;
      if (!joined[kk]) { joined[kk] = { key: kk, n: 0 }; outer.push(joined[kk]); }
      joined[kk].n += o.n;
    });
    var nOut = 0;
    outer.forEach(function (o) { nOut += o.n; });
    if (!inner && !nOut) { var sec = box.closest('section'); if (sec) sec.hidden = true; return; }

    var Wv = 1000, R = 480, cx = 500, cy = 500, r0 = 0.30 * R, gap = 0.05 * R;
    // split radius: band areas in proportion to their dots
    var share = nOut ? inner / (inner + nOut) : 1;
    var rm = Math.sqrt(r0 * r0 + share * (R * R - r0 * r0 - gap * (2 * r0 + gap)));
    if (!nOut) rm = R;
    var bands = [
      { n: inner, a: r0, b: nOut ? rm : R, ring: 'in' },
      { n: nOut, a: rm + gap, b: R, ring: 'out' }
    ];
    // rows and dots per row for a band at spacing s
    function rowsFor(bd, s) {
      var k = Math.max(1, Math.floor((bd.b - bd.a) / s)), rows = [], cap = 0;
      for (var j = 0; j < k; j++) {
        var r = bd.a + (bd.b - bd.a) * (j + 0.5) / k;
        var c = Math.max(1, Math.floor(Math.PI * r / s) + 1);
        rows.push({ r: r, cap: c });
        cap += c;
      }
      return { rows: rows, cap: cap };
    }
    function fits(s) {
      for (var i = 0; i < bands.length; i++) if (bands[i].n && rowsFor(bands[i], s).cap < bands[i].n) return false;
      return true;
    }
    var lo = 2, hi = 200;
    for (var it = 0; it < 40; it++) { var mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    var s = lo, dotR = s * 0.36;

    var dots = [];
    bands.forEach(function (bd) {
      if (!bd.n) return;
      var rf = rowsFor(bd, s), tot = rf.cap;
      // dots per row: in proportion to the row's length, the rest to the longest rows
      var per = rf.rows.map(function (row) { return Math.floor(bd.n * row.cap / tot); });
      var used = per.reduce(function (a, b) { return a + b; }, 0);
      for (var j = rf.rows.length - 1; used < bd.n; j = (j - 1 + rf.rows.length) % rf.rows.length) {
        if (per[j] < rf.rows[j].cap) { per[j]++; used++; }
      }
      var list = [];
      rf.rows.forEach(function (row, j) {
        var n = per[j];
        for (var i = 0; i < n; i++) {
          var ang = n === 1 ? Math.PI / 2 : Math.PI - Math.PI * i / (n - 1);   // left to right
          list.push({ ang: ang, r: row.r, ring: bd.ring });
        }
      });
      // left to right across all rows, so types form wedges
      list.sort(function (p, q) { return q.ang - p.ang || p.r - q.r; });
      list.forEach(function (d, i) { d.ord = i; d.of = list.length; });
      dots = dots.concat(list);
    });
    // types for the outer band, in the order given by the data
    var outerDots = dots.filter(function (d) { return d.ring === 'out'; });
    var k = 0;
    outer.forEach(function (o) {
      for (var i = 0; i < o.n && k < outerDots.length; i++) outerDots[k++].key = o.key;
    });
    dots.forEach(function (d) { if (d.ring === 'in') d.key = 'state'; });

    // The dots are drawn on one canvas by glance.js (roomAnim). Here only the box
    // (same shape as the layout) and the dot list in layout units.
    var y0 = cy - R - dotR - 6, Hb = R + 2 * dotR + 12;
    box.innerHTML = '<div class="gl-room-box" style="padding-top:' + (Hb / Wv * 100).toFixed(3) + '%" aria-hidden="true">' +
      '<canvas class="gl-room-canvas"></canvas></div>';
    box.__room = { w: Wv, h: Hb, r: dotR, dots: dots.map(function (d) {
      return { x: cx + d.r * Math.cos(d.ang), y: cy - d.r * Math.sin(d.ang) - y0, col: ROOM[d.key].col,
               out: d.ring === 'out', f: d.ord / Math.max(1, d.of - 1) };
    }) };

    var leg = $('#gl-room-legend');
    if (leg) {
      var keys = [];
      if (inner) keys.push('state');
      outer.forEach(function (o) { keys.push(o.key); });
      keys.forEach(function (kk) {
        leg.appendChild(el('span', 'gl-chart-key',
          '<span class="gl-room-sw" style="background:' + ROOM[kk].col + '"></span>' + esc(ROOM[kk].name)));
      });
    }
  });

  // ---- Most active actors: bubble chart with a toggle -----------------------------
  // Three lists from data_cleaning.R (IGCs and PrepComs only), each the top 10 by
  // speaking time:
  //   states and the EU (top_active)
  //   international organisations (top_nonstate.intl: UN bodies, agencies and
  //     treaties, IGOs)
  //   non-governmental actors (top_nonstate.nongov: NGOs, scientific institutes,
  //     businesses)
  // x: statements, y: hours of speaking time, bubble area: hours. Linear axes that
  // start near the data, not at zero; they rescale on every tab. Labels go right of
  // the bubble, or left, above or below when that spot is taken. The bubbles grow in
  // once the chart scrolls into view and again on every tab switch; hover dims the
  // others.
  part('most active', function () {
    var box = $('#gl-active'), sec = box && box.closest('.gl-active');
    var NS_ = D.top_nonstate || {};
    var SETS = {
      state:  { list: D.top_active || [], what: 'states and the EU' },
      intl:   { list: NS_.intl || [],     what: 'international organisations' },
      // every non-governmental actor gets one colour and one key entry
      nongov: { list: (NS_.nongov || []).map(function (t) {
                  var c = {}; for (var q in t) c[q] = t[q]; c.kind = 'ngo'; return c; }),
                what: 'non-governmental actors' }
    };
    if (!box || !SETS.state.list.length) { if (sec) sec.style.display = 'none'; return; }
    // colours and key labels by kind: states in blue, international organisations in
    // purple, non-governmental actors in the green of the negotiation room dots
    var KINDS = {
      state: { col: '#2f6fae', name: 'State' },
      bloc:  { col: '#002F62', name: 'EU' },          // the only bloc in the list
      un:    { col: '#a58bd8', name: 'UN body, agency or treaty' },
      igo:   { col: '#5a3d9a', name: 'Intergovernmental organisation' },
      ngo:   { col: '#3fae7d', name: 'NGO, business or scientific institution' }
    };
    var NS = 'http://www.w3.org/2000/svg', W = 1036, H = 480, m = { l: 64, r: 24, t: 14, b: 46 };
    var NAMES = { 'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
                  'United States of America': 'United States', 'Russian Federation': 'Russia' };
    function name(t) { return NAMES[t.name] || t.name; }
    // full name for hover and screen readers (non-state actors show an acronym on the chart)
    function full(t) { return t.full || name(t); }
    function S(tag, at, par) {
      var e = document.createElementNS(NS, tag);
      for (var k in at) e.setAttribute(k, at[k]);
      if (par) par.appendChild(e);
      return e;
    }
    function step(span, per) {                            // a round tick step, about `per` (default 6) ticks
      var raw = Math.max(span, 1e-9) / (per || 6), u = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / u;
      return (f < 1.5 ? 1 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * u;
    }
    var keyBox = $('#gl-active-key'), euNote = $('#gl-active-eu'), nsNote = $('#gl-active-ns');
    var tip = el('div', 'gl-act-tip');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var animate = !reduce && !!window.IntersectionObserver, seen = false, cur = null, B = [];

    // phones: the chart is drawn at the width it is shown at (taller, fewer x ticks),
    // so labels and axes keep a readable size instead of being scaled down
    var narrow = false, rk = 1;
    function sizeFor() {
      var bw = box.clientWidth || 1036;
      narrow = bw < 700;
      if (narrow) { W = Math.max(300, Math.round(bw)); H = Math.round(W * 1.05); m = { l: 66, r: 14, t: 14, b: 44 }; rk = Math.max(0.55, W / 1036 * 1.5); }
      else { W = 1036; H = 380; m = { l: 64, r: 24, t: 14, b: 46 }; rk = 1; }   // was 480 (Emil, 2026-11-26: less tall)
    }
    function draw(k) {
      var T = SETS[k].list;
      cur = k;
      sizeFor();
      var old = $('svg', box);
      if (old) box.removeChild(old);
      if (!tip.parentNode) box.appendChild(tip);
      tip.style.opacity = 0;
      // key: only the kinds in this list, in the order of KINDS
      var have = {};
      T.forEach(function (t) { have[t.kind] = true; });
      keyBox.innerHTML = '';
      Object.keys(KINDS).forEach(function (kk) {
        if (!have[kk]) return;
        keyBox.appendChild(el('span', 'gl-chart-key',
          '<span class="gl-active-sw" style="background:' + KINDS[kk].col + '"></span>' + esc(KINDS[kk].name)));
      });
      if (euNote) euNote.style.display = k === 'state' ? '' : 'none';
      // the cutoff: how many actors this tab shows, and what was counted
      var cut = $('#gl-active-cut');
      if (cut) cut.textContent = 'Top ' + T.length + ' at the IGCs and PrepComs.';
      if (nsNote) nsNote.style.display = k === 'state' ? 'none' : '';
      if (!T.length) { B = []; return; }

      var nMin = Infinity, nMax = 0, hMin = Infinity, hMax = 0;
      T.forEach(function (t) { nMin = Math.min(nMin, t.n); nMax = Math.max(nMax, t.n); hMin = Math.min(hMin, t.hours); hMax = Math.max(hMax, t.hours); });
      var xs = step(nMax - nMin, narrow ? 3.5 : 6), ys = step(hMax - hMin, narrow ? 5 : 6), XT = [], YT = [], v;
      var x0 = Math.max(0, Math.floor((nMin - (nMax - nMin) * 0.06) / (xs / 2)) * (xs / 2));
      var x1 = Math.ceil((nMax + (nMax - nMin) * 0.05) / (xs / 2)) * (xs / 2);
      var y0 = Math.max(0, Math.floor((hMin - (hMax - hMin) * 0.08) / (ys / 2)) * (ys / 2));
      var y1 = Math.ceil((hMax + (hMax - hMin) * 0.06) / (ys / 2)) * (ys / 2);
      if (x1 <= x0) x1 = x0 + xs;
      if (y1 <= y0) y1 = y0 + ys;
      function X(q) { return m.l + (q - x0) / (x1 - x0) * (W - m.l - m.r); }
      function Y(q) { return H - m.b - (q - y0) / (y1 - y0) * (H - m.t - m.b); }
      for (v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) XT.push(v);
      for (v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) YT.push(v);
      var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
        'aria-label': 'Bubble chart of the ' + T.length + ' ' + SETS[k].what + ' with the most speaking time: ' +
          T.map(function (t) { return full(t) + ' ' + t.hours + ' hours, ' + t.n + ' statements'; }).join('; ') });
      box.insertBefore(svg, tip);
      // hours that are not whole numbers keep one decimal (2.5 h, 0.5 h)
      function fh(v) { return (Math.abs(v - Math.round(v)) > 1e-9 ? v.toFixed(1) : fmt(v)) + ' h'; }
      XT.forEach(function (v) {
        S('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, 'class': 'gl-act-grid' }, svg);
        S('text', { x: X(v), y: H - m.b + 18, 'class': 'ax', 'text-anchor': 'middle' }, svg).textContent = fmt(v);
      });
      YT.forEach(function (v) {
        S('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), 'class': 'gl-act-grid' }, svg);
        S('text', { x: m.l - 10, y: Y(v) + 4, 'class': 'ax', 'text-anchor': 'end' }, svg).textContent = fh(v);
      });
      S('text', { x: W - m.r, y: H - 8, 'class': 'axt', 'text-anchor': 'end' }, svg).textContent = 'Total statements';
      S('text', { x: 14, y: H / 2, 'class': 'axt', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + H / 2 + ')' }, svg).textContent = 'Total hours of speaking time';

      // radius = kr * sqrt(hours); the biggest bubble is about as big in every tab
      var kr = 2.8 * Math.sqrt(62.8 / Math.max(hMax, 1));
      kr = Math.min(kr, 6.5) * rk;
      B = T.map(function (t) { return { t: t, x: X(t.n), y: Y(t.hours), r: kr * Math.sqrt(t.hours) }; });
      // label spots: right, left, above, below; first one that hits no bubble, no label, no edge
      var boxes = [];
      // true when another bubble is nearer to the label than its own (the label would
      // read as belonging to that one)
      function closer(a, own) {
        function dist(c) {
          var nx = Math.max(a.x, Math.min(c.x, a.x + a.w)), ny = Math.max(a.y, Math.min(c.y, a.y + a.h));
          return Math.sqrt((nx - c.x) * (nx - c.x) + (ny - c.y) * (ny - c.y)) - c.r;
        }
        var d0 = dist(own);
        for (var i = 0; i < B.length; i++) if (B[i] !== own && dist(B[i]) < d0 - 2) return true;
        return false;
      }
      function hit(a) {                                    // how badly a label box collides (0: free)
        var bad = 0;
        if (a.x < 2 || a.x + a.w > W - 2 || a.y < 0 || a.y + a.h > H - m.b) bad += 1e6;   // never outside the chart
        else if (a.x < m.l) bad += 50;                    // over the hour labels: allowed, but avoided
        for (var i = 0; i < B.length; i++) {
          var c = B[i], nx = Math.max(a.x, Math.min(c.x, a.x + a.w)), ny = Math.max(a.y, Math.min(c.y, a.y + a.h));
          var d2 = (nx - c.x) * (nx - c.x) + (ny - c.y) * (ny - c.y);
          if (d2 < (c.r + 1) * (c.r + 1)) bad += 10 + (c.r + 1) - Math.sqrt(d2);
        }
        for (var j = 0; j < boxes.length; j++) {
          var o = boxes[j], ox = Math.min(a.x + a.w, o.x + o.w) - Math.max(a.x, o.x), oy = Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y);
          if (ox > 0 && oy > 0) bad += 200 + ox * oy;
        }
        return bad;
      }
      B.slice().sort(function (a, b) { return b.r - a.r; }).forEach(function (b) {
        var w = name(b.t).length * 7.6, h = 16, g = 5, d = b.r * 0.72;
        var spots = [
          { x: b.x + b.r + g, y: b.y - h / 2, a: 'start' }, { x: b.x - b.r - g - w, y: b.y - h / 2, a: 'end' },
          { x: b.x - w / 2, y: b.y - b.r - g - h, a: 'middle' }, { x: b.x - w / 2, y: b.y + b.r + g, a: 'middle' },
          { x: b.x + d + g, y: b.y - d - h, a: 'start' }, { x: b.x + d + g, y: b.y + d, a: 'start' },
          { x: b.x - d - g - w, y: b.y - d - h, a: 'end' }, { x: b.x - d - g - w, y: b.y + d, a: 'end' }];
        // further up and to the right, joined by a thin line: only used when every close
        // spot is taken
        for (var f = 1; f <= 10; f++)
          spots.push({ x: b.x + b.r + 18 + f * 6, y: b.y - h / 2 - f * 20, a: 'start', far: true, cost: 25 + f * 4 });
        var s = spots[0], best = Infinity;
        // hand-placed where the automatic choice reads wrong in the current data
        // (by name; ignored when the name is not in the chart)
        var fixed = { 'Norway': 6, 'Singapore': 2, 'Iceland': 6, 'New Zealand': 3 }[name(b.t)];
        if (fixed !== undefined) best = -1, s = spots[fixed];
        for (var i = 0; i < spots.length && best >= 0; i++) {
          var bx = { x: spots[i].x, y: spots[i].y, w: w, h: h };
          var sc = hit(bx) + (spots[i].cost || i * 0.5) + (!spots[i].far && closer(bx, b) ? 60 : 0);   // ties: earlier spot wins
          if (sc < best) { best = sc; s = spots[i]; }
        }
        boxes.push({ x: s.x, y: s.y, w: w, h: h });
        b.lx = s.a === 'start' ? s.x : s.a === 'end' ? s.x + w : s.x + w / 2;
        b.ly = s.y + 12; b.la = s.a; b.far = !!s.far;
        b.box = { x: s.x, y: s.y, w: w, h: h };          // the label's area, also hoverable
      });

      // draw the smaller bubbles last, so they sit on top
      B.slice().sort(function (a, b) { return b.r - a.r; }).forEach(function (b) {
        var g = S('g', { 'class': 'gl-act-b' }, svg);
        b.c = S('circle', { cx: b.x, cy: b.y, r: b.r, fill: (KINDS[b.t.kind] || KINDS.state).col, 'fill-opacity': 0.9 }, g);
        if (b.far) {                                       // leader line from the bubble to its label
          var ang = Math.atan2(b.ly - 4 - b.y, b.lx - 3 - b.x);
          b.ln = S('line', { x1: b.x + b.r * Math.cos(ang), y1: b.y + b.r * Math.sin(ang), x2: b.lx - 3, y2: b.ly - 4, 'class': 'gl-act-lead' }, g);
        }
        // an invisible strip under the label, so the name can be hovered too (a bubble
        // that sits under another one is reached through its name)
        S('rect', { x: b.box.x - 2, y: b.box.y - 1, width: b.box.w + 4, height: b.box.h + 2, 'class': 'gl-act-hit' }, g);
        b.l = S('text', { x: b.lx, y: b.ly, 'text-anchor': b.la }, g);
        b.l.textContent = name(b.t);
        g.addEventListener('mousemove', function (ev) {
          var r = glRect(box), t = b.t;
          tip.innerHTML = '<b>' + esc(full(t)) + '</b><br>' + t.hours.toFixed(1) + ' hours of speaking time<br>' +
            fmt(t.n) + (t.n === 1 ? ' statement' : ' statements');
          var x = ev.clientX / r.z - r.left + 16, y = ev.clientY / r.z - r.top + 16, tw = tip.offsetWidth || 240;
          if (x + tw > r.width) x = Math.max(0, ev.clientX / r.z - r.left - tw - 16);   // flip left by its real width (long names)
          tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.opacity = 1;
          svg.classList.add('is-dim'); g.classList.add('is-on');
        });
        g.addEventListener('mouseleave', function () { tip.style.opacity = 0; svg.classList.remove('is-dim'); g.classList.remove('is-on'); });
      });
      // before the chart is first seen the bubbles wait at size 0 (grown in by the observer)
      if (animate && !seen) B.forEach(function (b) { b.c.setAttribute('r', 0); b.l.style.opacity = 0; if (b.ln) b.ln.style.opacity = 0; });
    }

    // grow in: smallest first, the largest last, one after the other
    var growId = 0;
    function grow() {
      if (!animate) return;
      var id = ++growId, t0 = performance.now(), order = B.slice().sort(function (a, b) { return a.r - b.r; });
      order.forEach(function (b) { b.c.setAttribute('r', 0); b.l.style.opacity = 0; if (b.ln) b.ln.style.opacity = 0; });
      (function frame(now) {
        if (id !== growId) return;                         // a newer tab took over
        var more = false;
        order.forEach(function (b, i) {
          var k = Math.max(0, Math.min(1, ((now - t0) / 1000 - i * 0.08) / 0.7));
          var e = k === 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);   // a little overshoot
          b.c.setAttribute('r', Math.max(0, b.r * e));
          b.l.style.opacity = k < 0.6 ? 0 : (k - 0.6) / 0.4;
          if (b.ln) b.ln.style.opacity = b.l.style.opacity;
          if (k < 1) more = true;
        });
        if (more) window.requestAnimationFrame(frame);
      })(t0);
    }

    // the toggle: tabs without data are hidden
    // redraw when the chart switches between the phone and the wide drawing
    window.addEventListener('resize', function () {
      if (cur && (box.clientWidth < 700) !== narrow) draw(cur);
    });
    var tabs = $$('.gl-active-tabs button');
    tabs.forEach(function (b) {
      var k = b.getAttribute('data-set');
      if (!SETS[k] || !SETS[k].list.length) { b.style.display = 'none'; return; }
      b.addEventListener('click', function () {
        if (k === cur) return;
        tabs.forEach(function (o) {
          var on = o === b;
          o.classList.toggle('is-active', on);
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        draw(k);
        if (seen) grow();
      });
    });
    draw('state');

    if (!animate) { seen = true; return; }
    // start once a quarter of the chart is on screen
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); seen = true; setTimeout(grow, 150); }
    }, { threshold: 0.25 });
    io.observe(box);
  });

  // ---- Package cards: colours, and a small column chart per package ----------------
  // The cards show no counts. Each package's explainer gets a column chart of its
  // statements at each IGC (packages in glance_data.js).
  var pkgNames = {};
  part('packages', function () {
    $$('.gl-pkg').forEach(function (card) {
      var k = card.getAttribute('data-k');
      pkgNames[k] = $('.gl-pkg-name', card).textContent;
      if (PKG_COLS[k]) card.style.setProperty('--pk', PKG_COLS[k]);   // same colours as the globe
    });
    var box = $('.gl-pkg-igcs'), P = D.packages;
    if (!box || !P || !P.igcs) return;
    (P.items || []).forEach(function (it) {
      var mx = 1, top = -1;
      it.n.forEach(function (v) { if (v > mx) mx = v; });
      it.n.forEach(function (v, j) { if (top < 0 && v === mx) top = j; });   // highlighted: the IGC with the most
      var h = '<div class="gl-pkg-igc" data-k="' + it.key + '" style="--pk:' + (PKG_COLS[it.key] || '') + '">' +
        '<div class="gl-pkg-igc-t">Statements at each IGC</div><div class="gl-pkg-igc-cols">';
      it.n.forEach(function (v, j) {
        h += '<div class="gl-pkg-igc-col' + (j === top ? ' is-top' : '') + '" aria-label="' + esc(P.igcs[j]) + ': ' + fmt(v) + ' statements">' +
          '<span class="gl-pkg-igc-v">' + fmt(v) + '</span>' +
          '<span class="gl-pkg-igc-bar" style="height:' + Math.round(v / mx * 96) + 'px"></span>' +
          '<span class="gl-pkg-igc-lbl">' + esc(P.igcs[j]) + '</span></div>';
      });
      box.insertAdjacentHTML('beforeend', h + '</div></div>');
    });
  });

  // ---- PrepCom bars -----------------------------------------------------------------
  part('prepcom', function () {
    var box = $('#gl-prep'), pi = D.prepcom;
    if (!box || !pi || !pi.items || !pi.items.length) return;
    var mx = 0;
    pi.items.forEach(function (it) { mx = Math.max(mx, it.n); });
    pi.items.forEach(function (it, i) {
      var r = el('div', 'gl-bar-row');
      r.style.setProperty('--i', i);
      r.innerHTML = '<div class="gl-bar-lbl">' + esc(it.label) + '</div>' +
        '<div class="gl-bar"><div class="gl-bar-fill" style="width:' + Math.round(it.n / mx * 100) + '%"></div></div>' +
        '<div class="gl-bar-n">' + fmt(it.n) + '</div>';
      box.appendChild(r);
    });
    var note = $('#gl-prep-note');
    if (note) {
      note.textContent = 'Agenda items with more than 100 statements across the three PrepComs';
      note.hidden = false;
    }
  });

  // ---- Growth chart: statements so far, with every meeting as a band ---------------
  part('growth', function () {
    var box = $('#gl-growth'), g = D.growth;
    if (!box || !g || !g.days || !g.days.length) return;
    var t0 = isoDays(g.t0), t1 = isoDays(g.t1);
    function pct(iso) { return (isoDays(iso) - t0) / (t1 - t0) * 100; }
    function fx(iso) { return pct(iso) * 10; }               // svg x: 0 to 1000
    function fy(v) { return (1 - v / g.ymax) * 300; }       // svg y: 0 to 300

    // step line: each meeting day jumps by that day's statements
    var pts = [];
    g.days.forEach(function (d) {
      var x = fx(d[0]).toFixed(2);
      pts.push(x + ' ' + fy(d[2] - d[1]).toFixed(2));
      pts.push(x + ' ' + fy(d[2]).toFixed(2));
    });
    var x0 = fx(g.days[0][0]).toFixed(2), xe = fx(g.t1).toFixed(2);
    var line = 'M' + x0 + ' ' + fy(0).toFixed(2) + ' L' + pts.join(' L') + ' L' + xe + ' ' + fy(g.total).toFixed(2);
    var area = line + ' L' + xe + ' 300 L' + x0 + ' 300 Z';

    var h = [];
    g.ticks.forEach(function (v) {
      var pos = 'top:' + ((1 - v / g.ymax) * 100).toFixed(3) + '%;';
      h.push('<div class="gl-gr-grid-line" style="' + pos + '"></div>');
      h.push('<div class="gl-gr-grid-lbl" style="' + pos + '">' + fmt(v) + '</div>');
    });
    // guide strips for formal sessions only
    g.meetings.forEach(function (m) {
      if (!m.formal) return;
      var l = pct(m.start), w = pct(m.end) - l;
      h.push('<div class="gl-gr-guide" style="left:' + l.toFixed(3) + '%;width:' + w.toFixed(3) + '%;"></div>');
    });
    h.push('<svg class="gl-gr-chart-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">' +
           '<path class="gl-gr-area" d="' + area + '"></path><path class="gl-gr-line" d="' + line + '"></path></svg>');
    // bands for every meeting; staggered labels with connectors for formal ones
    var fn = 0;
    g.meetings.forEach(function (m) {
      var l = pct(m.start), w = pct(m.end) - l, cx = l + w / 2;
      if (m.formal) fn += 1;
      var top = fn % 2 === 1 ? -88 : -72;
      if (m.formal) {
        h.push('<div class="gl-gr-conn" style="left:' + cx.toFixed(3) + '%;top:' + (top + 15) + 'px;height:' + (-50 - (top + 15)) + 'px;"></div>');
      }
      h.push('<div class="gl-gr-band gl-gr-band-' + m.cls + '" style="left:' + l.toFixed(3) + '%;width:' + w.toFixed(3) + '%;"></div>');
      if (m.formal) {
        h.push('<div class="gl-gr-mlbl" style="left:' + cx.toFixed(3) + '%;top:' + top + 'px;">' + esc(m.label) + '</div>');
      }
    });
    // year axis
    var y0 = +g.t0.slice(0, 4), y1 = +g.t1.slice(0, 4);
    for (var y = y0; y <= y1; y++) {
      var iso = y + '-01-01', d = isoDays(iso);
      if (d <= t0 || d >= t1) continue;
      var pos = 'left:' + pct(iso).toFixed(3) + '%;';
      h.push('<div class="gl-gr-ytick" style="' + pos + '"></div><div class="gl-gr-ylbl" style="' + pos + '">' + y + '</div>');
    }
    h.push('<div class="gl-gr-hover-line"></div><div class="gl-gr-tip"></div>');

    var chart = el('div', 'gl-gr-chart');
    var plot = el('div', 'gl-gr-plot', h.join(''));
    plot.setAttribute('data-t0', g.t0);
    plot.setAttribute('data-t1', g.t1);
    plot.__days = g.days;
    chart.appendChild(plot);
    box.insertBefore(chart, box.firstChild);

    // hover: date and statements so far
    var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var tip = $('.gl-gr-tip', plot), vline = $('.gl-gr-hover-line', plot);
    var dayNums = g.days.map(function (d) { return isoDays(d[0]); });
    function move(clientX, clientY) {
      var r = glRect(plot);
      var x = Math.max(0, Math.min(r.width, clientX / r.z - r.left));
      var dn = t0 + (x / r.width) * (t1 - t0), cum = 0;
      for (var i = 0; i < dayNums.length; i++) { if (dayNums[i] <= dn) cum = g.days[i][2]; else break; }
      var dt = new Date(dn * 864e5);
      tip.innerHTML = dt.getUTCDate() + ' ' + SHORT[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear() +
        ': <b>' + fmt(cum) + '</b> statements';
      tip.style.display = 'block';
      vline.style.display = 'block';
      vline.style.left = x + 'px';
      var w = tip.offsetWidth;
      tip.style.left = (x + 12 + w > r.width ? x - 12 - w : x + 12) + 'px';
      tip.style.top = Math.max(0, Math.min(r.height - tip.offsetHeight, clientY / r.z - r.top - 30)) + 'px';
    }
    function hide() { tip.style.display = 'none'; vline.style.display = 'none'; }
    plot.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    plot.addEventListener('mouseleave', hide);
    plot.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
    plot.addEventListener('touchend', hide);
  });

  // ---- Actors globe: colour and legend -----------------------------------------
  // Two views, one variable each (toggle 'Colour by' beside the blocs toggle):
  //   pkg: flat colour of the package element a country spoke on most;
  //   n:   total statements, one light to dark ramp (log scale), on all topics.
  // glance.js uses GLANCE.statCol and GLANCE.pkgCols, so legend and globe match.
  var NOPKG_COL = '#6f747a';                           // darker grey: a light one is mistaken for ABMT or CB&TMT by colour blind readers
  var PKG_SHORT = { mgr: 'MGR', abmt: 'ABMT', eia: 'EIA', cb: 'CB&TMT' };
  // view 'rat': ratified navy, signed (not yet ratified) a lighter blue of the same
  // ramp, the rest in the no-data grey (both blues clearly darker than the ocean)
  var RAT_COLS = { rat: '#1d3f6e', sig: '#7d9fc6' };   // one blue ramp: signed is a step before ratified (Emil, 2026-11-20)
  // sequential ramp for statements: pale sand to the page navy, lightness rising
  // steadily (safe for colour blindness); the sand end stands apart from the blue ocean
  var STAT_STOPS = [[233, 226, 207], [159, 182, 204], [93, 127, 163], [29, 63, 110]];
  function statCol(t) {
    t = Math.max(0, Math.min(1, t));
    var x = t * (STAT_STOPS.length - 1), i = Math.min(Math.floor(x), STAT_STOPS.length - 2), f = x - i, out = [];
    for (var j = 0; j < 3; j++) out[j] = Math.round(STAT_STOPS[i][j] + (STAT_STOPS[i + 1][j] - STAT_STOPS[i][j]) * f);
    return 'rgb(' + out.join(',') + ')';
  }
  part('globe legend', function () {
    var leg = $('#gl-g-legend');
    if (!leg) return;
    // view 'rat': ratification status (UN Treaty Collection)
    var rv = el('div', 'gl-g-leg gl-g-leg-rat');
    var rk = el('div', 'gl-g-keys');
    [[RAT_COLS.rat, 'Ratified'], [RAT_COLS.sig, 'Signed, not yet ratified'], ['#eef1f4', 'Not signed']].forEach(function (x) {
      rk.appendChild(el('span', 'gl-chart-key', '<span class="gl-g-sw' + (x[1] === 'Not signed' ? ' gl-g-sw-line' : '') + '" style="background:' + x[0] + '"></span>' + esc(x[1])));
    });
    rv.appendChild(rk);
    leg.appendChild(rv);
    // view 'pkg': one flat swatch per package element (short names, full name on hover)
    var pk = el('div', 'gl-g-leg gl-g-leg-pkg');
    var keys = el('div', 'gl-g-keys');
    function key(col, short, full) {
      var k = el('span', 'gl-chart-key', '<span class="gl-g-sw" style="background:' + col + '"></span>' + esc(short));
      k.title = full;
      return k;
    }
    ((D.packages && D.packages.items) || []).forEach(function (p) {
      var full = pkgNames[p.key] || p.key;
      keys.appendChild(key(PKG_COLS[p.key], PKG_SHORT[p.key] || full, full));
    });
    keys.appendChild(key(NOPKG_COL, 'None', 'No package statements'));
    pk.appendChild(keys);
    pk.appendChild(el('div', 'gl-g-legend-note', 'The package element a country spoke on most (cross-cutting issues excluded).'));
    leg.appendChild(pk);
    // view 'n': one ramp
    var nv = el('div', 'gl-g-leg gl-g-leg-n');
    var stops = [0, 0.33, 0.67, 1].map(function (t) { return statCol(t); }).join(',');
    nv.appendChild(el('div', 'gl-g-keys', '<span class="gl-g-ramp-lbl">Fewer</span><span class="gl-g-ramp gl-g-ramp-wide" style="background:linear-gradient(90deg,' +
      stops + ')"></span><span class="gl-g-ramp-lbl">More</span>'));
    nv.appendChild(el('div', 'gl-g-legend-note', 'Total statements, on all topics. Darker: more statements.'));
    leg.appendChild(nv);
  });

  function topList(t, title) {
    var h = '<div class="gl-card-top"><div class="gl-card-lbl">' + title + '</div>';
    if (!t || !t.length) {
      h += '<div class="gl-card-none">No statements</div>';
    } else {
      h += '<ol>' + t.map(function (x) {
        return '<li><span class="gl-card-item">' + esc(x[0]) + '</span><span class="gl-card-k">' + fmt(x[1]) + '</span></li>';
      }).join('') + '</ol>';
    }
    return h + '</div>';
  }

  function ratLine(r) {
    if (r.rat) return '<span class="gl-card-rat">Ratified ' + longDate(r.rat) + '</span>' +
      (r.sig ? '<span class="gl-card-sig">Signed ' + longDate(r.sig) + '</span>' : '');
    if (r.sig) return '<span class="gl-card-rat">Signed ' + longDate(r.sig) + '</span><span class="gl-card-sig">Not ratified yet</span>';
    return '<span class="gl-card-rat">Not signed</span>';
  }

  // Called by glance.js when a country is clicked (r: one entry of D.countries,
  // or null). GLANCE.scope: 'grp' with country blocs, 'nat' national capacity only.
  function renderCard(r) {
    var box = $('#gl-card');
    if (!box) return;
    if (!r) { box.innerHTML = '<div class="gl-card-empty">Click a country on the globe to see its ratification status, how many statements it made during the negotiations, and on which topics it was most active. Toggle country blocs off to see only statements made in a national capacity.</div>'; return; }
    var head = '<div class="gl-card-head">' +
      (r.flag && r.iso2 ? '<img class="gl-card-flag" src="flags/' + esc(r.iso2) + '.svg" alt="">' : '') +
      '<div class="gl-card-name">' + esc(r.name) + '</div></div>' +
      '<div class="gl-card-meta">' + ratLine(r) + '</div>';
    if (r.none) {                                        // a state with no statements in the data
      box.innerHTML = head + '<div class="gl-card-nostat">No statements recorded in our field notes.</div>';
      return;
    }
    var grp = window.GLANCE && window.GLANCE.scope === 'grp';
    var gs = r.groups || [], nVia = 0;
    gs.forEach(function (g) { nVia += g[1]; });
    // groups: [name, statements, member from, member until]; dates only for countries
    // that joined or left during the negotiations (group_members.csv)
    var via = gs.map(function (g) {
      var d = g[2] && g[3] ? ' (member from ' + longDate(g[2]) + ' to ' + longDate(g[3]) + ')'
            : g[3] ? ' (member until ' + longDate(g[3]) + ')'
            : g[2] ? ' (member since ' + longDate(g[2]) + ')' : '';
      return esc(g[0]) + d;
    }).join(', ');
    box.innerHTML = head +
      '<div class="gl-card-stats"><div class="gl-card-stat"><span class="gl-card-num">' + fmt(r.n || 0) + '</span>' +
        '<span class="gl-card-lbl">in national capacity</span></div>' +
      (grp
        ? '<div class="gl-card-stat"><span class="gl-card-num">' + fmt(nVia) + '</span>' +
          '<span class="gl-card-lbl">' + (gs.length ? 'by ' + (gs.length === 1 ? 'a bloc' : 'blocs') + ' it belongs to: ' + via : 'by blocs it belongs to') + '</span></div>'
        : '') + '</div>' +
      '<div class="gl-card-tops">' + topList(grp ? r.top_igc_g : r.top_igc, 'Most discussed at the IGCs') +
      topList(grp ? r.top_prepcom_g : r.top_prepcom, 'Most discussed at the PrepComs') + '</div>';
  }

  // For glance.js (globe and country card) and for checking in the console
  window.GLANCE = { data: D, renderCard: renderCard, pkgCols: PKG_COLS, pkgShort: PKG_SHORT, ratCols: RAT_COLS, statCol: statCol, noPkgCol: NOPKG_COL };
})();
