import crypto from 'node:crypto';
import {authorised,userOf} from '../../../lib/auth.js';
import {recordChanges} from '../../../lib/audit.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import {cleanProduct,productKey} from '../../../lib/validate.js';
// Editable product models for the comparison matrix and the price/positioning map.
// GET -> {products:[]}.  POST {product} or {products:[...]} adds or updates (matched by id, else by brand + model).  DELETE ?id=
const noStore={'cache-control':'private, no-store'},MAX=1000;
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  return Response.json(await readJson(paths.products,{updatedAt:null,products:[]}),{headers:noStore});
}
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  const incoming=Array.isArray(b.products)?b.products:b.product?[b.product]:null;
  if(!incoming||!incoming.length)return Response.json({error:'Send {product} or {products:[...]}'},{status:400});
  if(incoming.length>MAX)return Response.json({error:`At most ${MAX} models per request`},{status:400});
  const cleaned=[],dropped=[];
  // lenient (used by Collect data): a value in a format we cannot accept is skipped and reported, instead of rejecting every model in the save
  for(const [i,p0] of incoming.entries()){let p=p0||{},res=cleanProduct(p);
    if(res.bad.length&&b.lenient===true){p={...p};for(let t=0;t<4&&res.bad.length;t++){const ks=[...new Set(res.bad.map(x=>(String(x).match(/^[A-Za-z]+/)||[''])[0]))].filter(k=>k&&!['brand','model'].includes(k)&&k in p);if(!ks.length)break;ks.forEach(k=>delete p[k]);dropped.push({row:i+1,model:String(p.model||''),fields:ks});res=cleanProduct(p)}}
    const {out,bad}=res;if(bad.length)return Response.json({error:`${incoming.length>1?`Row ${i+1}: `:''}${bad.join('; ')}`},{status:400});cleaned.push({id:String(p.id||'').slice(0,40),...out})}
  const d=await readJson(paths.products,{updatedAt:null,products:[]});d.products=d.products||[];
  const now=new Date().toISOString();let added=0,updated=0;const changes=[];
  // how the change was made, for the edit history: edit (by hand), collect, re-check, import
  const via=['edit','collect','re-check','import','ai-check'].includes(b.via)?b.via:'edit';
  for(const c of cleaned){
    let at=c.id?d.products.findIndex(x=>x.id===c.id):-1;
    if(at<0)at=d.products.findIndex(x=>productKey(x)===productKey(c));
    if(at>=0){const before=d.products[at];d.products[at]={...before,...c,id:before.id,updatedAt:now};if(c.status==='discontinued'&&before.status!=='discontinued'&&!c.discontinuedAt)d.products[at].discontinuedAt=now.slice(0,10);if(c.status===''){delete d.products[at].discontinuedAt}changes.push({kind:'model',key:before.id,before,after:d.products[at]});updated++}
    else{if(d.products.length>=MAX)return Response.json({error:`Limit of ${MAX} models reached`},{status:400});const np={...c,id:crypto.randomUUID().replace(/-/g,'').slice(0,16),createdAt:now,updatedAt:now};d.products.push(np);changes.push({kind:'model',key:np.id,before:null,after:np});added++}
  }
  d.updatedAt=now;
  await writeJson(paths.products,d);
  try{await recordChanges(changes,{by:userOf(req),via})}catch(e){/* history is best effort: the save itself succeeded */}
  return Response.json({...d,added,updated,dropped});
}
export async function DELETE(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const id=new URL(req.url).searchParams.get('id')||'';
  const d=await readJson(paths.products,{updatedAt:null,products:[]});
  const gone=(d.products||[]).find(x=>x.id===id);d.products=(d.products||[]).filter(x=>x.id!==id);
  if(!gone)return Response.json({error:'Model not found'},{status:404});
  d.updatedAt=new Date().toISOString();await writeJson(paths.products,d);
  try{await recordChanges([{kind:'model',key:id,before:gone,after:null}],{by:userOf(req),via:'edit',alert:false})}catch(e){}
  return Response.json(d);
}
