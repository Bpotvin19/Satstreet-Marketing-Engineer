(function () {
  'use strict';
  var Terminal = window.SATSTREET;
  if (!Terminal) return;
  Terminal.mountHeader('News');
  var $ = function (id) { return document.getElementById(id); };
  var esc = Terminal.esc;
  var market = {};
  var categoryMeta = [
    ['rates','Rates and dollar','Rates & FX','^TNX'],
    ['equities','Equities US + Canada','Equities','^GSPC'],
    ['metals','Precious metals','Metals','GC=F'],
    ['energy','Energy and commodities','Energy','CL=F'],
    ['crypto','Crypto tape only','Crypto','BTC-USD'],
    ['world','Trade / geopolitics / war / elections','World','CAD=X'],
    ['canada','Canada-specific','Canada','CAD=X']
  ];

  var demoPayload = {
    title:'Macro Desk — illustrative preview',
    date:new Date().toISOString().slice(0,10),
    status:'Preview',
    window:'Illustrative layout — not live desk content',
    sourceUrl:'',
    lastEdited:new Date().toISOString(),
    blocks:[
      {type:'heading_2',text:'A. World brief (8 lines)'},
      {type:'numbered_list_item',text:'Global risk sentiment is mixed as desks balance growth, inflation and policy signals.'},
      {type:'numbered_list_item',text:'Energy markets remain sensitive to supply headlines and shipping conditions.'},
      {type:'numbered_list_item',text:'Bond yields and the dollar are setting the tone for cross-asset positioning.'},
      {type:'numbered_list_item',text:'Equity leadership is narrow, keeping index-level strength and breadth in focus.'},
      {type:'heading_2',text:'B. Must-read'},
      {type:'numbered_list_item',text:'Rates reprice ahead of the next major data release',links:[{text:'BLS',href:'https://www.bls.gov/news.release/empsit.nr0.htm'}]},
      {type:'numbered_list_item',text:'Commodity desks assess the latest supply signals',links:[{text:'AP',href:'https://wtop.com/national/2026/09/us-diesel-prices-hit-a-record-high-of-5-85-on-average-as-the-iran-war-disrupts-the-flow-of-fuel/'}],image:'https://wtop.com/wp-content/uploads/2026/09/AP26247309335683.jpg'},
      {type:'numbered_list_item',text:'Digital assets trade with broader risk appetite',links:[{text:'CoinDesk',href:'https://www.coindesk.com/'}]},
      {type:'heading_2',text:'C. Industry tiles'},
      {type:'heading_3',text:'1. Rates and dollar'}, {type:'paragraph',text:'What: Sovereign yields and the dollar remain the key cross-asset inputs.'}, {type:'paragraph',text:'Why: Policy expectations are moving with each macro release.'}, {type:'paragraph',text:'Watch 72h: Central-bank speakers, labour data and the next inflation print.'},
      {type:'heading_3',text:'2. Equities US + Canada'}, {type:'paragraph',text:'What: Major indices are consolidating while sector leadership rotates.'}, {type:'paragraph',text:'Why: Rates and earnings expectations are pulling in opposite directions.'}, {type:'paragraph',text:'Watch 72h: Breadth, technology leadership and Canadian resource shares.'},
      {type:'heading_3',text:'3. Precious metals'}, {type:'paragraph',text:'What: Gold and silver are responding to real yields and haven demand.'}, {type:'paragraph',text:'Why: Dollar direction and geopolitical risk are competing catalysts.'}, {type:'paragraph',text:'Watch 72h: US yields, the dollar index and physical-flow headlines.'},
      {type:'heading_3',text:'4. Energy and commodities'}, {type:'paragraph',text:'What: Oil remains headline-sensitive with a wide intraday range.'}, {type:'paragraph',text:'Why: Supply discipline and transport risk keep the market two-way.'}, {type:'paragraph',text:'Watch 72h: Inventory data, producer guidance and shipping activity.'},
      {type:'heading_3',text:'5. Crypto tape only'}, {type:'paragraph',text:'What: Bitcoin and ether are trading with the broader risk complex.'}, {type:'paragraph',text:'Why: Liquidity and rates remain the dominant macro transmission channels.'}, {type:'paragraph',text:'Watch 72h: ETF flows, Nasdaq beta and weekend liquidity.'},
      {type:'heading_3',text:'6. Trade / geopolitics / war / elections'}, {type:'paragraph',text:'What: Policy and geopolitical headlines are driving short-duration volatility.'}, {type:'paragraph',text:'Why: Energy, inflation and trade channels connect news directly to markets.'}, {type:'paragraph',text:'Watch 72h: Official statements and material changes in policy.'},
      {type:'heading_3',text:'7. Canada-specific'}, {type:'paragraph',text:'What: The Canadian dollar is balancing domestic policy and global commodities.'}, {type:'paragraph',text:'Why: Rate differentials and energy prices remain the main drivers.'}, {type:'paragraph',text:'Watch 72h: Canadian data, Bank of Canada communication and USD/CAD.'},
      {type:'heading_2',text:'D. Calendar'}, {type:'table',children:[{type:'table_row',cells:[['Date'],['Event'],['Why Satstreet might care']]},{type:'table_row',cells:[['Tomorrow'],['Major economic release'],['USD, yields and digital-asset beta']]},{type:'table_row',cells:[['This week'],['Central-bank communication'],['Rates and FX positioning']]},{type:'table_row',cells:[['This week'],['Commodity supply update'],['Energy and inflation expectations']]}]},
      {type:'heading_2',text:'E. Satstreet so-what'},
      {type:'bulleted_list_item',text:'Focus client conversations on liquidity, correlation and the path of rates.'},
      {type:'bulleted_list_item',text:'Keep digital-asset moves framed within the broader cross-asset tape.'},
      {type:'bulleted_list_item',text:'Separate confirmed developments from headline risk and speculation.'}
    ]
  };

  function parse(payload) {
    var out = { world:[], reads:[], sectors:{}, calendar:[], so:[] }, section='', sector=null;
    (payload.blocks || []).forEach(function (b) {
      var text = b.text || '';
      if (b.type === 'heading_2') {
        section = /^A\./.test(text)?'world':/^B\./.test(text)?'reads':/^C\./.test(text)?'sectors':/^D\./.test(text)?'calendar':/^E\./.test(text)?'so':'';
        sector=null; return;
      }
      if (section === 'sectors' && b.type === 'heading_3') { sector = text.replace(/^\d+\.\s*/, ''); out.sectors[sector] = []; return; }
      if (section === 'world' && b.type === 'numbered_list_item') out.world.push(text);
      if (section === 'reads' && (b.type === 'numbered_list_item' || b.type === 'bulleted_list_item')) out.reads.push({text:text,links:b.links||[],image:b.image||''});
      if (section === 'sectors' && sector && text) out.sectors[sector].push(text);
      if (section === 'so' && b.type === 'bulleted_list_item') out.so.push(text);
      if (section === 'calendar' && b.type === 'table' && b.children) {
        b.children.forEach(function (r,i) { if (i) out.calendar.push((r.cells||[]).map(function(c){return c[0]||'';})); });
      }
    });
    return out;
  }

  function price(q) {
    if (!q || q.price == null) return 'Reference unavailable';
    if (q.kind === 'fx') return q.price.toFixed(4);
    if (q.kind === 'pct') return q.price.toFixed(2) + '%';
    return '$' + q.price.toLocaleString('en-US',{maximumFractionDigits:q.price<100?2:0});
  }
  function sectorKey(name) {
    var low=name.toLowerCase();
    return categoryMeta.find(function(m){return low.indexOf(m[1].toLowerCase())>=0;}) || ['other',name,name,''];
  }
  function sectorIcon(key) {
    var paths={rates:'<path d="M4 18h16M6 15h12M8 12h8M12 4l8 5H4z"/>',equities:'<path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/>',metals:'<path d="m12 3 8 15H4z"/><path d="M8 14h8"/>',energy:'<path d="M12 3c5 7 7 10 7 14a7 7 0 0 1-14 0c0-4 2-7 7-14z"/>',crypto:'<circle cx="12" cy="12" r="8"/><path d="M9 8h5a2 2 0 0 1 0 4H9m0 0h6a2 2 0 0 1 0 4H9m3-10v12"/>',world:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',canada:'<path d="m12 3 2 4 3-1-1 4 3 2-4 2 1 4-4-2-4 2 1-4-4-2 3-2-1-4 3 1z"/>'};
    return '<span class="sector-icon '+key+'" aria-hidden="true"><svg viewBox="0 0 24 24">'+(paths[key]||paths.world)+'</svg></span>';
  }

  function hydrateThumbs(reads) {
    var key = window.__newsKey || sessionStorage.getItem('satstreet.news.key') || '';
    var urls = (reads || []).map(function(r){ return (r.links && r.links[0] && r.links[0].href) || ''; }).filter(Boolean);
    if (!key || !urls.length) return;
    fetch('/api/news-thumbs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-terminal-key': key },
      body: JSON.stringify({ urls: urls })
    }).then(function(r){ return r.json(); }).then(function(d){
      var map = (d && d.thumbs) || {};
      document.querySelectorAll('#reads .read[data-article]').forEach(function(n){
        var href = n.getAttribute('data-article') || '';
        var src = map[href];
        if (!src) return;
        var box = n.querySelector('.read-thumb');
        if (!box) return;
        box.innerHTML = '<img src="/api/news-image?u=' + encodeURIComponent(src) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
      });
    }).catch(function(){});
  }

  function render(payload, preview) {
    var d=parse(payload);
    $('world-list').innerHTML=(d.world.length?d.world:['No world brief was included in this edition.']).map(function(x){return '<li>'+esc(x)+'</li>';}).join('');
    $('read-count').textContent=d.reads.length+' items';
    $('reads').innerHTML=(d.reads.length?d.reads:[{text:'No must-read list was included.',links:[],image:''}]).slice(0,7).map(function(r){
      var href=(r.links[0]||{}).href||'';
      if(!href){ var m=(r.text||'').match(/https?:\/\/[^\s)>\]]+/); href=m?m[0]:''; }
      var host='Desk briefing';
      try { if(href) host=new URL(href).hostname.replace(/^www\./,''); } catch (e) {}
      var mark=(host.split('.')[0]||'Desk').slice(0,8);
      var thumb = r.image
        ? '<img src="'+esc(r.image)+'" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.hidden=false;">'+'<span class="mark" hidden>'+esc(mark)+'</span>'
        : '<span class="mark">'+esc(mark)+'</span>';
      var open = href ? ' href="'+esc(href)+'" target="_blank" rel="noopener noreferrer"' : '';
      var title = href
        ? '<a class="headline" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(r.text)+'</a>'
        : '<a class="headline">'+esc(r.text)+'</a>';
      return '<div class="read" data-article="'+esc(href)+'"><a class="read-thumb"'+open+' aria-hidden="true">'+thumb+'</a><div>'+title+'<small>'+esc(host)+'</small></div></div>';
    }).join('');
    var sectors=Object.keys(d.sectors).map(function(name){ var meta=sectorKey(name), lines=d.sectors[name], q=market[meta[3]], parts={what:'',why:'',watch:''}; lines.forEach(function(line){var m=line.match(/^(What|Why|Watch 72h):\s*(.*)$/i); if(m) parts[m[1].toLowerCase().split(' ')[0]]=m[2];}); return {key:meta[0],label:meta[2],name:name,q:q,parts:parts}; });
    $('filters').innerHTML=[['all','All sectors']].concat(categoryMeta.map(function(m){return [m[0],m[2]];})).map(function(f,i){return '<button class="filter" type="button" data-filter="'+f[0]+'" aria-pressed="'+(i===0)+'">'+(f[0]==='all'?'':sectorIcon(f[0]))+esc(f[1])+'</button>';}).join('');
    $('sectors').innerHTML=sectors.map(function(s){var cls=s.q&&s.q.changePct<0?'down':'up'; return '<article class="card sector visual-card" data-sector="'+esc(s.key)+'"><div class="sector-head"><div class="sector-title">'+sectorIcon(s.key)+'<div><p class="sector-kicker">'+esc(s.label)+'</p><h2>'+esc(s.name)+'</h2></div></div><div class="sector-market"><span class="value data-face">'+esc(price(s.q))+'</span>'+(s.q?Terminal.spark(s.q.spark,cls,150,42):'')+'</div></div><div class="sector-body"><div class="intel"><b>What</b><span>'+esc(s.parts.what||'No tape summary in this edition.')+'</span></div><div class="intel"><b>Why</b><span>'+esc(s.parts.why||'No driver note in this edition.')+'</span></div><div class="intel"><b>Watch</b><span>'+esc(s.parts.watch||'No 72-hour watch item in this edition.')+'</span></div></div></article>';}).join('');
    $('calendar').innerHTML=(d.calendar.length?d.calendar:[['\u2014','No calendar included','\u2014']]).map(function(r){return '<tr><td>'+esc(r[0]||'')+'</td><td>'+esc(r[1]||'')+'</td><td>'+esc(r[2]||'')+'</td></tr>';}).join('');
    $('so-list').innerHTML=(d.so.length?d.so:['No Satstreet lens was included in this edition.']).map(function(x){return '<li>'+esc(x)+'</li>';}).join('');
    $('source-meta').textContent=(preview?'Illustrative preview':'Notion \u00b7 '+(payload.status||'Status not set'))+' \u00b7 '+(payload.window||payload.date||'');
    $('source-link').hidden=!payload.sourceUrl; $('source-link').href=payload.sourceUrl||'#';
    $('desk').hidden=false; $('gate').hidden=true; $('lock').hidden=preview;
    $('news-pip').className='pip '+(preview?'warn':'ok'); $('news-state').textContent=preview?'Illustrative layout':'Updated from Notion \u00b7 '+new Date(payload.lastEdited).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    document.querySelectorAll('.filter').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.filter').forEach(function(b){b.setAttribute('aria-pressed',String(b===btn));}); document.querySelectorAll('.sector').forEach(function(card){card.hidden=btn.dataset.filter!=='all'&&card.dataset.sector!==btn.dataset.filter;});});});
    if (!preview) hydrateThumbs(d.reads);
  }

  function loadMarket() { return fetch('/api/market').then(function(r){return r.ok?r.json():{quotes:[]};}).then(function(d){(d.quotes||[]).forEach(function(q){market[q.symbol]=q;});}).catch(function(){}); }
  function unlock(key) {
    $('gate-error').textContent=''; $('news-state').textContent='Loading Macro Desk\u2026';
    return fetch('/api/news',{headers:{'x-terminal-key':key},cache:'no-store'}).then(function(r){return r.json().then(function(j){if(!r.ok) throw new Error(j.error||'Unable to load the feed.'); return j;});}).then(function(d){sessionStorage.setItem('satstreet.news.key',key); window.__newsKey=key; render(d,false);}).catch(function(e){$('news-pip').className='pip bad'; $('news-state').textContent='Protected Notion feed'; $('gate-error').textContent=e.message;});
  }
  $('gate-form').addEventListener('submit',function(e){e.preventDefault(); var key=$('access-key').value.trim(); if(key) unlock(key);});
  $('demo').addEventListener('click',function(){render(demoPayload,true);});
  $('lock').addEventListener('click',function(){sessionStorage.removeItem('satstreet.news.key'); $('desk').hidden=true; $('gate').hidden=false; $('lock').hidden=true; $('news-pip').className='pip'; $('news-state').textContent='Protected Notion feed'; $('access-key').value='';});
  loadMarket().then(function(){var key=sessionStorage.getItem('satstreet.news.key'); if(key) unlock(key);});
})();
