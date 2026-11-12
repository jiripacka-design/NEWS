import {authorised,userOf} from '../../../lib/auth.js';
// GET: who is signed in (shown in the header; edits are recorded under this name).
export async function GET(req){if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});return Response.json({name:userOf(req)},{headers:{'cache-control':'private, no-store'}})}
// POST: sign out.
export async function POST(){return Response.json({ok:true},{headers:{'set-cookie':'ci_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}})}
