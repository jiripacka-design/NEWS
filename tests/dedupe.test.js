import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const D=await import('../lib/dedupe.js');

test('headlines are compared without the publisher suffix, punctuation or filler words',()=>{
  assert.equal(D.cleanTitle('Brompton opens Paris flagship store - BikeBiz'),'brompton opens paris flagship store');
  assert.equal(D.cleanTitle('Tern’s new GSD | Cycling Industry News'),'tern s new gsd');
  assert.ok(D.similarity('Brompton opens Paris flagship store - BikeBiz','Brompton opens flagship store in Paris')>=D.SAME);
  assert.ok(D.similarity('Brompton opens Paris flagship store','Brompton recalls 2024 seatposts')<D.SAME);
});

test('links are compared without tracking parameters, www and trailing slashes; Google News wrappers are ignored',()=>{
  assert.equal(D.canonicalUrl('https://www.bikebiz.com/story/?utm_source=rss&utm_medium=x#top'),D.canonicalUrl('http://bikebiz.com/story'));
  assert.notEqual(D.canonicalUrl('https://bikebiz.com/story?id=1'),D.canonicalUrl('https://bikebiz.com/story?id=2'));
  assert.equal(D.canonicalUrl('https://news.google.com/rss/articles/CBMi123'),'');
});

test('the same story from several feeds is folded into one card; the publisher link with a picture is the one shown',()=>{
  const A=[
    {id:'g',brand:'Brompton',title:'Brompton opens Paris flagship store - BikeBiz',url:'https://news.google.com/rss/articles/abc',published:'2026-10-01T08:00:00Z',source:'Google News'},
    {id:'p',brand:'Brompton',title:'Brompton opens flagship store in Paris',url:'https://bikebiz.com/brompton-paris',image:'https://bikebiz.com/a.jpg',published:'2026-10-01T09:00:00Z',source:'BikeBiz'},
    {id:'u',brand:'General',title:'Brompton opens Paris flagship store',url:'https://www.bikebiz.com/brompton-paris/?utm_source=x',published:'2026-10-02T09:00:00Z',source:'Trade feed'},
    {id:'other',brand:'Brompton',title:'Brompton recalls seatposts on 2024 bikes',url:'https://x.test/recall',published:'2026-10-01T10:00:00Z'},
    {id:'late',brand:'Brompton',title:'Brompton opens Paris flagship store',url:'https://y.test/late',published:'2026-12-20T10:00:00Z'},
    {id:'tern',brand:'Tern',title:'Tern opens Paris flagship store',url:'https://z.test/t',published:'2026-10-01T10:00:00Z'}
  ];
  const m=D.groupStories(A);
  assert.equal(m.get('g'),'p');assert.equal(m.get('u'),'p');assert.ok(!m.has('p'));
  assert.ok(!m.has('other'),'a different story stays');assert.ok(!m.has('late'),'too far apart in time');assert.ok(!m.has('tern'),'a different brand stays');
  assert.equal(D.groupStories(A,new Set(['g'])).has('g'),false,'"Not a duplicate" keeps it on its own');
});

test('the scanner skips plain repeats but keeps loosely similar stories for the feed to group',()=>{
  const stored=[{id:'1',brand:'Tern',title:'Tern launches the new Verge X11 - road.cc',url:'https://road.cc/verge',published:'2026-10-01T00:00:00Z'}];
  assert.ok(D.isRepeat({brand:'Tern',title:'Tern launches the new Verge X11',url:'https://other.test/a',published:'2026-10-02T00:00:00Z'},stored));
  assert.ok(D.isRepeat({brand:'Tern',title:'Something else',url:'https://www.road.cc/verge/?utm_campaign=z',published:'2026-10-02T00:00:00Z'},stored));
  assert.equal(D.isRepeat({brand:'Tern',title:'Tern launches Verge X11 with bigger battery and new colours',url:'https://other.test/b',published:'2026-10-02T00:00:00Z'},stored),null);
});

test('/api/news returns the groups and remembers "not a duplicate"',async()=>{
  process.env.CI_LOCAL_STORE=fs.mkdtempSync(path.join(os.tmpdir(),'ci-dup-'));process.env.SESSION_SECRET='test-secret';
  const {token,COOKIE}=await import('../lib/auth.js'),{writeJson,paths}=await import('../lib/store.js'),news=await import('../app/api/news/route.js');
  const cookie=`${COOKIE}=${token()}`,req=(m,b)=>new Request('http://x.test/api/news',{method:m,headers:{cookie,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});
  await writeJson(paths.articles,{articles:[{id:'a',brand:'Dahon',title:'Dahon unveils K3 Plus folding bike',url:'https://a.test/1',published:'2026-10-01T00:00:00Z'},{id:'b',brand:'Dahon',title:'Dahon unveils the K3 Plus folding bike - BikeRadar',url:'https://b.test/2',published:'2026-10-01T05:00:00Z'}]});
  let d=await (await news.GET(req('GET'))).json();assert.equal(Object.keys(d.dupOf).length,1);
  const id=Object.keys(d.dupOf)[0];
  assert.equal((await news.POST(req('POST',{id,notDuplicate:true}))).status,200);
  d=await (await news.GET(req('GET'))).json();assert.equal(Object.keys(d.dupOf).length,0);assert.deepEqual(d.notDup,[id]);
  assert.equal((await news.POST(req('POST',{id}))).status,400);
});
