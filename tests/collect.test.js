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
  // v3.11: a $ or € price given as the £ price is kept, in the $ or € field, instead of being rejected
  assert.deepEqual(K.coerce('priceGBP','$2,500').set,{priceUSD:2500});assert.deepEqual(K.coerce('priceGBP','EUR 1999').set,{priceEUR:1999});assert.ok(!K.coerce('priceGBP','$2,500').set.priceGBP);
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
  const p={id:'9',brand:'Tern',model:'Link C8',line:'Link',priceGBP:900,weightKg:13};
  const t=K.buildBrief([{p,missing:K.missingFor(p).slice(0,3)}]);
  assert.match(t,/id: 9/);assert.match(t,/missing: fold, wheelIn, gears/);assert.match(t,/Return ONLY valid JSON/);assert.match(t,/already known: price £900, Link, 13 kg/);
  const n=K.buildBrief([{p:null,brand:'Strida',website:'https://strida.com'}]);assert.match(n,/NEW MODELS|FIND MODELS/);assert.match(n,/Strida/);
});
test('every field the importer can write passes server validation',()=>{
  const o={brand:'B',model:'M'};for(const f of K.FIELDS){if(f.k==='fold'){o.foldH=1;o.foldW=2;o.foldL=3}else o[f.k]=f.k==='sourceUrl'?'https://a.com':/Kg|Km|Wh|price|launch/i.test(f.k)?(f.k==='launch'?'2025':5):'x'}
  o.na=['saddle'];const r=cleanProduct(o);assert.deepEqual(r.bad,[]);assert.deepEqual(r.out.na,['saddle']);assert.equal(r.out.maxLoadKg,5);assert.equal(r.out.riderHeight,'x');
  assert.ok(fs.readFileSync('public/collect.js','utf8').includes('window'));
});

test('one import reads models and brand facts, and creates the right kind of record for each',()=>{
  const j=K.readInput(JSON.stringify({products:[{brand:'Tern',model:'Link C8',weightKg:13.3,line:'Link'}],brands:[{brand:'Tern',units:'65,000',paSkus:'140 products',offers:'Folding bike, Accessories',figuresYear:'FY2024',sourceUrl:'https://example.com/r',regionEMEA:'UK, Germany'}]}),{});
  assert.equal(j.recs.length,1);assert.equal(j.recs[0].values.line,'Link');assert.equal(j.brandRecs.length,1);
  const b=j.brandRecs[0].values;assert.equal(b.units,65000);assert.equal(b.paSkus,140);assert.equal(b.figuresYear,'2024');assert.equal(b.offers,'Folding bike, Accessories');assert.equal(b.regionEMEA,'UK, Germany');
  const bad=K.readInput('brand,units,offers\nTern,abc,Hoverboard\n',{});assert.equal(bad.brandRecs.length,1);assert.equal(bad.brandRecs[0].rejected.length,2);
});
test('a spreadsheet with brand columns and no model column is read as brand rows',()=>{
  const t=K.readInput('brand,Units per year,Revenue,SKUs,P&A products\nDahon,"1,000,000",70.5,300,\nTern,,,22,140\n',{});
  assert.equal(t.recs.length,0);assert.equal(t.brandRecs.length,2);assert.equal(t.brandRecs[0].values.units,1000000);assert.equal(t.brandRecs[1].values.paSkus,140);
  const d=K.diffBrand(t.brandRecs[1],{skuCount:22,paSkus:''});assert.deepEqual(d.map(x=>[x.k,x.status]).sort(),[['paSkus','new'],['skuCount','same']]);
});
test('euro and dollar prices are accepted but do not count as missing',()=>{
  const r=K.toRecord({priceEUR:'€1,999',priceUSD:'$899'});assert.equal(r.values.priceEUR,1999);assert.equal(r.values.priceUSD,899);
  assert.ok(!K.missingFor({brand:'A',model:'B',priceEUR:1999}).some(f=>f.k==='priceGBP'));assert.ok(!K.missingFor({brand:'A',model:'B'}).some(f=>f.k==='priceEUR'));
});
test('the brand brief names each brand, what is known and what is missing',()=>{
  const t=K.buildBrandBrief([{brand:'Tern',website:'https://ternbicycles.com',known:'22 models',missing:['units','paSkus']}]);
  assert.match(t,/\{"brands":\[/);assert.match(t,/Tern \| https:\/\/ternbicycles.com/);assert.match(t,/missing: units, paSkus/);assert.match(t,/null is the right answer/);
});
test('"null" and similar are never taken as a model name',()=>{
  const r=K.readInput(JSON.stringify([{brand:'Lemmo',model:null,weightKg:12},{brand:'Slane',model:'null',weightKg:10}]),{});
  assert.ok(r.recs.every(x=>!x.model),'model must be empty, not the word null');
});

test('a sloppy or cut-off AI answer is still read, and parts can be pasted together',()=>{
  const sloppy="Sure! Here you go:\n```json\n{“products”:[{“brand”:“Tern”,“model”:“Link C8”,“priceGBP”:“£1,099”,“weightKg”:13.3,},],\n // note\n “brands”:[{“brand”:“Tern”,“units”:65000,}]}\n```\nHope that helps";
  const r=K.readInput(sloppy,{});assert.equal(r.recs.length,1);assert.equal(r.recs[0].values.priceGBP,1099);assert.equal(r.brandRecs[0].values.units,65000);assert.ok(r.notice);
  const cut='{"brands":[],"products":[{"brand":"Tern","model":"A","weightKg":12},{"brand":"Tern","model":"B","weightKg":13},{"brand":"Tern","model":"C","weigh';
  const c=K.readInput(cut,{});assert.equal(c.recs.length,2);assert.match(c.notice,/cut off/);
  const two='{"products":[{"brand":"Tern","model":"A","weightKg":12}]}\nCONTINUE FROM M2\n{"products":[{"brand":"Tern","model":"B","weightKg":13}]}';
  assert.equal(K.readInput(two,{}).recs.length,2);
  assert.equal(K.readInput('{"result":{"products":[{"brand":"Tern","model":"A","weightKg":"N/A"}]}}',{}).recs.length,1);
});
test('the one-request brief lists every brand, model and new brand and repeats the answer rules',()=>{
  const p={id:'m1',brand:'Tern',model:'Link C8',priceGBP:1099};
  const t=K.buildMasterBrief({date:'2026-11-11',brands:[{brand:'Tern',website:'https://ternbicycles.com',known:'22 models',keys:['units','hq']}],models:[{p,missing:K.missingFor(p).slice(0,3)}],fresh:[{brand:'Strida'}]});
  assert.match(t,/ANSWER FORMAT/);assert.match(t,/B1\. Tern/);assert.match(t,/M1\. Tern \| Link C8 \| id: m1/);assert.match(t,/N1\. Strida/);assert.match(t,/BEFORE YOU REPLY/);assert.match(t,/EXAMPLE OF THE SHAPE/);assert.match(t,/3 items/);
  assert.equal(K.readInput(t.slice(t.indexOf('{"brands"'),t.indexOf('\n\n',t.indexOf('{"brands"'))),{}).recs.length,1);
});
