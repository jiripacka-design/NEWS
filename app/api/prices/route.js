import {authorised} from '../../../lib/auth.js';
import {readJson} from '../../../lib/store.js';
import {P} from '../../../lib/audit.js';
// GET: price history for every model {series:{modelId:[{field, value, at, shop?, seen?}]}}. Written by saves and re-checks.
export async function GET(req){if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});return Response.json(await readJson(P.prices,{series:{}}),{headers:{'cache-control':'private, no-store'}})}
