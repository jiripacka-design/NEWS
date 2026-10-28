import crypto from 'node:crypto';
import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson} from '../../../lib/store.js';
import events from '../../../public/events.js';
const PLATFORMS=['Instagram','Facebook','LinkedIn','YouTube','TikTok','X','Other'];
// Manually logged social posts (found via the Social watch tab). Stored with the scanned articles.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  const title=String(b.title||'').trim().slice(0,300),brand=String(b.brand||'').trim().slice(0,120);
  if(!title||!brand)return Response.json({error:'Brand and a description of the post are required'},{status:400});
  const platform=PLATFORMS.includes(b.platform)?b.platform:'Other';
  const url=String(b.url||'').trim();
  if(url&&!/^https:\/\//i.test(url))return Response.json({error:'Link must start with https://'},{status:400});
  const t=new Date(b.published),published=isNaN(t)?new Date().toISOString():t.toISOString();
  const lock=await readJson(paths.lock,null);
  if(lock&&Date.now()-new Date(lock.startedAt).getTime()<20*60*1000)return Response.json({error:'A scan is running - try again in a minute'},{status:409});
  const d=await readJson(paths.articles,{articles:[]});
  const a={id:crypto.randomUUID().replace(/-/g,'').slice(0,32),title,summary:String(b.summary||'').trim().slice(0,600),url:url.slice(0,1000),published,source:`${platform} (manual)`,sourceId:'manual',brand,validation:false,manual:true,eventType:events.EVENT_TYPES.includes(b.eventType)?b.eventType:'',ingestedAt:new Date().toISOString()};
  const articles=[a,...d.articles].sort((x,y)=>(Date.parse(y.published)||0)-(Date.parse(x.published)||0)).slice(0,5000);
  await writeJson(paths.articles,{updatedAt:new Date().toISOString(),articles});
  return Response.json(a);
}
