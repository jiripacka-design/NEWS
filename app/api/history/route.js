import {authorised,userOf} from '../../../lib/auth.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import {P,undo} from '../../../lib/audit.js';
const noStore={'cache-control':'private, no-store'};
// GET ?kind=model|brand&key=…&limit=: the edit history, newest first.
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const q=new URL(req.url).searchParams,kind=q.get('kind'),key=q.get('key'),limit=Math.min(2000,+q.get('limit')||400);
  const a=await readJson(P.audit,{entries:[]});let e=a.entries||[];
  if(kind)e=e.filter(x=>x.kind===kind);if(key)e=e.filter(x=>x.key===key);
  return Response.json({entries:e.slice(0,limit),total:e.length,me:userOf(req)},{headers:noStore});
}
// POST {undo:id, force?}: put the values from before that change back. Refuses (409) if those fields were changed again since, unless force.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));if(!b.undo)return Response.json({error:'Say which change to undo'},{status:400});
  const read=async(kind)=>{if(kind==='model'){const d=await readJson(paths.products,{products:[]});return {list:d.products||[]}}const d=await readJson(paths.brands,{brands:{}});return {list:Object.entries(d.brands||{}).map(([name,v])=>({...v,name}))}};
  const write=async(kind,list)=>{const now=new Date().toISOString();if(kind==='model'){const d=await readJson(paths.products,{products:[]});d.products=list;d.updatedAt=now;return writeJson(paths.products,d)}const d=await readJson(paths.brands,{brands:{}});d.brands=Object.fromEntries(list.map(({name,...v})=>[name,v]));d.updatedAt=now;return writeJson(paths.brands,d)};
  const r=await undo(String(b.undo),{by:userOf(req),force:!!b.force,read,write});
  if(r.error)return Response.json(r,{status:r.status||400});
  const out=r.kind==='model'?await readJson(paths.products,{products:[]}):await readJson(paths.brands,{brands:{}});
  return Response.json({ok:true,kind:r.kind,...out});
}
