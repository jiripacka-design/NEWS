import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const E=createRequire(import.meta.url)('../public/events.js');
const load=f=>JSON.parse(fs.readFileSync(new URL('./'+f,import.meta.url),'utf8'));
const acc=set=>set.filter(([t,s,exp])=>E.classify(t,s)===exp).length/set.length;
test('the tagger gets at least 95% of the tuned headlines and 85% of unseen ones',()=>{assert.ok(acc(load('events.fixture.json'))>=0.95,'tuned set');assert.ok(acc(load('events.holdout.json'))>=0.85,'holdout set')});
test('a headline that mentions several things goes to the strongest signal, not the first rule',()=>{
  assert.equal(E.classify('Dahon recalls folding bike after price cut',''),'Recall');
});
test('classifyDetailed explains itself and says how sure it is',()=>{
  const d=E.classifyDetailed('Dahon recalls Mariner D8 over frame cracking','Owners should stop riding.');
  assert.equal(d.type,'Recall');assert.equal(d.confidence,'high');assert.ok(d.why.length);
  const o=E.classifyDetailed('Council plans new cycle lanes','');assert.equal(o.type,'Other');assert.equal(o.confidence,'low');
});
test('every event type has a style class',()=>{const h=fs.readFileSync(new URL('../public/tracker.html',import.meta.url),'utf8');for(const t of E.EVENT_TYPES)assert.ok(h.includes('.e-'+t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'{'),t)});
