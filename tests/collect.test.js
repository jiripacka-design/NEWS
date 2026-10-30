import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {cleanProduct} from '../lib/validate.js';
const K=createRequire(import.meta.url)('../public/collect.js');
const BROMPTON=`Weight
12.5 kg
Speed
12-speed
Material
Steel
Folded Size
25.3" H x 23" W x 10.6" D
Main Frame
Precision drawn heat-treated steel tubing
Brakes: Brompton Dual Pivot Calipers
Tyres	349 x 35C Schwalbe Marathon Racer
Front Carrier
Front carrier block adaptor for all types of Brompton luggage`;
test('pasted Brompton-style spec text is read into the right fields and units',()=>{
  const r=K.readInput(BROMPTON,{brand:'Brompton',model:'C Line 12-speed'});
  assert.equal(r.kind,'text');const v=r.recs[0].values;
  assert.equal(v.weightKg,12.5);assert.equal(v.gears,'12-speed');assert.equal(v.material,'Steel');
  assert.deepEqual([v.foldH,v.foldW,v.foldL],[64.3,58.4,26.9]);
  assert.equal(v.brakes,'Brompton Dual Pivot Calipers');assert.match(v.tyres,/Marathon Racer/);assert.match(v.frontCarrier,/block adaptor/);
  assert.equal(K.readInput('hello world',{}).error.length>0,true);
});
test('units: lb, mm, miles, volts x amp-hours, wrong currency',()=>{
  assert.equal(K.coerce('weightKg','27.5 lbs').set.weightKg,12.47);
  assert.deepEqual(K.coerce('fold','645 x 585 x 270 mm').set,{foldH:64.5,foldW:58.5,foldL:27});
  assert.equal(K.coerce('fold','645 x 585 x 270 mm').note.length>0,true);
  assert.equal(K.coerce('rangeKm','20-45 miles').set.rangeKm,72);
  assert.equal(K.coerce('batteryWh','36 V 8.1 Ah').set.batteryWh,292);
  assert.equal(K.coerce('priceGBP','£1,809.00').set.priceGBP,1809);
  assert.ok(K.coerce('priceGBP','$2,500').why);
  assert.ok(K.coerce('weightKg','n/a').skip);assert.ok(K.coerce('tyres',null).skip);
  assert.ok(K.coerce('sourceUrl','http://x.com').why);
});
test('AI answer (JSON, even fenced, with null and "not found") reads cleanly',()=>{
  const j='Here you go:\n```json\n{"products":[{"id":"abc","brand":"Tern","model":"Verge X11","weight_kg":10.2,"Folded Size":"80 x 38 x 74 cm","brakes":null,"tyres":"not found","na":["rollerWheels"],"sourceUrl":"https://www.ternbicycles.com/x"}]}\n```';
  const r=K.readInput(j);assert.equal(r.kind,'json');const x=r.recs[0];
  assert.equal(x.id,'abc');assert.equal(x.values.weightKg,10.2);assert.equal(x.values.foldH,80);assert.equal('brakes' in x.values,false);assert.equal('tyres' in x.values,false);
  assert.deepEqual(x.na,['rollerWheels']);assert.equal(cleanProduct({brand:x.brand,model:x.model,...x.values}).bad.length,0);
});
test('CSV and tab-separated rows work and empty cells never clear anything',()=>{
  const r=K.readInput('brand,model,priceGBP,weightKg,tyres\nDahon,Mariner D8,799,,"20 x 1.5, Kenda"\n');
  assert.equal(r.kind,'table');assert.deepEqual(r.recs[0].values,{priceGBP:799,tyres:'20 x 1.5, Kenda'});
  assert.equal(K.readInput('brand\tmodel\tweight\nTern\tLink\t12\n').recs[0].values.weightKg,12);
});
test('preview: new vs differs vs same, fuzzy model match',()=>{
  const cur={id:'1',brand:'Brompton',model:'C Line with Advance Roller Frame - 12-speed (MY27)',priceGBP:1599,weightKg:12.5};
  const rec=K.readInput('Weight: 12.5 kg\nPrice: £1,809\nBrakes: Calipers',{brand:'Brompton',model:'C Line 12-speed'}).recs[0];
  const m=K.findExisting(rec,[cur],['Brompton']);assert.equal(m.p.id,'1');assert.equal(m.how,'near');
  const st=Object.fromEntries(K.diffRecord(rec,cur).map(r=>[r.k,r.status]));
  assert.deepEqual(st,{weightKg:'same',priceGBP:'differs',brakes:'new'});
});
test('checklist: electric fields only for e-bikes, not-published counts as done',()=>{
  const a={id:'1',brand:'X',model:'Plain',category:'Folding bike'},b={id:'2',brand:'X',model:'Electric One',category:'Folding e-bike'};
  assert.equal(K.missingFor(a).some(f=>f.k==='motor'),false);assert.equal(K.missingFor(b).some(f=>f.k==='motor'),true);
  const before=K.missingFor(a).length;a.na=['saddle'];assert.equal(K.missingFor(a).length,before-1);
  a.foldH=1;a.foldW=1;a.foldL=1;assert.equal(K.filled(a,'fold'),true);
});
test('AI brief lists missing keys per model and asks for JSON only',()=>{
  const p={id:'9',brand:'Tern',model:'Link C8',priceGBP:900,weightKg:13};
  const t=K.buildBrief([{p,missing:K.missingFor(p).slice(0,3)}]);
  assert.match(t,/id: 9/);assert.match(t,/missing: fold, wheelIn, gears/);assert.match(t,/Return ONLY valid JSON/);assert.match(t,/already known: price £900, 13 kg/);
  const n=K.buildBrief([{p:null,brand:'Strida',website:'https://strida.com'}]);assert.match(n,/NEW MODELS|FIND MODELS/);assert.match(n,/Strida/);
});
test('every field the importer can write passes server validation',()=>{
  const o={brand:'B',model:'M'};for(const f of K.FIELDS){if(f.k==='fold'){o.foldH=1;o.foldW=2;o.foldL=3}else o[f.k]=f.k==='sourceUrl'?'https://a.com':/Kg|Km|Wh|price|launch/i.test(f.k)?(f.k==='launch'?'2025':5):'x'}
  o.na=['saddle'];const r=cleanProduct(o);assert.deepEqual(r.bad,[]);assert.deepEqual(r.out.na,['saddle']);assert.equal(r.out.maxLoadKg,5);assert.equal(r.out.riderHeight,'x');
  assert.ok(fs.readFileSync('public/collect.js','utf8').includes('window'));
});
