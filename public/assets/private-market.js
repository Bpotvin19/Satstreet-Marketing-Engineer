(function () {
  'use strict';

  var S = window.SATSTREET;
  var STORAGE_INTERESTS = 'satstreet-private-market-interests-v1';
  var STORAGE_BOOK = 'satstreet-private-market-book-v1';

  var SAMPLE_OPPORTUNITIES = [
    {
      id: 'PM-BTC-1042', asset: 'BTC', direction: 'Buy', min: 15, max: 30, currency: 'CAD',
      timing: 'This week', status: 'Approved', clientRef: 'Client A-17', owner: 'R. Chen', consent: true,
      description: 'A qualified participant is exploring a measured BTC acquisition with timing flexibility.',
      notes: 'Confirm eligibility before any desk discussion.'
    },
    {
      id: 'PM-BTC-1047', asset: 'BTC', direction: 'Sell', min: 25, max: 50, currency: 'USD',
      timing: 'Within 48 hours', status: 'Approved', clientRef: 'Client F-08', owner: 'M. Singh', consent: true,
      description: 'A participant is considering a discreet block disposition, subject to agreed execution terms.',
      notes: 'Illustrative urgency; no executable order exists.'
    },
    {
      id: 'PM-ETH-1051', asset: 'ETH', direction: 'Buy', min: 300, max: 600, currency: 'CAD',
      timing: 'This month', status: 'Under Review', clientRef: 'Client C-22', owner: 'A. Martin', consent: true,
      description: 'A corporate participant is assessing a staged ETH acquisition over a flexible window.',
      notes: 'Potential staged execution discussion.'
    },
    {
      id: 'PM-BTC-1055', asset: 'BTC', direction: 'Sell', min: 8, max: 18, currency: 'CAD',
      timing: 'Flexible', status: 'Approved', clientRef: 'Client H-31', owner: 'R. Chen', consent: true,
      description: 'A long-term holder is evaluating liquidity options without a fixed execution date.',
      notes: 'Relationship owner to confirm broad timing.'
    },
    {
      id: 'PM-ETH-1058', asset: 'ETH', direction: 'Sell', min: 450, max: 900, currency: 'USD',
      timing: 'This week', status: 'Matched', clientRef: 'Client B-14', owner: 'M. Singh', consent: true,
      description: 'A qualified participant is exploring a professionally managed ETH block transaction.',
      notes: 'Do not imply counterparty availability.'
    },
    {
      id: 'PM-BTC-1063', asset: 'BTC', direction: 'Buy', min: 40, max: 75, currency: 'USD',
      timing: 'This month', status: 'Approved', clientRef: 'Client D-09', owner: 'A. Martin', consent: true,
      description: 'A family office is assessing a larger BTC allocation with a patient execution horizon.',
      notes: 'Illustrative family-office scenario.'
    }
  ];

  function readJson(key, fallback) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key));
      return parsed === null ? fallback : parsed;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function getBook() {
    var stored = readJson(STORAGE_BOOK, {});
    return SAMPLE_OPPORTUNITIES.map(function (item) {
      var update = stored[item.id] || {};
      return Object.assign({}, item, update);
    });
  }

  function visibleBook() {
    return getBook().filter(function (item) { return item.consent && item.status !== 'Closed'; });
  }

  function getInterests() {
    var list = readJson(STORAGE_INTERESTS, []);
    return Array.isArray(list) ? list : [];
  }

  function saveInterests(list) { writeJson(STORAGE_INTERESTS, list); }

  function opportunityById(id) {
    return getBook().filter(function (item) { return item.id === id; })[0] || null;
  }

  function formatSize(item) { return item.min + '–' + item.max + ' ' + item.asset; }
  function escapeAttribute(value) {
    return S.esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatDate(value) {
    return new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function uid() {
    return 'INT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function initClient() {
    var grid = document.getElementById('opportunity-grid');
    if (!grid) return;
    S.mountHeader('Private Market');

    var assetFilter = document.getElementById('filter-asset');
    var directionFilter = document.getElementById('filter-direction');
    var currencyFilter = document.getElementById('filter-currency');
    var detailDialog = document.getElementById('detail-dialog');
    var interestDialog = document.getElementById('interest-dialog');
    var deskDialog = document.getElementById('desk-dialog');

    function renderMetrics() {
      var book = visibleBook();
      var interests = getInterests().filter(function (item) { return item.status !== 'Closed'; });
      var metrics = [
        ['Available opportunities', book.length],
        ['BTC buy interests', book.filter(function (x) { return x.asset === 'BTC' && x.direction === 'Buy'; }).length],
        ['BTC sell interests', book.filter(function (x) { return x.asset === 'BTC' && x.direction === 'Sell'; }).length],
        ['My active interests', interests.length]
      ];
      document.getElementById('market-metrics').innerHTML = metrics.map(function (metric) {
        return '<div class="pm-metric"><span>' + S.esc(metric[0]) + '</span><strong>' + metric[1] + '</strong></div>';
      }).join('');
    }

    function renderBoard() {
      var book = visibleBook().filter(function (item) {
        if (assetFilter.value !== 'all' && item.asset !== assetFilter.value) return false;
        if (directionFilter.value !== 'all' && item.direction !== directionFilter.value) return false;
        if (currencyFilter.value !== 'all' && item.currency !== currencyFilter.value) return false;
        return true;
      });
      document.getElementById('result-count').textContent = book.length + (book.length === 1 ? ' opportunity' : ' opportunities');
      document.getElementById('opportunity-empty').hidden = book.length > 0;
      grid.innerHTML = book.map(function (item) {
        return '<article class="pm-card">' +
          '<div class="pm-card-top"><span class="pm-direction ' + item.direction.toLowerCase() + '">' + S.esc(item.direction) + ' interest</span>' +
          '<span class="pm-status">' + S.esc(item.status) + '</span></div>' +
          '<h3>' + S.esc(item.asset) + '</h3><p class="pm-size">' + S.esc(formatSize(item)) + '</p>' +
          '<dl class="pm-meta"><div><dt>Currency</dt><dd>' + S.esc(item.currency) + '</dd></div>' +
          '<div><dt>Timing</dt><dd>' + S.esc(item.timing) + '</dd></div>' +
          '<div><dt>Reference</dt><dd>' + S.esc(item.id) + '</dd></div>' +
          '<div><dt>Type</dt><dd>Desk assisted</dd></div></dl>' +
          '<p class="pm-description">' + S.esc(item.description) + '</p>' +
          '<button class="pm-btn secondary" type="button" data-view="' + S.esc(item.id) + '">View opportunity</button></article>';
      }).join('');
    }

    function renderInterests() {
      var interests = getInterests();
      var list = document.getElementById('interest-list');
      document.getElementById('interest-empty').hidden = interests.length > 0;
      list.innerHTML = interests.map(function (item) {
        return '<article class="pm-interest"><div><strong>' + S.esc(item.direction + ' ' + item.asset) + '</strong><small>' +
          S.esc(item.id) + (item.opportunityId ? ' · matches ' + S.esc(item.opportunityId) : '') + '</small></div>' +
          '<div><span class="pm-cell-label">Approx. size</span><span class="pm-cell-value">' + S.esc(item.size + ' ' + item.asset) + '</span></div>' +
          '<div><span class="pm-cell-label">Currency</span><span class="pm-cell-value">' + S.esc(item.currency) + '</span></div>' +
          '<div><span class="pm-cell-label">Timing</span><span class="pm-cell-value">' + S.esc(item.timing) + '</span></div>' +
          '<div><span class="pm-cell-label">Status</span><span class="pm-cell-value"><span class="pm-status">' + S.esc(item.status) + '</span></span></div></article>';
      }).join('');
      renderMetrics();
    }

    function showDetail(item) {
      document.getElementById('detail-title').textContent = item.direction + ' ' + item.asset + ' opportunity';
      document.getElementById('detail-content').innerHTML =
        '<span class="pm-status">' + S.esc(item.status) + '</span>' +
        '<dl class="pm-detail-grid"><div><dt>Indicative size</dt><dd>' + S.esc(formatSize(item)) + '</dd></div>' +
        '<div><dt>Asset</dt><dd>' + S.esc(item.asset) + '</dd></div><div><dt>Direction</dt><dd>' + S.esc(item.direction) + '</dd></div>' +
        '<div><dt>Currency</dt><dd>' + S.esc(item.currency) + '</dd></div><div><dt>Timing</dt><dd>' + S.esc(item.timing) + '</dd></div>' +
        '<div><dt>Reference</dt><dd>' + S.esc(item.id) + '</dd></div></dl>' +
        '<p class="pm-detail-copy">' + S.esc(item.description) + '</p>' +
        '<p class="pm-detail-copy"><strong>Desk-assisted execution.</strong> Satstreet would help qualified participants assess liquidity, complete required reviews and discuss potential execution terms. No automated matching or execution occurs here.</p>' +
        '<p class="pm-disclaimer">This opportunity is non-binding and subject to eligibility, compliance review, available liquidity and agreed execution terms.</p>' +
        '<div class="pm-dialog-actions"><button class="pm-btn" type="button" data-match="' + S.esc(item.id) + '">Express matching interest</button>' +
        '<button class="pm-btn secondary" type="button" data-contact-desk>Contact the desk</button></div>';
      detailDialog.showModal();
    }

    function openInterest(item) {
      document.getElementById('interest-form').hidden = false;
      document.getElementById('form-confirmation').hidden = true;
      document.getElementById('interest-form').reset();
      document.getElementById('form-error').textContent = '';
      document.getElementById('form-opportunity').value = item ? item.id : '';
      if (item) {
        document.getElementById('form-direction').value = item.direction === 'Buy' ? 'Sell' : 'Buy';
        document.getElementById('form-asset').value = item.asset;
        document.getElementById('form-currency').value = item.currency;
        document.getElementById('form-timing').value = item.timing;
      }
      interestDialog.showModal();
    }

    [assetFilter, directionFilter, currencyFilter].forEach(function (control) { control.addEventListener('change', renderBoard); });
    grid.addEventListener('click', function (event) {
      var button = event.target.closest('[data-view]');
      if (button) showDetail(opportunityById(button.getAttribute('data-view')));
    });
    document.addEventListener('click', function (event) {
      var close = event.target.closest('[data-close-dialog]');
      if (close) closeDialog(close.closest('dialog'));
      var open = event.target.closest('[data-open-interest]');
      if (open) openInterest(null);
      var match = event.target.closest('[data-match]');
      if (match) { closeDialog(detailDialog); openInterest(opportunityById(match.getAttribute('data-match'))); }
      var desk = event.target.closest('[data-contact-desk]');
      if (desk) { closeDialog(detailDialog); deskDialog.showModal(); }
    });

    document.getElementById('interest-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var direction = document.getElementById('form-direction').value;
      var asset = document.getElementById('form-asset').value;
      var size = Number(document.getElementById('form-size').value);
      var currency = document.getElementById('form-currency').value;
      var timing = document.getElementById('form-timing').value;
      var notes = document.getElementById('form-notes').value.trim();
      var error = document.getElementById('form-error');
      if (!form.checkValidity() || !direction || !asset || !currency || !timing || !isFinite(size) || size <= 0) {
        error.textContent = 'Complete all required fields and enter a size greater than zero.';
        form.reportValidity();
        return;
      }
      if (/wallet|seed phrase|private key/i.test(notes)) {
        error.textContent = 'Remove wallet addresses, seed phrases, private keys or similar sensitive information.';
        return;
      }
      var interests = getInterests();
      interests.unshift({
        id: uid(), opportunityId: document.getElementById('form-opportunity').value || null,
        direction: direction, asset: asset, size: size, currency: currency, timing: timing,
        notes: notes, status: 'Draft', createdAt: new Date().toISOString()
      });
      saveInterests(interests);
      form.hidden = true;
      var confirmation = document.getElementById('form-confirmation');
      confirmation.hidden = false;
      confirmation.innerHTML = '<div class="pm-confirmation"><strong>Saved on this device.</strong><br />Nothing has been submitted to Satstreet, a CRM or a trading system. This prototype interest now appears in My interests.</div>' +
        '<div class="pm-dialog-actions"><button class="pm-btn" type="button" data-close-dialog>Done</button></div>';
      renderInterests();
    });

    [detailDialog, interestDialog, deskDialog].forEach(function (dialog) {
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });

    renderBoard();
    renderInterests();
  }

  function initInternal() {
    var body = document.getElementById('book-body');
    if (!body) return;
    S.mountHeader('Private Market');

    function render() {
      body.innerHTML = getBook().map(function (item) {
        return '<tr data-id="' + S.esc(item.id) + '"><td><strong>' + S.esc(item.id) + '</strong></td><td>' + S.esc(item.clientRef) + '</td>' +
          '<td>' + S.esc(item.owner) + '</td><td>' + S.esc(item.asset) + '</td><td>' + S.esc(item.direction) + '</td>' +
          '<td>' + S.esc(formatSize(item)) + '</td><td>' + S.esc(item.currency) + '</td><td>' + S.esc(item.timing) + '</td>' +
          '<td><select class="pm-select" data-status aria-label="Status for ' + S.esc(item.id) + '">' +
          ['Draft','Under Review','Approved','Matched','Closed'].map(function (status) { return '<option' + (item.status === status ? ' selected' : '') + '>' + status + '</option>'; }).join('') + '</select></td>' +
          '<td><label class="pm-consent"><input type="checkbox" data-consent' + (item.consent ? ' checked' : '') + ' /> Published</label></td>' +
          '<td><input class="pm-input pm-notes" data-notes maxlength="180" value="' + escapeAttribute(item.notes) + '" aria-label="Internal notes for ' + escapeAttribute(item.id) + '" /></td></tr>';
      }).join('');
      document.getElementById('book-count').textContent = getBook().length + ' fictional opportunities';
    }

    function update(row) {
      var id = row.getAttribute('data-id');
      var state = readJson(STORAGE_BOOK, {});
      state[id] = {
        status: row.querySelector('[data-status]').value,
        consent: row.querySelector('[data-consent]').checked,
        notes: row.querySelector('[data-notes]').value
      };
      writeJson(STORAGE_BOOK, state);
      document.getElementById('save-state').textContent = 'Saved locally at ' + new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
    }

    body.addEventListener('change', function (event) { update(event.target.closest('tr')); });
    body.addEventListener('input', function (event) {
      if (event.target.matches('[data-notes]')) update(event.target.closest('tr'));
    });
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initClient();
    initInternal();
  });
})();
