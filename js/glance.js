// glance.js: globes, scroll animations and clicks for the BBNJ page.
// Map files come from geo/*.js (window.GL_GEO) so the page also works from
// file://; the country card is drawn by build.js (window.GLANCE.renderCard).
// Three blocks, each on its own so one failing leaves the others working:
// the title globe, the actors globe, and the scroll animations.
// Check with `node --check js/glance.js` after edits.

// ---- QUALITY: slow computers ---------------------------------------------------
// Each globe times its own frames. When drawing one frame takes longer than
// SLOW_MS a few times in a row, that globe switches to low quality for good:
// pixel ratio 1 (fewer pixels to fill), no grid lines, and WHILE IT TURNS it
// draws the coarse map files (geo/*-low.js, about a third of the points);
// as soon as it stops, it is drawn once more in full detail. Fast computers
// never notice; weak ones stay smooth instead of lagging.
var GL_QUALITY = { SLOW_MS: 22, STRIKES: 3, DPR_MAX: 1.5 };
function glQuality() {
  var q = { low: false, strikes: 0 };
  q.dpr = function () { return q.low ? 1 : Math.min(window.devicePixelRatio || 1, GL_QUALITY.DPR_MAX); };
  q.time = function (ms) {
    if (q.low) return false;
    q.strikes = ms > GL_QUALITY.SLOW_MS ? q.strikes + 1 : 0;
    if (q.strikes >= GL_QUALITY.STRIKES) { q.low = true; return true; }   // true: resize needed
    return false;
  };
  return q;
}

