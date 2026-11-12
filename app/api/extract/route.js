import {authorised} from '../../../lib/auth.js';
import {fetchSpecs} from '../../../lib/extract.js';
export const maxDuration=30;
// POST {url}: read a product page and return "Label: value" lines for Collect data to check. Nothing is saved.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  try{return Response.json(await fetchSpecs(b.url))}
  catch(e){return Response.json({error:'Could not read that page: '+(e.name==='TimeoutError'?'it took too long to answer':e.message)},{status:422})}
}
