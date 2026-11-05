import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CI_LOCAL_STORE=fs.mkdtempSync(path.join(os.tmpdir(),'ci-audit-'));process.env.SESSION_SECRET='test-secret';process.env.SITE_PASSWORD='pw';
const A=await import('../lib/auth.js'),{readJson,writeJson,paths}=await import('../lib/store.js'),{P}=await import('../lib/audit.js');
const products=await import('../app/api/products/route.js'),brands=await import('../app/api/brands/route.js'),history=await import('../app/api/history/route.js'),backup=await import('../app/api/backup/route.js'),login=await import('../app/api/login/route.js');
const as=(name)=>`${A.COOKIE}=${A.token(name)}`;
const call=(mod,method,url,body,who='Jiri')=>mod[method](new Request('http://x.test'+url,{method,headers:{cookie:as(who),'content-type':'application/json'},body:body?JSON.stringify(body):undefined}));

test('sessions carry the name; old cookies still work; personal passwords when SITE_USERS is set',async()=>{
  assert.ok(A.valid(A.token('Anna')));const req=new Request('http://x',{headers:{cookie:as('Anna')}});assert.equal(A.userOf(req),'Anna');
  const crypto=await import('node:crypto'),e=String(Date.now()+1e6),old=`${e}.${crypto.createHmac('sha256','test-secret').update(e).digest('hex')}`;
  assert.ok(A.valid(old));assert.equal(A.userOf(new Request('http://x',{headers:{cookie:`${A.COOKIE}=${old}`}})),'Someone');
  assert.ok(!A.valid(A.token('Anna').replace('.QW5u','.QW5v')),'the name cannot be changed without breaking the signature');
  assert.equal(A.check('Jiri','pw'),'Jiri');assert.equal(A.check('','pw'),'Someone');assert.equal(A.check('Jiri','no'),null);
  process.env.SITE_USERS='Jiri:one, Anna:two';assert.equal(A.check('jiri','one'),'Jiri');assert.equal(A.check('Anna','one'),null);assert.equal(A.check('Bob','pw'),null,'the shared password no longer works');
  assert.equal((await (await login.GET()).json()).personal,true);delete process.env.SITE_USERS;
});

test('every save is in the edit history with who and how; prices get a history and alerts',async()=>{
  let r=await (await call(products,'POST','/api/products',{product:{brand:'Tern',model:'Verge X11',priceGBP:2700,weightKg:10.2},via:'collect'})).json();
  const id=r.products[0].id;
  await call(products,'POST','/api/products',{product:{id,brand:'Tern',model:'Verge X11',priceGBP:2900}},'Anna');
  await call(products,'POST','/api/products',{product:{id,brand:'Tern',model:'Verge X11',status:'discontinued'}},'Anna');
  const h=(await (await call(history,'GET','/api/history')).json()).entries;
  assert.deepEqual(h.map(e=>[e.action,e.by,e.via]),[['change','Anna','edit'],['change','Anna','edit'],['add','Jiri','collect']]);
  assert.deepEqual(h[1].before,{priceGBP:2700});assert.deepEqual(h[1].after,{priceGBP:2900});
  assert.ok(h[0].after.discontinuedAt,'the date it was discontinued is filled in');
  const s=(await readJson(P.prices,{})).series[id];assert.deepEqual(s.map(x=>x.value),[2700,2900]);assert.ok(!s[0].start,'the first save is the start');
  const al=(await readJson(P.alerts,{})).alerts.map(a=>a.type);assert.ok(al.includes('price')&&al.includes('new-model')&&al.includes('discontinued'),al.join());
});

test('undo puts values back, refuses when changed again since, and is itself in the history',async()=>{
  const id=(await readJson(paths.products,{})).products[0].id;
  let h=(await (await call(history,'GET','/api/history')).json()).entries,price=h.find(e=>e.after.priceGBP===2900);
  assert.equal((await call(history,'POST','/api/history',{undo:price.id})).status,200);
  assert.equal((await readJson(paths.products,{})).products[0].priceGBP,2700);
  assert.equal((await call(history,'POST','/api/history',{undo:price.id})).status,409,'only once');
  await call(products,'POST','/api/products',{product:{id,brand:'Tern',model:'Verge X11',weightKg:11}});
  h=(await (await call(history,'GET','/api/history')).json()).entries;const first=h.find(e=>e.action==='change'&&e.via==='edit'&&e.after.weightKg===11);
  await call(products,'POST','/api/products',{product:{id,brand:'Tern',model:'Verge X11',weightKg:12}});
  const r=await call(history,'POST','/api/history',{undo:first.id});assert.equal(r.status,409);assert.deepEqual((await r.json()).moved,['weightKg']);
  assert.equal((await call(history,'POST','/api/history',{undo:first.id,force:true})).status,200);assert.equal((await readJson(paths.products,{})).products[0].weightKg,10.2);
  // deleting a model can be undone
  await call(products,'DELETE','/api/products?id='+id);assert.equal((await readJson(paths.products,{})).products.length,0);
  const del=(await (await call(history,'GET','/api/history')).json()).entries.find(e=>e.action==='remove');
  assert.equal((await call(history,'POST','/api/history',{undo:del.id})).status,200);assert.equal((await readJson(paths.products,{})).products[0].model,'Verge X11');
  // brand profile changes too
  await call(brands,'POST','/api/brands',{brand:'Tern',fields:{hq:'Taipei'}});await call(brands,'POST','/api/brands',{brand:'Tern',fields:{hq:'Taipei, Taiwan'}});
  const bh=(await (await call(history,'GET','/api/history?kind=brand')).json()).entries;assert.equal(bh[0].before.hq,'Taipei');
  assert.equal((await call(history,'POST','/api/history',{undo:bh[0].id})).status,200);assert.equal((await readJson(paths.brands,{})).brands.Tern.hq,'Taipei');
});

test('backups: made on request, listed, downloadable, and restore needs confirming and keeps a safety copy',async()=>{
  const made=await (await call(backup,'POST','/api/backup',{create:true})).json();assert.equal(made.backup.models,1);
  await call(products,'POST','/api/products',{product:{brand:'Dahon',model:'K3'}});
  const dl=await call(backup,'GET','/api/backup?download='+made.backup.id);assert.match(dl.headers.get('content-disposition'),/brompton-enemies-backup/);
  assert.equal((await call(backup,'POST','/api/backup',{restore:made.backup.id})).status,400);
  const r=await (await call(backup,'POST','/api/backup',{restore:made.backup.id,confirm:'RESTORE'})).json();assert.ok(r.ok&&r.safety.models===2);
  assert.equal((await readJson(paths.products,{})).products.length,1);
  assert.equal((await (await call(backup,'GET','/api/backup')).json()).backups.length,2);
  assert.equal((await call(backup,'POST','/api/backup',{restore:'file',data:{nope:1},confirm:'RESTORE'})).status,400);
});

test('alert email: grouped, one subject line',async()=>{
  const {compose}=await import('../lib/alerts.js');
  const m=compose([{type:'price',text:'Tern Verge X11: list price £2,700 → £2,900 (+7.4%)',by:'Anna',via:'edit'},{type:'street',text:'Evans: £3,500 → £3,150',via:'re-check'}],'https://x.test');
  assert.match(m.subject,/1 list price changes, 1 street price changes/);assert.match(m.html,/recorded by Anna/);assert.ok(!/recorded by/.test(m.text.split('\n').find(l=>l.includes('Evans'))));
});
