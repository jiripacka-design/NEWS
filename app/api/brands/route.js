import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
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
  const updates=b.updates&&typeof b.updates==='object'?b.updates:(b.brand?{[b.brand]:b.fields||{}}:null);
  if(!updates||!Object.keys(updates).length)return Response.json({error:'Send {brand, fields} or {updates:{brand:fields}}'},{status:400});
  if(Object.keys(updates).length>60)return Response.json({error:'Too many brands in one request'},{status:400});
  const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};
  const now=new Date().toISOString();
  for(const [name,fields] of Object.entries(updates)){
    const n=String(name).trim().slice(0,120);if(!n)return Response.json({error:'Brand name is required'},{status:400});
    const {out,bad}=cleanBrand(fields||{});
    if(bad.length)return Response.json({error:`${n}: invalid ${bad.join(', ')}`},{status:400});
    d.brands[n]={...(d.brands[n]||{}),...out,updatedAt:now};
    // Only one brand is "us". Setting it on one clears it everywhere else.
    if(out.isUs===true)for(const k of Object.keys(d.brands))if(k!==n&&d.brands[k].isUs)d.brands[k]={...d.brands[k],isUs:false};
  }
  d.updatedAt=now;
  await writeJson(paths.brands,d);
  return Response.json(d);
}
