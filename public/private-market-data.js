/* ──────────────────────────────────────────────────────────────────────────
   Satstreet Private Market — prototype data layer.

   Shared by private-market.html (client view) and
   private-market-internal.html (internal opportunity book).

   The market covers high-value physical assets — marine, aviation, motor
   vehicles, precious metals, watches and art — with a $50,000 floor, which
   is the desk's minimum trade size. Two currency fields are deliberate and
   not redundant: `currency` is what the indicative value is quoted in, and
   `settlement` is the counterparty's stated settlement preference, which is
   where the Satstreet desk's actual OTC business touches the transaction.

   Everything here is fictional and illustrative. Asset descriptions are
   generic on purpose — no real makes, models, hulls, tail numbers or
   registrations — and nothing is sent anywhere: state lives in this
   browser's localStorage only, so a status change made in the internal view
   is visible in the client view on the same machine, which is the demo loop
   the prototype exists to show.

   Storage keys:
     ss-pm-overrides   { [oppId]: { status, consent, notes } }  internal edits
     ss-pm-interests   [ interest ]                             client submissions
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* The desk's minimum trade size. The form refuses anything below it. */
  var MIN_VALUE = 50000;

  var CATEGORIES = [
    'Real Estate',
    'Marine',
    'Aviation',
    'Motor Vehicles',
    'Precious Metals',
    'Watches & Jewellery',
    'Fine Art & Collectibles'
  ];

  /* Physical assets are "offered" or "sought" rather than bought or sold —
     the desk's buy/sell vocabulary reads wrong against a yacht. */
  var DIRECTIONS = ['Offered', 'Sought'];

  var SETTLEMENTS = ['CAD', 'USD', 'BTC', 'Open'];

  /* Fictional book. Locations are region-level only: never an address, a
     berth, a hangar or a vault account. */
  var SEED = [
    {
      id: 'PM-2026-041', category: 'Marine', direction: 'Offered',
      title: '34m displacement motor yacht, 2019 refit',
      valueMin: 8500000, valueMax: 9200000, currency: 'USD', settlement: 'Open',
      location: 'Mediterranean', timing: 'Within 60 days',
      status: 'Open', consent: true,
      summary: 'Owner rotating out of a long-held vessel following a full refit. Survey and class records available to qualified parties.',
      clientRef: 'CR-1042', owner: 'M. Tremblay',
      notes: 'Owner will not entertain viewings before proof of funds. Broker of record already appointed.'
    },
    {
      id: 'PM-2026-039', category: 'Real Estate', direction: 'Offered',
      title: 'Waterfront estate, 4 acres, private dock and boathouse',
      valueMin: 12000000, valueMax: 14000000, currency: 'CAD', settlement: 'Open',
      location: 'Muskoka, Ontario', timing: 'Flexible',
      status: 'Open', consent: true,
      summary: 'Held by the same family for two decades and being released quietly rather than listed. Shown by appointment to qualified parties only.',
      clientRef: 'CR-1058', owner: 'M. Tremblay',
      notes: 'Vendor will not go to open market. Buyer must have local counsel engaged before a viewing.'
    },
    {
      id: 'PM-2026-038', category: 'Aviation', direction: 'Sought',
      title: 'Mid-size business jet, under 3,000 airframe hours',
      valueMin: 9000000, valueMax: 13000000, currency: 'USD', settlement: 'USD',
      location: 'North America', timing: 'This quarter',
      status: 'Open', consent: true,
      summary: 'Corporate flight department replacing an ageing aircraft. Requires enrolment on an engine programme and clean damage history.',
      clientRef: 'CR-0977', owner: 'J. Chen',
      notes: 'Pre-buy inspection facility already selected. Budget approved at board level.'
    },
    {
      id: 'PM-2026-036', category: 'Precious Metals', direction: 'Offered',
      title: '250 kg LBMA good-delivery gold bars, vaulted',
      valueMin: 22000000, valueMax: 24000000, currency: 'CAD', settlement: 'BTC',
      location: 'Switzerland (vaulted)', timing: 'Immediate',
      status: 'In discussion', consent: true,
      summary: 'Family office rebalancing a long-standing bullion position. Metal remains in professional vault storage throughout.',
      clientRef: 'CR-1105', owner: 'A. Fortin',
      notes: 'Client is specifically interested in settling into digital assets. Route the fiat and BTC leg through the desk.'
    },
    {
      id: 'PM-2026-033', category: 'Motor Vehicles', direction: 'Offered',
      title: 'Limited-production hypercar, delivery mileage',
      valueMin: 3200000, valueMax: 3600000, currency: 'USD', settlement: 'BTC',
      location: 'Western Europe', timing: 'Flexible',
      status: 'Open', consent: true,
      summary: 'Collector reducing a concentrated garage. Never registered, full manufacturer documentation and factory warranty intact.',
      clientRef: 'CR-0814', owner: 'M. Tremblay',
      notes: 'Price-sensitive; will hold rather than discount. Open to a digital-asset settlement leg.'
    },
    {
      id: 'PM-2026-031', category: 'Real Estate', direction: 'Sought',
      title: 'Ski-in chalet, five or more bedrooms, alpine resort',
      valueMin: 6000000, valueMax: 9000000, currency: 'CAD', settlement: 'CAD',
      location: 'Rocky Mountains, Canada', timing: 'This quarter',
      status: 'In discussion', consent: true,
      summary: 'Family office acquiring a seasonal property. Ski-in access and rental-management history both required.',
      clientRef: 'CR-1112', owner: 'J. Chen',
      notes: 'Financing not required; will close on cash terms. Local counsel already retained.'
    },
    {
      id: 'PM-2026-029', category: 'Watches & Jewellery', direction: 'Sought',
      title: 'Independent-maker perpetual calendar, full set',
      valueMin: 180000, valueMax: 320000, currency: 'CAD', settlement: 'CAD',
      location: 'Canada', timing: 'Within 30 days',
      status: 'Open', consent: true,
      summary: 'Private client completing a small collection. Requires original box, papers and unpolished case.',
      clientRef: 'CR-1120', owner: 'J. Chen',
      notes: 'Will pay a premium for provenance. Authentication by an independent specialist is a condition.'
    },
    {
      id: 'PM-2026-027', category: 'Marine', direction: 'Sought',
      title: 'Sport-fishing vessel, 60 to 70 ft, recent survey',
      valueMin: 2500000, valueMax: 4000000, currency: 'USD', settlement: 'USD',
      location: 'US East Coast', timing: 'This quarter',
      status: 'In discussion', consent: true,
      summary: 'Buyer seeking a turnkey vessel with documented maintenance and no outstanding survey items.',
      clientRef: 'CR-0688', owner: 'A. Fortin',
      notes: 'Two candidate vessels already under review. Timing driven by the season.'
    },
    {
      id: 'PM-2026-025', category: 'Fine Art & Collectibles', direction: 'Offered',
      title: 'Post-war canvas, documented exhibition provenance',
      valueMin: 1400000, valueMax: 1800000, currency: 'USD', settlement: 'Open',
      location: 'United Kingdom', timing: 'Flexible',
      status: 'Open', consent: true,
      summary: 'Single-owner work being released quietly ahead of an estate reorganisation. Catalogue history available on request.',
      clientRef: 'CR-1093', owner: 'M. Tremblay',
      notes: 'Discretion is the client’s priority. Not to be shown to auction houses.'
    },
    {
      id: 'PM-2026-023', category: 'Real Estate', direction: 'Offered',
      title: 'Two-level penthouse, approx. 6,000 sq ft, ocean frontage',
      valueMin: 8500000, valueMax: 9500000, currency: 'USD', settlement: 'BTC',
      location: 'South Florida', timing: 'Within 60 days',
      status: 'Open', consent: true,
      summary: 'Owner relocating and open to a digital-asset component in the consideration. Building approval process applies to any purchaser.',
      clientRef: 'CR-0902', owner: 'A. Fortin',
      notes: 'Client specifically asked whether a BTC leg is workable. Fiat conversion would route through the desk; the conveyance itself does not.'
    },
    {
      id: 'PM-2026-021', category: 'Motor Vehicles', direction: 'Sought',
      title: 'Matching-numbers 1960s grand tourer, concours history',
      valueMin: 900000, valueMax: 1400000, currency: 'USD', settlement: 'USD',
      location: 'Europe or North America', timing: 'Flexible',
      status: 'Open', consent: true,
      summary: 'Collector seeking a documented example with continuous ownership records. Restoration quality matters more than mileage.',
      clientRef: 'CR-0521', owner: 'J. Chen',
      notes: 'Marque expert retained to inspect any candidate before an offer is made.'
    },
    {
      id: 'PM-2026-018', category: 'Marine', direction: 'Offered',
      title: 'Pair of performance personal watercraft with custom trailer',
      valueMin: 85000, valueMax: 110000, currency: 'CAD', settlement: 'CAD',
      location: 'Ontario, Canada', timing: 'Within 2 weeks',
      status: 'Open', consent: true,
      summary: 'Low-hour pair sold together with a matched trailer and winter storage cradle. Serviced by the selling dealer since new.',
      clientRef: 'CR-1131', owner: 'A. Fortin',
      notes: 'Smallest line on the book; still clears the $50,000 minimum as a pair.'
    },
    {
      id: 'PM-2026-015', category: 'Aviation', direction: 'Offered',
      title: 'Twin-engine turboprop, 2014, on programme maintenance',
      valueMin: 2800000, valueMax: 3300000, currency: 'USD', settlement: 'USD',
      location: 'Western Canada', timing: 'Within 60 days',
      status: 'Open', consent: true,
      summary: 'Operator consolidating a fleet. Aircraft remains in service and available for demonstration to qualified buyers.',
      clientRef: 'CR-0450', owner: 'M. Tremblay',
      notes: 'Logbooks digitised and ready for a pre-buy. Seller flexible on closing location.'
    },
    {
      id: 'PM-2026-011', category: 'Precious Metals', direction: 'Sought',
      title: 'Silver bullion, sealed monster boxes',
      valueMin: 150000, valueMax: 400000, currency: 'CAD', settlement: 'CAD',
      location: 'Canada', timing: 'Immediate',
      status: 'Draft', consent: false,
      summary: 'Private client building a physical position. Awaiting client consent before publication.',
      clientRef: 'CR-1140', owner: 'A. Fortin',
      notes: 'Do not publish until the client confirms in writing.'
    },
    {
      id: 'PM-2026-006', category: 'Fine Art & Collectibles', direction: 'Offered',
      title: 'Contemporary sculpture, single-owner provenance',
      valueMin: 320000, valueMax: 420000, currency: 'USD', settlement: 'USD',
      location: 'Toronto, Canada', timing: 'Completed',
      status: 'Closed', consent: true,
      summary: 'Introduced and concluded off-platform with desk assistance.',
      clientRef: 'CR-0388', owner: 'J. Chen',
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
    var interest = Object.assign({
      id: 'MI-' + String(list.length + 1).padStart(3, '0'),
      status: 'Draft',
      created: new Date().toISOString().slice(0, 10)
    }, data);
    list.push(interest);
    return writeJSON('ss-pm-interests', list) ? interest : null;
  }

  function updateInterest(id, patch) {
    var list = getInterests().map(function (i) {
      return i.id === id ? Object.assign({}, i, patch) : i;
    });
    return writeJSON('ss-pm-interests', list);
  }

  function removeInterest(id) {
    return writeJSON('ss-pm-interests', getInterests().filter(function (i) {
      return i.id !== id;
    }));
  }

  function resetAll() {
    try {
      localStorage.removeItem('ss-pm-overrides');
      localStorage.removeItem('ss-pm-interests');
    } catch (e) { /* nothing to reset */ }
  }

  /* ── money ──────────────────────────────────────────────────────────────
     Values on this board span $85K to $24M, so a plain thousands separator
     makes the columns unreadable. Round to a magnitude and keep the currency
     prefix on the first figure of a range only. */
  function amount(n) {
    if (n >= 1e6) {
      var m = n / 1e6;
      return (m >= 10 ? Math.round(m) : Math.round(m * 10) / 10) + 'M';
    }
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(Math.round(n));
  }

  function prefix(ccy) { return ccy === 'CAD' ? 'CA$' : 'US$'; }

  /** "US$8.5M – 9.2M" */
  function fmtValue(o) {
    return prefix(o.currency) + amount(o.valueMin) + ' – ' + amount(o.valueMax);
  }

  /** A single figure, for client interests. "CA$120K" */
  function fmtOne(v, ccy) { return prefix(ccy) + amount(v); }

  window.SSPM = {
    MIN_VALUE: MIN_VALUE,
    CATEGORIES: CATEGORIES,
    DIRECTIONS: DIRECTIONS,
    SETTLEMENTS: SETTLEMENTS,
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
    fmtValue: fmtValue,
    fmtOne: fmtOne
  };
})();
