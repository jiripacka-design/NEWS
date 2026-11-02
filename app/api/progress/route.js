import {authorised} from '../../../lib/auth.js';
import {paths,readJson} from '../../../lib/store.js';
// The scanner writes ci/progress.json while it runs. The Run scan button reads it to draw its progress ring.
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const p=await readJson(paths.progress,null);
  return Response.json({progress:p},{headers:{'cache-control':'private, no-store'}});
}
