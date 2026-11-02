import {authorised} from '../../../lib/auth.js';
import {makeDigest,sendDigest,channels} from '../../../lib/digest.js';
export const maxDuration=60;
// GET: preview the weekly digest (signed-in users) or, with ?send=1 and the cron bearer token, send it (Vercel Cron).
// POST: send it now (signed-in users). Slack needs SLACK_WEBHOOK_URL; email needs RESEND_API_KEY and DIGEST_TO.
const isCron=req=>!!process.env.CRON_SECRET&&req.headers.get('authorization')===`Bearer ${process.env.CRON_SECRET}`;
const noStore={'cache-control':'private, no-store'};
export async function GET(req){
  const cron=isCron(req);
  if(!cron&&!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  try{
    const made=await makeDigest();
    const sent=cron&&new URL(req.url).searchParams.get('send')==='1'?await sendDigest(made):null;
    return Response.json({...made,channels:channels(),sent},{headers:noStore});
  }catch(e){return Response.json({error:e.message},{status:500})}
}
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const ch=channels();
  if(!ch.slack&&!ch.email)return Response.json({error:'No delivery channel is set up. Add SLACK_WEBHOOK_URL (Slack) or RESEND_API_KEY and DIGEST_TO (email) in Vercel.'},{status:400});
  try{const made=await makeDigest();return Response.json({sent:await sendDigest(made),channels:ch})}catch(e){return Response.json({error:e.message},{status:500})}
}