// ---- Hero globe ("rising planet") -------------------------------------------
// Own block: if d3 or the map files are missing, or anything here fails, only
// the globe is missing; the scroll animations below still run.
// Drawn on a canvas with d3-geo (vendor/): sphere in the national waters
// colour, the high seas (geo/highseas-mid.js, Marine Regions) and land
// (geo/land-mid.js) on top. Both are simplified copies (see geo/README.txt)
// so a frame draws quickly.
// Drag to turn it, like the actors globe: the surface follows the pointer and
// glides on a little after letting go. No zoom (no wheel, pinch or buttons).
// On touch screens vertical swipes still scroll the page (touch-action: pan-y),
// so a sideways swipe turns it. It does NOT spin by itself; drawn at most once
// per animation frame, nothing runs while it is still.
(function () {
  'use strict';
  var d3 = window.d3, topo = window.topojson;
  if (!d3 || !d3.geoOrthographic || !topo) return;

  var COL = {
    abnj: '#2f6fae',                     // high seas (also the key swatch in glance.css)
    nat:  '#cfe1f2',                     // within 200 nautical miles
    land: '#f4f6f8', landLine: '#b9c6d3',
    grat: 'rgba(255,255,255,0.22)', edge: '#c9d6e3'
  };
  var BASE = [30, -12];                  // start: centred on the Atlantic, 12 degrees north
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setup(canvas) {
    if (canvas.__glGlobe) return;
    canvas.__glGlobe = true;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    // precision 0: no adaptive resampling (the shapes are dense enough), much faster
    var proj = d3.geoOrthographic().clipAngle(90).precision(0).rotate([BASE[0], BASE[1], 0]);
    var path = d3.geoPath(proj, ctx);
    var grat = d3.geoGraticule10();
    var sphere = { type: 'Sphere' };
    var hs = null, land = null, hsLow = null, landLow = null, size = 0, dpr = 1, shade = null;
    var rot = [BASE[0], BASE[1]], vel = [0, 0];
    var raf = 0, q = glQuality();

    function resize() {
      var w = canvas.clientWidth;
      if (!w) return false;
      dpr = q.dpr();
      if (w !== size || canvas.width !== Math.round(w * dpr)) {
        size = w;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * dpr);
        shade = null;
      }
      proj.scale(w / 2 - 1).translate([w / 2, w / 2]);
      return true;
    }

    // moving: the globe is still turning (coarse shapes on a slow computer)
    function draw(moving) {
      if (!size) return;
      var t0 = performance.now();
      var coarse = moving && q.low && hsLow && landLow;
      var h = coarse ? hsLow : hs, l = coarse ? landLow : land;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // national waters as the base, the high seas on top; without the map
      // file the whole sphere is high seas blue
      ctx.beginPath(); path(sphere); ctx.fillStyle = h ? COL.nat : COL.abnj; ctx.fill();
      if (h) {
        // 'evenodd': the island EEZs are holes in the high seas shapes. With the
        // default 'nonzero' rule a hole was now and then filled in when the
        // outer shape was cut at the rim of the globe (a ring turned the
        // wrong way), so the island EEZs flickered while the globe turned
        ctx.beginPath(); path(h);
        ctx.fillStyle = COL.abnj; ctx.fill('evenodd');
        // a thin outline in the same colour keeps narrow strips of high seas
        // at least a pixel wide, so they do not flicker while the globe turns
        ctx.strokeStyle = COL.abnj; ctx.lineWidth = 0.8; ctx.lineJoin = 'round'; ctx.stroke();
      }
      // The grid has few points, so it needs resampling to curve near the rim
      // (without it the lines are drawn as straight chords at the edges)
      if (!q.low) {
        proj.precision(0.3);
        ctx.beginPath(); path(grat); ctx.strokeStyle = COL.grat; ctx.lineWidth = 0.6; ctx.stroke();
        proj.precision(0);
      }
      if (l) {
        ctx.beginPath(); path(l);
        ctx.fillStyle = COL.land; ctx.fill('evenodd');      // same for lakes
        ctx.strokeStyle = COL.landLine; ctx.lineWidth = 0.5; ctx.stroke();
      }
      // soft light from the upper left, darker towards the rim (made once per size)
      if (!shade) {
        shade = ctx.createRadialGradient(size * 0.36, size * 0.3, size * 0.05, size / 2, size / 2, size / 2);
        shade.addColorStop(0, 'rgba(255,255,255,0.20)');
        shade.addColorStop(0.65, 'rgba(255,255,255,0)');
        shade.addColorStop(1, 'rgba(0,30,70,0.20)');
      }
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI);
      ctx.fillStyle = shade; ctx.fill();
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 1; ctx.stroke();
      if (land && !coarse && q.time(performance.now() - t0)) resize();
    }

    // One frame: glide on after a drag (slowing down), draw, stop when still
    function frame() {
      raf = 0;
      var more = false;
      if (!drag && (Math.abs(vel[0]) > 0.01 || Math.abs(vel[1]) > 0.01)) {
        rot = [rot[0] + vel[0], Math.max(-80, Math.min(80, rot[1] + vel[1]))];
        vel = [vel[0] * 0.92, vel[1] * 0.92];
        more = true;
      }
      proj.rotate([rot[0], rot[1], 0]);
      draw(more || drag);
      if (more) raf = window.requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = window.requestAnimationFrame(frame); }

    // ---- pointer: drag and glide (one pointer only; no zoom)
    var drag = null, last = null;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', function (e) {
      if (drag !== null) return;
      drag = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      vel = [0, 0];
      last = [e.clientX, e.clientY, performance.now()];
      canvas.classList.add('is-drag');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== drag) return;
      var now = performance.now(), dx = e.clientX - last[0], dy = e.clientY - last[1];
      var deg = 180 / Math.PI / proj.scale();                // the surface follows the pointer
      rot = [rot[0] + dx * deg, Math.max(-80, Math.min(80, rot[1] - dy * deg))];
      var dt = Math.max(8, now - last[2]);
      vel = [dx * deg * 16 / dt, -dy * deg * 16 / dt];
      last = [e.clientX, e.clientY, now];
      kick();
    });
    function up(e) {
      if (e.pointerId !== drag) return;
      drag = null;
      canvas.classList.remove('is-drag');
      // glide on only if the pointer was still moving when let go
      if (reduce || e.type === 'pointercancel' || performance.now() - last[2] >= 80) vel = [0, 0];
      kick();                                                 // final frame in full detail
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    function refresh() { if (resize()) draw(); }
    window.addEventListener('resize', refresh);
    if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(canvas);

    // map files (geo/*.js); without them the globe is a plain blue sphere
    var G = window.GL_GEO || {};
    try {
      if (G.highseas) hs = topo.feature(G.highseas, G.highseas.objects.highseas);
      if (G.land) land = topo.feature(G.land, G.land.objects.land);
      if (G.highseasLow) hsLow = topo.feature(G.highseasLow, G.highseasLow.objects.highseas);
      if (G.landLow) landLow = topo.feature(G.landLow, G.landLow.objects.land);
    } catch (e) { hs = land = hsLow = landLow = null; }
    refresh();
    window.requestAnimationFrame(function () { canvas.classList.add('is-ready'); });
  }

  function scanGlobe() {
    document.querySelectorAll('.gl-shell .gl-hero-canvas').forEach(setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanGlobe);
  else scanGlobe();
})();

