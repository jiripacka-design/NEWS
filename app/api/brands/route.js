import {authorised,userOf} from '../../../lib/auth.js';
import {recordChanges} from '../../../lib/audit.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import {actOnArticles,removeSources,removeModels,addBrandSources} from '../../../lib/maintain.js';
import {cleanBrand} from '../../../lib/validate.js';
// Editable brand profiles: category, positioning, threat level, watchlist, regions, "us" and sources.
// GET -> {brands:{name:{...}}}.  POST {brand, fields} or {updates:{name:fields}} merges into the stored profile.
const noStore={'cache-control':'private, no-store'};
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  return Response.json(await readJson(paths.brands,{updatedAt:null,brands:{}}),{headers:noStore});
}
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  // Add a competitor: {addCompetitor:{name, category, website, createSources}}. It becomes a normal brand everywhere and, if asked, gets news sources.
  if(b.addCompetitor){
    const c=b.addCompetitor,name=String(c.name||'').trim().replace(/\s+/g,' ').slice(0,80);
    if(!name)return Response.json({error:'Give the competitor a name'},{status:400});
    const {out,bad}=cleanBrand({category:c.category,website:c.website});if(bad.length)return Response.json({error:`Invalid ${bad.join(', ')}`},{status:400});
    const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};d.removed=(d.removed||[]).filter(x=>x!==name);
    if(d.brands[name]&&d.brands[name].custom)return Response.json({error:`${name} is already on your list`},{status:409});
    const now=new Date().toISOString();d.brands[name]={...(d.brands[name]||{}),...out,custom:true,addedAt:now,updatedAt:now};d.updatedAt=now;
    await writeJson(paths.brands,d);
    try{await recordChanges([{kind:'brand',key:name,name,before:null,after:d.brands[name],noUndo:true}],{by:userOf(req),via:'edit',alert:false})}catch(e){}
    const sources=c.createSources===false?0:await addBrandSources(name,out.website);
    return Response.json({...d,sourcesAdded:sources});
  }
  if(b.restoreBrands===true){const d=await readJson(paths.brands,{updatedAt:null,brands:{}}),n=(d.removed||[]).length;d.removed=[];d.updatedAt=new Date().toISOString();await writeJson(paths.brands,d);return Response.json({...d,restored:n})}
  const updates=b.updates&&typeof b.updates==='object'?b.updates:(b.brand?{[b.brand]:b.fields||{}}:null);
  if(!updates||!Object.keys(updates).length)return Response.json({error:'Send {brand, fields} or {updates:{brand:fields}}'},{status:400});
  if(Object.keys(updates).length>60)return Response.json({error:'Too many brands in one request'},{status:400});
  const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};
  const now=new Date().toISOString(),changes=[],via=['edit','collect','re-check','import','ai-check'].includes(b.via)?b.via:'edit';
  for(const [name,fields] of Object.entries(updates)){
    const n=String(name).trim().slice(0,120);if(!n)return Response.json({error:'Brand name is required'},{status:400});
    const {out,bad}=cleanBrand(fields||{});
    if(bad.length)return Response.json({error:`${n}: invalid ${bad.join(', ')}`},{status:400});
    const before=d.brands[n]?{...d.brands[n]}:{};d.brands[n]={...(d.brands[n]||{}),...out,updatedAt:now};changes.push({kind:'brand',key:n,name:n,before,after:d.brands[n]});
    // Only one brand is "us". Setting it on one clears it everywhere else.
    if(out.isUs===true)for(const k of Object.keys(d.brands))if(k!==n&&d.brands[k].isUs)d.brands[k]={...d.brands[k],isUs:false};
  }
  d.updatedAt=now;
  await writeJson(paths.brands,d);
  try{await recordChanges(changes,{by:userOf(req),via,alert:false})}catch(e){/* best effort */}
  return Response.json(d);
}

// DELETE ?name=X&sources=keep|delete&articles=keep|archive|delete&models=keep|delete
// Removes a competitor from every list. Your own additions are deleted outright; the built-in brands are hidden and can be restored.
export async function DELETE(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const q=new URL(req.url).searchParams,name=(q.get('name')||'').trim(),srcOpt=q.get('sources')||'keep',artOpt=q.get('articles')||'keep',modOpt=q.get('models')||'keep';
  if(!name)return Response.json({error:'Say which competitor'},{status:400});
  const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};
  if(d.brands[name]&&d.brands[name].isUs)return Response.json({error:`${name} is marked as us and cannot be removed. Mark another brand as us first.`},{status:400});
  const res={sources:0,articles:0,models:0};
  if(srcOpt==='delete')res.sources=(await removeSources(s=>s.brand===name)).count;
  if(artOpt==='archive'||artOpt==='delete')res.articles=(await actOnArticles({brand:name},artOpt)).count;
  if(modOpt==='delete')res.models=await removeModels(name);
  if(d.brands[name]&&d.brands[name].custom)delete d.brands[name];
  else d.removed=[...new Set([...(d.removed||[]),name])];
  d.updatedAt=new Date().toISOString();await writeJson(paths.brands,d);
  try{await recordChanges([{kind:'brand',key:name,name,before:{name,removed:false},after:{name,removed:true,sources:srcOpt,articles:artOpt,models:modOpt},noUndo:true}],{by:userOf(req),via:'edit',alert:false})}catch(e){}
  return Response.json({...d,result:res});
}
