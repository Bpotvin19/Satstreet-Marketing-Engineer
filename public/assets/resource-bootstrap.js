(function(){
  function add(sel, cls){var el=document.querySelector(sel);if(el)el.classList.add(cls)}
  function boot(){
    add('main','rc-shell');
    add('.research','rc-research');
    add('.ask','rc-ask');
    add('.answer','rc-answer');
    add('.hero','rc-hero');
    var hero=document.querySelector('.hero');
    if(hero){var boxes=hero.querySelectorAll('.box');if(boxes[0])boxes[0].classList.add('rc-card','rc-searchbox');if(boxes[1])boxes[1].classList.add('rc-card','rc-start')}
    add('.search','rc-search');
    document.querySelectorAll('.section').forEach(function(x){x.classList.add('rc-section')});
    var hub=document.getElementById('hub');if(hub){hub.classList.remove('grid');hub.classList.add('rc-ecosystems')}
    var resources=document.getElementById('resources');if(resources){resources.classList.remove('grid');resources.classList.add('rc-resource-grid')}
    var reader=document.getElementById('reader');if(reader)reader.classList.add('rc-reader');
    var quick=document.getElementById('quick');if(quick){quick.classList.remove('row');quick.classList.add('rc-foundation')}
    var s=document.createElement('script');s.src='./assets/resource-native.js?v=3';document.body.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();