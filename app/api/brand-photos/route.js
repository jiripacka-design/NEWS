import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson,getSources} from '../../../lib/store.js';
import {fetchPageImage,isPublicHttpUrl} from '../../../lib/images.js';
export const maxDuration=30;
// Find a picture for one brand from its own website (the page's preview image) and save the link on the brand profile.
// POST {brand}. The website is the one on the brand profile, else the brand's home page from the scanner's source list.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  const brand=String(b.brand||'').trim().slice(0,120);
  if(!brand)return Response.json({error:'Brand is required'},{status:400});
  const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};
  let site=(d.brands[brand]||{}).website;
  if(!site){
    const cfg=await getSources();
    site=cfg.sources.filter(s=>s.brand===brand&&s.type==='site'&&s.url).map(s=>s.url).sort((x,y)=>{try{return new URL(x).pathname.length-new URL(y).pathname.length}catch{return 0}})[0];
  }
  if(!site)return Response.json({error:`No website on file for ${brand}. Add one on its profile.`},{status:404});
  if(!isPublicHttpUrl(site))return Response.json({error:'That website address is not allowed'},{status:400});
  let photo='';
  try{photo=await fetchPageImage(site,8000)}catch(e){return Response.json({error:`Could not read ${new URL(site).hostname}: ${e.message}`},{status:502})}
  if(!photo)return Response.json({error:`No preview picture found on ${new URL(site).hostname}`},{status:404});
  const now=new Date().toISOString();
  d.brands[brand]={...(d.brands[brand]||{}),photo,photoSource:site,updatedAt:now};d.updatedAt=now;
  await writeJson(paths.brands,d);
  return Response.json({brand,photo,photoSource:site});
}
