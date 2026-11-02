export const maxDuration=60;
import {authorised} from '../../../lib/auth.js';import {runScan} from '../../../lib/scanner.js';export async function POST(req){if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});try{return Response.json(await runScan('manual'))}catch(e){return Response.json({error:e.message,logs:e.logs||[]},{status:500})}}
