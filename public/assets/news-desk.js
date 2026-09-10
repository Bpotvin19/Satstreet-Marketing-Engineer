/* Macro Desk renderer.

   The Notion page written by satstreet-macro-desk each morning is the only
   source for this page. Section headings carry the contract:

     0. Breaking            paragraphs        (omitted on normal days)
     A. Overnight           paragraphs
     B. Today's five        numbered items + What / Desk read children
     C. Lane check          heading_3 per lane + What / Why / Watch
     D. Calendar            table or list
     F. On the wire         bullets
     G. Not in today's brief bullets

   Headings are matched on either the letter prefix or the words, and the
   earlier contract (A. World brief / B. Must-read / C. Industry tiles) still
   parses, so an edition written before the prompt changed still renders.

   "Top news this week" is the exception: it comes from Thursday's Weekly
   Newsletter Research page, delivered on the same payload as `weekly`, and
   reads that page's "1. WEEK IN ONE PAGE" list.

   Prices are never read from the brief. The tape and the per-lane quotes come
   from /api/market so a number on this page is always a live one.
*/
(function () {
  'use strict';
  var Terminal = window.SATSTREET;
  if (!Terminal) return;
  Terminal.mountHeader('News');
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (value) { return Terminal.esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var market = {};
  var marketAsOf = '';
  var STORAGE_KEY = 'satstreet.news.key';

  function storedKey() {
    try { return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || ''; }
    catch (e) { return sessionStorage.getItem(STORAGE_KEY) || ''; }
  }

  function rememberKey(key, persist) {
    sessionStorage.setItem(STORAGE_KEY, key);
    try {
      if (persist) localStorage.setItem(STORAGE_KEY, key);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function forgetKey() {
    sessionStorage.removeItem(STORAGE_KEY);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    window.__newsKey = '';
  }

  /* Section heading -> bucket. Tested in order; first match wins. */
  var SECTIONS = [
    ['breaking', /^0\.|breaking/i],
    ['overnight', /^A\.|overnight|world brief/i],
    ['stories',  /^B\.|today'?s five|top five|must.?read/i],
    ['lanes',    /^C\.|lane check|industry tile|sector/i],
    ['calendar', /^D\.|calendar/i],
    ['wire',     /^F\.|on the wire|x signal|social/i],
    ['excluded', /^G\.|not in (today|the)|excluded|left out/i]
  ];

  /* Lane key, canonical label, filter chip, tape symbol, name matcher.
     Order matters: geopolitics is tested before fiscal so "geopolitics"
     does not get caught by "politics". */
  var laneMeta = [
    ['crypto',      'Crypto and digital assets', 'Crypto',      'BTC-USD', /crypto|digital asset|bitcoin/i],
    ['ai',          'Frontier AI',               'Frontier AI', '^IXIC',   /\bai\b|frontier|artificial/i],
    ['commodities', 'Commodities and energy',    'Commodities', 'GC=F',    /commodit|energy|metal|gold|oil|precious/i],
    ['rates',       'Central banks and rates',   'Rates & FX',  '^TNX',    /rate|central bank|dollar|\bfx\b|yield/i],
    ['canada',      'Canada',                    'Canada',      'CAD=X',   /^canada/i],
    ['world',       'Geopolitics',               'Geopolitics', 'CL=F',    /geopolit|trade|war|election|world/i],
    ['fiscal',      'US politics and fiscal',    'US fiscal',   '^GSPC',   /fiscal|politic|washington|equit/i]
  ];

  var TAPE_ORDER = ['BTC-USD', 'ETH-USD', 'GC=F', 'CL=F', 'CAD=X', '^TNX', '^GSPC', '^IXIC'];
  var QUIET = /^(nothing material|nothing|none|no material|n\/a|—|-)\.?$/i;

  /* Illustrative quotes, used only by "View illustrative layout" and regardless of live feed availability. Shaped, not random, so the preview is stable. */
  function demoSpark(base, drift) {
    var out = [], v = base;
    for (var i = 0; i < 24; i += 1) {
      v = v * (1 + Math.sin(i * 0.7) * 0.004 + drift / 2400);
      out.push(v);
    }
    return out;
  }

  var demoMarket = {
    'BTC-USD': { symbol: 'BTC-USD', label: 'Bitcoin', price: 78500, changePct: 1.24, kind: 'usd', spark: demoSpark(77500, 1.2) },
    'ETH-USD': { symbol: 'ETH-USD', label: 'Ethereum', price: 2980, changePct: 0.86, kind: 'usd', spark: demoSpark(2955, 0.9) },
    'GC=F': { symbol: 'GC=F', label: 'Gold', price: 2412.4, changePct: 0.31, kind: 'usd', spark: demoSpark(2405, 0.3) },
    'CL=F': { symbol: 'CL=F', label: 'WTI Oil', price: 74.18, changePct: -0.72, kind: 'usd', spark: demoSpark(74.7, -0.7) },
    'CAD=X': { symbol: 'CAD=X', label: 'USD/CAD', price: 1.3642, changePct: 0.09, kind: 'fx', spark: demoSpark(1.3630, 0.1) },
    '^TNX': { symbol: '^TNX', label: 'US 10Y', price: 4.21, changePct: -0.44, kind: 'pct', spark: demoSpark(4.23, -0.4) },
    '^GSPC': { symbol: '^GSPC', label: 'S&P 500', price: 5487, changePct: 0.28, kind: 'level', spark: demoSpark(5472, 0.3) },
    '^IXIC': { symbol: '^IXIC', label: 'Nasdaq', price: 17842, changePct: 0.51, kind: 'level', spark: demoSpark(17752, 0.5) }
  };

  var demoPayload = {
    title: 'Macro Desk — illustrative preview',
    date: new Date().toISOString().slice(0, 10),
    status: 'Preview',
    window: 'Illustrative layout — not live desk content',
    sourceUrl: '',
    lastEdited: new Date().toISOString(),
    weekly: {
      title: 'Weekly Newsletter Research — illustrative',
      window: 'Thu → Thu',
      sourceUrl: '',
      blocks: [
        { type: 'heading_2', text: '1. WEEK IN ONE PAGE' },
        { type: 'numbered_list_item', lead: 'Oil through $100 on Gulf shipping risk', text: 'Oil through $100 on Gulf shipping risk — tanker attacks near Hormuz pushed Brent and WTI to their highest closes since May. (Reuters / AP)' },
        { type: 'numbered_list_item', lead: 'Canada–US trade spiral', text: 'Canada–US trade spiral — retaliatory tariffs took effect and further import bans were proclaimed for the end of the month. (Reuters)' },
        { type: 'numbered_list_item', lead: 'Hot pipeline inflation into the FOMC', text: 'Hot pipeline inflation into the FOMC — producer prices ran ahead of the annual target with CPI still to come. (BLS / AP)' },
        { type: 'numbered_list_item', lead: 'ECB raises by 25 basis points', text: 'ECB raises by 25 basis points — the deposit facility moved on energy inflation. (ECB)' },
        { type: 'numbered_list_item', lead: 'Large sidechain exploit', text: 'Large sidechain exploit — a bitcoin sidechain lost several thousand coins, most later returned, with a restart under way. (Chainalysis / TRM)' },
        { type: 'numbered_list_item', lead: 'Exchange tokenization capital', text: 'Exchange tokenization capital — a major venue took a nine-figure strategic investment for tokenized equities infrastructure. (Reuters / CNBC)' },
        { type: 'heading_2', text: '2. FRONTIER AI' },
        { type: 'numbered_list_item', text: 'Not part of the ranked section.' }
      ]
    },
    blocks: [
      { type: 'heading_2', text: 'A. Overnight' },
      { type: 'paragraph', text: 'Asia traded the session on light volume with the dollar firm into the European open. Risk assets held their range and there was no single dominant driver overnight.' },
      { type: 'paragraph', text: 'Digital assets tracked the broader complex. Funding stayed neutral and there were no forced-liquidation clusters worth flagging.' },

      { type: 'heading_2', text: "B. Today's five" },
      { type: 'numbered_list_item', text: 'Central bank communication keeps rate expectations two-way', links: [{ text: 'Reuters', href: 'https://www.reuters.com' }] },
      { type: 'paragraph', text: 'What: Officials repeated that policy will follow the data rather than a set path.' },
      { type: 'paragraph', text: 'Desk read: Rate volatility is the main transmission channel into digital-asset beta. Expect treasury clients to ask about timing.' },
      { type: 'numbered_list_item', text: 'Spot ETF flows turn positive for a third session', links: [{ text: 'Reuters', href: 'https://www.reuters.com' }] },
      { type: 'paragraph', text: 'What: Net creations continued across the largest US listings.' },
      { type: 'paragraph', text: 'Desk read: Persistent creations tighten borrow and can widen quoted spreads on size. Worth checking before quoting large blocks.' },
      { type: 'numbered_list_item', text: 'Gold holds near its recent range high', links: [{ text: 'Reuters', href: 'https://www.reuters.com' }] },
      { type: 'paragraph', text: 'What: Bullion stayed bid as real yields eased slightly.' },
      { type: 'paragraph', text: 'Desk read: The debasement trade is being expressed in metals as much as in bitcoin. Useful framing for treasury conversations.' },
      { type: 'numbered_list_item', text: 'Canadian regulators publish updated platform guidance', links: [{ text: 'Reuters', href: 'https://www.reuters.com' }] },
      { type: 'paragraph', text: 'What: The notice restates existing expectations for registered platforms.' },
      { type: 'paragraph', text: 'Desk read: Directly relevant to the desk. Compliance should confirm nothing in the notice changes current practice.' },
      { type: 'numbered_list_item', text: 'Large model release lands with an enterprise focus', links: [{ text: 'Reuters', href: 'https://www.reuters.com' }] },
      { type: 'paragraph', text: 'What: A frontier lab shipped a new model aimed at enterprise deployment.' },
      { type: 'paragraph', text: 'Desk read: Context only. Watch the datacenter and power read-through rather than the model itself.' },

      { type: 'heading_2', text: 'C. Lane check' },
      { type: 'heading_3', text: '1. Crypto and digital assets' },
      { type: 'paragraph', text: 'What: Majors traded with the broader risk complex and flows stayed orderly.' },
      { type: 'paragraph', text: 'Why: Liquidity and rate expectations remain the dominant macro channel.' },
      { type: 'paragraph', text: 'Watch: ETF creations, weekend liquidity and funding.' },
      { type: 'heading_3', text: '2. Canada' },
      { type: 'paragraph', text: 'What: The Canadian dollar balanced domestic policy against global commodities.' },
      { type: 'paragraph', text: 'Why: Rate differentials and energy prices remain the main drivers.' },
      { type: 'paragraph', text: 'Watch: Bank of Canada communication and USD/CAD.' },
      { type: 'heading_3', text: '3. US politics and fiscal' },
      { type: 'paragraph', text: 'What: Fiscal proposals continue to circulate without enacted changes.' },
      { type: 'paragraph', text: 'Why: Issuance and deficit expectations feed directly into yields.' },
      { type: 'paragraph', text: 'Watch: Treasury refunding commentary. PROPOSAL — NOT ENACTED.' },
      { type: 'heading_3', text: '4. Central banks and rates' },
      { type: 'paragraph', text: 'What: Front-end pricing was little changed on the session.' },
      { type: 'paragraph', text: 'Why: Officials have not committed to a path.' },
      { type: 'paragraph', text: 'Watch: Speakers, labour data and the next inflation print.' },
      { type: 'heading_3', text: '5. Commodities and energy' },
      { type: 'paragraph', text: 'What: Gold held its range and crude stayed headline-sensitive.' },
      { type: 'paragraph', text: 'Why: Real yields and supply discipline are competing catalysts.' },
      { type: 'paragraph', text: 'Watch: Inventories and the dollar index.' },
      { type: 'heading_3', text: '6. Geopolitics' },
      { type: 'paragraph', text: 'Nothing material' },
      { type: 'heading_3', text: '7. Frontier AI' },
      { type: 'paragraph', text: 'What: Capital expenditure guidance continues to run ahead of prior estimates.' },
      { type: 'paragraph', text: 'Why: Compute and power demand connect the theme to energy and rates.' },
      { type: 'paragraph', text: 'Watch: Datacenter announcements and utility filings.' },

      { type: 'heading_2', text: 'D. Calendar' },
      { type: 'table', children: [
        { type: 'table_row', cells: [['Date'], ['Event'], ['Why Satstreet might care']] },
        { type: 'table_row', cells: [['Tomorrow'], ['Major economic release'], ['USD, yields and digital-asset beta']] },
        { type: 'table_row', cells: [['This week'], ['Central-bank communication'], ['Rates and FX positioning']] },
        { type: 'table_row', cells: [['This week'], ['Commodity supply update'], ['Energy and inflation expectations']] }
      ] },

      { type: 'heading_2', text: 'E. Satstreet so-what' },
      { type: 'bulleted_list_item', text: 'Treasury clients are most likely to ask about rate timing today.' },
      { type: 'bulleted_list_item', text: 'Miners with CAD costs and USD revenue stay sensitive to USD/CAD here.' },
      { type: 'bulleted_list_item', text: 'Nothing overnight changes how the desk should quote size.' },

      { type: 'heading_2', text: 'F. On the wire' },
      { type: 'bulleted_list_item', text: 'UNVERIFIED — X ONLY: A widely shared post claims a large custody migration. No filing or statement confirms it yet.' },
      { type: 'bulleted_list_item', text: 'Desk conversation today is mostly about the gold and bitcoin relationship.' },

      { type: 'heading_2', text: "G. Not in today's brief" },
      { type: 'bulleted_list_item', text: 'Minor exchange listing — no desk impact' },
      { type: 'bulleted_list_item', text: 'Equity earnings beat — outside desk scope' }
    ]
  };

  /* ---------- parsing ---------- */

  function sectionOf(text) {
    for (var i = 0; i < SECTIONS.length; i += 1) {
      if (SECTIONS[i][1].test(text)) return SECTIONS[i][0];
    }
    return '';
  }

  function isListItem(type) {
    return type === 'numbered_list_item' || type === 'bulleted_list_item';
  }

  var LABEL = /^\s*(what happened|what|why|watch(?:\s*72h)?|desk read|so.?what|source|headline)\s*[:–—-]\s*(.*)$/i;

  function labelled(text) {
    var m = (text || '').match(LABEL);
    if (!m) return null;
    var key = m[1].toLowerCase();
    if (key === 'what happened') key = 'what';
    if (key === 'watch 72h') key = 'watch';
    if (key === 'so-what' || key === 'sowhat' || key === 'so what') key = 'desk read';
    return { key: key, value: m[2].trim() };
  }

  /* A story's What / Desk read may arrive as Notion children of the list item
     or as sibling paragraphs after it. Both are accepted. */
  function absorb(story, block) {
    var tag = labelled(block.text || '');
    if (!tag) return false;
    if (tag.key === 'what') story.what = tag.value;
    else if (tag.key === 'desk read') story.deskRead = tag.value;
    else if (tag.key === 'source' && !story.links.length && block.links && block.links.length) story.links = block.links;
    else return false;
    return true;
  }

  /* Editions written before the contract settled put the source URL in the
     headline text and run several sentences together. Trim the URL and let
     the first sentence be the headline. */
  function tidyHeadline(text) {
    return text.replace(/\s*[[(]?\s*https?:\/\/\S+\s*[\])]?\s*$/i, '').trim();
  }

  function splitLongHeadline(story) {
    if (story.what || story.headline.length <= 130) return;
    var cut = story.headline.match(/^(.{40,160}?[.!?])\s+(\S[\s\S]*)$/);
    if (!cut) return;
    story.headline = cut[1];
    story.what = cut[2];
  }

  function parse(payload) {
    var out = { breaking: [], overnight: [], stories: [], lanes: [], calendar: [], wire: [], excluded: [], wireTitle: '' };
    var section = '';
    var lane = null;
    var story = null;

    (payload.blocks || []).forEach(function (b) {
      var text = (b.text || '').trim();

      if (b.type === 'heading_2') {
        section = sectionOf(text);
        if (section === 'wire') out.wireTitle = text.replace(/^[0A-Z]\.\s*/, '');
        lane = null;
        story = null;
        return;
      }

      if (section === 'lanes' && b.type === 'heading_3') {
        lane = { name: text.replace(/^\d+[.)]\s*/, ''), what: '', why: '', watch: '', quiet: false };
        out.lanes.push(lane);
        return;
      }

      if (section === 'breaking' && text) { out.breaking.push(text); return; }

      if (section === 'overnight' && text) { out.overnight.push(text); return; }

      if (section === 'stories') {
        if (isListItem(b.type)) {
          var headline = tidyHeadline(text.replace(/^\s*headline\s*[:–—-]\s*/i, ''));
          story = { headline: headline, what: '', deskRead: '', links: b.links || [] };
          (b.children || []).forEach(function (child) { absorb(story, child); });
          out.stories.push(story);
          return;
        }
        if (story && text) absorb(story, b);
        return;
      }

      if (section === 'lanes' && lane && text) {
        if (QUIET.test(text)) { lane.quiet = true; return; }
        var tag = labelled(text);
        if (tag && (tag.key === 'what' || tag.key === 'why' || tag.key === 'watch')) { lane[tag.key] = tag.value; return; }
        if (lane.what) return;
        /* An unlabelled lane paragraph often still ends with its own
           "Watch: ..." sentence. Lift it rather than losing it in the body. */
        var tail = text.match(/^([\s\S]*?)[\s.]*\bWatch(?:\s*72h)?:\s*([\s\S]+)$/i);
        if (tail) { lane.what = tail[1].trim(); lane.watch = tail[2].trim(); }
        else lane.what = text;
        return;
      }

      if (section === 'calendar') {
        if (b.type === 'table' && b.children) {
          b.children.forEach(function (row, i) {
            if (i) out.calendar.push((row.cells || []).map(function (c) { return c[0] || ''; }));
          });
          return;
        }
        /* Editions that write the calendar as a list instead of a table:
           "Fri 11 Sep 08:30 ET: US CPI ...". Split on the first colon that
           is followed by a space, so clock times stay intact. */
        if (isListItem(b.type) && text) {
          var row = text.match(/^(.{1,64}?):\s+([\s\S]+)$/);
          out.calendar.push(row ? [row[1].trim(), row[2].trim(), ''] : ['', text, '']);
        }
        return;
      }

      if (section === 'wire' && isListItem(b.type) && text) out.wire.push(text);
      if (section === 'excluded' && isListItem(b.type) && text) out.excluded.push(text);
    });

    out.stories.forEach(splitLongHeadline);
    return out;
  }

  /* ---------- formatting ---------- */

  function price(q) {
    if (!q || q.price == null) return '—';
    var p = q.price;
    if (q.kind === 'fx') return p.toFixed(4);
    if (q.kind === 'pct') return p.toFixed(2) + '%';
    if (q.kind === 'level') return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return '$' + p.toLocaleString('en-US', { maximumFractionDigits: p < 100 ? 2 : 0 });
  }

  function change(q) {
    if (!q) return { cls: 'flat', text: '—' };
    if (q.kind === 'pct' && q.changeAbs != null) {
      var bps = Math.round(q.changeAbs * 100);
      return { cls: bps > 0 ? 'up' : (bps < 0 ? 'down' : 'flat'), text: (bps > 0 ? '+' : '') + bps + ' bps' };
    }
    if (q.changePct == null) return { cls: 'flat', text: '—' };
    var v = q.changePct;
    var cls = v > 0.005 ? 'up' : (v < -0.005 ? 'down' : 'flat');
    return { cls: cls, text: (v > 0 ? '+' : '') + v.toFixed(2) + '%' };
  }

  function laneKey(name) {
    for (var i = 0; i < laneMeta.length; i += 1) {
      if (laneMeta[i][4].test(name)) return laneMeta[i];
    }
    return ['other', name, name, '', null];
  }

  function laneIcon(key) {
    var paths = {
      rates: '<path d="M4 18h16M6 15h12M8 12h8M12 4l8 5H4z"/>',
      fiscal: '<path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
      commodities: '<path d="m12 3 8 15H4z"/><path d="M8 14h8"/>',
      ai: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
      crypto: '<circle cx="12" cy="12" r="8"/><path d="M9 8h5a2 2 0 0 1 0 4H9m0 0h6a2 2 0 0 1 0 4H9m3-10v12"/>',
      world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
      canada: '<path d="m12 3 2 4 3-1-1 4 3 2-4 2 1 4-4-2-4 2 1-4-4-2 3-2-1-4 3 1z"/>'
    };
    return '<span class="sector-icon ' + key + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + (paths[key] || paths.world) + '</svg></span>';
  }

  function hostOf(href) {
    try { return href ? new URL(href).hostname.replace(/^www\./, '') : ''; }
    catch (e) { return ''; }
  }

  function hydrateThumbs(stories) {
    var key = window.__newsKey || storedKey();
    var urls = (stories || []).map(function (s) {
      return (s.links && s.links[0] && s.links[0].href) || '';
    }).filter(Boolean);
    if (!key || !urls.length) return;
    fetch('/api/news-thumbs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-terminal-key': key },
      body: JSON.stringify({ urls: urls })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var map = (d && d.thumbs) || {};
      document.querySelectorAll('#stories .story[data-article]').forEach(function (n) {
        var src = map[n.getAttribute('data-article') || ''];
        if (!src) return;
        var box = n.querySelector('.story-thumb');
        if (!box) return;
        box.innerHTML = '<img src="/api/news-image?u=' + encodeURIComponent(src) +
          '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
      });
    }).catch(function () {});
  }

  /* ---------- rendering ---------- */

  function renderTape() {
    var symbols = TAPE_ORDER.filter(function (s) { return market[s]; });
    if (!symbols.length) { $('tape').hidden = true; return; }
    $('tape').hidden = false;
    $('tape').innerHTML = symbols.map(function (s) {
      var q = market[s];
      var c = change(q);
      return '<div class="tick">' +
        '<span class="sym">' + esc(q.label || s) + '</span>' +
        '<span class="px data-face">' + esc(price(q)) + '</span>' +
        '<span class="chg ' + c.cls + ' data-face">' + esc(c.text) + '</span>' +
        (q.spark && q.spark.length ? Terminal.spark(q.spark, c.cls === 'down' ? 'down' : 'up', 110, 24) : '') +
        '</div>';
    }).join('');
  }

  function renderStories(stories) {
    $('story-count').textContent = stories.length ? Math.min(stories.length, 5) + ' shown' + (stories.length > 5 ? ' · ' + stories.length + ' in source' : '') : '';
    if (!stories.length) {
      $('stories').innerHTML = '<p class="quiet-lane">No ranked stories were included in this edition.</p>';
      return;
    }
    $('stories').innerHTML = stories.slice(0, 5).map(function (s, i) {
      var href = (s.links[0] || {}).href || '';
      if (!href) {
        var m = (s.headline || '').match(/https?:\/\/[^\s)>\]]+/);
        href = m ? m[0] : '';
      }
      var host = hostOf(href);
      var mark = ((host.split('.')[0]) || 'Desk').slice(0, 8);
      var open = href ? ' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"' : '';
      var headline = href
        ? '<a class="headline" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(s.headline) + '</a>'
        : '<a class="headline">' + esc(s.headline) + '</a>';
      return '<article class="story" data-article="' + esc(href) + '">' +
        '<span class="rank data-face">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
        '<a class="story-thumb"' + open + ' aria-hidden="true" tabindex="-1"><span class="mark">' + esc(mark) + '</span></a>' +
        '<div class="story-main">' + headline +
        '<span class="outlet">' + esc(host || 'Desk briefing') + '</span>' +
        (s.what ? '<p class="what">' + esc(s.what) + '</p>' : '') +
        (s.deskRead ? '<p class="deskread"><b>Desk read</b><span>' + esc(s.deskRead) + '</span></p>' : '') +
        '</div></article>';
    }).join('');
  }

  function renderLanes(lanes) {
    var cards = lanes.map(function (lane) {
      var meta = laneKey(lane.name);
      return { key: meta[0], chip: meta[2], name: lane.name, q: market[meta[3]], lane: lane };
    });

    var present = {};
    cards.forEach(function (c) { present[c.key] = true; });
    var chips = [['all', 'All lanes']].concat(laneMeta.filter(function (m) { return present[m[0]]; })
      .map(function (m) { return [m[0], m[2]]; }));

    $('filters').innerHTML = chips.map(function (f, i) {
      return '<button class="filter" type="button" data-filter="' + esc(f[0]) + '" aria-pressed="' + (i === 0) + '">' +
        (f[0] === 'all' ? '' : laneIcon(f[0])) + esc(f[1]) + '</button>';
    }).join('');

    $('sectors').innerHTML = cards.map(function (c) {
      var cls = c.q && c.q.changePct < 0 ? 'down' : 'up';
      var body = c.lane.quiet
        ? '<p class="quiet-lane">Nothing material in this lane today.</p>'
        : '<div class="intel"><b>What</b><span>' + esc(c.lane.what || 'No tape summary in this edition.') + '</span></div>' +
          '<div class="intel"><b>Why</b><span>' + esc(c.lane.why || 'No driver note in this edition.') + '</span></div>' +
          '<div class="intel"><b>Watch</b><span>' + esc(c.lane.watch || 'No watch item in this edition.') + '</span></div>';
      return '<article class="card sector visual-card" data-sector="' + esc(c.key) + '">' +
        '<div class="sector-head"><div class="sector-title">' + laneIcon(c.key) +
        '<div><p class="sector-kicker">' + esc(c.chip) + '</p><h2>' + esc(c.name) + '</h2></div></div>' +
        '<div class="sector-market"><span class="value data-face">' + esc(price(c.q)) + '</span>' +
        (c.q && c.q.spark && c.q.spark.length ? Terminal.spark(c.q.spark, cls, 150, 42) : '') + '</div></div>' +
        '<div class="sector-body">' + body + '</div></article>';
    }).join('');

    document.querySelectorAll('.filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.filter').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        document.querySelectorAll('.sector').forEach(function (card) {
          card.hidden = btn.dataset.filter !== 'all' && card.dataset.sector !== btn.dataset.filter;
        });
      });
    });
  }

  /* ---------- weekly recap ---------- */

  /* Thursday's pack opens with "1. WEEK IN ONE PAGE". Anchored so the later
     "10." and "11." headings do not re-open the section. */
  var WEEKLY_SECTION = /^\s*1\.(?!\d)|week in one page|top news/i;

  function weeklyItem(block) {
    var text = (block.text || '').trim();
    var sources = '';
    var tail = text.match(/^([\s\S]*?)\s*\(([^()]{2,80})\)\s*$/);
    if (tail) { text = tail[1].trim(); sources = tail[2].trim(); }

    var lead = (block.lead || '').trim();
    var title = lead;
    var detail = '';
    if (lead && text.slice(0, lead.length) === lead) {
      detail = text.slice(lead.length).replace(/^\s*[—–:-]\s*/, '').trim();
    } else if (lead) {
      detail = text;
    } else {
      /* No bold run survived. Fall back to a spaced dash, which will not
         split a compound like "US–Iran". */
      var dash = text.match(/^(.{3,90}?)\s+[—–]\s+([\s\S]+)$/);
      if (dash) { title = dash[1].trim(); detail = dash[2].trim(); }
      else title = text;
    }
    return { title: title.replace(/\s*[:—–-]\s*$/, '').trim(), detail: detail, sources: sources };
  }

  function parseWeekly(weekly) {
    if (!weekly || !weekly.blocks) return [];
    var items = [], inSection = false;
    weekly.blocks.forEach(function (b) {
      if (b.type === 'heading_2' || b.type === 'heading_1') {
        inSection = WEEKLY_SECTION.test((b.text || '').trim());
        return;
      }
      if (inSection && isListItem(b.type) && (b.text || '').trim()) items.push(weeklyItem(b));
    });
    return items;
  }

  function renderWeekly(weekly) {
    var items = parseWeekly(weekly);
    var stamp = weekly && (weekly.window || weekly.date) ? (weekly.window || weekly.date) : '';
    $('weekly-window').textContent = items.length && stamp ? stamp : '';

    if (!items.length) {
      $('weekly').innerHTML = '<li class="weekly-empty">' +
        (weekly ? 'This week’s recap has no ranked section yet.' : 'The weekly recap is written on Thursdays.') +
        '</li>';
      $('weekly-link').hidden = !(weekly && weekly.sourceUrl);
      if (weekly && weekly.sourceUrl) $('weekly-link').href = weekly.sourceUrl;
      return;
    }

    $('weekly').innerHTML = items.slice(0, 8).map(function (it) {
      return '<li>' +
        '<span class="wk-title">' + esc(it.title) + '</span>' +
        (it.detail ? '<span class="wk-detail">' + esc(it.detail) + '</span>' : '') +
        (it.sources ? '<span class="wk-src">' + esc(it.sources) + '</span>' : '') +
        '</li>';
    }).join('');

    $('weekly-link').hidden = !weekly.sourceUrl;
    if (weekly.sourceUrl) {
      $('weekly-link').href = weekly.sourceUrl;
      $('weekly-link').textContent = items.length > 8
        ? 'Open the full weekly recap (' + items.length + ' items) ↗'
        : 'Open the full weekly recap ↗';
    }
  }

  function renderWire(wire, title) {
    /* Let the card follow the brief. An edition that files section F as
       "Blind spots" should not be captioned "On the wire". */
    if (title) $('wire-title').textContent = title;
    if (!wire.length) {
      $('wire').innerHTML = '<li class="quiet-lane">No social signal was included in this edition.</li>';
      return;
    }
    $('wire').innerHTML = wire.map(function (line) {
      var m = line.match(/^\s*(unverified[^:]*)\s*:\s*(.*)$/i);
      return m
        ? '<li><span class="unverified">' + esc(m[1]) + '</span>' + esc(m[2]) + '</li>'
        : '<li>' + esc(line) + '</li>';
    }).join('');
  }

  function briefFreshness(payload, now) {
    var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    var date = String(payload.date || '').slice(0, 10);
    var valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    if (payload.stale) return 'Cached brief: the latest source could not be retrieved. Check the dates before use.';
    if (!valid) return 'The brief date is missing or invalid. Freshness cannot be confirmed.';
    if (date < today) return 'Earlier edition: this brief is not dated today. Check the source before use.';
    if (date > today) return 'Future-dated edition: verify the source date before use.';
    return '';
  }

  function renderHealth(payload, preview) {
    var warning = preview ? 'Illustrative demonstration: headlines and prices are examples, not current market information.' : briefFreshness(payload, new Date());
    $('brief-warning').textContent = warning || 'Dated today · source status is shown below; this does not confirm approval for external use.';
    $('brief-warning').parentElement.classList.toggle('attention', !!warning);
    var stamp = function (value) {
      var d = new Date(value || '');
      return Number.isFinite(d.getTime()) ? d.toLocaleString('en-CA', {timeZone:'America/Toronto', timeZoneName:'short'}) : 'Not available';
    };
    var rows = preview ? [['Mode', 'Illustrative'], ['Prices', 'Examples only'], ['Headlines', 'Examples only'], ['External use', 'Not approved']] :
      [['Brief date', payload.date || 'Not available'], ['Source updated', stamp(payload.lastEdited)], ['Retrieved from Notion', stamp(payload.fetchedAt)], ['Source status', payload.status || 'Not set']];
    $('brief-metadata').innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
  }

  function render(payload, preview) {
    renderHealth(payload, preview);
    var referenceMarket = market;
    if (preview) market = demoMarket;
    var d = parse(payload);

    $('breaking').hidden = !d.breaking.length;
    if (d.breaking.length) $('breaking-body').textContent = d.breaking.join(' ');

    renderTape();

    $('overnight').innerHTML = (d.overnight.length ? d.overnight : ['No overnight summary was included in this edition.'])
      .map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');

    renderWeekly(payload.weekly);

    renderStories(d.stories);
    renderLanes(d.lanes);

    $('calendar').innerHTML = (d.calendar.length ? d.calendar : [['—', 'No calendar included', '—']])
      .map(function (r) {
        return '<tr><td>' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') + '</td><td>' + esc(r[2] || '') + '</td></tr>';
      }).join('');

    renderWire(d.wire, d.wireTitle);

    $('excluded-card').hidden = !d.excluded.length;
    $('excluded').innerHTML = d.excluded.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');

    var stamp = payload.window || payload.date || '';
    $('edition-stamp').textContent = preview ? 'Preview data' : stamp;
    $('source-meta').textContent = (preview ? 'Illustrative preview' : 'Notion · ' + (payload.status || 'Status not set')) +
      (stamp ? ' · ' + stamp : '');
    $('source-link').hidden = !payload.sourceUrl;
    $('source-link').href = payload.sourceUrl || '#';

    $('desk').hidden = false;
    $('gate').hidden = true;
    $('lock').hidden = preview;
    var clock = function (iso) {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto', timeZoneName: 'short' });
    };
    var freshnessWarning = briefFreshness(payload, new Date());
    $('news-pip').className = 'pip ' + (preview || freshnessWarning ? 'warn' : 'ok');
    $('news-state').textContent = preview
      ? 'Illustrative layout'
      : payload.stale
        ? 'Held copy from ' + clock(payload.staleSince) + ' · Notion unreachable'
        : freshnessWarning ? 'Check brief date' : 'Source updated ' + clock(payload.lastEdited);

    market = referenceMarket;
    if (preview) $('tape-meta').textContent = 'Illustrative prices · not live market data';
    if (!preview) hydrateThumbs(d.stories.slice(0, 5));
  }

  /* ---------- boot ---------- */

  function loadMarket() {
    return fetch('/api/market')
      .then(function (r) { return r.ok ? r.json() : { quotes: [] }; })
      .then(function (d) {
        marketAsOf = d.asOf || '';
        (d.quotes || []).forEach(function (q) { market[q.symbol] = q; });
        if ($('tape-meta') && marketAsOf) {
          $('tape-meta').textContent = 'Indicative reference data · fetched ' +
            new Date(marketAsOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto', timeZoneName: 'short' });
        }
      })
      .catch(function () {
        if ($('tape-meta')) $('tape-meta').textContent = 'Reference data currently unavailable';
      });
  }

  function unlock(key, persist) {
    $('gate-error').textContent = '';
    $('news-state').textContent = 'Loading Macro Desk…';
    return fetch('/api/news', { headers: { 'x-terminal-key': key }, cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || 'Unable to load the feed.');
          return j;
        });
      })
      .then(function (d) { rememberKey(key, persist); window.__newsKey = key; render(d, false); })
      .catch(function (e) {
        $('news-pip').className = 'pip bad';
        $('news-state').textContent = 'Protected Notion feed';
        $('gate-error').textContent = e.message;
      });
  }

  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('access-key').value.trim();
    if (key) unlock(key, $('remember-key').checked);
  });
  $('demo').addEventListener('click', function () {
    render(demoPayload, true);
  });
  $('lock').addEventListener('click', function () {
    forgetKey();
    $('desk').hidden = true;
    $('gate').hidden = false;
    $('lock').hidden = true;
    $('news-pip').className = 'pip';
    $('news-state').textContent = 'Protected Notion feed';
    $('edition-stamp').textContent = '';
    $('access-key').value = '';
  });

  loadMarket().then(function () {
    var key = storedKey(), persisted = false;
    try { persisted = !!localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (key) { $('remember-key').checked = persisted; unlock(key, persisted); }
  });
})();

