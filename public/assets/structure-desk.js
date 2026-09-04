(function () {
  'use strict';
  var S = window.SATSTREET, $ = function (id) { return document.getElementById(id); };
  var esc = S.esc, fmt = S.fmt;
  S.mountHeader('Structure');

  var TABS = ['derivatives', 'network', 'macro', 'institutional'];
  var loaded = {}, updated = {};

  var DISCLOSURE = {
    derivatives:
      '<p><strong>Source.</strong> Derivatives figures are drawn from a single third-party venue and describe positioning at that venue only. They are not a view on the wider market and not a recommendation.</p>' +
      '<p><strong>Method.</strong> Funding is annualised from the venue\u2019s 8-hour rate. Basis is the perpetual mark against the venue\u2019s spot index. Open interest is USD notional as reported. Implied volatility is the venue\u2019s own 30-day index.</p>' +
      '<p>Indicative reference data only \u2014 not a quote, not an offer, and not the price at which Satstreet will execute.</p>',
    network:
      '<p><strong>Source.</strong> Bitcoin network figures come from mempool.space and describe the public blockchain. Hashrate is an estimate derived from observed block times and is not directly measurable.</p>' +
      '<p>Fee estimates change continuously and are indicative of conditions at the time shown.</p>',
    macro:
      '<p><strong>Source.</strong> Equity, rate, metal and dollar levels are indicative reference prices from third-party venues and may be delayed. Foreign exchange is a reference rate.</p>' +
      '<p>Movements shown are since the previous close. Yields are quoted in basis points. Nothing here is a forecast or a statement about how any market will affect another.</p>',
    institutional:
      '<p><strong>Source.</strong> Spot Bitcoin ETF flow and holdings figures are compiled by <a href="https://www.coinglass.com/etf/bitcoin" target="_blank" rel="noopener noreferrer">CoinGlass</a> from issuer reports and primary-market activity. Satstreet does not originate this series.</p>' +
      '<p><strong>Method.</strong> Daily net flow is creations minus redemptions in USD. A positive print is a net inflow; a negative print is a net outflow. Totals include the listed US spot Bitcoin ETFs on the CoinGlass tape. Weekend and holiday sessions are omitted because creations settle on US equity-market days.</p>' +
      '<p>Indicative reference data only \u2014 not a quote, not an offer, and not a statement about future ETF demand or Bitcoin price.</p>'
  };

  function show(name) {
    TABS.forEach(function (t) {
      var sel = t === name;
      var btn = $('tab-' + t);
      btn.setAttribute('aria-selected', String(sel));
      btn.tabIndex = sel ? 0 : -1;
      $('p-' + t).hidden = !sel;
    });
    $('disclosure').innerHTML = DISCLOSURE[name];
    stamp(name);
    if (!loaded[name]) { loaded[name] = true; (LOAD[name] || function () {})(); }
  }

  var tablist = document.querySelector('.tabs');
  tablist.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-t]');
    if (b) show(b.getAttribute('data-t'));
  });
  tablist.addEventListener('keydown', function (e) {
    var i = TABS.indexOf(document.activeElement.getAttribute('data-t'));
    if (i < 0) return;
    var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1
          : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (n === -1) return;
    e.preventDefault();
    n = (n + TABS.length) % TABS.length;
    show(TABS[n]); $('tab-' + TABS[n]).focus();
  });

  function stamp(name) {
    var at = updated[name];
    if (!at) { $('pip').className = 'pip'; $('feedstate').textContent = 'Loading\u2026'; return; }
    if (at === 'error') { $('pip').className = 'pip bad'; $('feedstate').textContent = 'Unavailable'; return; }
    var st = S.staleness(at);
    $('pip').className = 'pip ' + (st.stale ? 'warn' : 'ok');
    $('feedstate').innerHTML = st.stale
      ? '<span class="stale">Data ' + st.minutes + ' min old</span>'
      : 'Updated ' + fmt.time(at);
  }

  var tip = function (label, text) {
    return '<abbr class="tip" title="' + esc(text) + '">' + esc(label) + '</abbr>';
  };

  function loadDerivatives() {
    $('deriv').innerHTML = '<div class="card">' + S.skeleton(4, 18) + '</div><div class="card">' + S.skeleton(4, 18) + '</div>';
    fetch('/api/structure', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        $('deriv').innerHTML = d.assets.map(function (a) {
          if (a.error) {
            return '<div class="card"><header><h2>' + esc(a.asset) + ' perpetual</h2></header>' +
              S.errorState('Unavailable', a.error, '') + '</div>';
          }
          var f = a.fundingAnnualPct, bs = a.basisPct;
          var cell = function (k, tipText, val, cls, sub) {
            return '<div class="dcell"><div class="k">' + tip(k, tipText) + '</div>' +
              '<div class="v ' + (cls || '') + '">' + val + '</div>' +
              '<div class="s">' + esc(sub || '') + '</div></div>';
          };
          return '<div class="card"><header><h2>' + esc(a.asset) + ' perpetual</h2></header>' +
            '<div class="dgrid">' +
              cell('Funding', 'The periodic payment between long and short holders of a perpetual contract, shown annualised from the venue\u2019s 8-hour rate. Positive means long holders are paying short holders.',
                   fmt.pct(f), fmt.dir(f),
                   f === null ? '' : f > 0 ? 'longs paying shorts' : f < 0 ? 'shorts paying longs' : 'flat') +
              cell('Basis', 'The perpetual contract\u2019s mark price relative to the venue\u2019s spot index, in percent. A positive basis means the contract trades above spot.',
                   bs === null ? '\u2014' : (bs > 0 ? '+' : '') + bs.toFixed(3) + '%', fmt.dir(bs), 'perpetual vs spot') +
              cell('Open interest', 'The total notional value of contracts currently open at this venue. It measures how much is committed, not direction.',
                   fmt.compact(a.openInterestUsd), '', 'notional') +
              cell('Implied volatility', 'The venue\u2019s 30-day volatility index, derived from options pricing. It reflects expected magnitude of movement, not direction.',
                   a.impliedVol === null ? '\u2014' : a.impliedVol.toFixed(1), '', '30-day index') +
            '</div>' +
            '<div class="venue"><span>Venue: ' + esc(d.venue) + '</span>' +
              '<span>24h volume ' + fmt.compact(a.volume24hUsd) + '</span>' +
              '<span>Updated ' + fmt.time(d.asOf) + '</span></div></div>';
        }).join('');
        updated.derivatives = new Date(d.asOf).getTime();
        stamp('derivatives');
      })
      .catch(function (e) {
        $('deriv').innerHTML = '<div class="card">' + S.errorState('Derivatives data unavailable', e.message, 'retry-d') + '</div>';
        updated.derivatives = 'error'; stamp('derivatives');
        var r = $('retry-d'); if (r) r.addEventListener('click', function () { loaded.derivatives = false; show('derivatives'); });
      });
  }

  function feeWords(n) {
    if (!isFinite(n)) return '';
    if (n <= 2) return 'minimal congestion';
    if (n <= 10) return 'light congestion';
    if (n <= 40) return 'moderate congestion';
    if (n <= 100) return 'elevated congestion';
    return 'heavy congestion';
  }

  function loadNetwork() {
    var api = 'https://mempool.space/api/';
    $('net').innerHTML = '<div class="metric">' + S.skeleton(2, 16) + '</div><div class="metric">' + S.skeleton(2, 16) +
      '</div><div class="metric">' + S.skeleton(2, 16) + '</div><div class="metric">' + S.skeleton(2, 16) + '</div>';
    $('net-extra').innerHTML = S.skeleton(2, 14);
    var get = function (p) {
      return fetch(api + p).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var ct = r.headers.get('content-type') || '';
        return ct.indexOf('json') > -1 ? r.json() : r.text();
      });
    };
    Promise.all([
      get('v1/mining/hashrate/3d').catch(function () { return null; }),
      get('v1/difficulty-adjustment').catch(function () { return null; }),
      get('v1/fees/recommended').catch(function () { return null; }),
      get('blocks/tip/height').catch(function () { return null; }),
      get('v1/blocks').catch(function () { return null; })
    ]).then(function (r) {
      var hash = r[0], diff = r[1], fees = r[2], height = r[3], blocks = r[4];
      if (!hash && !diff && !fees && height === null) throw new Error('network data unavailable');
      var hs = hash && hash.hashrates && hash.hashrates.length ? hash.hashrates[hash.hashrates.length - 1].avgHashrate : NaN;
      var m = function (k, v, s) {
        return '<div class="metric"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
      };
      $('net').innerHTML =
        m('Hashrate', isFinite(hs) ? (hs / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' EH/s' : '\u2014', 'seven-day average') +
        m('Difficulty', diff && isFinite(diff.difficultyChange) ? (diff.difficultyChange > 0 ? '+' : '') + diff.difficultyChange.toFixed(2) + '%' : '\u2014', diff ? 'estimated change at next retarget' : '') +
        m('Fee estimate', fees ? fees.fastestFee + ' sat/vB' : '\u2014', fees ? esc(feeWords(fees.fastestFee)) : '') +
        m('Block height', height !== null ? Number(height).toLocaleString('en-US') : '\u2014', 'chain tip');
      var rows = [];
      if (diff) {
        rows.push(['Difficulty period', Math.round(diff.progressPercent || 0) + '% complete', (diff.remainingBlocks != null ? Number(diff.remainingBlocks).toLocaleString('en-US') + ' blocks remaining' : '')]);
        if (diff.estimatedRetargetDate) rows.push(['Next adjustment', new Date(diff.estimatedRetargetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 'estimated']);
      }
      if (fees) rows.push(['Fee range', fees.hourFee + '\u2013' + fees.fastestFee + ' sat/vB', 'within the hour to next block']);
      if (blocks && blocks.length && blocks[0].timestamp) {
        var mins = Math.max(0, Math.round((Date.now() / 1000 - blocks[0].timestamp) / 60));
        rows.push(['Last block', mins + ' min ago', new Date(blocks[0].timestamp * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })]);
      }
      $('net-extra').innerHTML = '<header><h2>Detail</h2></header><div class="dgrid">' +
        rows.map(function (x) {
          return '<div class="dcell"><div class="k">' + esc(x[0]) + '</div><div class="v" style="font-size:17px">' + esc(x[1]) + '</div><div class="s">' + esc(x[2]) + '</div></div>';
        }).join('') + '</div><div class="venue"><span>Source: mempool.space</span><span>Updated ' + fmt.time(Date.now()) + '</span></div>';
      updated.network = Date.now(); stamp('network');
    }).catch(function (e) {
      $('net').innerHTML = '';
      $('net-extra').innerHTML = S.errorState('Network data unavailable', e.message, 'retry-n');
      updated.network = 'error'; stamp('network');
      var r = $('retry-n'); if (r) r.addEventListener('click', function () { loaded.network = false; show('network'); });
    });
  }

  function loadMacro() {
    $('macro').innerHTML = Array(6).join('x').split('x').map(function () { return '<div class="metric">' + S.skeleton(2, 16) + '</div>'; }).join('');
    fetch('/api/market', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        var want = ['USD/CAD', 'S&P 500', 'Nasdaq', 'Gold', 'WTI Oil', 'US 10Y'];
        var by = {}; d.quotes.forEach(function (q) { by[q.label] = q; });
        $('macro').innerHTML = want.filter(function (l) { return by[l]; }).map(function (l) {
          var q = by[l];
          var val = q.price === null ? '\u2014' : q.kind === 'pct' ? q.price.toFixed(2) + '%' : q.kind === 'fx' ? q.price.toFixed(4) : q.price.toLocaleString('en-US', { maximumFractionDigits: 2 });
          var mv = q.kind === 'pct' ? fmt.bps(q.changeAbs) : fmt.pct(q.changePct);
          var cls = fmt.dir(q.kind === 'pct' ? q.changeAbs : q.changePct);
          return '<div class="metric"><div class="k">' + esc(q.label) + '</div><div class="v">' + val + '</div><div class="s"><span class="' + cls + '">' + mv + '</span> \u00b7 ' + esc(q.source) + '</div>' +
            (q.spark && q.spark.length > 2 ? '<div style="margin-top:8px">' + S.spark(q.spark, cls, 100, 26) + '</div>' : '') + '</div>';
        }).join('');
        updated.macro = new Date(d.asOf).getTime(); stamp('macro');
      })
      .catch(function (e) {
        $('macro').innerHTML = '<div class="card">' + S.errorState('Macro data unavailable', e.message, 'retry-m') + '</div>';
        updated.macro = 'error'; stamp('macro');
        var r = $('retry-m'); if (r) r.addEventListener('click', function () { loaded.macro = false; show('macro'); });
      });
  }

  function money(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var sign = n < 0 ? '-' : n > 0 ? '+' : '';
    var abs = Math.abs(n);
    var body = abs >= 1e9 ? (abs/1e9).toFixed(2) + 'B' : abs >= 1e6 ? (abs/1e6).toFixed(1) + 'M' : abs >= 1e3 ? (abs/1e3).toFixed(0) + 'K' : abs.toFixed(0);
    return sign + '$' + body;
  }
  function moneyAbs(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var abs = Math.abs(n);
    var body = abs >= 1e9 ? (abs/1e9).toFixed(2) + 'B' : abs >= 1e6 ? (abs/1e6).toFixed(1) + 'M' : abs >= 1e3 ? (abs/1e3).toFixed(0) + 'K' : abs.toFixed(0);
    return '$' + body;
  }
  function flowBars(days) {
    var vals = days.map(function(d){ return d.flowUsd; }).filter(function(n){ return isFinite(n); });
    var max = Math.max.apply(null, vals.map(Math.abs).concat([1]));
    return '<div class="flowbar" aria-hidden="true">' + days.map(function(d){
      var h = Math.max(3, Math.round(Math.abs(d.flowUsd)/max*70));
      return '<i class="'+(d.flowUsd<0?'out':'')+'" style="height:'+h+'px" title="'+esc(d.date)+' '+money(d.flowUsd)+'"></i>';
    }).join('') + '</div>';
  }
  function loadInstitutional() {
    $('etf-kpis').innerHTML = Array(4).join('x').split('x').map(function(){ return '<div class="metric">'+S.skeleton(2,16)+'</div>'; }).join('');
    $('etf-tape').innerHTML = S.skeleton(4,16);
    $('etf-issuers').innerHTML = S.skeleton(4,16);
    $('etf-days').innerHTML = S.skeleton(6,14);
    fetch('/api/etf', { cache: 'no-store' })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return j; }); })
      .then(function(d){
        if (!d.days || !d.days.length) throw new Error(d.error || 'CoinGlass returned no sessions');
        var last = d.days[d.days.length-1];
        var five = d.days.slice(-5).reduce(function(s,x){ return s+(x.flowUsd||0); },0);
        var m = function(k,v,sub,cls){
          return '<div class="metric"><div class="k">'+esc(k)+'</div><div class="v '+(cls||'')+'">'+v+'</div><div class="s">'+esc(sub||'')+'</div></div>';
        };
        $('etf-kpis').innerHTML =
          m('Latest session', money(last.flowUsd), last.date + (last.flowUsd>=0?' net inflow':' net outflow'), fmt.dir(last.flowUsd)) +
          m('Five sessions', money(five), 'sum of the last five prints', fmt.dir(five)) +
          m('Cumulative net', money(d.cumulativeUsd), 'since the CoinGlass series begins', fmt.dir(d.cumulativeUsd)) +
          m('Reported AUM', moneyAbs(d.aumUsd), d.listCount ? d.listCount+' listed spot products' : 'issuer-reported assets');
        var recent = d.days.slice(-24);
        $('etf-tape').innerHTML = '<header><h2>Daily net flow</h2><span class="eyebrow">USD creations minus redemptions</span></header>' +
          flowBars(recent) +
          '<div class="venue"><span>Source: CoinGlass</span><span>'+esc(recent[0].date)+' \u2192 '+esc(recent[recent.length-1].date)+'</span></div>';
        var issuers = (d.issuers||[]).slice(0,8);
        $('etf-issuers').innerHTML = '<header><h2>Holdings snapshot</h2><span class="eyebrow">Issuer-reported</span></header>' +
          (issuers.length? issuers.map(function(x){
            return '<div class="issuer"><div><strong>'+esc(x.ticker)+'</strong><div class="s">'+esc(x.name||'')+'</div></div>' +
              '<div style="text-align:right"><div class="v" style="font-size:16px">'+moneyAbs(x.aumUsd)+'</div>' +
              '<div class="s">'+(x.btcHolding!=null? Number(x.btcHolding).toLocaleString('en-US',{maximumFractionDigits:0})+' BTC':'')+'</div></div></div>';
          }).join('') : '<p class="ctx">Issuer holdings were not included in this refresh.</p>') +
          '<div class="venue"><span>Updated '+fmt.time(d.asOf)+'</span></div>';
        var rows = d.days.slice(-12).reverse();
        $('etf-days').innerHTML = '<header><h2>Recent sessions</h2><span class="eyebrow">Largest prints named where CoinGlass breaks them out</span></header>' +
          '<div style="overflow-x:auto"><table class="etf-table"><thead><tr><th>Session</th><th>Net flow</th><th>Lead inflow</th><th>Lead outflow</th></tr></thead><tbody>' +
          rows.map(function(day){
            return '<tr><td>'+esc(day.date)+'</td><td class="'+fmt.dir(day.flowUsd)+'">'+money(day.flowUsd)+'</td><td>'+esc(day.leadIn || '\u2014')+'</td><td>'+esc(day.leadOut || '\u2014')+'</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="venue"><a href="https://www.coinglass.com/etf/bitcoin" target="_blank" rel="noopener noreferrer">Open CoinGlass ETF tape \u2197</a></div>';
        updated.institutional = new Date(d.asOf).getTime();
        stamp('institutional');
      })
      .catch(function(e){
        $('etf-kpis').innerHTML = '';
        $('etf-tape').innerHTML = S.errorState('ETF flow data unavailable', e.message, 'retry-i');
        $('etf-issuers').innerHTML = '';
        $('etf-days').innerHTML = '';
        updated.institutional = 'error'; stamp('institutional');
        var r = $('retry-i'); if (r) r.addEventListener('click', function(){ loaded.institutional=false; show('institutional'); });
      });
  }

  var LOAD = { derivatives: loadDerivatives, network: loadNetwork, macro: loadMacro, institutional: loadInstitutional };
  show('derivatives');
})();
