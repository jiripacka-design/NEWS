import crypto from 'node:crypto';
import {authorised} from '../../../lib/auth.js';
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
  const cleaned=[];
  for(const [i,p] of incoming.entries()){const {out,bad}=cleanProduct(p||{});if(bad.length)return Response.json({error:`${incoming.length>1?`Row ${i+1}: `:''}${bad.join('; ')}`},{status:400});cleaned.push({id:String(p.id||'').slice(0,40),...out})}
  const d=await readJson(paths.products,{updatedAt:null,products:[]});d.products=d.products||[];
  const now=new Date().toISOString();let added=0,updated=0;
  for(const c of cleaned){
    let at=c.id?d.products.findIndex(x=>x.id===c.id):-1;
    if(at<0)at=d.products.findIndex(x=>productKey(x)===productKey(c));
    if(at>=0){d.products[at]={...d.products[at],...c,id:d.products[at].id,updatedAt:now};updated++}
    else{if(d.products.length>=MAX)return Response.json({error:`Limit of ${MAX} models reached`},{status:400});d.products.push({...c,id:crypto.randomUUID().replace(/-/g,'').slice(0,16),createdAt:now,updatedAt:now});added++}
  }
  d.updatedAt=now;
  await writeJson(paths.products,d);
  return Response.json({...d,added,updated});
}
export async function DELETE(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const id=new URL(req.url).searchParams.get('id')||'';
  const d=await readJson(paths.products,{updatedAt:null,products:[]});
  const before=(d.products||[]).length;d.products=(d.products||[]).filter(x=>x.id!==id);
  if(d.products.length===before)return Response.json({error:'Model not found'},{status:404});
  d.updatedAt=new Date().toISOString();await writeJson(paths.products,d);return Response.json(d);
}
