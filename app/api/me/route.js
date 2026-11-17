import {authorised,userOf,cleanName,token,COOKIE} from '../../../lib/auth.js';
// GET: who is signed in (shown in the header; edits are recorded under this name).
export async function GET(req){if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});return Response.json({name:userOf(req)},{headers:{'cache-control':'private, no-store'}})}
// PUT {name}: v3.15. Sessions made before names were asked for (or with the name left out) show as "Someone" in History.
// This puts a name on the current session without signing in again; the session keeps its normal length.
export async function PUT(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  let b={};try{b=await req.json()}catch{}
  const name=cleanName(b.name);if(!name||/^someone$/i.test(name))return Response.json({error:'Type your name'},{status:400});
  return Response.json({ok:true,name},{headers:{'set-cookie':`${COOKIE}=${token(name)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`,'cache-control':'private, no-store'}});
}
// POST: sign out.
export async function POST(){return Response.json({ok:true},{headers:{'set-cookie':'ci_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}})}
