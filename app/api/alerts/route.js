import {authorised} from '../../../lib/auth.js';
import {readJson} from '../../../lib/store.js';
import {P} from '../../../lib/audit.js';
import {sendAlerts,canEmail,alertTo,compose} from '../../../lib/alerts.js';
// GET: recent alerts, whether email is set up, and a preview of the next email.
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const d=await readJson(P.alerts,{alerts:[],lastSent:null}),todo=(d.alerts||[]).filter(a=>!a.sent);
  return Response.json({alerts:(d.alerts||[]).slice(0,200),unsent:todo.length,lastSent:d.lastSent,email:canEmail(),to:alertTo().map(x=>x.replace(/^(.).*(@.*)$/,'$1…$2')),preview:todo.length?compose(todo.slice().reverse()).subject:''},{headers:{'cache-control':'private, no-store'}});
}
// POST: send the waiting alerts now.
export async function POST(req){if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});const r=await sendAlerts({force:true});return Response.json(r,{status:r.error?502:200})}
