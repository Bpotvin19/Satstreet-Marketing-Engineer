/* ──────────────────────────────────────────────────────────────────────────
   Satstreet Private Market — prototype data layer.

   Shared by private-market.html (client view) and
   private-market-internal.html (internal opportunity book).

   Everything here is fictional and illustrative. Nothing is sent anywhere:
   state lives in this browser's localStorage only, so a status change made
   in the internal view is visible in the client view on the same machine —
   which is exactly the demo loop the prototype exists to show.

   Storage keys:
     ss-pm-overrides   { [oppId]: { status, consent, notes } }  internal edits
     ss-pm-interests   [ interest ]                             client submissions
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Fictional opportunity book. Client references and relationship owners
     are invented; sizes are indicative ranges, never exact holdings. */
  var SEED = [
    {
      id: 'PM-2026-041', asset: 'BTC', direction: 'Buy', sizeMin: 25, sizeMax: 50,
      currency: 'CAD', timing: 'Within 2 weeks', status: 'Open', consent: true,
      summary: 'Corporate treasury seeking to establish a balance-sheet position through staged accumulation.',
      clientRef: 'CR-1042', owner: 'M. Tremblay',
      notes: 'Prefers two or three tranches. Board approval already in place.'
    },
    {
      id: 'PM-2026-038', asset: 'BTC', direction: 'Sell', sizeMin: 100, sizeMax: 150,
      currency: 'USD', timing: 'Immediate', status: 'In discussion', consent: true,
      summary: 'Estate-related disposition. Staged execution preferred to limit market impact.',
      clientRef: 'CR-0977', owner: 'J. Chen',
      notes: 'Counsel involved; settlement instructions to be confirmed before any tranche.'
    },
    {
      id: 'PM-2026-036', asset: 'BTC', direction: 'Buy', sizeMin: 10, sizeMax: 20,
      currency: 'CAD', timing: 'This quarter', status: 'Open', consent: true,
      summary: 'Family office initiating a first digital-asset allocation with institutional custody.',
      clientRef: 'CR-1105', owner: 'A. Fortin',
      notes: 'Custody provider selected. Flexible on timing within the quarter.'
    },
    {
      id: 'PM-2026-033', asset: 'BTC', direction: 'Sell', sizeMin: 40, sizeMax: 60,
      currency: 'CAD', timing: 'Flexible', status: 'Open', consent: true,
      summary: 'Long-term holder rebalancing a concentrated position. No urgency on execution.',
      clientRef: 'CR-0814', owner: 'M. Tremblay',
      notes: 'Client is price-sensitive above all; will wait for the right level.'
    },
    {
      id: 'PM-2026-029', asset: 'ETH', direction: 'Buy', sizeMin: 500, sizeMax: 800,
      currency: 'USD', timing: 'Within 30 days', status: 'Open', consent: true,
      summary: 'Institutional allocator adding a secondary asset alongside an existing BTC position.',
      clientRef: 'CR-1120', owner: 'J. Chen',
      notes: 'USD settlement only. Wants a single fill if liquidity allows.'
    },
    {
      id: 'PM-2026-027', asset: 'BTC', direction: 'Buy', sizeMin: 200, sizeMax: 300,
      currency: 'USD', timing: 'Staged over 60 days', status: 'In discussion', consent: true,
      summary: 'Institutional accumulation programme executed in tranches under desk guidance.',
      clientRef: 'CR-0688', owner: 'A. Fortin',
      notes: 'Weekly tranche cadence agreed in principle. Reviewing execution schedule.'
    },
    {
      id: 'PM-2026-025', asset: 'BTC', direction: 'Sell', sizeMin: 15, sizeMax: 25,
      currency: 'CAD', timing: 'Within 2 weeks', status: 'Open', consent: true,
      summary: 'Founder liquidity event following a company sale. Clean, single-settlement preference.',
      clientRef: 'CR-1093', owner: 'M. Tremblay',
      notes: 'Source-of-funds documentation complete.'
    },
    {
      id: 'PM-2026-021', asset: 'ETH', direction: 'Sell', sizeMin: 1000, sizeMax: 1500,
      currency: 'USD', timing: 'Flexible', status: 'Open', consent: true,
      summary: 'Early holder reducing exposure. Open to partial fills against qualified interest.',
      clientRef: 'CR-0521', owner: 'J. Chen',
      notes: 'Partial fills acceptable in blocks of 250+.'
    },
    {
      id: 'PM-2026-018', asset: 'BTC', direction: 'Buy', sizeMin: 5, sizeMax: 10,
      currency: 'CAD', timing: 'Immediate', status: 'Draft', consent: false,
      summary: 'Private client first purchase. Awaiting client consent before publication.',
      clientRef: 'CR-1131', owner: 'A. Fortin',
      notes: 'Do not publish until the client confirms in writing.'
    },
    {
      id: 'PM-2026-012', asset: 'BTC', direction: 'Sell', sizeMin: 30, sizeMax: 40,
      currency: 'USD', timing: 'Completed', status: 'Closed', consent: true,
      summary: 'Treasury rebalancing, matched and concluded off-platform with desk assistance.',
      clientRef: 'CR-0450', owner: 'M. Tremblay',
      notes: 'Retained for the demo so the book shows a closed line.'
    }
  ];

  var OPP_STATUSES = ['Draft', 'Open', 'In discussion', 'Closed'];
  var INTEREST_STATUSES = ['Draft', 'Under Review', 'Approved', 'Matched', 'Closed'];

  /* localStorage can throw (private windows, blocked site data); the
     prototype must still render, just without persistence. */
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function getOverrides() { return readJSON('ss-pm-overrides', {}); }

  /** The book as the internal view sees it: seed + any local edits. */
  function getBook() {
    var over = getOverrides();
    return SEED.map(function (o) {
      var edit = over[o.id] || {};
      return Object.assign({}, o, {
        status: OPP_STATUSES.indexOf(edit.status) >= 0 ? edit.status : o.status,
        consent: typeof edit.consent === 'boolean' ? edit.consent : o.consent,
        notes: typeof edit.notes === 'string' ? edit.notes : o.notes
      });
    });
  }

  /** Only consented, non-draft, non-closed lines reach the client board. */
  function getPublished() {
    return getBook().filter(function (o) {
      return o.consent && (o.status === 'Open' || o.status === 'In discussion');
    });
  }

  function setOverride(id, patch) {
    var over = getOverrides();
    over[id] = Object.assign({}, over[id] || {}, patch);
    return writeJSON('ss-pm-overrides', over);
  }

  function getInterests() { return readJSON('ss-pm-interests', []); }

  function addInterest(data) {
    var list = getInterests();
    var n = list.length + 1;
    var interest = Object.assign({
      id: 'MI-' + String(n).padStart(3, '0'),
      status: 'Draft',
      created: new Date().toISOString().slice(0, 10)
    }, data);
    list.push(interest);
    var ok = writeJSON('ss-pm-interests', list);
    return ok ? interest : null;
  }

  function updateInterest(id, patch) {
    var list = getInterests().map(function (i) {
      return i.id === id ? Object.assign({}, i, patch) : i;
    });
    return writeJSON('ss-pm-interests', list);
  }

  function removeInterest(id) {
    var list = getInterests().filter(function (i) { return i.id !== id; });
    return writeJSON('ss-pm-interests', list);
  }

  function resetAll() {
    try {
      localStorage.removeItem('ss-pm-overrides');
      localStorage.removeItem('ss-pm-interests');
    } catch (e) { /* nothing to reset */ }
  }

  function fmtSize(o) {
    var f = function (n) { return n.toLocaleString('en-CA'); };
    return f(o.sizeMin) + '–' + f(o.sizeMax) + ' ' + o.asset;
  }

  window.SSPM = {
    OPP_STATUSES: OPP_STATUSES,
    INTEREST_STATUSES: INTEREST_STATUSES,
    getBook: getBook,
    getPublished: getPublished,
    setOverride: setOverride,
    getInterests: getInterests,
    addInterest: addInterest,
    updateInterest: updateInterest,
    removeInterest: removeInterest,
    resetAll: resetAll,
    fmtSize: fmtSize
  };
})();
