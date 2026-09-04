(function(){
  'use strict';
  var COINS={
    Bitcoin:'bitcoin',
    Ethereum:'ethereum',
    Stablecoins:'usd-coin',
    Solana:'solana',
    XRP:'ripple',
    Bittensor:'bittensor',
    Hyperliquid:'hyperliquid',
    Zcash:'zcash',
    'BNB Chain':'binancecoin'
  };
  var logos={};
  function escapeHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function ecosystemFromText(v){v=String(v||'');return Object.keys(COINS).find(function(name){return v===name||v.indexOf(name+' ·')===0||v.indexOf(name)===0})||null}
  function img(name,cls){var src=logos[name];if(!src)return null;return '<img class="'+(cls||'rc-crypto-logo')+'" src="'+escapeHtml(src)+'" alt="'+escapeHtml(name)+' logo">'}
  function applyLanding(){document.querySelectorAll('.rc-eco').forEach(function(card){var name=card.getAttribute('data-title');var box=card.querySelector('.rc-eco-icon');var mark=img(name,'rc-crypto-logo');if(box&&mark)box.innerHTML=mark})}
  function applyReader(){var reader=document.getElementById('reader');if(!reader||reader.hidden)return;var eyebrow=reader.querySelector('.rc-title-row .eyebrow');var title=reader.querySelector('.rc-title-row h2');var name=ecosystemFromText(eyebrow&&eyebrow.textContent)||ecosystemFromText(title&&title.textContent);var box=reader.querySelector('.rc-reader-icon');var mark=name&&img(name,'rc-crypto-logo rc-reader-crypto-logo');if(box&&mark)box.innerHTML=mark}
  function applyAll(){applyLanding();applyReader()}
  function save(){try{sessionStorage.setItem('satstreetCryptoLogos',JSON.stringify(logos))}catch(e){}}
  function loadSaved(){try{var x=JSON.parse(sessionStorage.getItem('satstreetCryptoLogos')||'{}');if(x&&typeof x==='object')logos=x}catch(e){}}
  function fetchLogos(){var ids=Object.keys(COINS).map(function(k){return COINS[k]}).join(',');return fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+encodeURIComponent(ids)+'&sparkline=false',{cache:'force-cache'}).then(function(r){if(!r.ok)throw new Error('logo feed unavailable');return r.json()}).then(function(rows){var byId={};rows.forEach(function(x){if(x&&x.id&&x.image)byId[x.id]=x.image});Object.keys(COINS).forEach(function(name){if(byId[COINS[name]])logos[name]=byId[COINS[name]]});save();applyAll()}).catch(function(){applyAll()})}
  function init(){loadSaved();applyAll();fetchLogos();var reader=document.getElementById('reader');if(reader){new MutationObserver(function(){applyReader()}).observe(reader,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();