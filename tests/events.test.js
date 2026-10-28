import test from 'node:test';import assert from 'node:assert/strict';import events from '../public/events.js';
const E=events,now=Date.parse('2026-10-27T12:00:00Z');
test('event tagging covers the six types and falls back to Other',()=>{
  const cases=[['Engwe recalls batteries over fire risk','Recall'],['Lectric cuts prices on XP 4.0 by $200','Price change'],['Fiido raises $20m in Series A','Funding / financial'],['Fiido raises prices after tariffs','Price change'],['Ahooga announces UK expansion','Market entry'],['Gocycle launches in the US','Market entry'],['Tern announces distribution partnership','Partnership / distribution'],['Brompton launches new B2B Partner Portal','Partnership / distribution'],['Tern launches all-new HSD cargo bike','Launch'],['Birdy raises concerns about suspension','Other'],['DAHON-V Technology at CIN Live 2026','Other']];
  for(const [t,w] of cases)assert.equal(E.classify(t,''),w,t);
  assert.equal(E.classify('Quiet title','The brand announced a recall of a part'),'Recall');
});
test('momentum compares equal windows and ignores bad or future dates',()=>{
  const items=[{date:'2026-10-25',brand:'Tern'},{date:'2026-10-20',brand:'Tern'},{date:'2026-10-02',brand:'Tern'},{date:'2026-09-20',brand:'Tern'},{date:'2026-12-01',brand:'Dahon'},{date:'nope',brand:'Dahon'},{date:'2026-10-26',brand:'Other brand'}];
  const m=Object.fromEntries(E.momentum(items,['Tern','Dahon'],now,30,12).map(x=>[x.brand,x]));
  assert.equal(m.Tern.cur,3);assert.equal(m.Tern.prev,1);assert.equal(m.Tern.label,'Accelerating');
  assert.equal(m.Dahon.label,'No activity');assert.equal(m.Tern.spark.length,12);assert.equal(m.Tern.spark.reduce((a,b)=>a+b,0),4);
});
test('digest ranks us and the watchlist first and formats for Slack',()=>{
  const items=[{date:'2026-10-26',brand:'Dahon',title:'Dahon launches a bike',url:'https://x.test/a'},{date:'2026-10-25',brand:'Tern',title:'Tern cuts prices',url:'https://x.test/b'},{date:'2026-10-24',brand:'Brompton',title:'Brompton opens a new store in Tokyo',url:'https://x.test/c'},{date:'2026-09-01',brand:'Tern',title:'old'}];
  const d=E.buildDigest(items,{us:'Brompton',watch:['Tern'],threat:{Tern:{level:'High'}},brands:['Dahon','Tern','Brompton']},now,7);
  assert.equal(d.total,3);assert.deepEqual(d.top.map(i=>i.brand),['Brompton','Tern','Dahon']);
  const slack=E.digestText(d,now,'slack');assert.match(slack,/<https:\/\/x\.test\/b\|Tern cuts prices>/);assert.match(slack,/Tern \[High\] 1/);
  assert.match(E.digestHtml(d,now),/<a href="https:\/\/x\.test\/c">/);
});
