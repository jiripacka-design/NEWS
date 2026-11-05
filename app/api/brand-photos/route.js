import {authorised} from '../../../lib/auth.js';
import {paths,readJson,writeJson,getSources} from '../../../lib/store.js';
import {fetchPageImage,isPublicHttpUrl} from '../../../lib/images.js';
import {fetchSpecs} from '../../../lib/extract.js';
export const maxDuration=30;
const slug=b=>String(b).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'brand';
const photoPath=b=>`ci/photos/${slug(b)}.json`;
const modelPath=id=>`ci/photos/model-${String(id).replace(/[^a-z0-9]/gi,'').slice(0,40)}.json`;
const IMG=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
// GET ?brand=Name returns the picture a person uploaded for that brand (stored on the server, so everyone sees it).
export async function GET(req){
  if(!authorised(req))return new Response('Unauthorized',{status:401});
  const q=new URL(req.url).searchParams,brand=q.get('brand')||'',model=q.get('model')||'';
  // ?src=https://… passes a picture from another site through this one, so the page can crop it in the picture editor (browsers block that across sites). Pictures only, 10 MB at most.
  const src=q.get('src');
  if(src){
    if(!/^https:\/\//i.test(src)||!isPublicHttpUrl(src))return new Response('That picture link is not allowed',{status:400});
    try{
      const r=await fetch(src,{headers:{'user-agent':'Mozilla/5.0 (compatible; BromptonEnemies/3.12)',accept:'image/*'},signal:AbortSignal.timeout(10000),redirect:'follow'});
      const ct=(r.headers.get('content-type')||'').split(';')[0].trim();
      if(!r.ok||!/^image\/(jpeg|png|webp|avif|gif)$/i.test(ct)||(r.url&&!isPublicHttpUrl(r.url)))return new Response('No picture at that link',{status:404});
      const buf=Buffer.from(await r.arrayBuffer());if(buf.length>10e6)return new Response('Picture too large',{status:413});
      return new Response(buf,{headers:{'content-type':ct,'cache-control':'private, max-age=600'}});
    }catch(e){return new Response('Could not fetch the picture',{status:502})}
  }
  const d=await readJson(model?modelPath(model):photoPath(brand),null),m=d&&IMG.exec(d.data||'');
  if(!m)return new Response('No picture',{status:404});
  return new Response(Buffer.from(m[2],'base64'),{headers:{'content-type':m[1],'cache-control':'private, max-age=300'}});
}
// POST {brand, imageData}  saves an uploaded picture (a small data URL made by the page).
// POST {brand}             finds a picture on the brand's own website (the page's preview image) and saves the link.
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({}));
  // A picture for one model (SKU): {modelId, imageData}. Shown on the Product Comparison cards instead of the brand picture.
  // {modelId, findOnPage:true}: look for the model's picture on its product page (product data image, then preview image). Returns the link; the page then crops and saves it.
  if(b.modelId&&b.findOnPage){
    const pr=await readJson(paths.products,{updatedAt:null,products:[]}),p=(pr.products||[]).find(x=>x.id===String(b.modelId));
    if(!p)return Response.json({error:'Model not found'},{status:404});
    const page=String(b.url||p.url||p.sourceUrl||'');
    if(!/^https:\/\//i.test(page))return Response.json({error:'This model has no product page link yet. Add one (Edit > Product page link), or upload a picture.'},{status:404});
    try{const d=await fetchSpecs(page);if(!d.image)return Response.json({error:`No picture found on ${new URL(page).hostname}`},{status:404});return Response.json({image:d.image,page})}
    catch(e){return Response.json({error:'Could not read the product page: '+e.message},{status:502})}
  }
  if(b.modelId){
    const v=String(b.imageData||'');
    if(!IMG.test(v))return Response.json({error:'The picture must be a PNG, JPEG or WebP'},{status:400});
    if(v.length>450000)return Response.json({error:'The picture is too large after resizing. Try a smaller one.'},{status:413});
    const pr=await readJson(paths.products,{updatedAt:null,products:[]}),at=(pr.products||[]).findIndex(x=>x.id===String(b.modelId));
    if(at<0)return Response.json({error:'Model not found'},{status:404});
    const now=new Date().toISOString(),photo=`/api/brand-photos?model=${encodeURIComponent(b.modelId)}&v=${Date.now()}`;
    await writeJson(modelPath(b.modelId),{model:b.modelId,data:v,updatedAt:now});
    pr.products[at]={...pr.products[at],photo,photoSource:'uploaded',updatedAt:now};pr.updatedAt=now;await writeJson(paths.products,pr);
    return Response.json({modelId:b.modelId,photo,product:pr.products[at]});
  }
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

// DELETE ?model=ID or ?brand=Name removes an uploaded picture and goes back to the default one.
export async function DELETE(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const q=new URL(req.url).searchParams,model=q.get('model'),brand=q.get('brand');
  if(model){
    await writeJson(modelPath(model),null);
    const pr=await readJson(paths.products,{updatedAt:null,products:[]});pr.products=(pr.products||[]).map(x=>x.id===model?(({photo,photoSource,...r})=>r)(x):x);await writeJson(paths.products,pr);
    return Response.json({ok:true});
  }
  if(brand){
    await writeJson(photoPath(brand),null);
    const d=await readJson(paths.brands,{updatedAt:null,brands:{}});if(d.brands&&d.brands[brand]){const {photo,photoSource,...r}=d.brands[brand];d.brands[brand]=r;await writeJson(paths.brands,d)}
    return Response.json({ok:true});
  }
  return Response.json({error:'Say which picture: model or brand'},{status:400});
}
