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

  var PEOPLE = ['ben', 'george', 'dan', 'mike'];
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

  function isSocial(d) {
    return (d.platforms || []).some(function (p) { return p === 'X' || p === 'LinkedIn'; });
  }

  function isEmail(d) {
    return (d.platforms || []).indexOf('Email') >= 0;
  }

  /* ---------- shared pieces ---------- */

  function statusChip(d) {
    var approval = d.approval || 'Needs Review';
    var cls = approval === 'Approved' ? 'ok' : (approval === 'Changes Requested' ? 'bad' : 'warn');
    return '<span class="wchip ' + cls + '">' + esc(approval) + '</span>';
  }

  function draftCard(d, showVoice) {
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
    var isMike = key === 'mike';
    var section = activeSection[key] || 'social';
    if (section === 'newsletters' && !isMike) section = 'social';

    var sections = [['social', 'Potential social posts', social.length]];
    if (isMike) sections.push(['newsletters', 'Newsletters', (data.newsletters || []).length]);
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
    } else if (section === 'newsletters') {
      var list = data.newsletters || [];
      body = list.length
        ? '<ul class="nlist">' + list.map(function (n) {
            return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title) + '</a>' +
              (n.lastEdited ? '<span>' + esc(day(n.lastEdited)) + '</span>' : '') + '</li>';
          }).join('') + '</ul>'
        : emptyState('The newsletter archive is empty.');
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
    $('email-view').innerHTML =
      '<div class="whead"><div><p class="eyebrow">Shared queue</p><h2>Email drafts</h2></div></div>' +
      '<p class="wnote">Written by the bots into the Content Queue. Nothing here is sent from this page — sending and approval stay with a person.</p>' +
      (drafts.length
        ? '<div class="draft-list">' + drafts.map(function (d) { return draftCard(d, true); }).join('') + '</div>'
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

  function renderProspects() {
    var all = data.prospects || [];
    var rows = leadFilter === 'all' ? all : all.filter(function (p) { return p.leadSource === leadFilter; });
    var counts = { all: all.length, Daily: 0, Offshore: 0 };
    all.forEach(function (p) { if (counts[p.leadSource] !== undefined) counts[p.leadSource] += 1; });

    var filters = [['all', 'All'], ['Daily', 'Daily'], ['Offshore', 'Offshore']].map(function (f) {
      return '<button class="subtab" type="button" data-lead="' + f[0] + '" aria-selected="' + (leadFilter === f[0]) + '">' +
        esc(f[1]) + '<span class="count">' + counts[f[0]] + '</span></button>';
    }).join('');

    var mine = {};
    all.forEach(function (p) { if (p.owner) mine[p.owner] = (mine[p.owner] || 0) + 1; });
    var tally = OWNERS.map(function (o) {
      return '<span class="wchip plain">' + esc(o) + ' <b>' + (mine[o] || 0) + '</b></span>';
    }).join('');

    var body = rows.length
      ? '<div class="ptable-wrap"><table class="ptable"><thead><tr>' +
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
        }).join('') + '</tbody></table></div>'
      : emptyState('No prospects match this filter.');

    $('prospects-view').innerHTML =
      '<div class="whead"><div><p class="eyebrow">Revenue</p><h2>Prospecting list</h2></div><div class="tally">' + tally + '</div></div>' +
      '<p class="wnote">Daily and offshore research in one list. Assigning a name records who intends to reach out — it is not contact, and it does not change the research status.</p>' +
      '<div class="subnav">' + filters + '</div><div class="wbody">' + body + '</div>';

    Array.prototype.forEach.call($('prospects-view').querySelectorAll('[data-lead]'), function (btn) {
      btn.addEventListener('click', function () { leadFilter = btn.getAttribute('data-lead'); renderProspects(); });
    });
    Array.prototype.forEach.call($('prospects-view').querySelectorAll('.owner-pick'), function (sel) {
      sel.addEventListener('change', function () { assign(sel.getAttribute('data-id'), sel.value, sel); });
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
    if (PEOPLE.indexOf(view) >= 0) renderPerson(view);
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
