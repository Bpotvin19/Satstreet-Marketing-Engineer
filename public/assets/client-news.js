(function () {
  'use strict';
  var S = window.SATSTREET;
  var $ = function (id) { return document.getElementById(id); };
  S.mountHeader('News');

  function setState(message, ok) {
    $('brief-state').textContent = message;
    $('brief-pip').className = 'pip' + (ok ? ' ok' : '');
  }

  fetch('/api/desknote', { cache: 'no-store', headers: { accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('request failed');
      return response.json();
    })
    .then(function (data) {
      $('brief-loading').hidden = true;
      if (!data.note || !Array.isArray(data.note.paragraphs) || !data.note.paragraphs.length) {
        $('brief-empty').hidden = false;
        setState('No brief published', false);
        return;
      }

      var note = data.note;
      $('brief-title').textContent = note.title || 'Today’s market note';
      if (note.date) {
        var date = new Date(note.date + 'T12:00:00');
        $('brief-date').textContent = date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
        $('brief-date').dateTime = note.date;
      }
      if (note.preheader) {
        $('brief-lede').textContent = note.preheader;
        $('brief-lede').hidden = false;
      }
      note.paragraphs.forEach(function (paragraph) {
        var p = document.createElement('p');
        p.textContent = paragraph;
        $('brief-copy').appendChild(p);
      });
      $('brief-content').hidden = false;
      setState('Latest reviewed brief', true);
    })
    .catch(function () {
      $('brief-loading').hidden = true;
      $('brief-error').hidden = false;
      setState('Brief unavailable', false);
    });
})();
