import {COOKIE,token,check,users} from '../../../lib/auth.js';
// GET: does sign-in need a name from a list (personal passwords) or a free name (shared password)?
export async function GET(){return Response.json({personal:users().length>0})}
// POST {name, password}: signs in. The name is kept in the session so edits show who made them.
export async function POST(req){let body={};try{body=await req.json()}catch{}const who=check(body.name,body.password);if(!who)return Response.json({ok:false},{status:401});return Response.json({ok:true,name:who},{headers:{'set-cookie':`${COOKIE}=${token(who)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`}})}
