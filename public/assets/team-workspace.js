/* Team workspace: per-person tabs, the shared email draft queue and the
   prospect list.

   Everything is fetched from /api/workspace after the access key is accepted,
   so none of it is in the served page. news-desk.js owns the gate and calls
   mount() on unlock and unmount() on lock.

   The queue is read-only by design. Approval and sending stay in Notion and in
   people's hands; the only thing this screen writes is who intends to work a
   prospect.
*/
(function () {
  'use strict';
  var Terminal = window.SATSTREET;
  if (!Terminal) return;
  var esc = Terminal.esc;
  var $ = function (id) { return document.getElementById(id); };

  var PEOPLE = ['ben', 'george', 'dan', 'mike', 'jon'];
  var COMPLIANCE = 'levy';
  var OWNERS = ['Ben', 'George', 'Dan', 'Mike'];
  var data = null;
  var activePerson = 'ben';
  var activeSection = {};
  var leadFilter = 'all';

  function clock(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function day(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch (e) { return iso; }
  }

  function personOf(key) {
    return (data && data.people || []).filter(function (p) { return p.key === key; })[0] || null;
  }

  /* The Email option was added to Content Queue after the daily client note
     had been running for weeks, so existing email drafts still carry the
     LinkedIn label. Recognise them by what they are rather than losing them:
     a Subject line, the Client AM Email campaign, or the card's own name.
     Rows found this way are badged so the mislabelling stays visible. */
  function looksLikeEmail(d) {
    if (/^\s*subject\s*:/im.test(d.draft || '')) return true;
    if (/client\s+(am\s+)?email|weekly\s+client\s+email/i.test(d.campaign || '')) return true;
    if (/^\s*client\s+email\b/i.test(d.name || '')) return true;
    return false;
  }

  function labelledEmail(d) {
    return (d.platforms || []).indexOf('Email') >= 0;
  }

  function isEmail(d) {
    return labelledEmail(d) || looksLikeEmail(d);
  }

  function isSocial(d) {
    if (isEmail(d)) return false;
    return (d.platforms || []).some(function (p) { return p === 'X' || p === 'LinkedIn'; });
  }

  /* ---------- shared pieces ---------- */

  function statusChip(d) {
    var approval = d.approval || 'Needs Review';
    var cls = approval === 'Approved' ? 'ok' : (approval === 'Changes Requested' ? 'bad' : 'warn');
    return '<span class="wchip ' + cls + '">' + esc(approval) + '</span>';
  }

  function draftCard(d, showVoice, flag) {
    var platforms = (d.platforms || []).map(function (p) {
      return '<span class="wchip plain">' + esc(p) + '</span>';
    }).join('');
    var screened = d.screenedDraft && d.screenedDraft !== d.draft
      ? '<div class="screened"><b>Screener suggested wording</b><p>' + esc(d.screenedDraft) + '</p></div>'
      : '';
    var meta = [];
    if (d.screenStatus) meta.push(d.screenStatus);
    if (d.verdict) meta.push('Screen: ' + d.verdict);
    if (d.risk) meta.push('Risk: ' + d.risk);
    if (d.publishDate) meta.push('Publish ' + day(d.publishDate));
    return '<article class="draft">' +
      '<header class="draft-head">' +
        '<h3>' + esc(d.name || 'Untitled draft') + '</h3>' +
        '<div class="draft-chips">' +
          (showVoice && d.voice ? '<span class="wchip voice">' + esc(d.voice) + '</span>' : '') +
          (flag ? '<span class="wchip warn">' + esc(flag) + '</span>' : '') +
          platforms + statusChip(d) +
        '</div>' +
      '</header>' +
      (d.draft ? '<p class="draft-body">' + esc(d.draft) + '</p>' : '<p class="draft-body empty">No draft text on this card yet.</p>') +
      screened +
      (d.notes ? '<p class="draft-note">' + esc(d.notes) + '</p>' : '') +
      '<footer class="draft-foot">' +
        '<span>' + esc(meta.join(' · ')) + '</span>' +
        '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">Open in Notion ↗</a>' +
      '</footer>' +
    '</article>';
  }

  function emptyState(message) {
    return '<p class="wempty">' + esc(message) + '</p>';
  }

  /* ---------- person tab ---------- */

  function voiceHtml(person) {
    if (!person) return emptyState('No voice reference is configured.');
    if (person.error) return emptyState(person.error);
    var lines = person.lines || [];
    if (!lines.length) return emptyState('This voice reference has no readable content yet.');
    var open = false, html = '';
    lines.forEach(function (line) {
      var list = line.type === 'bulleted_list_item' || line.type === 'numbered_list_item' || line.type === 'to_do';
      if (list && !open) { html += '<ul class="vlist">'; open = true; }
      if (!list && open) { html += '</ul>'; open = false; }
      if (line.type === 'divider') { html += '<hr class="vrule" />'; return; }
      if (list) { html += '<li>' + esc(line.text) + '</li>'; return; }
      if (line.type === 'heading_1' || line.type === 'heading_2') html += '<h3 class="vhead">' + esc(line.text) + '</h3>';
      else if (line.type === 'heading_3') html += '<h4 class="vsub">' + esc(line.text) + '</h4>';
      else if (line.type === 'quote' || line.type === 'callout') html += '<blockquote class="vquote">' + esc(line.text) + '</blockquote>';
      else if (line.type === 'code') html += '<pre class="vcode">' + esc(line.text) + '</pre>';
      else html += '<p class="vtext">' + esc(line.text) + '</p>';
    });
    if (open) html += '</ul>';
    return html;
  }

  function renderPerson(key) {
    activePerson = key;
    var person = personOf(key);
    var name = person ? person.name : key;
    var voice = person ? person.voice : name;
    var social = (data.drafts || []).filter(function (d) { return d.voice === voice && isSocial(d); });
    var archive = (person && person.archive) || [];
    var archiveLabel = (person && person.archiveLabel) || 'Archive';
    var section = activeSection[key] || 'social';
    if (section === 'archive' && !archive.length) section = 'social';

    var sections = [['social', 'Potential social posts', social.length]];
    if (archive.length) sections.push(['archive', archiveLabel, archive.length]);
    sections.push(['voice', 'Voice reference', 0]);

    var subnav = '<div class="subnav" role="tablist" aria-label="' + esc(name) + ' sections">' +
      sections.map(function (s) {
        return '<button class="subtab" type="button" role="tab" data-section="' + s[0] + '"' +
          ' aria-selected="' + (s[0] === section) + '">' + esc(s[1]) +
          (s[2] ? '<span class="count">' + s[2] + '</span>' : '') + '</button>';
      }).join('') + '</div>';

    var body = '';
    if (section === 'social') {
      body = social.length
        ? '<div class="draft-list">' + social.map(function (d) { return draftCard(d, false); }).join('') + '</div>'
        : emptyState('No social drafts are waiting in ' + name + "'s voice right now.");
    } else if (section === 'archive') {
      body = '<p class="wnote">Published work, kept for cadence and structure. ' +
        'Style reference only — do not lift copy or company claims from it.</p>' +
        '<ul class="nlist">' + archive.map(function (n) {
          return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title) + '</a>' +
            (n.lastEdited ? '<span>' + esc(day(n.lastEdited)) + '</span>' : '') + '</li>';
        }).join('') + '</ul>' +
        (person && person.archiveUrl
          ? '<a class="weekly-more" href="' + esc(person.archiveUrl) + '" target="_blank" rel="noopener noreferrer">Open the full archive ↗</a>'
          : '');
    } else {
      body = '<div class="voice-doc">' + voiceHtml(person) + '</div>';
    }

    $('person-view').innerHTML =
      '<div class="whead">' +
        '<div><p class="eyebrow">Team workspace</p><h2>' + esc(name) + '</h2></div>' +
        (person ? '<a class="wlink" href="' + esc(person.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(person.voiceTitle) + ' ↗</a>' : '') +
      '</div>' + subnav + '<div class="wbody">' + body + '</div>';

    Array.prototype.forEach.call($('person-view').querySelectorAll('.subtab'), function (btn) {
      btn.addEventListener('click', function () {
        activeSection[key] = btn.getAttribute('data-section');
        renderPerson(key);
      });
    });
  }

  /* ---------- email tab ---------- */

  function renderEmail() {
    var drafts = (data.drafts || []).filter(isEmail);
    var unlabelled = drafts.filter(function (d) { return !labelledEmail(d); }).length;
    var warn = unlabelled
      ? '<p class="wnote warn-note"><b>' + unlabelled + ' of these are not tagged Email in Notion.</b> ' +
        'They were matched by their subject line or campaign instead. Setting Platform to Email on the ' +
        'drafting bot makes this exact.</p>'
      : '';
    $('email-view').innerHTML =
      '<div class="whead"><div><p class="eyebrow">Shared queue</p><h2>Email drafts</h2></div>' +
      '<span class="wchip plain">' + drafts.length + ' drafts</span></div>' +
      '<p class="wnote">Written by the bots into the Content Queue. Nothing is sent from this page — sending and approval stay with a person.</p>' +
      warn +
      (drafts.length
        ? '<div class="draft-list">' + drafts.map(function (d) {
            return draftCard(d, true, labelledEmail(d) ? '' : 'Untagged');
          }).join('') + '</div>'
        : emptyState('No email drafts are waiting.'));
  }

  /* ---------- prospects tab ---------- */

  function ownerControl(p) {
    var options = ['<option value="">Unassigned</option>'].concat(OWNERS.map(function (o) {
      return '<option value="' + esc(o) + '"' + (p.owner === o ? ' selected' : '') + '>' + esc(o) + '</option>';
    })).join('');
    return '<select class="owner-pick" data-id="' + esc(p.id) + '" aria-label="Owner for ' + esc(p.company) + '">' +
      options + '</select>';
  }

  function canonicalTable(rows) {
    if (!rows.length) return emptyState('No records match this filter.');
    return '<div class="ptable-wrap"><table class="ptable"><thead><tr>' +
        '<th>Company</th><th>Decision maker</th><th>Why now</th><th>Source</th><th>Score</th><th>Owner</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr data-row="' + esc(p.id) + '">' +
          '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.company) + '</a>' +
            '<span class="psub">' + esc([p.segment, p.region].filter(Boolean).join(' · ')) + '</span></td>' +
          '<td>' + esc(p.decisionMaker || '—') + '</td>' +
          '<td class="pwhy">' + esc(p.whyNow || p.trigger || '—') + '</td>' +
          '<td>' + (p.leadSource ? '<span class="wchip plain">' + esc(p.leadSource) + '</span>' : '—') +
            (p.sourcePack ? ' <a class="ppack" href="' + esc(p.sourcePack) + '" target="_blank" rel="noopener noreferrer">pack ↗</a>' : '') + '</td>' +
          '<td class="pscore">' + (p.score == null ? '—' : esc(String(p.score))) + '</td>' +
          '<td>' + ownerControl(p) + '<span class="save-state" data-state="' + esc(p.id) + '"></span></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function linkedinTable(rows) {
    if (!rows.length) return emptyState('No LinkedIn relationships in the working slice.');
    return '<div class="ptable-wrap"><table class="ptable"><thead><tr>' +
        '<th>Person</th><th>Company</th><th>Segment</th><th>Next step</th><th>Score</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr>' +
          '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.person || '—') + '</a>' +
            '<span class="psub">' + esc(p.position || '') + '</span></td>' +
          '<td>' + esc(p.company || '—') + '</td>' +
          '<td>' + esc(p.segment || '—') + '<span class="psub">' + esc(p.opportunity || '') + '</span></td>' +
          '<td class="pwhy">' + esc(p.nextStep || p.angle || '—') + '</td>' +
          '<td class="pscore">' + (p.score == null ? '—' : esc(String(p.score))) + '</td>' +
          '<td>' + (p.thisWeek ? '<span class="wchip warn">This week</span> ' : '') +
            '<span class="wchip plain">' + esc(p.outreachStatus || 'Not reviewed') + '</span></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function packTable(rows) {
    if (!rows.length) return emptyState('No offshore packs were readable.');
    return '<div class="ptable-wrap"><table class="ptable"><thead><tr>' +
        '<th>Fund</th><th>Contact</th><th>Jurisdiction</th><th>Score</th><th>Priority</th><th>Pack</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr>' +
          '<td>' + esc(p.company) + '</td>' +
          '<td>' + esc(p.person || '—') + '<span class="psub">' + esc(p.position || '') + '</span></td>' +
          '<td>' + esc(p.region || '—') + '</td>' +
          '<td class="pscore">' + (p.score == null ? '—' : esc(String(p.score))) + '</td>' +
          '<td>' + (p.priority ? '<span class="wchip plain">' + esc(p.priority) + '</span>' : '—') + '</td>' +
          '<td><a class="ppack" href="' + esc(p.packUrl) + '" target="_blank" rel="noopener noreferrer">' +
            esc(p.packDate || 'pack') + ' ↗</a></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function section(title, note, html) {
    return '<h3 class="wsection">' + esc(title) + (note ? '<span>' + esc(note) + '</span>' : '') + '</h3>' + html;
  }

  function renderProspects() {
    var all = data.prospects || [];
    var linked = data.linkedin || [];
    var packs = data.offshore || [];
    var daily = all.filter(function (p) { return p.leadSource === 'Daily'; });
    var offshoreRows = all.filter(function (p) { return p.leadSource === 'Offshore'; });

    var chips = [
      ['all', 'All sources', all.length + linked.length + packs.length],
      ['Daily', 'Daily', daily.length],
      ['Offshore', 'Offshore', offshoreRows.length],
      ['LinkedIn', 'LinkedIn network', linked.length],
      ['Packs', 'Offshore packs', packs.length]
    ];
    var filters = chips.map(function (f) {
      return '<button class="subtab" type="button" data-lead="' + f[0] + '" aria-selected="' + (leadFilter === f[0]) + '">' +
        esc(f[1]) + '<span class="count">' + f[2] + '</span></button>';
    }).join('');

    var mine = {};
    all.forEach(function (p) { if (p.owner) mine[p.owner] = (mine[p.owner] || 0) + 1; });
    var tally = OWNERS.map(function (o) {
      return '<span class="wchip plain">' + esc(o) + ' <b>' + (mine[o] || 0) + '</b></span>';
    }).join('');

    var body;
    if (leadFilter === 'LinkedIn') body = linkedinTable(linked);
    else if (leadFilter === 'Packs') body = packTable(packs);
    else if (leadFilter === 'Daily') body = canonicalTable(daily);
    else if (leadFilter === 'Offshore') body = canonicalTable(offshoreRows);
    else {
      body = section('Prospect list', all.length + ' records · assignable', canonicalTable(all)) +
        section('LinkedIn network', linked.length + ' in the working slice', linkedinTable(linked)) +
        section('Offshore research packs', packs.length + ' funds across recent packs', packTable(packs));
    }

    $('prospects-view').innerHTML =
      '<div class="whead"><div><p class="eyebrow">Revenue</p><h2>Prospecting list</h2></div><div class="tally">' + tally + '</div></div>' +
      '<p class="wnote">Assigning a name records who intends to reach out — it is not contact, and it does not change the research status. ' +
      'Only the prospect list can be assigned here: LinkedIn tracks its owner as a Notion person, and the offshore packs are research documents rather than records.</p>' +
      '<div class="subnav">' + filters + '</div><div class="wbody">' + body + '</div>';

    Array.prototype.forEach.call($('prospects-view').querySelectorAll('[data-lead]'), function (btn) {
      btn.addEventListener('click', function () { leadFilter = btn.getAttribute('data-lead'); renderProspects(); });
    });
    Array.prototype.forEach.call($('prospects-view').querySelectorAll('.owner-pick'), function (sel) {
      sel.addEventListener('change', function () { assign(sel.getAttribute('data-id'), sel.value, sel); });
    });
  }

  /* ---------- Levy: compliance review ---------- */

  function renderLevy() {
    var drafts = data.drafts || [];
    var waiting = drafts.filter(function (d) {
      return d.screenStatus === 'Ready for Compliance' || d.screenStatus === 'In Compliance Review';
    });
    var returned = drafts.filter(function (d) { return d.screenStatus === 'Returned'; });
    var approved = drafts.filter(function (d) { return d.approval === 'Approved'; });

    var buckets = [
      ['waiting', 'Waiting on you', waiting],
      ['returned', 'Returned for changes', returned],
      ['approved', 'Recently approved', approved]
    ];
    var which = activeSection.levy || 'waiting';
    var chosen = buckets.filter(function (b) { return b[0] === which; })[0] || buckets[0];

    var subnav = '<div class="subnav" role="tablist" aria-label="Compliance queue">' +
      buckets.map(function (b) {
        return '<button class="subtab" type="button" role="tab" data-section="' + b[0] + '"' +
          ' aria-selected="' + (b[0] === which) + '">' + esc(b[1]) +
          '<span class="count">' + b[2].length + '</span></button>';
      }).join('') + '</div>';

    var body = chosen[2].length
      ? '<div class="draft-list">' + chosen[2].map(function (d) { return draftCard(d, true); }).join('') + '</div>'
      : emptyState(which === 'waiting' ? 'Nothing is waiting on compliance review.' : 'Nothing in this bucket.');

    $('person-view').innerHTML =
      '<div class="whead">' +
        '<div><p class="eyebrow">Compliance</p><h2>Levy</h2></div>' +
        '<span class="wchip warn">Approval stays in Notion</span>' +
      '</div>' +
      '<p class="wnote">Everything the screener has passed to compliance. This page shows the draft and the screener verdict — it cannot approve, change status or publish. Use the Notion link on a card to record a decision.</p>' +
      subnav + '<div class="wbody">' + body + '</div>';

    Array.prototype.forEach.call($('person-view').querySelectorAll('.subtab'), function (btn) {
      btn.addEventListener('click', function () {
        activeSection.levy = btn.getAttribute('data-section');
        renderLevy();
      });
    });
  }

  function assign(id, owner, control) {
    var state = $('prospects-view').querySelector('[data-state="' + id + '"]');
    var key = window.__newsKey || '';
    if (state) { state.textContent = 'Saving…'; state.className = 'save-state'; }
    control.disabled = true;
    fetch('/api/prospect-owner', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-terminal-key': key },
      body: JSON.stringify({ id: id, owner: owner })
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not save.'); return j; }); })
      .then(function () {
        (data.prospects || []).forEach(function (p) { if (p.id === id) p.owner = owner; });
        if (state) { state.textContent = 'Saved'; state.className = 'save-state ok'; }
        setTimeout(function () { if (state) state.textContent = ''; }, 2200);
      })
      .catch(function (e) {
        if (state) { state.textContent = e.message; state.className = 'save-state bad'; }
        var previous = '';
        (data.prospects || []).forEach(function (p) { if (p.id === id) previous = p.owner || ''; });
        control.value = previous;
      })
      .then(function () { control.disabled = false; });
  }

  /* ---------- lifecycle ---------- */

  function renderActive(view) {
    if (!data) return;
    if (view === COMPLIANCE) renderLevy();
    else if (PEOPLE.indexOf(view) >= 0) renderPerson(view);
    else if (view === 'email') renderEmail();
    else if (view === 'prospects') renderProspects();
  }

  function stamp() {
    if (!data) return;
    var text = data.stale
      ? 'Held copy from ' + clock(data.staleSince)
      : 'Updated ' + clock(data.asOf);
    $('workspace-stamp').textContent = text;
  }

  function load(force) {
    var key = window.__newsKey || '';
    if (!key) return Promise.resolve(false);
    $('workspace-stamp').textContent = 'Loading…';
    return fetch('/api/workspace' + (force ? '?refresh=1' : ''), {
      headers: { 'x-terminal-key': key },
      cache: 'no-store'
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Unavailable.'); return j; }); })
      .then(function (d) { data = d; stamp(); return true; })
      .catch(function (e) {
        data = null;
        $('workspace-stamp').textContent = e.message;
        return false;
      });
  }

  window.SATSTREET_WORKSPACE = {
    /* Called when a key is accepted. Fetches once; each tab renders from the
       same payload so switching people costs nothing. */
    mount: function () { return load(false); },
    unmount: function () {
      data = null;
      ['person-view', 'email-view', 'prospects-view'].forEach(function (id) {
        if ($(id)) $(id).innerHTML = '';
      });
      if ($('workspace-stamp')) $('workspace-stamp').textContent = '';
    },
    show: function (view) {
      if (data) { renderActive(view); return Promise.resolve(true); }
      return load(false).then(function (ok) { if (ok) renderActive(view); return ok; });
    },
    refresh: function (view) {
      return load(true).then(function (ok) { if (ok) renderActive(view); return ok; });
    }
  };
})();
