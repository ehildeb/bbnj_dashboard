// io_network.js: the IO network in the IFB section. Which international
// organisations states mentioned, linked to the package elements (IGCs) or the
// agenda items (PrepComs) they mentioned them under. Data: window.IO_DATA
// (data/io_data.js, written by data_cleaning.R from ../io_network/output).
//
// Layout: ForceAtlas2 in LinLog mode (vendor/graphology-fa2.min.js, window.IOGraph),
// settled with a fixed seed, so the picture is the same on every load.
// Live (always on): a d3-force simulation (vendor/d3-force.min.js,
// window.IOForce) starts from the ForceAtlas2 layout; dots can be dragged, the
// network flexes and settles again in (nearly) the same shape: each dot is pulled
// back to its static place and links keep their static length.
// Readability: only the topN most mentioned IOs, the topItems most linked PrepCom
// items (all their links are drawn; minLink can raise the bar); light, curved lines. Colours: IOs one colour in both views, packages in their
// colours (cross-cutting grey), PrepCom items in the PrepCom colour.
//
// Plain ES5. Check with `node --check js/io_network.js`.
(function () {
  'use strict';

  var D = window.IO_DATA, LIB = window.IOGraph, FORCE = window.IOForce;
  var box = document.getElementById('gl-io-net');
  if (!box) return;
  if (!D || !LIB) { box.parentNode.parentNode.hidden = true; return; }

  // ---- Settings (tweak here) ----------------------------------------------------
  var IO_CFG = {
    minN: { igc: 3, prepcom: 2 },      // IOs with fewer statements are never drawn
    topN: { igc: 20, prepcom: 20 },    // only the N most mentioned IOs
    topItems: { igc: 5, prepcom: 8 },  // only the N most linked items (PrepComs: agenda items)
    minLink: 1,                        // links with fewer statements are not drawn (1: all links; Emil 2026-11-20)
    curve: 0.18,                       // bend of the lines (0: straight)
    selMax: 30, selPow: 0.7,           // sizes when something is selected; 0.5 = area in proportion to mentions, 0.7 exaggerates a little (Emil)
    // 'direct': one scale for every selection (the strongest link in the view gets the
    // maximum), so 1 mention always looks small; 'relative': each selection's own
    // strongest link gets the maximum
    selScale: 'direct',
    sizeMs: 650,                       // how long the dots take to change size
    iterations: 1500,                  // ForceAtlas2 rounds before the first drawing
    seed: 7,
    fa2: { linLogMode: true, gravity: 0.6, scalingRatio: 4 },
    // live: every dot is pulled back towards its place in the static layout (home),
    // and links keep their static length, so live settles in the same shape
    live: { home: 0.12, link: 0.3, charge: -25 },
    W: 1000, H: 600, pad: 50
  };
  var G = window.GLANCE || {};
  var PKG_COLS = {};
  var src = G.pkgCols || { mgr: '#3f6f9f', abmt: '#b9a3d6', eia: '#8cc7ad', cb: '#d8a865' };
  for (var pk in src) PKG_COLS[pk] = src[pk];
  PKG_COLS.cci = '#b4b9bf';                       // cross-cutting: greyed out
  var PKG_SHORT = { mgr: 'MGR', abmt: 'ABMT', eia: 'EIA', cb: 'CB&TMT', cci: 'Cross-cutting' };
  if (G.pkgShort) for (var ps in G.pkgShort) PKG_SHORT[ps] = G.pkgShort[ps];
  var COL = {
    io: '#5b6b7c',         // IO dots, same in both views
    prepcom: '#f0b27f',    // PrepCom agenda items: the PrepCom colour (PrepCom bars)
    prepcomLine: '#e0a36d'
  };
  var NS = 'http://www.w3.org/2000/svg';
  var tip = document.getElementById('gl-io-tip');
  var state = { mode: 'igc', live: true, sel: { igc: null, prepcom: null } };   // always live; sel: shown package/item
  // shorter button labels for the PrepCom agenda items (display only)
  var ITEM_SHORT = {
    'Cooperation with relevant legal instruments, frameworks and bodies': 'Cooperation with IFBs',
    'Capacity-building and transfer of marine technology committee': 'CB&TMT committee',
    'Implementation and compliance committee': 'Compliance committee',
    'Access and benefit-sharing committee': 'ABS committee',
    'Rules of procedure of the COP': 'COP rules of procedure',
    'Scientific and technical body': 'Scientific and technical body'
  };
  var cache = {}, sim = null, K = 1;
  // drawing size: the wide layout, or on phones the width it is shown at (taller), so
  // labels keep a readable size; K scales the dots with it
  function geom() {
    var bw = box.clientWidth || 1000;
    // padX leaves room for the labels beside the outermost dots
    if (bw < 700) return { W: Math.round(bw), H: Math.round(bw * 1.3), k: Math.max(0.5, bw / 1000 * 1.5), pad: 28, padX: 56 };
    return { W: 1000, H: 600, k: 1, pad: 50, padX: 50 };
  }

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rnd(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function wrap(s, max) {                       // display only: split a long label into lines
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- Nodes, links and the settled layout for one view -----------------------------
  function build(mode) {
    var ck = mode + ':' + IO_CFG.W;
    if (cache[ck]) return cache[ck];
    var d = D[mode], igc = mode === 'igc', keepIo = {};
    d.ios.filter(function (o) { return o.n >= IO_CFG.minN[mode]; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, IO_CFG.topN[mode])
      .forEach(function (o) { keepIo[o.id] = o; });
    var itemSum = {};
    d.links.forEach(function (l) { if (keepIo[l.io]) itemSum[l.item] = (itemSum[l.item] || 0) + l.n; });
    var items = d.items.filter(function (it) { return itemSum[it.key]; })
      .sort(function (a, b) { return itemSum[b.key] - itemSum[a.key]; })
      .slice(0, IO_CFG.topItems[mode]);
    var keepItem = {};
    items.forEach(function (it) { keepItem[it.key] = true; });
    var best = {};
    d.links.forEach(function (l) {
      if (keepIo[l.io] && keepItem[l.item] && (!best[l.io] || l.n > best[l.io].n)) best[l.io] = l;
    });
    var links = d.links.filter(function (l) {
      return keepIo[l.io] && keepItem[l.item] && (l.n >= IO_CFG.minLink || best[l.io] === l);
    });
    Object.keys(keepIo).forEach(function (id) { if (!best[id]) delete keepIo[id]; });
    var maxItem = 1;
    items.forEach(function (it) { if (it.n > maxItem) maxItem = it.n; });

    var nodes = [], byId = {}, g = new LIB.Graph(), R = rnd(IO_CFG.seed);
    items.forEach(function (it) {
      var n = { id: 'i:' + it.key, item: true, key: it.key, label: it.label, n: it.n,
        size: K * (igc ? 22 + Math.sqrt(it.n / maxItem) * 22 : 8 + Math.sqrt(it.n / maxItem) * 18) };
      n.base = n.size;
      nodes.push(n); byId[n.id] = n;
      g.addNode(n.id, { x: R() * 100, y: R() * 100, size: n.size + K * (igc ? 10 : 30) });
    });
    Object.keys(keepIo).forEach(function (id) {
      var o = keepIo[id];
      var n = { id: 'o:' + id, item: false, label: o.label, full: o.full, n: o.n, size: K * (3 + Math.sqrt(o.n) * 1.2) };
      n.base = n.size;
      nodes.push(n); byId[n.id] = n;
      g.addNode(n.id, { x: R() * 100, y: R() * 100, size: n.size + 14 * K });
    });
    var L = links.map(function (l) {
      g.addEdge('o:' + l.io, 'i:' + l.item, { weight: l.n });
      return { s: byId['o:' + l.io], t: byId['i:' + l.item], n: l.n };
    });
    var st = LIB.forceAtlas2.inferSettings(g);
    for (var k in IO_CFG.fa2) st[k] = IO_CFG.fa2[k];
    st.adjustSizes = true; st.edgeWeightInfluence = 1; st.barnesHutOptimize = false;
    LIB.forceAtlas2.assign(g, { iterations: IO_CFG.iterations, settings: st });

    // screen transform from the settled layout (kept fixed while live)
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    g.forEachNode(function (key, a) {
      x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y);
    });
    var W = IO_CFG.W, H = IO_CFG.H, pad = IO_CFG.pad;
    var padX = IO_CFG.padX || pad;
    var sc = Math.min((W - 2 * padX) / ((x1 - x0) || 1), (H - 2 * pad) / ((y1 - y0) || 1));
    var tr = { sc: sc, ox: (W - (x1 - x0) * sc) / 2 - x0 * sc, oy: (H - (y1 - y0) * sc) / 2 - y0 * sc };
    var start = {};
    g.forEachNode(function (key, a) { start[key] = [a.x, a.y]; });
    cache[ck] = { g: g, st: st, tr: tr, nodes: nodes, links: L, start: start };
    return cache[ck];
  }

  function edgePath(l) {
    var dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, c = IO_CFG.curve;
    var cx = (l.s.x + l.t.x) / 2 - dy * c, cy = (l.s.y + l.t.y) / 2 + dx * c;
    return 'M' + l.s.x.toFixed(1) + ',' + l.s.y.toFixed(1) + 'Q' + cx.toFixed(1) + ',' + cy.toFixed(1) +
      ' ' + l.t.x.toFixed(1) + ',' + l.t.y.toFixed(1);
  }

  // ---- Drawing --------------------------------------------------------------------
  function draw() {
    if (sim) { sim.stop(); sim = null; }
    var G0 = geom();
    IO_CFG.W = G0.W; IO_CFG.H = G0.H; IO_CFG.pad = G0.pad; IO_CFG.padX = G0.padX; K = G0.k;
    var mode = state.mode, igc = mode === 'igc', V = build(mode), g = V.g, tr = V.tr;
    // back to the settled layout
    g.forEachNode(function (key) {
      g.setNodeAttribute(key, 'x', V.start[key][0]); g.setNodeAttribute(key, 'y', V.start[key][1]);
      g.setNodeAttribute(key, 'fixed', false);
    });
    function sync() {
      var mx = 0;
      V.nodes.forEach(function (n) {
        var a = g.getNodeAttributes(n.id);
        var x = tr.ox + a.x * tr.sc, y = tr.oy + a.y * tr.sc;
        if (n.x !== undefined) mx = Math.max(mx, Math.abs(x - n.x), Math.abs(y - n.y));
        n.x = x; n.y = y;
      });
      return mx;
    }
    V.nodes.forEach(function (n) { n.x = undefined; n.size = n.base; });
    sync();

    while (box.firstChild) box.removeChild(box.firstChild);
    var svg = svgEl('svg', { viewBox: '0 0 ' + IO_CFG.W + ' ' + IO_CFG.H, 'class': 'gl-io-svg' + (state.live ? ' is-live' : ''),
      role: 'img', 'aria-label': igc ? 'Network of IFBs and package elements'
        : 'Network of IFBs and PrepCom agenda items' }, box);
    var gl = svgEl('g', {}, svg), gn = svgEl('g', {}, svg), gt = svgEl('g', {}, svg);   // lines, dots, IO labels on top

    var lines = V.links.map(function (l) {
      var cci = igc && l.t.key === 'cci';
      var e = svgEl('path', {
        d: edgePath(l), fill: 'none',
        stroke: igc ? PKG_COLS[l.t.key] : COL.prepcomLine,
        'stroke-opacity': cci ? 0.09 : 0.2,
        'stroke-width': (0.3 + Math.sqrt(l.n) * 0.45).toFixed(2),
        'stroke-linecap': 'round', 'class': 'gl-io-link'
      }, gl);
      return { el: e, l: l };
    });
    // wide invisible strip along each line, only active for the lines of the clicked
    // node: hovering (or tapping) it shows the statement count of that line
    lines.forEach(function (x) {
      var e = x.hit = svgEl('path', { d: edgePath(x.l), fill: 'none', stroke: 'transparent',
        'stroke-width': 12, 'class': 'gl-io-hit' }, gl);
      e.style.pointerEvents = 'none';
      e.addEventListener('pointerenter', function (ev) { x.el.style.strokeOpacity = 0.9; lineTip(x.l, ev); });
      e.addEventListener('pointermove', function (ev) { lineTip(x.l, ev); });
      e.addEventListener('pointerleave', function () { x.el.style.strokeOpacity = 0.5; if (tip) tip.hidden = true; });
      e.addEventListener('click', function (ev) { ev.stopPropagation(); lineTip(x.l, ev); });
    });
    function lineTip(l, ev) {
      if (!tip) return;
      tip.innerHTML = '<span>' + fmt(l.n) + (l.n === 1 ? ' statement' : ' statements') + '</span>';
      tip.hidden = false;
      var r = box.getBoundingClientRect();
      var x = ev.clientX - r.left + 12, y = ev.clientY - r.top - 30;
      if (x + tip.offsetWidth > r.width - 4) x = ev.clientX - r.left - 12 - tip.offsetWidth;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px'; tip.style.right = 'auto';
    }

    var groups = [], dragging = null;
    var order = V.nodes.filter(function (n) { return !n.item; }).concat(V.nodes.filter(function (n) { return n.item; }));
    order.forEach(function (n) {
      var el = svgEl('g', { 'class': 'gl-io-node' + (n.item ? ' is-item' : '') }, gn);
      if (n.item) {
        n.circ = svgEl('circle', { r: n.size, fill: igc ? PKG_COLS[n.key] : COL.prepcom }, el);
        if (igc) {
          var t = n.ptxt = svgEl('text', { 'class': 'gl-io-pkg' + (n.key === 'cci' ? ' is-cci' : ''), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, el);
          t.textContent = PKG_SHORT[n.key] || n.label;
          if ((PKG_SHORT[n.key] || '').length > 8) t.setAttribute('font-size', '13');
        } else {
          var tl = n.ltxt = svgEl('text', { 'class': 'gl-io-item', 'text-anchor': 'middle', y: n.size + 16 }, el);
          wrap(n.label, 22).forEach(function (line, i) {
            var ts = svgEl('tspan', { x: 0, dy: i ? '1.15em' : 0 }, tl);
            ts.textContent = line;
          });
        }
      } else {
          n.circ = svgEl('circle', { r: n.size, 'class': 'gl-io-dot', fill: COL.io }, el);
          // label in its own top layer, so a package circle never hides it
          n.lel = svgEl('g', { 'class': 'gl-io-lblg' }, gt);
          var lb = svgEl('text', { 'class': 'gl-io-lbl', x: n.size + 4, 'dominant-baseline': 'central' }, n.lel);
          lb.textContent = n.label;
      }
      n.el = el;
      groups.push({ el: el, n: n });
      el.addEventListener('mouseenter', function () {
        if (dragging) return;
        applySel(n);                // hovering previews the selection (sizes too)
        focus(n);
      });
      el.addEventListener('mouseleave', function () { if (!dragging) rest(); });
      el.addEventListener('pointerdown', function (ev) { startDrag(ev, n); });
    });
    function redraw() {
      V.nodes.forEach(function (n) {
        var t = 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')';
        n.el.setAttribute('transform', t);
        if (n.lel) {
          n.lel.setAttribute('transform', t);
          // labels on the outer side: left of dots in the left part, right otherwise
          var left = n.x < IO_CFG.W / 2 - 80 * K, txt = n.lel.firstChild;
          if (txt._left !== left) { txt._left = left; txt.setAttribute('text-anchor', left ? 'end' : 'start'); }
          txt.setAttribute('x', left ? -(n.size + 4) : n.size + 4);
        }
      });
      lines.forEach(function (x) { var d = edgePath(x.l); x.el.setAttribute('d', d); if (x.hit) x.hit.setAttribute('d', d); });
    }
    redraw();

    function focus(n) {
      var near = {}; near[n.id] = true;
      var mine = [];
      lines.forEach(function (x) {
        var on = x.l.s === n || x.l.t === n;
        if (on) { near[x.l.s.id] = true; near[x.l.t.id] = true; mine.push(x.l); }
        x.el.style.opacity = on ? 1 : 0.06;
      });
      groups.forEach(function (x) {
        var o = near[x.n.id] ? 1 : 0.18;
        x.el.style.opacity = o;
        if (x.n.lel) x.n.lel.style.opacity = o;
      });
      if (!tip) return;
      mine.sort(function (a, b) { return b.n - a.n; });
      var title = n.item ? n.label : n.label + (n.full && n.full !== n.label ? ' (' + n.full + ')' : '');
      var h = '<strong>' + esc(title) + '</strong><span class="gl-io-tip-n">' +
        (n.item ? fmt(n.n) + ' mentions of IFBs' : 'Appears in ' + fmt(n.n) + ' statements') + '</span>';
      mine.slice(0, 6).forEach(function (l) {
        var other = l.s === n ? l.t : l.s;
        var name = other.item ? (igc ? (PKG_SHORT[other.key] || other.label) : other.label) : other.label;
        h += '<span class="gl-io-tip-row">' + esc(name) + ': ' + fmt(l.n) + '</span>';
      });
      if (mine.length > 6) h += '<span class="gl-io-tip-row gl-io-tip-more">and ' + (mine.length - 6) + ' more</span>';
      tip.innerHTML = h;
      tip.hidden = false;
      // beside the dot; flipped to the left near the right edge, upwards near the bottom
      var r = box.getBoundingClientRect(), k = r.width / IO_CFG.W;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var x = (n.x + n.size) * k + 12, y = n.y * k - 12;
      if (x + tw > r.width - 4) x = (n.x - n.size) * k - 12 - tw;
      if (y + th > r.height - 4) y = r.height - 4 - th;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px'; tip.style.right = 'auto';
    }
    function unfocus() {
      lines.forEach(function (x) { x.el.style.opacity = ''; });
      groups.forEach(function (x) { x.el.style.opacity = ''; if (x.n.lel) x.n.lel.style.opacity = ''; });
      if (tip) tip.hidden = true;
    }
    // ---- Package/item buttons: show one element; IO dots sized by their mentions under it
    function selNode() {
      var k = state.sel[mode];
      return k ? V.nodes.filter(function (n) { return n.id === k; })[0] || null : null;
    }
    // sizes glide to their new values (easeInOut over IO_CFG.sizeMs); the live
    // simulation follows so the dots make room as they grow
    var anim = null;
    function animateSizes() {
      var t0 = null, dur = IO_CFG.sizeMs, same = true;
      V.nodes.forEach(function (n) { if (n.to === undefined) n.to = n.size; if (n.to !== n.animTo) same = false; });
      // already gliding to the same sizes (e.g. a click right after the hover preview): carry on
      if (anim && same) return;
      var moving = !!anim;
      V.nodes.forEach(function (n) { n.from = n.size; n.animTo = n.to; });
      if (anim) cancelAnimationFrame(anim);
      // from rest: ease in and out; when changing course mid-way: ease out only, so it
      // never slows down to a stop before setting off again
      function ease(t) {
        if (moving) return 1 - Math.pow(1 - t, 3);
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur), e = ease(k);
        V.nodes.forEach(function (n) {
          n.size = n.from + (n.to - n.from) * e;
          n.circ.setAttribute('r', n.size.toFixed(2));
          if (n.ltxt) n.ltxt.setAttribute('y', (n.size + 16).toFixed(1));
          // a package circle too small for its name: name below it, in navy
          if (n.ptxt) {
            var small = n.size < 20;
            n.ptxt.setAttribute('y', small ? (n.size + 12).toFixed(1) : 0);
            n.ptxt.classList.toggle('is-out', small);
          }
        });
        if (sim) { sim.force('collide').radius(function (n) { return n.size + (n.item ? 8 : 4); }); if (sim.alpha() < 0.1) sim.alpha(0.1).restart(); }
        else redraw();
        anim = k < 1 ? requestAnimationFrame(frame) : null;
      }
      anim = requestAnimationFrame(frame);
    }
    // show one node (the clicked one, or `preview` while hovering). A package/item:
    // the IOs are sized by their mentions under it. An IO: the packages/items are
    // sized by its mentions under each. Exaggerated within the selection: the biggest
    // gets the maximum size, the rest scale with selPow (closer to 1 = bigger differences).
    function applySel(preview) {
      var sn = preview || selNode(), m = {}, maxM = 1, maxAll = 1;
      V.links.forEach(function (l) {
        if (l.n > maxAll) maxAll = l.n;
        var other = sn && (l.t === sn ? l.s : (l.s === sn ? l.t : null));
        if (other) { m[other.id] = l.n; if (l.n > maxM) maxM = l.n; }
      });
      if (IO_CFG.selScale === 'direct') maxM = maxAll;
      var itMin = K * (igc ? 5 : 4), itMax = K * (igc ? 52 : 30);
      V.nodes.forEach(function (n) {
        if (!sn || n === sn || n.item === sn.item) { n.to = n.base; return; }
        var f = m[n.id] ? Math.pow(m[n.id] / maxM, IO_CFG.selPow) : 0;
        if (n.item) n.to = m[n.id] ? itMin + f * (itMax - itMin) : n.base;
        else n.to = m[n.id] ? K * (3 + f * (IO_CFG.selMax - 3)) : 2;
      });
      animateSizes();
      lines.forEach(function (x) {
        var on = sn && (x.l.t === sn || x.l.s === sn);
        x.el.style.opacity = sn ? (on ? 1 : 0.04) : '';
        x.el.style.strokeOpacity = on ? 0.5 : '';
        // line counts only for the clicked node, not while hovering previews another
        var cs = !preview && selNode();
        x.hit.style.pointerEvents = cs && (x.l.t === cs || x.l.s === cs) ? 'stroke' : 'none';
      });
      groups.forEach(function (x) {
        x.el.classList.toggle('is-sel', x.n === selNode());
        var o = !sn ? '' : (x.n === sn || m[x.n.id] ? 1 : 0.15);
        x.el.style.opacity = o;
        if (x.n.lel) x.n.lel.style.opacity = o;
      });
      if (tip && !preview) tip.hidden = true;
    }
    function rest() { applySel(); }
    // click a package/item to show only it; click it again (or empty space) to show all
    function toggleSel(n) {
      state.sel[mode] = (n && state.sel[mode] !== n.id) ? n.id : null;
      applySel();
    }
    svg.addEventListener('click', function (ev) {
      if (!ev.target.closest || !ev.target.closest('.gl-io-node, .gl-io-hit')) { if (state.sel[mode]) toggleSel(null); }
    });

    // ---- Live: d3-force from the ForceAtlas2 positions; dots can be dragged ----------
    function toSvg(ev) {
      var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return [Math.max(10, Math.min(IO_CFG.W - 10, p.x)), Math.max(10, Math.min(IO_CFG.H - 10, p.y))];
    }
    // a press only becomes a drag after the pointer moves a few pixels, and the dot
    // keeps its offset to the pointer (no jump); a press without moving is a click
    var press = null;
    function startDrag(ev, n) {
      ev.preventDefault();
      var p = toSvg(ev);
      press = { n: n, cx: ev.clientX, cy: ev.clientY, dx: n.x - p[0], dy: n.y - p[1], moved: false, touch: ev.pointerType === 'touch' };
      window.addEventListener('pointermove', moveDrag);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', cancelPress);
    }
    function cancelPress() {                // the browser took over (a scroll): no tap, no drag
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', cancelPress);
      press = null;
    }
    function moveDrag(ev) {
      if (!press || press.touch) return;   // fingers scroll the page; only a mouse drags
      if (!press.moved) {
        if (Math.abs(ev.clientX - press.cx) + Math.abs(ev.clientY - press.cy) < 5 || !sim) return;
        press.moved = true;
        dragging = press.n;
        if (tip) tip.hidden = true;
        sim.alphaTarget(0.3).restart();
      }
      var p = toSvg(ev);
      dragging.fx = p[0] + press.dx; dragging.fy = p[1] + press.dy;
    }
    function endDrag() {
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      if (!press) return;
      var pr = press; press = null;
      window.removeEventListener('pointercancel', cancelPress);
      if (!pr.moved) {
        toggleSel(pr.n);
        if (pr.touch) { if (state.sel[mode]) focus(pr.n); else if (tip) tip.hidden = true; }   // no hover on touch: the tap shows the box
        return;
      }
      dragging.fx = null; dragging.fy = null;
      dragging = null;
      sim.alphaTarget(0);
      rest();
    }
    V.nodes.forEach(function (n) { n.fx = null; n.fy = null; n.vx = 0; n.vy = 0; });
    if (state.live && FORCE) {
      V.nodes.forEach(function (n) { n.hx = n.x; n.hy = n.y; });
      var simLinks = V.links.map(function (l) {
        return { source: l.s, target: l.t, n: l.n, len: Math.sqrt(Math.pow(l.t.x - l.s.x, 2) + Math.pow(l.t.y - l.s.y, 2)) };
      });
      sim = FORCE.forceSimulation(V.nodes)
        .force('link', FORCE.forceLink(simLinks).distance(function (l) { return l.len; }).strength(IO_CFG.live.link))
        .force('charge', FORCE.forceManyBody().strength(IO_CFG.live.charge).distanceMax(120))
        .force('collide', FORCE.forceCollide(function (n) { return n.size + (n.item ? 8 : 4); }))
        .force('x', FORCE.forceX(function (n) { return n.hx; }).strength(IO_CFG.live.home))
        .force('y', FORCE.forceY(function (n) { return n.hy; }).strength(IO_CFG.live.home))
        .alpha(0.3)
        .on('tick', function () {
          V.nodes.forEach(function (n) {
            n.x = Math.max(n.size + 4, Math.min(IO_CFG.W - n.size - 4, n.x));
            n.y = Math.max(n.size + 4, Math.min(IO_CFG.H - n.size - 4, n.y));
          });
          redraw();
        });
    }

    applySel();
  }

  // ---- Controls -------------------------------------------------------------------
  var btns = document.querySelectorAll('#gl-io-toggle button');
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(btns, function (x) {
        var on = x === b;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      state.mode = b.getAttribute('data-view');
      safeDraw();
    });
  });
  function safeDraw() {
    try { draw(); } catch (err) {
      if (window.console) console.error('IO network:', err);
    }
  }
  var lastW = null;
  window.addEventListener('resize', function () {
    var w = geom().W;
    if (lastW !== null && Math.abs(w - lastW) > 30) safeDraw();
    lastW = w;
  });
  safeDraw();
  lastW = IO_CFG.W;
})();
