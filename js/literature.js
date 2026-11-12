// literature.js: the list on literature.html, from window.LIT_DATA
// (data/literature_data.js). Search (every word must match, accents ignored),
// filters (package or theme, region, type, years), sort and
// 25 entries per page, all in the browser. Abstracts open on click; they open
// by themselves when the search words are found in them. Plain ES5. Check with
// `node --check js/literature.js` after edits.
(function () {
  'use strict';
  var L = window.LIT_DATA;
  var list = document.getElementById('lit-list');
  if (!list) return;
  if (!L || !L.papers) {
    var m = document.querySelector('.lit-missing');
    if (m) m.hidden = false;
    return;
  }
  // Copy button for the search string under the explainer
  var cp = document.querySelector('.lit-copy');
  if (cp) cp.addEventListener('click', function () {
    var t = document.getElementById(cp.getAttribute('data-copy')).textContent;
    function done(ok) { cp.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { cp.textContent = 'Copy'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
    } else {
      var r = document.createRange(); r.selectNodeContents(document.getElementById(cp.getAttribute('data-copy')));
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { done(document.execCommand('copy')); } catch (e) { done(false); }
    }
  });
  var PER_PAGE = 25;
  var all = L.papers, shown = all.slice(), page = 0, words = [];
  function $(id) { return document.getElementById(id); }
  var el = {
    q: $('lit-q'), theme: $('lit-theme'), region: $('lit-region'), type: $('lit-type'),
    from: $('lit-from'), to: $('lit-to'), clear: $('lit-clear'), sort: $('lit-sort')
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // lower case without accents, for searching and sorting
  function norm(s) {
    s = String(s || '').toLowerCase();
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }
  function key(s) { return norm(s).replace(/^[^a-z0-9]+/, ''); }

  // search text per paper, made once
  all.forEach(function (p) {
    p._s = norm([p.title, p.authors, p.source, p.abstract, p.keywords].join(' '));
  });

  // ---- filter options from the data (sorted; counts in brackets)
  function fill(sel, vals, order) {
    var c = {};
    vals.forEach(function (v) { if (v) c[v] = (c[v] || 0) + 1; });
    var ks = Object.keys(c).sort(order || function (a, b) { return a < b ? -1 : 1; });
    sel.insertAdjacentHTML('beforeend', ks.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + ' (' + fmt(c[k]) + ')</option>';
    }).join(''));
  }
  // packages first (in the order of the dashboard), then the rest A to Z, General and Other last
  var THEME_ORDER = ['Marine genetic resources (MGRs)', 'Area-based management tools (ABMTs/MPAs)',
    'Environmental impact assessments (EIAs)', 'Capacity-building and transfer of marine technology (CB&TMT)'];
  function themeRank(t) {
    var i = THEME_ORDER.indexOf(t);
    return i >= 0 ? i : (t === 'General' ? 90 : t === 'Other' ? 91 : 10);
  }
  fill(el.theme, [].concat.apply([], all.map(function (p) { return p.themes || []; })),
    function (a, b) { return themeRank(a) - themeRank(b) || (a < b ? -1 : 1); });
  fill(el.region, all.map(function (p) { return p.region; }));
  fill(el.type, all.map(function (p) { return p.type; }));
  var years = all.map(function (p) { return p.year; }).filter(Boolean);
  var y0 = Math.min.apply(null, years), y1 = Math.max.apply(null, years), yo = '';
  for (var y = y0; y <= y1; y++) yo += '<option value="' + y + '">' + y + '</option>';
  el.from.innerHTML = yo; el.to.innerHTML = yo;
  el.from.value = y0; el.to.value = y1;

  // ---- sorting
  function cmp(a, b) {
    if (!a && b) return 1;            // empty values last
    if (a && !b) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  var SORTS = {
    'year-desc': function (a, b) { return (b.year || 0) - (a.year || 0) || cmp(key(a.title), key(b.title)); },
    'year-asc':  function (a, b) { return (a.year || 9999) - (b.year || 9999) || cmp(key(a.title), key(b.title)); },
    'title':     function (a, b) { return cmp(key(a.title), key(b.title)) || (b.year || 0) - (a.year || 0); },
    'authors':   function (a, b) { return cmp(key(a.authors), key(b.authors)) || (b.year || 0) - (a.year || 0); }
  };

  // ---- search words marked in the text (on the escaped text, accents kept)
  function mark(s) {
    var t = esc(s);
    if (!words.length) return t;
    var src = norm(t), out = '', i = 0, hits = [];
    words.forEach(function (w) {
      var w2 = esc(w), at = src.indexOf(w2);
      while (at >= 0 && w2) { hits.push([at, at + w2.length]); at = src.indexOf(w2, at + w2.length); }
    });
    if (!hits.length) return t;
    hits.sort(function (a, b) { return a[0] - b[0]; });
    hits.forEach(function (h) {
      if (h[0] < i) return;                       // overlapping hit
      // stay outside entities (&amp; etc.)
      if (/&[a-z]*$/.test(t.slice(Math.max(0, h[0] - 6), h[0]))) return;
      out += t.slice(i, h[0]) + '<mark>' + t.slice(h[0], h[1]) + '</mark>';
      i = h[1];
    });
    return out + t.slice(i);
  }
  function hit(s) {
    if (!words.length || !s) return false;
    var n = norm(s);
    return words.some(function (w) { return n.indexOf(w) >= 0; });
  }

  // ---- one entry
  function entry(p, n) {
    var t = p.title ? mark(p.title) : '(no title)';
    var title = p.doi ? '<a href="' + esc(p.doi) + '" target="_blank" rel="noopener">' + t + '</a>' : t;
    // volume and issue left out for now (Emil, 2026-11-12); they are still in the data
    var ref = [];
    if (p.source) ref.push('<i>' + mark(p.source) + '</i>');
    if (p.year) ref.push(String(p.year));
    if (p.pages) ref.push('pp. ' + esc(p.pages));
    if (p.type) ref.push(esc(p.type));
    var h = '<li class="lit-item">' +
      '<div class="lit-title">' + title + '</div>';
    if (p.authors) h += '<div class="lit-authors">' + mark(p.authors) + '</div>';
    h += '<div class="lit-ref">' + ref.join('<span class="lit-sep" aria-hidden="true">&middot;</span>') + '</div>';
    var meta = [];
    if (p.themes) meta.push('<span class="lit-k">Package or theme:</span> ' + esc(p.themes.join('; ')));
    if (p.region) meta.push('<span class="lit-k">Region:</span> ' + esc(p.region));
    if (meta.length) h += '<div class="lit-meta">' + meta.join('<span class="lit-sep" aria-hidden="true">&middot;</span>') + '</div>';
    if (p.abstract) {
      var open = hit(p.abstract) || hit(p.keywords), id = 'lit-a' + n;
      h += '<button type="button" class="lit-more" aria-expanded="' + open + '" aria-controls="' + id + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>Abstract</button>' +
        '<div class="lit-abstract" id="' + id + '"' + (open ? '' : ' hidden') + '><p>' + mark(p.abstract) + '</p>' +
        (p.keywords ? '<p class="lit-kw"><span class="lit-k">Keywords:</span> ' + mark(p.keywords) + '</p>' : '') + '</div>';
    }
    return h + '</li>';
  }

  // ---- filter, sort, draw
  function apply() {
    words = norm(el.q.value).split(/\s+/).filter(Boolean);
    var th = el.theme.value, rg = el.region.value, tp = el.type.value;
    var f = +el.from.value, t = +el.to.value;
    if (f > t) { var x = f; f = t; t = x; }
    var yearsOn = f !== y0 || t !== y1;
    shown = all.filter(function (p) {
      if (th && (!p.themes || p.themes.indexOf(th) < 0)) return false;
      if (rg && p.region !== rg) return false;
      if (tp && p.type !== tp) return false;
      if (yearsOn && (!p.year || p.year < f || p.year > t)) return false;
      for (var i = 0; i < words.length; i++) if (p._s.indexOf(words[i]) < 0) return false;
      return true;
    });
    shown.sort(SORTS[el.sort.value] || SORTS['year-desc']);
    el.clear.hidden = !(words.length || th || rg || tp || yearsOn);
    page = 0;
    render();
  }

  function render() {
    var pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    var from = page * PER_PAGE, to = Math.min(shown.length, from + PER_PAGE);
    list.setAttribute('start', from + 1);
    list.innerHTML = shown.slice(from, to).map(function (p, i) { return entry(p, from + i); }).join('');
    $('lit-none').hidden = shown.length > 0;
    var c = shown.length === all.length ? fmt(all.length) + ' publications'
      : fmt(shown.length) + ' of ' + fmt(all.length) + ' publications';
    if (pages > 1) c += ', showing ' + fmt(from + 1) + ' to ' + fmt(to);
    $('lit-count').textContent = c;
    var nav = $('lit-pages'), h = [];
    if (pages > 1) {
      h.push('<button type="button" data-p="' + (page - 1) + '"' + (page === 0 ? ' disabled' : '') + '>Previous</button>');
      for (var i = 0; i < pages; i++) {
        if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 2) {
          h.push('<button type="button" data-p="' + i + '"' + (i === page ? ' class="is-active" aria-current="page"' : '') + '>' + (i + 1) + '</button>');
        } else if (Math.abs(i - page) === 3) {
          h.push('<span class="lit-gap">...</span>');
        }
      }
      h.push('<button type="button" data-p="' + (page + 1) + '"' + (page === pages - 1 ? ' disabled' : '') + '>Next</button>');
    }
    nav.innerHTML = h.join('');
  }

  // ---- events
  var timer = 0;
  el.q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(apply, 150); });
  [el.theme, el.region, el.type, el.from, el.to, el.sort].forEach(function (s) {
    s.addEventListener('change', apply);
  });
  el.clear.addEventListener('click', function () {
    el.q.value = ''; el.theme.value = ''; el.region.value = ''; el.type.value = '';
    el.from.value = y0; el.to.value = y1;
    apply();
    el.q.focus();
  });
  list.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.lit-more') : null;
    if (!b) return;
    var box = $(b.getAttribute('aria-controls')), open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    box.hidden = !open;
  });
  $('lit-pages').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-p]') : null;
    if (!b || b.disabled) return;
    page = +b.getAttribute('data-p');
    render();
    var top = document.querySelector('.lit-bar');
    if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
  });
  apply();
})();
