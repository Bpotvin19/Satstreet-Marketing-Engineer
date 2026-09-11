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
     keeps the comparison honest and the picture readable. */
  function sideFor(vsize) {
    var s = Math.sqrt(Math.max(1, vsize)) * 0.55;
    return Math.max(3, Math.min(26, s));
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
    var settled = [];
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

    /* Settled squares fill the left pane in columns, bottom upwards, which
       reads as a block being filled rather than a scatter. */
    function repack() {
      var x = PAD;
      var y = height - PAD;
      var columnWidth = 0;
      var limit = Math.max(120, width * 0.42);
      for (var i = 0; i < settled.length; i += 1) {
        var s = settled[i];
        if (y - s.side < PAD) {
          x += columnWidth + PAD;
          columnWidth = 0;
          y = height - PAD;
        }
        if (x + s.side > limit) { s.hidden = true; continue; }
        s.hidden = false;
        y -= s.side;
        s.x = x;
        s.y = y;
        y -= PAD;
        if (s.side > columnWidth) columnWidth = s.side;
      }
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
      settled.push(item);
      if (settled.length > MAX_LIVE) settled.shift();
      repack();
    }

    function clearBlock() {
      settled.length = 0;
      sizeTotal = 0;
      repack();
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
      var limit = Math.max(120, width * 0.42);
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
        ctx.fillRect(s.x, s.y, s.side, s.side);
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
        if (f.x <= Math.max(120, width * 0.42)) {
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
