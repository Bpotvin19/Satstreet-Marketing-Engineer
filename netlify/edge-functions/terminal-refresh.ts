export default async function terminalRefresh(_request: Request, context: any) {
  const response = await context.next();
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  let html = await response.text();
  html = html.replace(/, Ben\./g, '.');
  html = html.replace(/<span class="avatar"[^>]*>[^<]*<\/span>/g, '');

  const css = `<style data-terminal-refresh>
  .avatar{display:none!important}.mainnav{gap:1px}.mainnav a{padding-left:8px;padding-right:8px}
  .pagehead{position:relative;min-height:148px;margin-bottom:28px;padding:14px 0 28px;gap:34px;align-items:flex-start;border-bottom:1px solid rgba(13,27,46,.085)}
  .pagehead>div:first-child{flex:1 1 620px;min-width:0;max-width:920px}.pagehead .eyebrow{margin:0 0 12px;font-size:11px;line-height:1.35;letter-spacing:1.28px;color:#59697a}
  .page-title-row{gap:15px;margin:0 0 12px;align-items:center}.pagehead h1{margin:0;font-size:39px;line-height:1.02;letter-spacing:-.55px}.page-emblem{width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,#e8f5fa,#f9fbfd 72%);border-color:#d1e5ed}
  .pagehead>div:first-child>p:last-child{max-width:72ch;font-size:16px;line-height:1.62;color:#465463}.pagehead>.feedstate{margin-top:8px;padding:7px 11px;border:1px solid #dfe7ee;border-radius:999px;background:rgba(255,255,255,.68);white-space:nowrap}.tabs{margin-bottom:24px}
  @media(max-width:900px){.navtoggle{display:block!important}.mainnav{display:none!important;position:absolute;top:58px;left:0;right:0;z-index:40;flex-direction:column;gap:0;margin:0;padding:6px 0 10px;background:var(--navy)}.mainnav.open{display:flex!important}.mainnav a{height:auto;padding:12px 20px}.pagehead{min-height:0;padding-top:6px;gap:18px}.pagehead h1{font-size:32px}}
  </style>`;

  const js = `<script data-terminal-refresh>(function(){function run(){var nav=document.getElementById('mainnav')||document.querySelector('.mainnav');if(nav){var links=[].slice.call(nav.querySelectorAll('a'));var chart=links.find(a=>/chart\\.html$/.test(a.getAttribute('href')||''));var structure=links.find(a=>/structure\\.html$/.test(a.getAttribute('href')||''));if(chart&&structure)nav.insertBefore(chart,structure);var r=nav.querySelector('a[href$="resources.html"]');if(!r){r=document.createElement('a');r.href='./resources.html';r.textContent='Resources';var p=links.find(a=>/portfolio\\.html$/.test(a.getAttribute('href')||''));nav.insertBefore(r,p||null)}if(/resources\\.html$/.test(location.pathname)){nav.querySelectorAll('a').forEach(a=>a.removeAttribute('aria-current'));r.setAttribute('aria-current','page')}}document.querySelectorAll('.avatar').forEach(x=>x.remove());var g=document.getElementById('greeting');if(g){var h=new Date().getHours();g.textContent='Good '+(h<12?'morning':h<17?'afternoon':'evening')+'.'}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run()})();</script>`;

  html = html.replace('</head>', css + '</head>').replace('</body>', js + '</body>');

  if (/\/resources\.html(?:$|[?#])/.test(new URL(_request.url).pathname)) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./assets/resource-native.css?v=3"></head>');
    html = html.replace('</body>', '<script src="./assets/resource-bootstrap.js?v=3"></script></body>');
  }

  const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('etag');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
export const config = { path: '/*' };
