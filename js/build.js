// build.js: fills the data parts of the page from window.GLANCE_DATA
// (data/glance_data.js, made by data_cleaning.R). Runs once, before glance.js,
// so the animations find a finished page.
//
// Plain ES5, no build step. Each part runs in its own try/catch, so a problem
// in one part only leaves that part empty. Check with `node --check js/build.js`.
(function () {
  'use strict';

  var D = window.GLANCE_DATA;
  if (!D || !D.meta) {
    var b = document.querySelector('.gl-banner-data');
    if (b) b.hidden = false;
    return;
  }

  // ---- Colours and names --------------------------------------------------------
  var PAL = {
    igc: '#5cc79a', prepcom: '#f0b27f', cop: '#9cc8f0',
    dialogue: '#9486c8', intersess: '#5ba4ae', informal: '#c8b79a'
  };
  var CLASS_LABELS = {
    igc: 'IGCs', prepcom: 'PrepComs', cop: 'COP', dialogue: 'Online dialogues',
    intersess: 'Intersessional meetings', informal: 'Other meetings'
  };
  // globe only: four clearly different hues (green, blue, orange, magenta)
  var PKG_COLS = { mgr: '#45a774', abmt: '#4683c4', eia: '#d9965a', cb: '#a26a9e' };
  var CROSS_COLS = ['#5cc79a', '#f0b27f', '#002F62', '#9486c8', '#5ba4ae', '#3670a8', '#009EE3', '#c8b79a'];
  var CROSS_GREY = '#b8c0c8';
  // Negotiation room: states in the inner rows, everyone else outside
  // Country blocs are not drawn; the other types are shown in two groups
  // (the counts in the data stay by type, see ROOM_JOIN)
  var ROOM = {
    state:  { col: '#002F62', name: 'States' },
    intl:   { col: '#009EE3', name: 'UN bodies and intergovernmental organisations' },
    nongov: { col: '#5cc79a', name: 'NGOs, scientific institutes and businesses' }
  };
  var ROOM_JOIN = { un: 'intl', igo: 'intl', ngo: 'nongov', sci: 'nongov', bus: 'nongov' };
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
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
               'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
               'eighteen', 'nineteen', 'twenty'];
  function word(n, cap) {
    var w = n >= 0 && n <= 20 ? WORDS[n] : String(n);
    return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }
  // A round number below n, for "more than" and "over": 1,009 becomes 1,000, 77 becomes 70
  function floorNice(n) {
    if (n >= 1000) return Math.floor(n / 100) * 100;
    if (n >= 20) return Math.floor(n / 10) * 10;
    return n;
  }
  // Down to a round figure for "more than": 219 to 200, 41 to 40, 1,009 to 1,000
  function roundDown(n) {
    if (!(n > 0)) return 0;
    var u = Math.pow(10, Math.floor(Math.log(n) / Math.LN10));
    return Math.floor(n / u) * u;
  }
  function isoDays(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function longDate(s) { var p = s.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function part(name, f) {
    try { f(); } catch (e) { if (window.console) console.error('build.js: ' + name + ' failed', e); }
  }

  var M = D.meta;
  var A = D.actors || { total: 0, states: 0, others: [] };
  var nonState = 0;
  (A.others || []).forEach(function (o) { if (o.key !== 'group') nonState += o.n; });
  var nums = {
    n_meetings: M.n_meetings, n_statements: M.n_statements, n_actors: M.n_actors,
    n_topics: M.n_topics, n_official: M.n_official, n_other: M.n_other,
    n_igc: M.n_igc, n_prepcom: M.n_prepcom, n_before: M.n_before, n_after: M.n_after,
    n_observations: M.n_observations, hours_floor: floorNice(M.hours || 0),
    n_nonstate_floor: floorNice(nonState),
    n_packages: (D.packages || []).length, first_year: M.first_year,
    n_actors_round: roundDown(M.n_actors), n_topics_round: roundDown(M.n_topics),
    n_meetings_round: roundDown(M.n_meetings)
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
    // "more than" only when the real number is above its round figure
    $$('[data-gl-more]').forEach(function (e) {
      var v = M[e.getAttribute('data-gl-more')];
      if (typeof v === 'number' && roundDown(v) >= v) e.hidden = true;
    });
    $$('[data-gl-word]').forEach(function (e) {
      var v = nums[e.getAttribute('data-gl-word')];
      if (v !== undefined) e.textContent = word(v, e.hasAttribute('data-cap'));
    });
    $$('[data-gl-date]').forEach(function (e) {
      var v = M[e.getAttribute('data-gl-date')];
      if (v) e.textContent = longDate(v);
    });
    var R = D.ratification;
    $$('[data-gl-rat]').forEach(function (e) {
      if (R && R[e.getAttribute('data-gl-rat')] !== undefined) e.textContent = R[e.getAttribute('data-gl-rat')];
    });
    var lit = window.LIT_DATA, ln = $('#gl-lit-n');
    if (ln && lit && lit.n) ln.textContent = fmt(lit.n) + ' papers';
  });

  // ---- Ratification sentence --------------------------------------------------------
  part('ratification', function () {
    var R = D.ratification, p = $('#gl-rat-text');
    if (!R || !p) return;
    function who(n, eu) { return fmt(n) + (n === 1 ? ' state' : ' states') + (eu ? ' and the EU' : ''); }
    p.textContent = 'To date, ' + who(R.states_signed, R.eu_signed) + ' have signed the Agreement, and ' +
      who(R.states_ratified, R.eu_ratified) + ' have ratified it.';
  });

  // ---- The negotiations at a glance: the Agreement and the meetings ------------
  // Builds the pieces; glance.js places them (all absolutely positioned in
  // #gl-mo-stage). Each square carries what glance.js needs: data-side (before
  // or after the adoption, official meetings only), data-pos (place in date
  // order among all meetings, 0 = first) and data-tip (name and dates). Online
  // and intersessional meetings get the same square, without a label.
  part('meetings', function () {
    var stage = $('#gl-mo-stage'), mt = D.meetings;
    if (!stage || !mt) return;
    var off = (mt.official || []).slice(), other = mt.other || [];
    var adopt = mt.adoption || '2023-06-19';
    var N = mt.n_all + (mt.has_cop ? 0 : 1);           // places in the row (COP-1 last until it is in the data)
    // the Agreement sits just after the last meeting that started by the adoption day
    var nBefore = 0;
    off.forEach(function (m) { if (m.start <= adopt) nBefore++; });
    other.forEach(function (m) { if (m.start <= adopt) nBefore++; });
    stage.setAttribute('data-n', N);
    stage.setAttribute('data-agr', nBefore - 0.5);

    var agr = el('a', 'gl-mo-agr');
    agr.href = 'https://www.un.org/bbnjagreement/en/bbnj-agreement/text-bbnj-agreement';
    agr.target = '_blank';
    agr.rel = 'noopener';
    // Stand-in cover until a picture of the real front page is added
    agr.innerHTML = '<span class="gl-mo-cover"><span class="gl-mo-cover-k">Agreement</span>' +
      '<span class="gl-mo-cover-t">under the United Nations Convention on the Law of the Sea on the Conservation ' +
      'and Sustainable Use of Marine Biological Diversity of Areas beyond National Jurisdiction</span>' +
      '<span class="gl-mo-cover-d">Adopted 19 June 2023</span></span>';
    stage.appendChild(agr);

    // Earth Negotiations Bulletin (ENB, IISD) summary report of each official
    // meeting, by meeting key (checked 2026-11-03). A square with a report is a link.
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

    // side: 'before' or 'after' (official meetings) or 'other'
    function square(m, side, pos, outline) {
      var url = side !== 'other' && m.key ? ENB[m.key] : null;
      var box = el(url ? 'a' : 'div', 'gl-meet is-hid' + (outline ? ' gl-meet-next' : '') + (side === 'other' ? ' gl-meet-x' : '') + (url ? ' gl-meet-link' : ''));
      if (url) {
        box.href = url; box.target = '_blank'; box.rel = 'noopener';
        box.setAttribute('aria-label', m.label + ': Earth Negotiations Bulletin summary report');
        box.setAttribute('data-tip2', 'Click for the ENB summary report');
      }
      box.setAttribute('data-cls', m.cls);
      box.setAttribute('data-side', side);
      box.setAttribute('data-pos', pos);
      box.setAttribute('data-tip', m.tip);
      var sq = el('div', 'gl-meet-sq');
      if (!outline) sq.style.background = PAL[m.cls] || PAL.informal;
      box.appendChild(sq);
      if (side !== 'other') {
        box.appendChild(el('div', 'gl-meet-lbl', esc(m.label)));
        box.appendChild(el('div', 'gl-meet-yr', esc(m.years)));
      }
      stage.appendChild(box);
    }
    off.forEach(function (m) { square(m, m.start <= adopt ? 'before' : 'after', m.ord); });
    other.forEach(function (m) { square(m, 'other', m.ord); });
    if (!mt.has_cop) {
      square({ cls: 'cop', label: 'COP-1', years: 'January 2027', tip: 'COP-1: January 2027, New York' },
             'after', N - 1, true);
    }
    stage.appendChild(el('div', 'gl-tl-tip'));

    // colour key: each type joins at the stage where its meetings appear (data-s)
    var leg = $('#gl-mo-legend');
    if (leg) {
      var stageOf = {};
      off.forEach(function (m) { stageOf[m.cls] = Math.min(stageOf[m.cls] || 9, m.start <= adopt ? 1 : 2); });
      other.forEach(function (m) { stageOf[m.cls] = Math.min(stageOf[m.cls] || 9, 3); });
      if (!stageOf.cop) stageOf.cop = 2;
      ['igc', 'prepcom', 'cop', 'dialogue', 'intersess', 'informal'].forEach(function (c) {
        if (!stageOf[c]) return;
        var k = el('span', 'gl-chart-key gl-mo-key',
          '<span class="gl-legend-sw' + (c === 'cop' && !mt.has_cop ? ' gl-legend-next' : '') + '" style="background:' +
          (c === 'cop' && !mt.has_cop ? '#ffffff' : PAL[c]) + '"></span>' +
          esc(c === 'cop' && !mt.has_cop ? 'COP (next)' : CLASS_LABELS[c]));
        k.setAttribute('data-s', stageOf[c]);
        leg.appendChild(k);
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

    var Hv = cy + dotR + 6, h = [];
    // The dots are drawn on one canvas by glance.js (frame by frame, one layer):
    // smooth even with ~200 dots popping in. Here only the box (same shape as the
    // layout) and the dot list in layout units.
    var y0 = cy - R - dotR - 6, Hb = R + 2 * dotR + 12;
    box.innerHTML = '<div class="gl-room-box" style="padding-top:' + (Hb / Wv * 100).toFixed(3) + '%" aria-hidden="true">' +
      '<canvas class="gl-room-canvas"></canvas></div>';
    box.__room = { w: Wv, h: Hb, r: dotR, dots: dots.map(function (d) {
      return { x: cx + d.r * Math.cos(d.ang), y: cy - d.r * Math.sin(d.ang) - y0, col: ROOM[d.key].col,
               out: d.ring === 'out', f: d.ord / Math.max(1, d.of - 1) };
    }) };
    box.setAttribute('data-hv', Hv.toFixed(0));

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

  // ---- Package cards: counts and bar widths ---------------------------------------
  var pkgNames = {};
  part('packages', function () {
    var pk = D.packages || [];
    var mx = 1;
    pk.forEach(function (p) { mx = Math.max(mx, p.n); });
    pk.forEach(function (p) {
      var card = $('.gl-pkg[data-k="' + p.key + '"]');
      if (!card) return;
      pkgNames[p.key] = $('.gl-pkg-name', card).textContent;
      var c = $('.gl-count', card);
      c.setAttribute('data-to', p.n);
      c.textContent = fmt(p.n);
      $('.gl-pkg-fill', card).style.width = Math.round(p.n / mx * 100) + '%';
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
      note.textContent = 'Statements per agenda item';
      note.hidden = false;
    }
  });

  // ---- Growth chart ---------------------------------------------------
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
      h.push('<div class="home-grid-line" style="' + pos + '"></div>');
      h.push('<div class="home-grid-lbl" style="' + pos + '">' + fmt(v) + '</div>');
    });
    // guide strips for formal sessions only
    g.meetings.forEach(function (m) {
      if (!m.formal) return;
      var l = pct(m.start), w = pct(m.end) - l;
      h.push('<div class="home-guide" style="left:' + l.toFixed(3) + '%;width:' + w.toFixed(3) + '%;"></div>');
    });
    h.push('<svg class="home-chart-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">' +
           '<path class="home-area" d="' + area + '"></path><path class="home-line" d="' + line + '"></path></svg>');
    // bands for every meeting; staggered labels with connectors for formal ones
    var fn = 0;
    g.meetings.forEach(function (m) {
      var l = pct(m.start), w = pct(m.end) - l, cx = l + w / 2;
      if (m.formal) fn += 1;
      var top = fn % 2 === 1 ? -88 : -72;
      if (m.formal) {
        h.push('<div class="home-conn" style="left:' + cx.toFixed(3) + '%;top:' + (top + 15) + 'px;height:' + (-50 - (top + 15)) + 'px;"></div>');
      }
      h.push('<div class="home-band home-band-' + m.cls + '" style="left:' + l.toFixed(3) + '%;width:' + w.toFixed(3) + '%;"></div>');
      if (m.formal) {
        h.push('<div class="home-mlbl" style="left:' + cx.toFixed(3) + '%;top:' + top + 'px;">' + esc(m.label) + '</div>');
      }
    });
    // year axis
    var y0 = +g.t0.slice(0, 4), y1 = +g.t1.slice(0, 4);
    for (var y = y0; y <= y1; y++) {
      var iso = y + '-01-01', d = isoDays(iso);
      if (d <= t0 || d >= t1) continue;
      var pos = 'left:' + pct(iso).toFixed(3) + '%;';
      h.push('<div class="home-ytick" style="' + pos + '"></div><div class="home-ylbl" style="' + pos + '">' + y + '</div>');
    }
    h.push('<div class="home-hover-line"></div><div class="home-tip"></div>');

    var chart = el('div', 'home-chart');
    var plot = el('div', 'home-plot', h.join(''));
    plot.setAttribute('data-t0', g.t0);
    plot.setAttribute('data-t1', g.t1);
    plot.__days = g.days;
    chart.appendChild(plot);
    box.insertBefore(chart, box.firstChild);

    // hover: date and statements so far
    var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var tip = $('.home-tip', plot), vline = $('.home-hover-line', plot);
    var dayNums = g.days.map(function (d) { return isoDays(d[0]); });
    function move(clientX, clientY) {
      var r = plot.getBoundingClientRect();
      var x = Math.max(0, Math.min(r.width, clientX - r.left));
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
      tip.style.top = Math.max(0, Math.min(r.height - tip.offsetHeight, clientY - r.top - 30)) + 'px';
    }
    function hide() { tip.style.display = 'none'; vline.style.display = 'none'; }
    plot.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    plot.addEventListener('mouseleave', hide);
    plot.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
    plot.addEventListener('touchend', hide);
  });

  // ---- Actors globe: colour and legend -----------------------------------------
  // One colour per country: the hue is the package element it spoke on most,
  // the shade how many statements it made (light: few, dark: many; log scale).
  // glance.js uses GLANCE.shade for the globe, so legend and globe always match.
  var NOPKG_COL = '#8f9aa6';
  function hexRgb(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function shade(col, t) {
    var c = hexRgb(col), lo = [], hi = [], out = [];
    for (var i = 0; i < 3; i++) {
      lo[i] = c[i] + (255 - c[i]) * 0.72;              // pale tint
      hi[i] = c[i] * 0.72 + [0, 30, 60][i] * 0.28;     // deep, a little towards navy (keeps the hue)
      out[i] = Math.round(lo[i] + (hi[i] - lo[i]) * t);
    }
    return 'rgb(' + out.join(',') + ')';
  }
  part('globe legend', function () {
    var leg = $('#gl-g-legend');
    if (!leg) return;
    // short names to save room; the full name shows on hover
    var ABBR = { mgr: 'MGR', abmt: 'ABMT', eia: 'EIA', cb: 'CB&TMT' };
    function key(col, short, full) {
      var k = el('span', 'gl-chart-key', '<span class="gl-g-ramp" style="background:linear-gradient(90deg,' +
        shade(col, 0) + ',' + shade(col, 1) + ')"></span>' + esc(short));
      k.title = full;
      return k;
    }
    var keys = el('div', 'gl-g-keys');
    (D.packages || []).forEach(function (p) {
      var full = pkgNames[p.key] || p.key;
      keys.appendChild(key(PKG_COLS[p.key], ABBR[p.key] || full, full));
    });
    keys.appendChild(key(NOPKG_COL, 'None', 'No package statements'));
    leg.appendChild(keys);
    leg.appendChild(el('div', 'gl-g-legend-note', 'Colour: the package element a country spoke on most. Darker: more statements.'));
  });

  function topList(t, title, cls) {
    var h = '<div class="gl-card-top gl-top-' + cls + '"><div class="gl-card-lbl"><span class="gl-card-sw"></span>' + title + '</div>';
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
    var grp = window.GLANCE && window.GLANCE.scope === 'grp';
    var gs = r.groups || [], nVia = 0;
    gs.forEach(function (g) { nVia += g[1]; });
    var via = gs.map(function (g) { return esc(g[0]); }).join(', ');
    box.innerHTML = '<div class="gl-card-head">' +
      (r.flag && r.iso2 ? '<img class="gl-card-flag" src="flags/' + esc(r.iso2) + '.svg" alt="">' : '') +
      '<div class="gl-card-name">' + esc(r.name) + '</div></div>' +
      '<div class="gl-card-meta">' + ratLine(r) + '</div>' +
      '<div class="gl-card-stats"><div class="gl-card-stat"><span class="gl-card-num">' + fmt(r.n || 0) + '</span>' +
        '<span class="gl-card-lbl">in national capacity</span></div>' +
      (grp
        ? '<div class="gl-card-stat"><span class="gl-card-num">' + fmt(nVia) + '</span>' +
          '<span class="gl-card-lbl">' + (gs.length ? 'through ' + (gs.length === 1 ? 'bloc' : 'blocs') + ': ' + via : 'through blocs') + '</span></div>'
        : '') + '</div>' +
      '<div class="gl-card-tops">' + topList(grp ? r.top_igc_g : r.top_igc, 'Most discussed at the IGCs', 'igc') +
      topList(grp ? r.top_prepcom_g : r.top_prepcom, 'Most discussed at the PrepComs', 'prepcom') + '</div>';
  }

  // ---- Try it yourself ---------------------------------------------------------------
  // Every pair of variables is counted in advance by data_cleaning.R.
  var cross = D.cross;
  var view = 'bubbles';

  // n colours spread along the palette (colorRampPalette in R)
  function ramp(n) {
    if (n <= CROSS_COLS.length) return CROSS_COLS.slice(0, n);
    var rgb = CROSS_COLS.map(function (c) {
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    });
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1) * (rgb.length - 1), k = Math.min(rgb.length - 2, Math.floor(t)), f = t - k;
      out.push('#' + [0, 1, 2].map(function (j) {
        var v = Math.round(rgb[k][j] + (rgb[k + 1][j] - rgb[k][j]) * f);
        return (v < 16 ? '0' : '') + v.toString(16);
      }).join(''));
    }
    return out;
  }
  function colsFor(side, isMeeting) {
    if (isMeeting && side.cls) {
      return side.cls.map(function (c) { return c === 'undef' ? CROSS_GREY : (PAL[c] || PAL.informal); });
    }
    var c = ramp(side.labels.length);
    side.undef.forEach(function (u, i) { if (u) c[i] = CROSS_GREY; });
    return c;
  }
  function shorten(x, n) { return x.length > n ? x.slice(0, n - 1) + '…' : x; }
  function shortAll(labels, n) {
    var s = labels.map(function (x) { return shorten(x, n); });
    var seen = {}, dup = false;
    s.forEach(function (x) { if (seen[x]) dup = true; seen[x] = true; });
    return dup ? labels.slice() : s;
  }
  function varName(k) {
    for (var i = 0; i < cross.vars.length; i++) if (cross.vars[i].key === k) return cross.vars[i].label.toLowerCase();
    return k;
  }

  // Bubble matrix in SVG: rows = "Statements per", columns = "Split by",
  // bubble area = statements, numbers inside bubbles of at least 45% of the largest
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function measure(svg, labels, size) {
    var t = svgEl('text', { 'font-size': size, x: -9999, y: -9999 });
    svg.appendChild(t);
    var mx = 0;
    labels.forEach(function (s) { t.textContent = s; mx = Math.max(mx, t.getComputedTextLength ? t.getComputedTextLength() : s.length * 6); });
    svg.removeChild(t);
    return mx;
  }

  function drawBubbles(p, v2) {
    var box = $('#gl-bubbles'), tip = $('.gl-x-tip');
    box.innerHTML = '';
    var W = box.clientWidth;
    if (!W) return;                                  // not laid out yet
    if (!p.cells.length) { box.innerHTML = '<div class="gl-bx-empty">Nothing to show.</div>'; return; }
    var ys = shortAll(p.a.labels, 34), xs = shortAll(p.b.labels, 30);
    var cols = colsFor(p.b, v2 === 'meeting');
    var R = ys.length, C = xs.length;
    var svg = svgEl('svg', { width: W, role: 'img', 'aria-label': 'Bubble chart of statements' });
    box.appendChild(svg);
    var left = Math.min(Math.ceil(measure(svg, ys, 11)) + 12, Math.round(W * 0.4));
    var tilt = C > 4;
    var lw = measure(svg, xs, 11);
    var top = tilt ? Math.ceil(lw * 0.58 + 14) : 28;
    // tilted labels lean right: keep room so the last one stays inside the card
    var right = tilt ? Math.max(8, Math.ceil(measure(svg, [xs[C - 1]], 11) * 0.82 - (W - left) / C / 2)) : 8;
    var cw = (W - left - right) / C;
    var ch = 46;
    var maxD = Math.min(52, cw - 4, ch - 4);
    var H = top + R * ch + 4;
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var mx = 0;
    p.cells.forEach(function (c) { mx = Math.max(mx, c[2]); });
    var g = svgEl('g', {});
    svg.appendChild(g);
    for (var i = 0; i < R; i++) {
      var cy = top + i * ch + ch / 2;
      g.appendChild(svgEl('line', { 'class': 'gl-bx-grid', x1: left, x2: W - right, y1: cy, y2: cy }));
      var yl = svgEl('text', { 'class': 'gl-bx-lbl', x: left - 10, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, ys[i]);
      yl.appendChild(svgEl('title', {}, p.a.labels[i]));
      g.appendChild(yl);
    }
    for (var j = 0; j < C; j++) {
      var cx = left + j * cw + cw / 2;
      g.appendChild(svgEl('line', { 'class': 'gl-bx-grid', x1: cx, x2: cx, y1: top, y2: top + R * ch }));
      var xl = tilt
        ? svgEl('text', { 'class': 'gl-bx-lbl', x: cx, y: top - 8, 'text-anchor': 'start', transform: 'rotate(-35 ' + cx + ' ' + (top - 8) + ')' }, xs[j])
        : svgEl('text', { 'class': 'gl-bx-lbl', x: cx, y: top - 10, 'text-anchor': 'middle' }, xs[j]);
      xl.appendChild(svgEl('title', {}, p.b.labels[j]));
      g.appendChild(xl);
    }
    p.cells.forEach(function (c) {
      var cx = left + c[1] * cw + cw / 2, cy = top + c[0] * ch + ch / 2;
      var r = Math.max(1.5, Math.sqrt(c[2] / mx) * maxD / 2);
      var circ = svgEl('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(2), fill: cols[c[1]] });
      circ.__glTip = '<b>' + esc(p.a.labels[c[0]]) + '</b><br>' + esc(p.b.labels[c[1]]) + '<br>' + fmt(c[2]) + ' statements';
      g.appendChild(circ);
      if (c[2] >= 0.45 * mx && r >= 11) {
        g.appendChild(svgEl('text', { 'class': 'gl-bx-num', 'font-size': fmt(c[2]).length > 4 ? 10 : 11, x: cx.toFixed(1), y: cy.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, fmt(c[2])));
      }
    });
    // hover (delegated on the svg)
    var cur = null;
    svg.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.tagName === 'circle' ? e.target : null;
      if (cur && cur !== t) cur.classList.remove('is-hover');
      cur = t;
      if (!t) { tip.style.display = 'none'; return; }
      t.classList.add('is-hover');
      var br = $('.gl-cross').getBoundingClientRect();
      tip.innerHTML = t.__glTip;
      tip.style.display = 'block';
      tip.style.left = (e.clientX - br.left) + 'px';
      tip.style.top = (e.clientY - br.top) + 'px';
    });
    svg.addEventListener('mouseleave', function () {
      if (cur) cur.classList.remove('is-hover');
      cur = null;
      tip.style.display = 'none';
    });
  }

  function drawTable(p) {
    var box = $('#gl-xtab');
    if (!p.cells.length) { box.innerHTML = '<div class="gl-bx-empty">Nothing to show.</div>'; return; }
    var mx = 0, m = {};
    p.cells.forEach(function (c) { mx = Math.max(mx, c[2]); m[c[0] + ':' + c[1]] = c[2]; });
    var h = '<table class="gl-xtab"><thead><tr><th></th>' +
      p.b.labels.map(function (b) { return '<th>' + esc(b) + '</th>'; }).join('') + '</tr></thead><tbody>';
    p.a.labels.forEach(function (a, i) {
      h += '<tr><th scope="row">' + esc(a) + '</th>';
      p.b.labels.forEach(function (b, j) {
        var n = m[i + ':' + j] || 0;
        var al = n === 0 ? 0 : 0.06 + 0.5 * n / mx;
        h += '<td' + (n === 0 ? ' class="is-zero"' : '') + ' style="background:rgba(0,106,180,' + al.toFixed(2) + ')">' + fmt(n) + '</td>';
      });
      h += '</tr>';
    });
    box.innerHTML = h + '</tbody></table>';
  }

  // Notes name everything that is left out or counted more than once
  function crossNote(p, v1, v2) {
    var n = ['Bubble size and numbers count statements.'];
    if (p.a.hidden > 0) n.push('Only the ' + p.a.labels.length + ' most frequent values of ' + varName(v1) + ' are shown (' + p.a.hidden + ' more are not).');
    if (p.b.hidden > 0) n.push('Only the ' + p.b.labels.length + ' most frequent values of ' + varName(v2) + ' are shown (' + p.b.hidden + ' more are not).');
    if (cross.multi.indexOf(v1) >= 0 || cross.multi.indexOf(v2) >= 0) n.push('A statement with several values (for example several actor types) counts under each of them.');
    if (v1 === 'actor' || v2 === 'actor') n.push('Chair roles are not counted as actors (' + cross.chair_text + ').');
    return n.join(' ');
  }

  function renderCross() {
    var sx = $('#gl-x'), sf = $('#gl-fill');
    if (!sx || !sf || !cross) return;
    var v1 = sx.value, v2 = sf.value, note = $('#gl-cross-note');
    var bub = $('#gl-bubbles'), tab = $('#gl-xtab');
    bub.hidden = view !== 'bubbles';
    tab.hidden = view !== 'table';
    if (v1 === v2) {
      bub.innerHTML = tab.innerHTML = '<div class="gl-bx-empty">Pick two different things.</div>';
      note.textContent = '';
      return;
    }
    var p = cross.pairs[v1 + '|' + v2];
    if (!p) { bub.innerHTML = tab.innerHTML = '<div class="gl-bx-empty">Nothing to show.</div>'; note.textContent = ''; return; }
    if (view === 'bubbles') drawBubbles(p, v2); else drawTable(p);
    note.textContent = crossNote(p, v1, v2);
  }

  // Question cards: each sets the two variables and gives a one-line answer
  // worked out from the counts (labels as in the data). A question whose pair
  // is not in the data is left out.
  function rowTotals(p) {
    var t = p.a.labels.map(function () { return 0; });
    p.cells.forEach(function (c) { t[c[0]] += c[2]; });
    return t;
  }
  function topCol(p, rowOk) {
    var t = p.b.labels.map(function () { return 0; });
    p.cells.forEach(function (c) { if (rowOk(c[0])) t[c[1]] += c[2]; });
    var best = -1;
    t.forEach(function (v, j) { if (v > 0 && !p.b.undef[j] && (best < 0 || v > t[best])) best = j; });
    return best;
  }
  function B(x) { return '<b>' + esc(x) + '</b>'; }
  var QUESTIONS = [
    { q: 'Which topics dominated each meeting?', v1: 'meeting', v2: 'section_level1',
      take: function (p) {
        var cls = p.a.cls || [];
        var i = topCol(p, function (r) { return cls[r] === 'igc'; });
        var j = topCol(p, function (r) { return cls[r] === 'prepcom'; });
        if (i < 0 || j < 0) return '';
        return 'At the IGCs, ' + B(p.b.labels[i]) + ' drew the most statements; at the PrepComs, ' + B(p.b.labels[j]) + '.';
      } },
    { q: 'Who did the talking?', v1: 'actor_type', v2: 'meeting',
      take: function (p) {
        var t = rowTotals(p), top = 0;
        t.forEach(function (v, i) { if (v > t[top]) top = i; });
        var cols = p.b.labels.length, won = 0;
        p.b.labels.forEach(function (x, j) {
          var best = -1, bv = -1;
          p.cells.forEach(function (c) { if (c[1] === j && c[2] > bv) { bv = c[2]; best = c[0]; } });
          if (best === top) won++;
        });
        return B(p.a.labels[top]) + ' was the most frequent actor type at ' +
          (won === cols ? 'every meeting' : won + ' of ' + cols + ' meetings') + '.';
      } },
    { q: 'Who spoke the most, and on what?', v1: 'actor', v2: 'section_level1',
      take: function (p) {
        var l = p.a.labels;
        if (l.length < 3) return '';
        return 'The most active speakers were ' + B(l[0]) + ', ' + B(l[1]) + ' and ' + B(l[2]) + '.';
      } },
    { q: 'Where were statements made?', v1: 'negotiation_format', v2: 'meeting',
      take: function (p) {
        var t = rowTotals(p), o = t.map(function (v, i) { return i; })
          .filter(function (i) { return !p.a.undef[i]; })
          .sort(function (x, y) { return t[y] - t[x]; });
        if (o.length < 2) return '';
        return 'Most statements were made in ' + B(p.a.labels[o[0]].toLowerCase()) + ', followed by ' + B(p.a.labels[o[1]].toLowerCase()) + '.';
      } },
    { q: 'How busy was each year?', v1: 'year', v2: 'actor_type',
      take: function (p) {
        var t = rowTotals(p), top = 0;
        t.forEach(function (v, i) { if (v > t[top]) top = i; });
        return B(p.a.labels[top]) + ' was the busiest year in our data.';
      } }
  ];
  var curQ = -1;

  function setQuestion(k) {
    curQ = k;
    $$('.gl-q').forEach(function (b) {
      var on = +b.getAttribute('data-q') === k;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  // after any change: if the two lists match a question, that card lights up
  function syncQuestion() {
    var v1 = $('#gl-x').value, v2 = $('#gl-fill').value, k = -1;
    QUESTIONS.forEach(function (q, i) { if (q.ok && q.v1 === v1 && q.v2 === v2) k = i; });
    setQuestion(k);
  }
  function renderTake() {
    var box = $('#gl-x-take');
    if (!box) return;
    var q = QUESTIONS[curQ], p = q ? cross.pairs[q.v1 + '|' + q.v2] : null, t = '';
    if (q && p) { try { t = q.take(p) || ''; } catch (e) { t = ''; } }
    box.innerHTML = t;
    box.hidden = !t;
  }

  part('cross', function () {
    var sx = $('#gl-x'), sf = $('#gl-fill');
    if (!sx || !sf || !cross || !cross.vars.length) return;
    cross.vars.forEach(function (v) {
      sx.appendChild(new Option(v.label, v.key));
      sf.appendChild(new Option(v.label, v.key));
    });
    var keys = cross.vars.map(function (v) { return v.key; });
    // question cards
    var qs = $('#gl-qs');
    QUESTIONS.forEach(function (q, i) {
      q.ok = keys.indexOf(q.v1) >= 0 && keys.indexOf(q.v2) >= 0 && !!cross.pairs[q.v1 + '|' + q.v2];
      if (!q.ok || !qs) return;
      var b = el('button', 'gl-q', esc(q.q));
      b.type = 'button';
      b.setAttribute('data-q', i);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        sx.value = q.v1;
        sf.value = q.v2;
        setQuestion(i);
        renderCross();
        renderTake();
      });
      qs.appendChild(b);
    });
    var first = -1;
    QUESTIONS.forEach(function (q, i) { if (first < 0 && q.ok) first = i; });
    if (first >= 0) {
      sx.value = QUESTIONS[first].v1;
      sf.value = QUESTIONS[first].v2;
    } else {
      sx.value = keys.indexOf('section_level1') >= 0 ? 'section_level1' : keys[0];
      sf.value = keys.indexOf('actor_type') >= 0 ? 'actor_type' : keys[Math.min(1, keys.length - 1)];
    }
    function onPick() { syncQuestion(); renderCross(); renderTake(); }
    sx.addEventListener('change', onPick);
    sf.addEventListener('change', onPick);
    $$('.gl-view button').forEach(function (b) {
      b.addEventListener('click', function () {
        view = b.getAttribute('data-view');
        $$('.gl-view button').forEach(function (o) {
          o.classList.toggle('is-active', o === b);
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        renderCross();
      });
    });
    // redraw on width changes only (bubbles are laid out in pixels)
    var lastW = 0, tmr = 0;
    function onResize() {
      var w = $('#gl-bubbles').clientWidth;
      if (w === lastW || view !== 'bubbles') return;
      lastW = w;
      window.clearTimeout(tmr);
      tmr = window.setTimeout(renderCross, 120);
    }
    window.addEventListener('resize', onResize);
    syncQuestion();
    renderCross();
    renderTake();
    lastW = $('#gl-bubbles').clientWidth;
    // the fonts change label widths: redraw once they are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (view === 'bubbles') renderCross(); });
  });

  // For glance.js (globe and country card) and for checking in the console
  window.GLANCE = { data: D, renderCard: renderCard, pkgCols: PKG_COLS, pkgNames: pkgNames, room: ROOM,
                    shade: shade, noPkgCol: NOPKG_COL };
})();