// ---- Actors globe ----------------------------------------------------------
// Own block, like the hero globe. d3-geo on a canvas; country shapes from
// geo/countries-mid.js (world-atlas countries-50m, simplified), data per
// country from data/glance_data.js (web_countries() in data_cleaning.R). Countries too small
// for the map get a dot (point from the lookup table, or the centre of their
// largest island when the shape is under a few pixels).
//   - drag to turn; it glides on a little after letting go;
//   - zoom with the mouse wheel, the +/- buttons or a trackpad pinch (ctrl +
//     wheel); the wheel always zooms (never scrolls the page) over the globe.
//     Every zoom eases towards a target (kT), smooth like the glide after a drag;
//   - click a country: the globe flies there and zooms in and the card beside
//     it shows the country (build.js: GLANCE.renderCard); clicking the same
//     country again deselects it and zooms back out;
//   - double click: zooms back out (the selection stays as it was before the
//     double click);
//   - colour: hue = main package element, shade = statements (GLANCE.shade in
//     build.js, so the legend matches).
(function () {
  'use strict';
  var d3 = window.d3, topo = window.topojson;
  if (!d3 || !d3.geoOrthographic || !topo) return;

  var OCEAN = '#dcebf7', NODATA = '#eef1f4', LINE = '#ffffff';
  var KMIN = 1, KMAX = 8;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }

  function setup(root) {
    if (root.__glG) return;
    root.__glG = true;
    var canvas = root.querySelector('.gl-g-canvas');
    var tipEl = root.querySelector('.gl-g-tip');
    var ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    var GL = window.GLANCE || {};
    var rows = (GL.data && GL.data.countries) || [];
    var pkgCols = GL.pkgCols || {};
    var byNum = {};
    var maxLog = { nat: 0, grp: 0 };
    rows.forEach(function (r) {
      byNum[r.isonum] = r;
      maxLog.nat = Math.max(maxLog.nat, Math.log((r.n || 0) + 1));
      maxLog.grp = Math.max(maxLog.grp, Math.log((r.ng || r.n || 0) + 1));
    });
    // "Count": 'nat' national capacity only, 'grp' including group statements.
    // A country with no statements in the current count is drawn grey but can
    // still be hovered and clicked (name and card; 2026-11-03).
    var scope = 'grp';                                  // country blocs on by default
    var on = root.querySelector('.gl-g-scope .is-active');
    if (on && on.getAttribute('data-scope') === 'nat') scope = 'nat';
    GL.scope = scope;
    function val(r) { return !r ? 0 : (scope === 'grp' ? (r.ng || 0) : (r.n || 0)); }
    function pkgOf(r) { return scope === 'grp' ? r.pkg_g : r.pkg; }

    var proj = d3.geoOrthographic().clipAngle(90).precision(0);
    var path = d3.geoPath(proj, ctx);
    var grat = d3.geoGraticule10();
    var sphere = { type: 'Sphere' };
    var feats = [], featsLow = [], dots = [];
    var size = 0, dpr = 1, base = 1;
    var rot = [-10, -15], k = 1, kT = 1, sel = null, hover = null;
    var ZOOM_MS = 110;                                  // how quickly the zoom catches up with its target
    var vel = [0, 0], raf = 0, anim = null, q = glQuality();

    function colour(r) {
      if (!r || !val(r)) return NODATA;
      var pk = pkgOf(r), t = maxLog[scope] ? Math.log(val(r) + 1) / maxLog[scope] : 0;
      var col = (pk && pkgCols[pk]) || GL.noPkgCol || '#8f9aa6';
      return GL.shade ? GL.shade(col, t) : col;
    }

    function resize() {
      var w = canvas.clientWidth;
      if (!w) return false;
      dpr = q.dpr();
      if (w !== size || canvas.width !== Math.round(w * dpr)) {
        size = w;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * dpr);
      }
      base = w / 2 - 2;
      return true;
    }
    function apply() { proj.scale(base * k).translate([size / 2, size / 2]).rotate([rot[0], rot[1], 0]); }

    function visible(lonlat) {
      return d3.geoDistance(lonlat, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.02;
    }

    // moving: turning or zooming (coarse shapes, no outlines on a slow computer)
    function draw(moving) {
      if (!size) return;
      var t0 = performance.now();
      var coarse = moving && q.low && featsLow.length > 0;
      apply();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath(); path(sphere); ctx.fillStyle = OCEAN; ctx.fill();
      if (!q.low) {
        proj.precision(0.3);
        ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6; ctx.stroke();
        proj.precision(0);
      }
      (coarse ? featsLow : feats).forEach(function (f) {
        ctx.beginPath(); path(f);
        ctx.fillStyle = colour(f.__r); ctx.fill();
        ctx.strokeStyle = LINE; ctx.lineWidth = 0.5; ctx.stroke();
      });
      [hover, sel].forEach(function (h, i) {
        if (!h || !h.__f || coarse) return;
        ctx.beginPath(); path(h.__f);
        ctx.strokeStyle = i ? '#002F62' : '#006AB4'; ctx.lineWidth = i ? 2 : 1.2; ctx.stroke();
      });
      // dots for states too small to see (or not on the map)
      var R = proj.scale(), rr = 3 + Math.min(3, k * 0.6);
      dots.forEach(function (d) {
        var tiny = !d.__f || d.__f.__sr * R * R < 30;
        if (!tiny || !val(d) || !visible(d.pt)) { d.__xy = null; return; }
        var xy = proj(d.pt);
        d.__xy = xy;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], d === sel ? rr + 2 : rr, 0, 2 * Math.PI);
        ctx.fillStyle = colour(d); ctx.fill();
        ctx.lineWidth = d === sel ? 2 : 1.2;
        ctx.strokeStyle = d === sel ? '#002F62' : (d === hover ? '#006AB4' : '#ffffff');
        ctx.stroke();
      });
      ctx.beginPath(); path(sphere); ctx.strokeStyle = '#c9d6e3'; ctx.lineWidth = 1; ctx.stroke();
      if (feats.length && !coarse && q.time(performance.now() - t0)) resize();
    }

    // one loop for glide, fly and zoom animations; idle when nothing moves
    var lastTs = null;
    function loop(ts) {
      raf = 0;
      var more = false;
      var dt = lastTs === null ? 16 : Math.min(64, ts - lastTs);
      lastTs = ts;
      if (anim) {
        var t = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = ease(t);
        rot = [anim.r0[0] + anim.dr[0] * e, anim.r0[1] + anim.dr[1] * e];
        k = anim.k0 + (anim.k1 - anim.k0) * e;
        kT = k;
        if (t < 1) more = true; else anim = null;
      } else {
        if (Math.abs(vel[0]) > 0.01 || Math.abs(vel[1]) > 0.01) {
          rot = [rot[0] + vel[0], Math.max(-80, Math.min(80, rot[1] + vel[1]))];
          vel = [vel[0] * 0.92, vel[1] * 0.92];
          more = true;
        }
        // smooth zoom: ease towards the target
        if (Math.abs(kT - k) > 0.002) {
          k += (kT - k) * (reduce ? 1 : 1 - Math.exp(-dt / ZOOM_MS));
          more = true;
        } else {
          k = kT;
        }
      }
      if (!more) lastTs = null;
      draw(more || (pts && Object.keys(pts).length > 0));
      if (more) raf = window.requestAnimationFrame(loop);
    }
    function kick() { if (!raf) raf = window.requestAnimationFrame(loop); }
    function animate(r1, k1, dur) {
      vel = [0, 0];
      var dr = [wrap(r1[0] - rot[0]), r1[1] - rot[1]];
      anim = { t0: performance.now(), dur: reduce ? 1 : dur, r0: rot.slice(), dr: dr, k0: k, k1: k1 };
      kick();
    }
    function zoomTo(k1) { anim = null; kT = Math.max(KMIN, Math.min(KMAX, k1)); kick(); }

    // what is under the pointer: a dot first (they are small), then a shape
    function pick(x, y) {
      var best = null, bd = 9;
      dots.forEach(function (d) {
        if (!d.__xy) return;
        var dd = Math.hypot(d.__xy[0] - x, d.__xy[1] - y);
        if (dd < bd) { bd = dd; best = d; }
      });
      if (best) return best;
      apply();
      var ll = proj.invert([x, y]);
      if (!ll || !visible(ll)) return null;
      for (var i = 0; i < feats.length; i++) {
        if (feats[i].__r && d3.geoContains(feats[i], ll)) return feats[i].__r;   // also states with no statements
      }
      return null;
    }

    // back to the whole globe (keeps the current turn)
    function zoomOut() { animate(rot, 1, 700); }
    function deselect() {
      sel = null;
      if (GL.renderCard) GL.renderCard(null);
    }

    function choose(r) {
      if (r === sel) { deselect(); zoomOut(); return; }      // clicked again: deselect and zoom out
      sel = r;
      var c = r.__f && !r.pt ? d3.geoCentroid(r.__f) : (r.pt || [0, 0]);
      var k1 = r.__f ? Math.max(1.6, Math.min(5, 0.35 / Math.sqrt(Math.max(r.__f.__sr, 1e-6)))) : 5;
      if (r.__f && r.__f.__sr > 0.3) k1 = 1.4;                  // very large countries
      animate([-c[0], Math.max(-70, Math.min(70, -c[1]))], k1, 900);
      if (GL.renderCard) GL.renderCard(r);
    }

    function showTip(r, x, y) {
      if (!r) { tipEl.style.display = 'none'; return; }
      var t = '<b>' + r.name + '</b><br>' + (r.none ? 'No statements' : val(r).toLocaleString('en-GB') + ' statements');
      tipEl.innerHTML = t;
      tipEl.style.display = 'block';
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    }

    // ---- pointer: drag, glide, click, pinch
    var pts = {}, last = null, moved = 0, pinch0 = null, lastClick = null;
    canvas.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = [e.clientX, e.clientY];
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      anim = null; vel = [0, 0]; moved = 0;
      last = [e.clientX, e.clientY, performance.now()];
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: kT };
      }
      canvas.classList.add('is-drag');
    });
    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (!pts[e.pointerId]) {                                // hover
        var h = pick(x, y);
        if (h !== hover) { hover = h; kick(); }
        canvas.style.cursor = h ? 'pointer' : 'grab';
        showTip(h, x, y);
        return;
      }
      pts[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pts);
      if (ids.length === 2 && pinch0) {
        var a = pts[ids[0]], b = pts[ids[1]];
        kT = Math.max(KMIN, Math.min(KMAX, pinch0.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d));
        kick();
        return;
      }
      var now = performance.now(), dx = e.clientX - last[0], dy = e.clientY - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      var deg = 180 / Math.PI / (base * k);                  // the surface follows the pointer
      rot = [rot[0] + dx * deg, Math.max(-80, Math.min(80, rot[1] - dy * deg))];
      var dt = Math.max(8, now - last[2]);
      vel = [dx * deg * 16 / dt, -dy * deg * 16 / dt];
      last = [e.clientX, e.clientY, now];
      showTip(null);
      kick();
    });
    function up(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) pinch0 = null;
      if (Object.keys(pts).length) return;
      canvas.classList.remove('is-drag');
      kick();                                                 // final frame in full detail
      if (moved < 5) {                                        // a click, not a drag
        vel = [0, 0];
        var now = performance.now();
        if (lastClick && now - lastClick.t < 320 &&
            Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 12) {
          // double click: zoom back out; undo what the first click did to the selection
          sel = lastClick.prevSel;
          if (GL.renderCard) GL.renderCard(sel);
          lastClick = null;
          zoomOut();
          return;
        }
        lastClick = { t: now, x: e.clientX, y: e.clientY, prevSel: sel };
        var r = canvas.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
        if (h) choose(h);
        else if (sel) { deselect(); zoomOut(); }              // click in the water: deselect and zoom out
      } else if (!reduce && performance.now() - last[2] < 80) {
        kick();                                               // glide on
      } else {
        vel = [0, 0];
      }
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { if (hover) { hover = null; kick(); } showTip(null); });
    // mouse wheel and trackpad pinch (ctrl + wheel) always zoom the globe; the
    // page does not scroll while the pointer is over it
    canvas.addEventListener('wheel', function (e) {
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;                       // lines (Firefox) to pixels
      else if (e.deltaMode === 2) dy *= size || 400;          // pages to pixels
      e.preventDefault();
      if (!dy) return;
      if (anim) { kT = k; anim = null; }
      // pinch deltas are small, so they get a stronger factor; one wheel notch is about x1.2
      var f = e.ctrlKey ? 0.01 : 0.0018;
      kT = Math.max(KMIN, Math.min(KMAX, kT * Math.exp(-dy * f)));
      kick();
    }, { passive: false });

    root.querySelector('.gl-g-zin').addEventListener('click', function () { zoomTo(kT * 1.6); });
    root.querySelector('.gl-g-zout').addEventListener('click', function () { zoomTo(kT / 1.6); });
    root.querySelector('.gl-g-reset').addEventListener('click', function () { animate([-10, -15], 1, 700); });
    var section = root.closest('.gl-actors');
    root.querySelectorAll('.gl-g-scope button').forEach(function (b) {
      b.addEventListener('click', function () {
        scope = b.getAttribute('data-scope') === 'grp' ? 'grp' : 'nat';
        GL.scope = scope;
        root.querySelectorAll('.gl-g-scope button').forEach(function (o) { o.classList.toggle('is-active', o === b); });
        if (section) section.classList.toggle('is-grp', scope === 'grp');
        if (GL.renderCard) GL.renderCard(sel);
        kick();
      });
    });

    function refresh() { if (resize()) draw(); }
    window.addEventListener('resize', refresh);
    if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(canvas);
    refresh();

    var t = (window.GL_GEO || {}).countries;
    if (!t) { canvas.classList.add('is-ready'); return; }
    try {
      feats = topo.feature(t, t.objects.countries).features;
      feats.forEach(function (f) {
        f.__sr = d3.geoArea(f);
        var r = f.id !== undefined ? byNum[f.id] : null;
        if (r) { f.__r = r; r.__f = f; }
      });
      var tl = (window.GL_GEO || {}).countriesLow;
      if (tl) {
        featsLow = topo.feature(tl, tl.objects.countries).features;
        featsLow.forEach(function (f) { f.__r = f.id !== undefined ? byNum[f.id] || null : null; });
      }
      rows.forEach(function (r) {
        if (r.point_lon !== null && r.point_lon !== undefined) {
          r.pt = [r.point_lon, r.point_lat];
        } else if (r.__f) {
          // centre of the largest polygon (an island, for archipelagos)
          var g = r.__f.geometry, polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates], best = null, ba = -1;
          polys.forEach(function (pp) { var a = d3.geoArea({ type: 'Polygon', coordinates: pp }); if (a > ba) { ba = a; best = pp; } });
          r.pt = d3.geoCentroid({ type: 'Polygon', coordinates: best });
        }
        if (r.pt) dots.push(r);
      });
    } catch (e) { feats = []; dots = []; }
    canvas.classList.add('is-ready');
    refresh();
  }

  function scan() { document.querySelectorAll('.gl-shell .gl-globe').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();


// ---- Clicks, reveal animations and the pinned meeting overview -------------
// Content is only hidden once this block has added `gl-anim` to <html>. With
// "reduce motion" switched on, or without IntersectionObserver, nothing is
// hidden and the pinned section shows its final state.
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var anim = !reduce && ('IntersectionObserver' in window);
  if (anim) document.documentElement.classList.add('gl-anim');

  function c01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // ---- Package cards ----------------------------------------------------------
  // Start: the intro text left, the four cards right. Click a card: the cards move
  // under the intro text on the left and the clicked package's text appears on the
  // right where the cards were. Click another card to switch; click the open one
  // again to go back. The move is animated (FLIP: measure, move, slide from the old
  // place); with reduce motion it just jumps.
  var reduceMo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function flipMove(cards, change) {
    var first = cards.map(function (c) { return c.getBoundingClientRect(); });
    change();
    if (reduceMo) return;
    cards.forEach(function (c, i) {
      var last = c.getBoundingClientRect();
      var dx = first[i].left - last.left, dy = first[i].top - last.top;
      var sx = first[i].width / Math.max(1, last.width), sy = first[i].height / Math.max(1, last.height);
      c.style.transition = 'none';
      c.style.transformOrigin = '0 0';
      c.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    });
    void document.body.offsetWidth;                     // apply the start position before animating
    cards.forEach(function (c, i) {
      c.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
      c.style.transitionDelay = (i * 30) + 'ms';
      c.style.transform = '';
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var pkg = t && t.closest ? t.closest('.gl-shell .gl-pkg') : null;
    if (!pkg) return;
    var sec = pkg.closest('section');
    if (!sec) return;
    var grid = sec.querySelector('.gl-pkgs'), slotL = sec.querySelector('.gl-pkg-slot-l'), slotR = sec.querySelector('.gl-pkg-slot-r');
    var cards = Array.prototype.slice.call(sec.querySelectorAll('.gl-pkg'));
    var k = pkg.getAttribute('data-k');
    var open = sec.classList.contains('is-open');
    var closing = open && pkg.classList.contains('is-active');
    function mark(key) {
      cards.forEach(function (p) {
        var on = p.getAttribute('data-k') === key;
        p.classList.toggle('is-active', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      sec.querySelectorAll('.gl-pkg-text, .gl-pkg-igc').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-k') === key); });
      var h = sec.querySelector('.gl-pkg-h'), name = pkg.querySelector('.gl-pkg-name');
      if (h && name && key) h.textContent = name.textContent;
      var on = key && sec.querySelector('.gl-pkg[data-k="' + key + '"]');
      if (on) sec.style.setProperty('--pk', on.style.getPropertyValue('--pk'));   // the panel's line in its colour
    }
    if (closing) {
      flipMove(cards, function () { mark(null); sec.classList.remove('is-open'); if (slotR && grid) slotR.appendChild(grid); });
    } else if (!open) {
      flipMove(cards, function () { mark(k); sec.classList.add('is-open'); if (slotL && grid) slotL.appendChild(grid); });
    } else {
      mark(k);
    }
  });

  // ---- Click pop-ups: one open at a time; a click outside or Esc closes ----------
  function closePops(except) {
    document.querySelectorAll('.gl-shell .gl-pop.is-open').forEach(function (p) {
      if (p === except) return;
      p.classList.remove('is-open');
      var b = p.querySelector('.gl-pop-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t && t.closest ? t.closest('.gl-shell .gl-pop-btn') : null;
    if (btn) {
      var pop = btn.closest('.gl-pop');
      if (pop.classList.contains('gl-pop-hover')) return;   // hover pop-ups: a click does nothing
      var open = !pop.classList.contains('is-open');
      closePops(pop);
      pop.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if (t && t.closest && t.closest('.gl-pop-box a')) { closePops(null); return; }
    if (!(t && t.closest && t.closest('.gl-pop-box'))) closePops(null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(null); });

  // ---- Reveal and count up ------------------------------------------------------
  // Runs both ways: an element that leaves the bottom of the screen (scrolling
  // back up) is hidden again and its counters reset; one that leaves the top
  // stays shown.
  function counts(root) { return root.querySelectorAll('.gl-count[data-to]'); }
  function countUp(root) {
    counts(root).forEach(function (el) {
      if (el.__glCounted) return;
      el.__glCounted = true;
      var to = parseFloat(el.getAttribute('data-to'));
      if (!isFinite(to) || to <= 0) return;
      var run = (el.__glRun = (el.__glRun || 0) + 1);
      var t0 = null, dur = 1400;
      function step(ts) {
        if (el.__glRun !== run) return;
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) window.requestAnimationFrame(step);
        else el.textContent = fmt(to);
      }
      window.requestAnimationFrame(step);
    });
  }
  function resetCounts(root) {
    counts(root).forEach(function (el) {
      el.__glRun = (el.__glRun || 0) + 1;
      el.__glCounted = false;
      el.textContent = '0';
    });
  }
  function finishCounts(root) {
    counts(root).forEach(function (el) {
      el.__glRun = (el.__glRun || 0) + 1;
      el.__glCounted = true;
      var to = parseFloat(el.getAttribute('data-to'));
      if (isFinite(to)) el.textContent = fmt(to);
    });
  }
  if (anim) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var el = en.target, r = en.boundingClientRect;
        if (r.width === 0 && r.height === 0) return;
        if (en.isIntersecting) { el.classList.add('is-in'); countUp(el); return; }
        var h = en.rootBounds ? en.rootBounds.height : window.innerHeight;
        if (r.top > h / 2) { el.classList.remove('is-in'); resetCounts(el); }
        else { el.classList.add('is-in'); finishCounts(el); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    var scanReveal = function () {
      document.querySelectorAll('.gl-shell .gl-reveal').forEach(function (el) {
        if (el.__glObserved) return;
        el.__glObserved = true;
        io.observe(el);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanReveal);
    else scanReveal();
    // safety net: anything in view still hidden 3 s after loading is shown
    window.addEventListener('load', function () {
      window.setTimeout(function () {
        document.querySelectorAll('.gl-shell .gl-reveal:not(.is-in)').forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) { el.classList.add('is-in'); countUp(el); }
        });
      }, 3000);
    });
  }

  // ---- Pinned sections ----------------------------------------------------------
  // ---- The Agreement and the official meetings (not pinned, 2026-11-03) ----------
  // Part one shows the Agreement big in its slot. A short scroll on (MO_GO px past
  // the middle of the screen) sends it gliding down into its place in the row of
  // meetings in part two (0.8 s, on its own). From 0.3 s into the glide, once the row
  // is on screen, the IGCs (left) and PrepComs and COP-1 (right) pop in one after the
  // other; scrolling back up past the slot hides them and it glides back up.
  var SLOT = 80, GAP = 26;                            // px per meeting at full size
  var AG_ROW = 0.62;                                  // Agreement size in the row, as a share of its full size
  var SQ_MID = 26;                                    // half the square: its centre within the .gl-meet box
  var MO_GO = 140, MO_BACK = 60;                      // px scrolled past the slot to send it down / bring it back
  var MO_GLIDE = 800;                                 // ms the glide takes (the CSS transition)
  var MO_POP = 300;                                   // ms into the glide when the meetings start to come in

  function moParts(sec, stage) {
    if (sec.__mo) return sec.__mo;
    var sq = Array.prototype.slice.call(stage.querySelectorAll('.gl-meet'));
    sq.sort(function (x, y) { return +x.getAttribute('data-pos') - +y.getAttribute('data-pos'); });
    sec.__mo = {
      agr: sec.querySelector('.gl-mo-agr'),
      slot: sec.querySelector('.gl-mo-slot'),
      sq: sq,
      agrPos: +stage.getAttribute('data-agr') || 0,
      shown: null
    };
    return sec.__mo;
  }

  function moUpdate(sec) {
    var stage = sec.querySelector('.gl-mo-stage');
    if (!stage) return;
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    var P = moParts(sec, stage);
    if (!P.agr || !P.slot) return;
    var AW = P.agr.offsetWidth || 240, AH = P.agr.offsetHeight || 314;
    var IW = P.sq.length ? P.sq[0].offsetWidth : 72;
    var n = P.sq.length, rowY = H / 2;

    // the row with every official meeting: the Agreement's final place
    var u = Math.min(1, (W - 8) / (n * SLOT + AW * AG_ROW + 2 * GAP));
    var sB = Math.min(1, (W - 16) / AW, (H - 8) / AH, AG_ROW * u);
    var slot = SLOT * u, gap = GAP * u, agW = AW * sB;
    var x = (W - (agW + 2 * gap + n * slot)) / 2, agX = null, xs = [];
    P.sq.forEach(function (b) {
      if (agX === null && +b.getAttribute('data-pos') > P.agrPos) { agX = x + gap + agW / 2; x += agW + 2 * gap; }
      xs.push(x + slot / 2); x += slot;
    });
    if (agX === null) agX = x + gap + agW / 2;

    // start (slot in part one) and end (row in part two), in the section's coordinates
    var rs = sec.getBoundingClientRect(), ra = P.slot.getBoundingClientRect(), rt = stage.getBoundingClientRect();
    var ax = ra.left - rs.left + ra.width / 2, ay = ra.top - rs.top + ra.height / 2;
    var sA = Math.min(1.6, ra.height / AH, (ra.width || W) / AW);
    var ghost = P.slot.querySelector('.gl-mo-ghost');
    if (ghost) { ghost.style.width = Math.round(AW * sA) + 'px'; ghost.style.height = Math.round(AH * sA) + 'px'; }
    var bx = rt.left - rs.left + agX, by = rt.top - rs.top + rowY;
    // a short scroll past the slot sends it down: it glides to the row on its own
    // (CSS transition, 0.8 s) rather than following the scroll; back up, it returns
    var yA = ra.top + ra.height / 2, mid = window.innerHeight / 2, past = mid - yA;
    if (!anim) P.down = true;
    else if (!P.down && past > MO_GO) { P.down = true; P.tDown = Date.now(); setTimeout(update, MO_POP + 20); }
    else if (P.down && past < MO_BACK) P.down = false;
    var cx = P.down ? bx : ax, cy = P.down ? by : ay, sc = P.down ? sB : sA;
    P.agr.style.transform = 'translate(' + (cx - AW / 2).toFixed(1) + 'px,' + (cy - AH / 2).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
    sec.classList.toggle('is-down', !!P.down);

    // the meetings start coming in while it is still gliding (MO_POP), once the row is on screen
    var rowOn = rt.top + rowY < window.innerHeight * 0.95;
    var shown = !anim || !!(P.down && Date.now() - P.tDown >= MO_POP && rowOn);
    if (P.down && !rowOn) setTimeout(update, 200);   // may land off screen: look again shortly
    sec.classList.toggle('is-in', shown);
    if (P.shown !== shown) {                          // they pop in one after the other
      var k = 0;
      P.sq.forEach(function (b) { b.style.transitionDelay = shown ? (k++ * 60) + 'ms' : '0ms'; });
      P.shown = shown;
    }
    P.sq.forEach(function (b, i) {
      var s = shown ? u : 0.3 * u;
      b.style.transform = 'translate(' + (xs[i] - IW / 2).toFixed(1) + 'px,' + (rowY - SQ_MID).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      b.classList.toggle('is-hid', !shown);
    });
  }

  // Publications: the newest few show, the rest behind a button
  function pubsMore() {
    var box = document.querySelector('.gl-pubs'), btn = document.querySelector('.gl-pubs-more');
    if (!box || !btn) return;
    var n = box.querySelectorAll('.gl-pub').length;
    btn.textContent = 'Show all ' + n + ' publications';
    btn.addEventListener('click', function () {
      var open = box.classList.toggle('is-all');
      btn.textContent = open ? 'Show fewer' : 'Show all ' + n + ' publications';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Tooltip for the meetings and the Agreement
  function moTip(stage) {
    var tip = stage.querySelector('.gl-tl-tip');
    if (!tip) return;
    stage.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.gl-meet:not(.is-hid)') : null;
      if (!t) { tip.style.display = 'none'; return; }
      var r = (t.querySelector('.gl-meet-sq') || t).getBoundingClientRect();
      var t2 = t.getAttribute('data-tip2');
      tip.textContent = t.getAttribute('data-tip') + (t2 ? '\n' + t2 : '');
      tip.style.display = 'block';
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = (r.top - 6) + 'px';
    });
    stage.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    document.addEventListener('scroll', function () { tip.style.display = 'none'; }, { passive: true, capture: true });
  }

  // ---- Negotiation room: dots pop in on one canvas -------------------------------
  // When the room comes into view the dots pop in left to right, the states first,
  // the other actors from 0.5 s (each dot a short springy grow). Scrolled back out
  // below the screen, it resets and plays again next time. One canvas, drawn frame
  // by frame: smooth with ~200 dots and does not hold up scrolling. Reduced motion:
  // drawn at once.
  function roomAnim(box) {
    var R = box.__room, cv = box.querySelector('.gl-room-canvas');
    if (!R || !cv) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var t0 = null, raf = 0, W = 0, dpr = 1;
    var STEP = 800, OUT = 500, DUR = 420;
    function size() {
      var w = cv.clientWidth;
      if (!w) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w !== W) { W = w; cv.width = Math.round(w * dpr); cv.height = Math.round(w * R.h / R.w * dpr); }
      return true;
    }
    function ease(x) { var c = 1.7; x = x - 1; return 1 + (c + 1) * x * x * x + c * x * x; }   // a little overshoot
    function draw(now) {
      raf = 0;
      if (!size()) return;
      var k = W / R.w, done = true;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, R.w, R.h);
      R.dots.forEach(function (d) {
        var s = 1;
        if (t0 !== null && anim) {
          var t = (now - t0 - d.f * STEP - (d.out ? OUT : 0)) / DUR;
          if (t < 1) done = false;
          if (t <= 0) return;
          s = t >= 1 ? 1 : ease(t);
        } else if (anim) return;                         // not started: nothing shown
        ctx.globalAlpha = Math.min(1, s);
        ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(0.01, R.r * s), 0, 2 * Math.PI);
        ctx.fillStyle = d.col; ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (!done) raf = window.requestAnimationFrame(draw);
    }
    function play() { if (t0 !== null) return; t0 = performance.now(); if (!raf) raf = window.requestAnimationFrame(draw); }
    function reset() { t0 = null; if (raf) { window.cancelAnimationFrame(raf); raf = 0; } draw(performance.now()); }
    if (!anim) { t0 = null; draw(performance.now()); window.addEventListener('resize', function () { draw(performance.now()); }); return; }
    new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) play();
        else if (e.boundingClientRect.top > (e.rootBounds ? e.rootBounds.height : window.innerHeight) / 2) reset();   // left below: play again later
      });
    }, { threshold: 0, rootMargin: '0px 0px -15% 0px' }).observe(box);
    window.addEventListener('resize', function () { W = 0; draw(performance.now()); });
    draw(performance.now());
  }

  // ---- Wiring ----------------------------------------------------------------------
  var moSec = null;
  function update() { if (moSec) moUpdate(moSec); }
  var ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { ticking = false; update(); });
  }
  function init() {
    pubsMore();
    moSec = document.querySelector('.gl-shell .gl-mo');
    var room = document.querySelector('.gl-shell #gl-room');
    if (room) roomAnim(room);
    if (moSec) {
      var st = moSec.querySelector('.gl-mo-stage');
      if (st) moTip(st);
    }
    update();
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    window.addEventListener('load', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


// ---- Menu -----------------------------------------------------------------------
// The button opens and closes the panel; a click on a link, outside the panel or
// Escape closes it. While scrolling, the section in the middle of the screen is
// marked in the list (is-current).
(function () {
  'use strict';
  function init() {
    var nav = document.querySelector('.gl-shell .gl-menu');
    if (!nav) return;
    var btn = nav.querySelector('.gl-menu-btn'), panel = nav.querySelector('.gl-menu-panel');
    var links = Array.prototype.slice.call(nav.querySelectorAll('.gl-menu-list a'));
    function set(open) {
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      if (open) mark();
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(panel.hidden); });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !nav.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); }
    });
    // current section: the last one whose top is above the middle of the screen
    var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var tick = false;
    function mark() {
      tick = false;
      var mid = window.innerHeight / 2, cur = -1;
      secs.forEach(function (sec, i) { if (sec && sec.getBoundingClientRect().top <= mid) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('is-current', i === Math.max(0, cur)); });
    }
    window.addEventListener('scroll', function () {
      if (!tick && !panel.hidden) { tick = true; window.requestAnimationFrame(mark); }
    }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
