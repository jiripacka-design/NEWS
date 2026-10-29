import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CI_LOCAL_STORE=fs.mkdtempSync(path.join(os.tmpdir(),'ci-'));process.env.SESSION_SECRET='test-secret';process.env.CRON_SECRET='cron-secret';
const {token,COOKIE}=await import('../lib/auth.js');
const brands=await import('../app/api/brands/route.js'),products=await import('../app/api/products/route.js'),news=await import('../app/api/news/route.js'),tags=await import('../app/api/tags/route.js'),digest=await import('../app/api/digest/route.js'),manual=await import('../app/api/manual/route.js');
const {writeJson,paths}=await import('../lib/store.js');
const cookie=`${COOKIE}=${token()}`;
const req=(method,url,body,headers={})=>new Request('http://x.test'+url,{method,headers:{cookie,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
const anon=(method,url,body)=>new Request('http://x.test'+url,{method,headers:{'content-type':'application/json'},body:body&&method!=='GET'?JSON.stringify(body):undefined});
test('all new routes refuse signed-out requests',async()=>{
  for(const [m,f] of [['GET',brands.GET],['POST',brands.POST],['GET',products.GET],['POST',products.POST],['DELETE',products.DELETE],['POST',tags.POST],['GET',digest.GET],['POST',digest.POST],['GET',news.GET]])assert.equal((await f(anon(m,'/api/x',{}))).status,401);
});
test('brand profile: only one "us", validation, partial updates keep other fields',async()=>{
  let r=await brands.POST(req('POST','/api/brands',{updates:{Brompton:{isUs:true,category:'Folding bike',watch:false},Tern:{watch:true,threat:'High',threatReason:'Same compact-folding buyer',regions:{US:'United States, Canada',EMEA:['Germany']}}}}));
  assert.equal(r.status,200);
  r=await brands.POST(req('POST','/api/brands',{brand:'Dahon',fields:{isUs:true}}));let d=await r.json();
  assert.equal(d.brands.Dahon.isUs,true);assert.equal(d.brands.Brompton.isUs,false);assert.equal(d.brands.Brompton.category,'Folding bike');
  assert.deepEqual(d.brands.Tern.regions.US,['United States','Canada']);assert.equal(d.brands.Tern.threat,'High');
  for(const bad of [{category:'Scooter'},{threat:'Extreme'},{sources:['http://insecure.test']},{revenueGBPm:-4},{lastVerified:'yesterday'}])assert.equal((await brands.POST(req('POST','/api/brands',{brand:'Tern',fields:bad}))).status,400,JSON.stringify(bad));
  assert.equal((await brands.POST(req('POST','/api/brands',{}))).status,400);
});
test('products: add, bulk upsert by brand+model, validate, delete',async()=>{
  let r=await products.POST(req('POST','/api/products',{product:{brand:'Brompton',model:'C Line Explore',category:'Folding bike',priceGBP:'1500',weightKg:'11.8',foldL:'58',foldW:'56.5',foldH:'27',gears:'6',launch:'2024-03'}}));let d=await r.json();
  assert.equal(r.status,200);assert.equal(d.added,1);assert.equal(d.products[0].priceGBP,1500);const id=d.products[0].id;
  r=await products.POST(req('POST','/api/products',{products:[{brand:'brompton',model:'c line explore',priceGBP:1600},{brand:'Tern',model:'Verge X11',category:'Folding e-bike',batteryWh:400,rangeKm:'',weightKg:''}]}));d=await r.json();
  assert.equal(d.added,1);assert.equal(d.updated,1);assert.equal(d.products.length,2);assert.equal(d.products.find(p=>p.id===id).priceGBP,1600);assert.equal(d.products.find(p=>p.id===id).weightKg,11.8);
  assert.equal(d.products.find(p=>p.model==='Verge X11').rangeKm,null);
  for(const bad of [{brand:'X'},{brand:'X',model:'Y',priceGBP:-1},{brand:'X',model:'Y',launch:'soon'},{brand:'X',model:'Y',url:'http://no'},{brand:'X',model:'Y',category:'Unicycle'}])assert.equal((await products.POST(req('POST','/api/products',{product:bad}))).status,400,JSON.stringify(bad));
  assert.equal((await products.DELETE(req('DELETE','/api/products?id=nope'))).status,404);
  r=await products.DELETE(req('DELETE','/api/products?id='+id));d=await r.json();assert.equal(d.products.length,1);
  assert.equal((await (await products.GET(req('GET','/api/products'))).json()).products.length,1);
});
test('manual post carries an event type and tags can be corrected',async()=>{
  const a=await (await manual.POST(req('POST','/api/manual',{brand:'Tern',platform:'Instagram',title:'Teaser for something',eventType:'Launch'}))).json();
  assert.equal(a.eventType,'Launch');
  assert.equal((await tags.POST(req('POST','/api/tags',{id:a.id,type:'Recall'}))).status,200);
  assert.equal((await tags.POST(req('POST','/api/tags',{id:a.id,type:'Nonsense'}))).status,400);
  const n=await (await news.GET(req('GET','/api/news'))).json();assert.equal(n.tags[a.id],'Recall');
});
test('digest: signed-in preview, cron send needs the bearer token, POST needs a channel',async()=>{
  await writeJson(paths.articles,{articles:[{id:'abcdef123456',title:'Tern cuts prices on the Verge',summary:'',url:'https://x.test/v',published:new Date().toISOString(),brand:'Tern',source:'GN'}]});
  const d=await (await digest.GET(req('GET','/api/digest'))).json();
  assert.ok(d.text.includes('Tern'));assert.equal(d.sent,null);assert.equal(d.channels.slack,false);
  assert.equal((await digest.GET(anon('GET','/api/digest?send=1'))).status,401);
  const c=await (await digest.GET(new Request('http://x.test/api/digest?send=1',{headers:{authorization:'Bearer cron-secret'}}))).json();
  assert.deepEqual(c.sent,{slack:null,email:null});
  assert.equal((await digest.POST(req('POST','/api/digest'))).status,400);
});
const images=await import('../lib/images.js'),scanner=await import('../lib/scanner.js'),photos=await import('../app/api/brand-photos/route.js');
test('picture extraction: RSS media tags, enclosure, inline img, page preview image, junk and private addresses refused',()=>{
  const feed=`<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>
   <item><title>A</title><link>https://site.test/a</link><media:content url="https://cdn.test/a.jpg" medium="image"/></item>
   <item><title>B</title><link>https://site.test/b</link><enclosure url="http://cdn.test/b.png" type="image/png"/></item>
   <item><title>C</title><link>https://site.test/c</link><content:encoded><![CDATA[<p>hi</p><img src="/img/c.webp" width="600">]]></content:encoded></item>
   <item><title>D</title><link>https://site.test/d</link><description><![CDATA[<img src="https://x.test/pixel.gif">]]></description></item>
   <item><title>E</title><link>https://site.test/e</link><media:content url="https://cdn.test/e.mp3" type="audio/mpeg"/></item></channel></rss>`;
  const it=scanner.parseItems(feed,{name:'S'});
  assert.deepEqual(it.map(x=>x.image),['https://cdn.test/a.jpg','https://cdn.test/b.png','https://site.test/img/c.webp','','']);
  assert.equal(images.metaImage('<head><meta content="/hero.jpg" property="og:image"><meta name="twitter:image" content="https://t.test/t.jpg"></head>','https://brand.test/'),'https://brand.test/hero.jpg');
  assert.equal(images.metaImage("<meta name='twitter:image' content='https://t.test/t.jpg'>",'https://brand.test/'),'https://t.test/t.jpg');
  for(const u of ['http://localhost/x','http://10.0.0.5/x','http://192.168.1.1/x','http://169.254.169.254/x','ftp://a.test/x','http://intranet/x'])assert.equal(images.isPublicHttpUrl(u),false,u);
  assert.equal(images.isPublicHttpUrl('https://www.brompton.com/'),true);
  assert.equal(images.cleanImageUrl('data:image/png;base64,AAAA'),'');
});
test('brand profile company fields validate; photo route finds a preview picture or explains why not',async()=>{
  assert.equal((await brands.POST(req('POST','/api/brands',{brand:'Tern',fields:{hq:'Taipei, Taiwan',founded:'2011',employees:'about 300',ownership:'Private',website:'https://www.ternbicycles.com/'}}))).status,200);
  for(const bad of [{founded:'twenty'},{website:'http://insecure.test'},{photo:'javascript:alert(1)'}])assert.equal((await brands.POST(req('POST','/api/brands',{brand:'Tern',fields:bad}))).status,400,JSON.stringify(bad));
  const real=globalThis.fetch;
  try{
    globalThis.fetch=async u=>new Response('<html><head><meta property="og:image" content="https://cdn.test/tern.jpg"></head></html>',{status:200,headers:{'content-type':'text/html'}});
    const r=await photos.POST(req('POST','/api/brand-photos',{brand:'Tern'}));assert.equal(r.status,200);assert.equal((await r.json()).photo,'https://cdn.test/tern.jpg');
    assert.equal((await (await brands.GET(req('GET','/api/brands'))).json()).brands.Tern.photo,'https://cdn.test/tern.jpg');
    globalThis.fetch=async()=>new Response('<html><head></head></html>',{status:200,headers:{'content-type':'text/html'}});
    assert.equal((await photos.POST(req('POST','/api/brand-photos',{brand:'Brompton'}))).status,404);
    assert.equal((await photos.POST(req('POST','/api/brand-photos',{brand:'Cranston'}))).status,404);
  }finally{globalThis.fetch=real}
  assert.equal((await photos.POST(anon('POST','/api/brand-photos',{brand:'Tern'}))).status,401);
});
