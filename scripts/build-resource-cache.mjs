import fs from 'node:fs/promises';
import path from 'node:path';

const NOTION='https://api.notion.com/v1';
const VERSION='2022-06-28';
const TOKEN=(process.env.NOTION_TOKEN||'').trim();
const ROOT=(process.env.NOTION_RESOURCES_PAGE||'3c0e562f-a5bd-81d8-b8c5-cc4d048593fc').trim();
const HUB=(process.env.NOTION_KNOWLEDGE_HUB_PAGE||'3bbe562f-a5bd-80f2-93c6-ddfe1462cd20').trim();
const OUT=path.join(process.cwd(),'public','data','resources');
const ASSETS=path.join(OUT,'assets');
if(!TOKEN){console.warn('NOTION_TOKEN missing; skipping Resource Centre cache build.');process.exit(0)}
const clean=v=>{const r=String(v).replace(/-/g,'');return /^[0-9a-f]{32}$/i.test(r)?`${r.slice(0,8)}-${r.slice(8,12)}-${r.slice(12,16)}-${r.slice(16,20)}-${r.slice(20)}`:String(v)};
const plain=a=>(a||[]).map(x=>x?.plain_text??x?.text?.content??'').join('').trim();
const rich=a=>(a||[]).map(x=>({text:String(x?.plain_text??x?.text?.content??''),href:x?.href||x?.text?.link?.url||null,bold:!!x?.annotations?.bold,italic:!!x?.annotations?.italic,underline:!!x?.annotations?.underline,strikethrough:!!x?.annotations?.strikethrough,code:!!x?.annotations?.code})).filter(x=>x.text);
function title(p){for(const v of Object.values(p?.properties||{})){if(v?.type==='title')return plain(v.title)}return'Untitled'}
function icon(i){if(!i)return null;if(i.type==='emoji')return i.emoji||null;if(i.type==='external')return i.external?.url||null;return null}
async function notion(p){const r=await fetch(NOTION+p,{headers:{authorization:`Bearer ${TOKEN}`,'Notion-Version':VERSION}});const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b?.message||`Notion ${r.status}`);return b}
async function children(id){let out=[],cursor='';do{const q=new URLSearchParams({page_size:'100'});if(cursor)q.set('start_cursor',cursor);const r=await notion(`/blocks/${clean(id)}/children?${q}`);out.push(...(r.results||[]));cursor=r.has_more?String(r.next_cursor||''):''}while(cursor);return out}
async function saveAsset(url,id,type){try{const r=await fetch(url);if(!r.ok)return url;const ct=r.headers.get('content-type')||'';let ext=type==='pdf'?'.pdf':ct.includes('svg')?'.svg':ct.includes('png')?'.png':ct.includes('webp')?'.webp':ct.includes('jpeg')||ct.includes('jpg')?'.jpg':type==='video'?'.mp4':'.bin';const name=`${clean(id)}${ext}`;await fs.writeFile(path.join(ASSETS,name),Buffer.from(await r.arrayBuffer()));return `/data/resources/assets/${name}`}catch{return url}}
const containers=new Set(['column','column_list','table','synced_block','toggle','callout']);
async function normalize(b,depth=0){const type=b.type,p=b[type]||{},base={id:clean(b.id),type};if(['paragraph','heading_1','heading_2','heading_3','quote','bulleted_list_item','numbered_list_item','toggle','to_do'].includes(type)){base.rich=rich(p.rich_text);base.text=plain(p.rich_text);if(type==='to_do')base.checked=!!p.checked}else if(type==='callout'){base.rich=rich(p.rich_text);base.text=plain(p.rich_text);base.icon=icon(p.icon);base.color=p.color||''}else if(type==='code'){base.rich=rich(p.rich_text);base.text=plain(p.rich_text);base.language=p.language||''}else if(type==='child_page'){base.pageId=clean(b.id);base.title=p.title||'Untitled'}else if(type==='bookmark'||type==='embed'){base.url=p.url||'';base.text=plain(p.caption)}else if(['image','video','file','pdf'].includes(type)){const u=p.type==='external'?p.external?.url:p.file?.url;base.url=u?await saveAsset(u,b.id,type):'';base.text=plain(p.caption)}else if(type==='link_preview'){base.url=p.url||''}else if(type==='link_to_page'&&p.type==='page_id'){base.pageId=clean(p.page_id);base.title='Linked page'}else if(type==='table_row'){base.cells=(p.cells||[]).map(c=>rich(c))}else if(type==='divider'){}else if(!b.has_children){return null}
if(b.has_children&&type!=='child_page'&&depth<6){const kids=await children(b.id);base.children=(await Promise.all(kids.map(x=>normalize(x,depth+1)))).filter(Boolean)}return base}
const seen=new Set(),queue=[clean(ROOT),clean(HUB)],index=[];
await fs.mkdir(ASSETS,{recursive:true});
while(queue.length){const id=queue.shift();if(!id||seen.has(id)||seen.size>250)continue;seen.add(id);try{const page=await notion(`/pages/${id}`),kids=await children(id),blocks=(await Promise.all(kids.map(x=>normalize(x,0)))).filter(Boolean);const doc={page:{id,title:title(page),edited:page.last_edited_time||null,icon:icon(page.icon)},blocks,source:'Notion cache',cachedAt:new Date().toISOString()};await fs.writeFile(path.join(OUT,`${id}.json`),JSON.stringify(doc));index.push({id,title:doc.page.title,edited:doc.page.edited});for(const b of blocks){walk(b)}}catch(e){console.warn('Resource cache skipped',id,e.message)}
}
function walk(b){if(b?.pageId&&!seen.has(clean(b.pageId)))queue.push(clean(b.pageId));for(const c of b?.children||[])walk(c)}
await fs.writeFile(path.join(OUT,'index.json'),JSON.stringify({generatedAt:new Date().toISOString(),root:clean(ROOT),hub:clean(HUB),pages:index},null,2));
console.log(`Resource Centre cache built: ${index.length} pages`);
