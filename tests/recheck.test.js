import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CI_LOCAL_STORE=fs.mkdtempSync(path.join(os.tmpdir(),'ci-rc-'));process.env.SESSION_SECRET='test-secret';
const R=await import('../lib/recheck.js'),{writeJson,readJson,paths}=await import('../lib/store.js');
const P=[
  {id:'v',brand:'Tern',model:'Verge X11',priceGBP:2700,weightKg:10.2,gears:'11-speed',url:'https://tern.test/verge',lastVerified:'2026-01-01'},
  {id:'k',brand:'Dahon',model:'K3',priceGBP:899,weightKg:8.9,url:'https://dahon.test/k3',lastVerified:'2026-01-01'},
  {id:'n',brand:'Dahon',model:'Mu',priceGBP:700,lastVerified:'2026-01-01'},
  {id:'x',brand:'Birdy',model:'Birdy',url:'https://birdy.test/gone',lastVerified:'2026-01-01',na:['batteryWh']}];
const pages={'https://tern.test/verge':{lines:['Price: £2900','Weight: 10.2 kg','Gears: 11-speed','Brakes: Shimano 105','Source link: https://tern.test/verge'],image:'https://tern.test/v.jpg'},
  'https://dahon.test/k3':{lines:['Price: £899','Weight: 8.9 kg']}};
const fetcher=async(u)=>{if(!pages[u])throw new Error('the site answered HTTP 404');return pages[u]};

test('a changed price is found, a new spec is offered, the same values are left alone',()=>{
  const c=R.compare(P[0],pages['https://tern.test/verge']);
  assert.deepEqual(c.changes.map(x=>[x.k,x.cur,x.next]),[['priceGBP','2700','2900']]);
  assert.deepEqual(c.fills.map(x=>x.k),['brakes']);assert.deepEqual(c.changes[0].values,{priceGBP:2900});
});
test('re-checking stores changes for review and marks unchanged models as verified today; nothing saved is overwritten',async()=>{
  await writeJson(paths.products,{products:P});
  const r=await R.recheck(['v','k','n','x'],{fetcher});
  const by=Object.fromEntries(r.results.map(x=>[x.id,x.status]));
  assert.deepEqual(by,{v:'changed',k:'same',n:'no-link',x:'gone'},'a 404 page means the model may be discontinued');
  const pr=(await readJson(paths.products,{})).products,get=id=>pr.find(p=>p.id===id);
  assert.equal(get('k').lastVerified,R.today(),'unchanged = verified today');
  assert.equal(get('v').lastVerified,'2026-01-01');assert.equal(get('v').priceGBP,2700,'changes wait for a person');
  assert.equal(r.pending.v.image,'https://tern.test/v.jpg');assert.ok(!r.pending.k);assert.ok(r.pending.x&&!r.pending.n,'a gone page waits for review; no link is just reported');
  assert.deepEqual(Object.keys(await R.resolve(['v','x','n'])),[]);
});
test('the monthly job picks models with a page link not verified for 90 days, oldest first',async()=>{
  const old=new Date(Date.now()-200*864e5).toISOString().slice(0,10),mid=new Date(Date.now()-100*864e5).toISOString().slice(0,10),fresh=R.today();
  await writeJson(paths.products,{products:[{id:'a',url:'https://a.test',lastVerified:mid},{id:'b',url:'https://b.test',lastVerified:old},{id:'c',url:'https://c.test',lastVerified:fresh},{id:'d',lastVerified:old}]});
  assert.deepEqual(await R.staleIds(),['b','a']);
});
test('/api/recheck needs a login, takes ids and resolves',async()=>{
  const {token,COOKIE}=await import('../lib/auth.js'),rt=await import('../app/api/recheck/route.js');
  assert.equal((await rt.POST(new Request('http://x.test/api/recheck',{method:'POST',body:'{}'}))).status,401);
  const req=(b)=>new Request('http://x.test/api/recheck',{method:'POST',headers:{cookie:`${COOKIE}=${token()}`,'content-type':'application/json'},body:JSON.stringify(b)});
  assert.equal((await rt.POST(req({}))).status,400);
  assert.equal((await rt.POST(req({resolve:['zz']}))).status,200);
});
test('street prices are read from shop pages, kept with their history, and a change raises an alert',async()=>{
  const {P}=await import('../lib/audit.js');
  await writeJson(paths.products,{products:[{id:'s',brand:'Tern',model:'Vektron',priceGBP:3500,url:'https://tern.test/vek',lastVerified:R.today(),retail:[{shop:'Evans',url:'https://evans.test/vek',price:3500},{shop:'Gone',url:'https://gone.test/x'}]}]});
  const f=async(u)=>{if(u==='https://evans.test/vek')return {lines:['Price: £3150'],price:{value:3150,currency:'GBP'}};if(u==='https://tern.test/vek')return {lines:['Price: £3500','Weight: 22 kg']};throw new Error('the site answered HTTP 404')};
  const r=await R.recheck(['s'],{fetcher:f});
  const p=(await readJson(paths.products,{})).products[0];
  assert.equal(p.retail[0].price,3150);assert.equal(p.retail[1].error,'the shop page no longer exists');assert.equal(p.priceGBP,3500,'the list price is not touched');
  const pts=(await readJson(P.prices,{series:{}})).series.s;assert.deepEqual(pts.map(x=>[x.shop,x.value]),[['Evans',3150]]);
  const al=(await readJson(P.alerts,{alerts:[]})).alerts;assert.ok(al.some(a=>a.type==='street'&&/Evans: £3,500 → £3,150 \(−10%\)/.test(a.text)),JSON.stringify(al));
});
