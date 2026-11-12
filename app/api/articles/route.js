import {authorised} from '../../../lib/auth.js';
import {paths,readJson} from '../../../lib/store.js';
import {actOnArticles} from '../../../lib/maintain.js';
// GET ?stats=1 -> article counts per source and per brand.  POST {action:'archive'|'unarchive'|'delete', ids|sourceId|brand}
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const d=await readJson(paths.articles,{articles:[]}),bySource={},byBrand={};
  for(const a of d.articles||[]){
    const s=bySource[a.sourceId||a.source||'?']=bySource[a.sourceId||a.source||'?']||{total:0,archived:0},b=byBrand[a.brand]=byBrand[a.brand]||{total:0,archived:0};
    s.total++;b.total++;if(a.archived){s.archived++;b.archived++}
  }
  return Response.json({bySource,byBrand,total:(d.articles||[]).length},{headers:{'cache-control':'private, no-store'}});
}
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  if(!['archive','unarchive','delete'].includes(b.action))return Response.json({error:'action must be archive, unarchive or delete'},{status:400});
  const sel={ids:Array.isArray(b.ids)?b.ids.map(String).slice(0,5000):[],sourceId:b.sourceId?String(b.sourceId):'',brand:b.brand?String(b.brand):'',source:b.source?String(b.source):''};
  if(!sel.ids.length&&!sel.sourceId&&!sel.brand&&!sel.source)return Response.json({error:'Say which articles: ids, sourceId, source or brand'},{status:400});
  try{return Response.json(await actOnArticles(sel,b.action))}catch(e){return Response.json({error:e.message},{status:500})}
}
