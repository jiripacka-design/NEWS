import {paths,readJson,writeJson,getSources} from './store.js';
import {seedSources} from './seed-sources.js';
// Shared clean-up helpers for the Sources, Competitors and News screens.
// Articles: "archive" hides them from the feed but keeps them (and stops the scanner re-adding them);
// "delete" removes them for good and remembers their ids and links so the scanner does not bring them back.
export function pick(articles,sel){
  const ids=new Set(sel.ids||[]);
  return articles.filter(a=>(ids.size&&ids.has(a.id))||(sel.sourceId&&a.sourceId===sel.sourceId)||(sel.source&&a.source===sel.source&&!a.manual)||(sel.brand&&a.brand===sel.brand));
}
export async function actOnArticles(sel,action){
  const d=await readJson(paths.articles,{updatedAt:null,articles:[]}),list=d.articles||[],hit=new Set(pick(list,sel).map(a=>a.id));
  if(!hit.size)return {count:0};
  const now=new Date().toISOString();
  if(action==='delete'){
    const gone=list.filter(a=>hit.has(a.id)),dead=await readJson(paths.deleted,{ids:[],urls:[]});
    dead.ids=[...new Set([...(dead.ids||[]),...gone.map(a=>a.id)])].slice(-8000);
    dead.urls=[...new Set([...(dead.urls||[]),...gone.filter(a=>a.url).map(a=>`${a.brand}|${a.url}`)])].slice(-8000);
    await writeJson(paths.deleted,dead);
    d.articles=list.filter(a=>!hit.has(a.id));
  }else if(action==='archive'){d.articles=list.map(a=>hit.has(a.id)?{...a,archived:true,archivedAt:now}:a)}
  else if(action==='unarchive'){d.articles=list.map(a=>hit.has(a.id)?(({archived,archivedAt,...r})=>r)(a):a)}
  else throw new Error('Unknown action');
  d.updatedAt=now;await writeJson(paths.articles,d);return {count:hit.size};
}
// Remove sources by id. Built-in ones (seed list or the two system feeds) are remembered in "removed" so they do not come back by themselves.
export async function removeSources(match){
  const d=await getSources(),keep=[],gone=[];
  for(const s of d.sources)(match(s)?gone:keep).push(s);
  if(!gone.length)return {count:0,sources:[]};
  d.sources=keep;
  const builtin=gone.filter(s=>s.validation||seedSources.some(z=>z.id===s.id||(z.url&&z.url===s.url))).map(s=>s.id);
  d.removed=[...new Set([...(d.removed||[]),...builtin])];
  await writeJson(paths.sources,d);return {count:gone.length,sources:gone};
}
export async function removeModels(brand){
  const d=await readJson(paths.products,{updatedAt:null,products:[]}),n=(d.products||[]).length;
  d.products=(d.products||[]).filter(p=>p.brand!==brand);
  if(d.products.length!==n){d.updatedAt=new Date().toISOString();await writeJson(paths.products,d)}
  return n-d.products.length;
}
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'brand';
export async function addBrandSources(name,website){
  const d=await getSources(),now=new Date().toISOString(),add=[];
  const gn={id:`custom-gn-${slug(name)}`,name:`Google News – ${name}`,type:'google-news',query:`"${name}" bike`,brand:name,enabled:true,filterMode:'brand',createdAt:now};
  if(!d.sources.some(s=>s.id===gn.id))add.push(gn);
  if(/^https:\/\//i.test(website||'')){const site={id:`custom-site-${slug(name)}`,name:`${name} – official`,type:'site',url:website,brand:name,enabled:true,filterMode:'all',createdAt:now};if(!d.sources.some(s=>s.id===site.id||s.url===site.url))add.push(site)}
  if(add.length){d.sources.push(...add);d.removed=(d.removed||[]).filter(x=>!add.some(a=>a.id===x));await writeJson(paths.sources,d)}
  return add.length;
}
