import {authorised} from '../../../../lib/auth.js';
import {checkSite} from '../../../../lib/scanner.js';
export const maxDuration=60;
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));const url=String(b.url||'').trim();
  if(!/^https:\/\//i.test(url))return Response.json({error:'The link must start with https://'},{status:400});
  try{return Response.json(await checkSite(url))}
  catch(e){return Response.json({error:/^No RSS/.test(e.message)?'No feed found at this address. Try the site\'s feed link (often /feed or /rss), or paste an RSS link directly.':'Could not read this link: '+e.message},{status:422})}
}
