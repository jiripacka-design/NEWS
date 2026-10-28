import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import {upsert,seedProducts} from '../../../lib/products.js';
const load=async()=>(await readJson(paths.products,null))?.products||seedProducts();
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  return Response.json({products:await load()},{headers:{'cache-control':'private, no-store'}});
}
// Body: one product, or {products:[...]} for CSV import. Existing rows are matched by id, then brand+model.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>null);if(!b)return Response.json({error:'Invalid request'},{status:400});
  const rows=Array.isArray(b.products)?b.products:[b];
  if(rows.length>500)return Response.json({error:'Import up to 500 rows at a time'},{status:400});
  const r=upsert(await load(),rows);
  if(r.errors.length)return Response.json({error:r.errors.slice(0,5).join('; ')},{status:400});
  await writeJson(paths.products,{updatedAt:new Date().toISOString(),products:r.products});
  return Response.json({products:r.products});
}
export async function DELETE(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const id=new URL(req.url).searchParams.get('id'),products=(await load()).filter(x=>x.id!==id);
  await writeJson(paths.products,{updatedAt:new Date().toISOString(),products});
  return Response.json({products});
}
