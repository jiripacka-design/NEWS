import {authorised} from '../../../lib/auth.js';
import {paths,readJson} from '../../../lib/store.js';
import {recheck,resolve,staleIds,STALE_DAYS} from '../../../lib/recheck.js';
import {sendAlerts} from '../../../lib/alerts.js';
import {userOf} from '../../../lib/auth.js';
export const maxDuration=60;
const cron=(req)=>!!process.env.CRON_SECRET&&req.headers.get('authorization')===`Bearer ${process.env.CRON_SECRET}`;
// GET: the review list (changes found by earlier re-checks). Called by the monthly job (with the cron secret) it also re-checks
// the models that have not been verified for STALE_DAYS days; changes wait for a person, unchanged models are marked verified.
export async function GET(req){
  if(cron(req)){try{const ids=await staleIds(40),r=await recheck(ids,{budgetMs:45000,by:'Weekly re-check'});let sent=null;try{sent=await sendAlerts({force:true})}catch(e){sent={error:e.message}}return Response.json({checked:r.checked,left:r.left,pending:Object.keys(r.pending).length,alerts:sent})}catch(e){return Response.json({error:e.message},{status:500})}}
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const q=await readJson(paths.recheck,{updatedAt:null,results:{}});return Response.json({...q,staleDays:STALE_DAYS},{headers:{'cache-control':'private, no-store'}});
}
// POST {ids:[…]}: re-check these models now (up to 8 per call; the page calls repeatedly to show progress).
// POST {resolve:[…]}: take these models off the review list (after saving or dismissing their changes).
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  if(Array.isArray(b.resolve))return Response.json({pending:await resolve(b.resolve.map(String).slice(0,500))});
  const ids=Array.isArray(b.ids)?b.ids.map(String).slice(0,8):[];
  if(!ids.length)return Response.json({error:'Send ids (up to 8) or resolve'},{status:400});
  return Response.json(await recheck(ids,{budgetMs:45000,by:userOf(req)}));
}
