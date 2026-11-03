// literature.js: the list on literature.html, from window.LIT_DATA
// (data/literature_data.js). One entry per paper, 25 per page, sorted in the
// browser. Plain ES5. Check with `node --check js/literature.js` after edits.
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
  var PER_PAGE = 25;
  var papers = L.papers.slice();
  var page = 0;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function key(s) { return String(s || '').toLowerCase().replace(/^[^a-z0-9]+/, ''); }

  var SORTS = {
    'year-desc': function (a, b) { return (b.year || 0) - (a.year || 0) || cmp(key(a.title), key(b.title)); },
    'year-asc':  function (a, b) { return (a.year || 9999) - (b.year || 9999) || cmp(key(a.title), key(b.title)); },
    'title':     function (a, b) { return cmp(key(a.title), key(b.title)) || (b.year || 0) - (a.year || 0); },
    'authors':   function (a, b) { return cmp(key(a.authors), key(b.authors)) || (b.year || 0) - (a.year || 0); }
  };
  function cmp(a, b) {
    if (!a && b) return 1;            // empty values last
    if (a && !b) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function entry(p) {
    var t = p.title ? esc(p.title) : '(no title)';
    var title = p.doi ? '<a href="' + esc(p.doi) + '" target="_blank" rel="noopener">' + t + '</a>' : t;
    var vi = p.volume && p.issue ? p.volume + '(' + p.issue + ')' : (p.volume || (p.issue ? 'issue ' + p.issue : ''));
    var ref = [];
    if (p.source) ref.push('<i>' + esc(p.source) + '</i>');
    if (p.year) ref.push(String(p.year));
    if (vi) ref.push(esc(vi));
    if (p.pages) ref.push('pages ' + esc(p.pages));
    var h = '<li class="lit-item"><div class="lit-title">' + title + '</div>';
    if (p.authors) h += '<div class="lit-authors" title="' + esc(p.authors) + '">' + esc(p.authors) + '</div>';
    h += '<div class="lit-ref">' + ref.join('<span class="lit-sep">&middot;</span>') +
      (p.type ? '<span class="lit-tag">' + esc(p.type) + '</span>' : '') +
      (p.doi ? '<a class="lit-doi" href="' + esc(p.doi) + '" target="_blank" rel="noopener">DOI</a>' : '') + '</div>';
    // every other column with a value; a long abstract is cut to three lines
    // and opens fully on click
    (p.extra || []).forEach(function (x) {
      var abs = x[0].toLowerCase() === 'abstract';
      h += '<div class="lit-extra' + (abs ? ' lit-abstract' : '') + '"' + (abs ? ' title="Click to show all"' : '') + '>' +
        '<span class="lit-extra-lbl">' + esc(x[0]) + ':</span> ' + esc(x[1]) + '</div>';
    });
    return h + '</li>';
  }

  function render() {
    var pages = Math.max(1, Math.ceil(papers.length / PER_PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    var from = page * PER_PAGE, to = Math.min(papers.length, from + PER_PAGE);
    list.setAttribute('start', from + 1);
    list.innerHTML = papers.slice(from, to).map(entry).join('');
    document.getElementById('lit-count').textContent = fmt(papers.length) + ' papers' +
      (pages > 1 ? ', showing ' + fmt(from + 1) + ' to ' + fmt(to) : '');
    var nav = document.getElementById('lit-pages'), h = [];
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

  function sortBy(k) { papers.sort(SORTS[k] || SORTS['year-desc']); page = 0; render(); }

  list.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('.lit-abstract') : null;
    if (a) a.classList.toggle('is-open');
  });
  document.getElementById('lit-sort').addEventListener('change', function (e) { sortBy(e.target.value); });
  document.getElementById('lit-pages').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-p]') : null;
    if (!b || b.disabled) return;
    page = +b.getAttribute('data-p');
    render();
    var top = document.querySelector('.lit-bar');
    if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
  });
  sortBy('year-desc');
})();
