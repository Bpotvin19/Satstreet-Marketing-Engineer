/* Live mempool feed.

   Every unconfirmed transaction relayed on the network, arriving as it
   happens. Each square is one transaction: its area is the transaction's
   size in bytes, its colour is what the sender is paying per byte. They
   fly in from the right and pack into the block that is being built.

   The feed is blockchain.info's public firehose over a websocket, which a
   browser may open directly — roughly a dozen transactions a second. Fee is
   derived, not reported: inputs minus outputs. Where the feed does not
   resolve an input value the fee is unknowable, and those are drawn grey
   rather than guessed at.

   Drawing stops whenever the panel is hidden, the browser tab is in the
   background, or the reader has asked for reduced motion. A visualisation
   nobody is looking at should not be spending a laptop battery.
*/
(function () {
  'use strict';

  var FEED = 'wss://ws.blockchain.info/inv';

  /* Same ramp as the block strip: green is cheap, red is paying up. */
  var BANDS = [
    [2, '#0f8a63'],
    [5, '#3f9a58'],
    [15, '#a9823c'],
    [50, '#c2761f'],
    [Infinity, '#c33a49']
  ];
  var UNKNOWN = '#9fb3c4';

  var MAX_LIVE = 900;      /* settled squares kept before the oldest are dropped */
  var PAD = 2;             /* gap between packed squares */

  function toneFor(rate) {
    if (rate === null || !isFinite(rate)) return UNKNOWN;
    for (var i = 0; i < BANDS.length; i += 1) if (rate < BANDS[i][0]) return BANDS[i][1];
    return BANDS[BANDS.length - 1][1];
  }

  /* Area proportional to size would make a 100 kB transaction a thousand
     times a 100 byte one and nothing else would be visible. Square root
     keeps the comparison honest and the picture readable.

     Sides are then snapped to even numbers. Arbitrary fractional sizes can
     never tile without leaving slivers; a small set of even sizes packs
     flush, which is what makes the block look built rather than piled. */
  var STEP = 2;
  function sideFor(vsize) {
    var raw = Math.sqrt(Math.max(1, vsize)) * 0.55;
    var snapped = Math.round(raw / STEP) * STEP;
    return Math.max(4, Math.min(26, snapped));
  }

  function feeOf(tx) {
    var ins = 0;
    var resolved = true;
    var inputs = tx.inputs || [];
    for (var i = 0; i < inputs.length; i += 1) {
      var prev = inputs[i] && inputs[i].prev_out;
      if (!prev || typeof prev.value !== 'number') { resolved = false; break; }
      ins += prev.value;
    }
    if (!resolved || !inputs.length) return null;
    var outs = 0;
    var out = tx.out || [];
    for (var j = 0; j < out.length; j += 1) outs += out[j].value || 0;
    var fee = ins - outs;
    return fee >= 0 ? fee : null;
  }

  function create(canvas, onStats) {
    var ctx = canvas.getContext('2d');
    var flying = [];
    var settled = [];   /* reassigned by repack */
    var ws = null;
    var frame = null;
    var retry = 0;
    var reconnect = null;
    var running = false;
    var width = 0;
    var height = 0;
    var seen = 0;
    var sizeTotal = 0;
    var windowStart = Date.now();
    var recent = [];

    var reduced = false;
    try {
      reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      width = Math.max(240, Math.round(rect.width));
      height = Math.max(140, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      repack();
    }

    /* Skyline packing. The block keeps a profile of its current top edge,
       and each arriving square takes the lowest place it fits, leftmost on
       a tie. Squares sit flush against their neighbours in both directions,
       so a small one drops into the notch beside a large one instead of
       leaving a dead strip beside it — which is what column packing did.

       Segments are {x, w, y}, with y measured upward from the floor. */
    var sky = [];
    var blockWidth = 0;

    function floorWidth() {
      return Math.max(120, Math.round(width * 0.42));
    }

    function resetSky() {
      blockWidth = floorWidth();
      sky = [{ x: 0, w: blockWidth, y: 0 }];
    }

    /* Lowest resting place for a square of this side, or null if the block
       has no room left. */
    function findSpot(side) {
      var bestY = Infinity;
      var bestX = 0;
      for (var i = 0; i < sky.length; i += 1) {
        var x = sky[i].x;
        if (x + side > blockWidth) break;
        var top = 0;
        var covered = 0;
        var j = i;
        while (covered < side && j < sky.length) {
          if (sky[j].y > top) top = sky[j].y;
          covered += sky[j].w;
          j += 1;
        }
        if (covered < side) break;
        if (top + side > height) continue;
        if (top < bestY) { bestY = top; bestX = x; }
      }
      return bestY === Infinity ? null : { x: bestX, y: bestY };
    }

    /* Raise the profile across the square's footprint, then merge any
       neighbours that now sit at the same height. */
    function raise(x, y, side) {
      var top = y + side;
      var next = [];
      for (var i = 0; i < sky.length; i += 1) {
        var seg = sky[i];
        var end = seg.x + seg.w;
        if (end <= x || seg.x >= x + side) { next.push(seg); continue; }
        if (seg.x < x) next.push({ x: seg.x, w: x - seg.x, y: seg.y });
        if (end > x + side) next.push({ x: x + side, w: end - (x + side), y: seg.y });
      }
      next.push({ x: x, w: side, y: top });
      next.sort(function (a, b) { return a.x - b.x; });

      var merged = [];
      for (var k = 0; k < next.length; k += 1) {
        var last = merged[merged.length - 1];
        if (last && last.y === next[k].y && last.x + last.w === next[k].x) last.w += next[k].w;
        else merged.push(next[k]);
      }
      sky = merged;
    }

    /* Seat one square. Returns false when the block is full. */
    function seat(item) {
      var spot = findSpot(item.side);
      if (!spot) return false;
      raise(spot.x, spot.y, item.side);
      item.x = spot.x;
      item.y = height - spot.y - item.side;
      item.hidden = false;
      return true;
    }

    /* Only on resize, a new block, or after making room. Arrivals are
       seated incrementally, so this is not on the hot path. */
    function repack() {
      resetSky();
      var kept = [];
      for (var i = 0; i < settled.length; i += 1) {
        if (seat(settled[i])) kept.push(settled[i]);
      }
      settled = kept;
    }

    function add(tx) {
      var vsize = Math.max(1, Number(tx.size) || 1);
      var fee = feeOf(tx);
      var rate = fee === null ? null : fee / vsize;
      var side = sideFor(vsize);

      seen += 1;
      sizeTotal += vsize;
      recent.push(Date.now());

      var item = {
        side: side,
        tone: toneFor(rate),
        x: width + side,
        y: PAD + Math.random() * Math.max(1, height - side - PAD * 2),
        hidden: false
      };

      if (reduced) {
        settled.push(item);
        if (settled.length > MAX_LIVE) settled.shift();
        repack();
        return;
      }

      item.vx = -(1.6 + Math.random() * 1.4);
      flying.push(item);
      if (flying.length > 240) flying.shift();
    }

    function land(item) {
      if (!seat(item)) {
        /* Block is full. Drop the oldest fifth and rebuild, which is rare
           enough not to matter and keeps the picture moving. */
        settled = settled.slice(Math.ceil(settled.length * 0.2));
        repack();
        if (!seat(item)) return;
      }
      settled.push(item);
      if (settled.length > MAX_LIVE) { settled.shift(); repack(); }
    }

    function clearBlock() {
      settled = [];
      sizeTotal = 0;
      resetSky();
    }

    function stats() {
      var cutoff = Date.now() - 10000;
      while (recent.length && recent[0] < cutoff) recent.shift();
      return {
        perSecond: recent.length / 10,
        staged: settled.length,
        vsize: sizeTotal,
        seen: seen,
        live: !!ws && ws.readyState === 1
      };
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      /* The edge of the block being packed. */
      var limit = blockWidth || floorWidth();
      ctx.strokeStyle = 'rgba(120,140,160,.28)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(limit + 6, 6);
      ctx.lineTo(limit + 6, height - 6);
      ctx.stroke();
      ctx.setLineDash([]);

      var i;
      for (i = 0; i < settled.length; i += 1) {
        var s = settled[i];
        if (s.hidden) continue;
        ctx.fillStyle = s.tone;
        /* Packed flush; the single pixel comes off the drawn square, not
           the footprint, so the grid reads without opening real gaps. */
        ctx.fillRect(s.x, s.y, s.side - 1, s.side - 1);
      }

      for (i = 0; i < flying.length; i += 1) {
        var f = flying[i];
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = f.tone;
        ctx.fillRect(f.x, f.y, f.side, f.side);
        ctx.globalAlpha = 1;
      }
    }

    function step() {
      if (!running) return;
      for (var i = flying.length - 1; i >= 0; i -= 1) {
        var f = flying[i];
        f.x += f.vx;
        if (f.x <= (blockWidth || floorWidth())) {
          flying.splice(i, 1);
          land(f);
        }
      }
      draw();
      frame = window.requestAnimationFrame(step);
    }

    function open() {
      if (ws) return;
      try {
        ws = new WebSocket(FEED);
      } catch (e) {
        schedule();
        return;
      }
      ws.onopen = function () {
        retry = 0;
        try {
          ws.send(JSON.stringify({ op: 'unconfirmed_sub' }));
          ws.send(JSON.stringify({ op: 'blocks_sub' }));
        } catch (e) {}
        if (onStats) onStats(stats());
      };
      ws.onmessage = function (event) {
        var payload;
        try { payload = JSON.parse(event.data); } catch (e) { return; }
        if (payload.op === 'utx' && payload.x) add(payload.x);
        else if (payload.op === 'block') clearBlock();
      };
      ws.onclose = function () { ws = null; if (running) schedule(); };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }

    function schedule() {
      if (reconnect || !running) return;
      retry = Math.min(retry + 1, 6);
      reconnect = window.setTimeout(function () {
        reconnect = null;
        open();
      }, Math.min(30000, 1000 * Math.pow(2, retry)));
    }

    var ticker = null;

    return {
      start: function () {
        if (running) return;
        /* A browser runs no animation frames for a background tab, so
           starting here would open a socket and report itself live while
           nothing was ever drawn. Wait to be brought to the front; the
           visibilitychange handler starts us then. */
        if (document.hidden) return;
        running = true;
        resize();
        open();
        if (!reduced) frame = window.requestAnimationFrame(step);
        else draw();
        ticker = window.setInterval(function () {
          if (onStats) onStats(stats());
          if (reduced) draw();
        }, 1000);
        window.addEventListener('resize', resize);
      },
      stop: function () {
        running = false;
        window.removeEventListener('resize', resize);
        if (frame) window.cancelAnimationFrame(frame);
        frame = null;
        if (ticker) window.clearInterval(ticker);
        ticker = null;
        if (reconnect) { window.clearTimeout(reconnect); reconnect = null; }
        if (ws) { try { ws.close(); } catch (e) {} ws = null; }
        flying.length = 0;
        settled.length = 0;
        ctx.clearRect(0, 0, width, height);
      },
      reduced: function () { return reduced; }
    };
  }

  window.SATSTREET_MEMPOOL = { create: create, toneFor: toneFor };
})();
