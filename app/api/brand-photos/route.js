import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson,getSources} from '../../../lib/store.js';
import {fetchPageImage,isPublicHttpUrl} from '../../../lib/images.js';
export const maxDuration=30;
const slug=b=>String(b).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'brand';
const photoPath=b=>`ci/photos/${slug(b)}.json`;
const IMG=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
// GET ?brand=Name returns the picture a person uploaded for that brand (stored on the server, so everyone sees it).
export async function GET(req){
  if(!authorised(req))return new Response('Unauthorized',{status:401});
  const brand=new URL(req.url).searchParams.get('brand')||'';
  const d=await readJson(photoPath(brand),null),m=d&&IMG.exec(d.data||'');
  if(!m)return new Response('No picture',{status:404});
  return new Response(Buffer.from(m[2],'base64'),{headers:{'content-type':m[1],'cache-control':'private, max-age=300'}});
}
// POST {brand, imageData}  saves an uploaded picture (a small data URL made by the page).
// POST {brand}             finds a picture on the brand's own website (the page's preview image) and saves the link.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  const brand=String(b.brand||'').trim().slice(0,120);
  if(!brand)return Response.json({error:'Brand is required'},{status:400});
  const d=await readJson(paths.brands,{updatedAt:null,brands:{}});d.brands=d.brands||{};
  const now=new Date().toISOString();
  if(b.imageData!==undefined){
    const v=String(b.imageData);
    if(!IMG.test(v))return Response.json({error:'The picture must be a PNG, JPEG or WebP'},{status:400});
    if(v.length>450000)return Response.json({error:'The picture is too large after resizing. Try a smaller one.'},{status:413});
    await writeJson(photoPath(brand),{brand,data:v,updatedAt:now});
    const photo=`/api/brand-photos?brand=${encodeURIComponent(brand)}&v=${Date.now()}`;
    d.brands[brand]={...(d.brands[brand]||{}),photo,photoSource:'uploaded',updatedAt:now};d.updatedAt=now;
    await writeJson(paths.brands,d);
    return Response.json({brand,photo,photoSource:'uploaded'});
  }
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
  d.brands[brand]={...(d.brands[brand]||{}),photo,photoSource:site,updatedAt:now};d.updatedAt=now;
  await writeJson(paths.brands,d);
  return Response.json({brand,photo,photoSource:site});
}
