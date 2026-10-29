import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import events from '../../../public/events.js';
// Manual corrections to the automatic event type of a scanned article. POST {id, type}; type '' removes the correction.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  const id=String(b.id||'');
  if(!/^[a-z0-9]{8,64}$/i.test(id))return Response.json({error:'Unknown article id'},{status:400});
  if(b.type!==''&&!events.EVENT_TYPES.includes(b.type))return Response.json({error:'Unknown event type'},{status:400});
  const d=await readJson(paths.tags,{tags:{}});d.tags=d.tags||{};
  if(b.type==='')delete d.tags[id];else d.tags[id]=b.type;
  await writeJson(paths.tags,d);
  return Response.json({id,type:b.type});
}
