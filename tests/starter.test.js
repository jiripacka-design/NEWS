import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cleanBrand,cleanProduct,SPEC_TEXT} from '../lib/validate.js';
const starter=JSON.parse(fs.readFileSync('public/starter-data/products.json','utf8')).products;
test('starter brand data passes the importer validation',()=>{
  const b=JSON.parse(fs.readFileSync('starter-data/brand-data.json','utf8')).brands;
  assert.ok(Object.keys(b).length>=6);
  for(const [name,f] of Object.entries(b)){const {bad}=cleanBrand(f);assert.deepEqual(bad,[],name)}
});
test('every starter model passes product validation and names its source',()=>{
  assert.ok(starter.length>=13);
  const keys=new Set();
  for(const p of starter){const {bad}=cleanProduct(p);assert.deepEqual(bad,[],p.model);assert.match(p.sourceUrl,/^https:\/\//,p.model);assert.match(p.lastVerified,/^\d{4}-\d{2}-\d{2}$/);
    const k=(p.brand+'|'+p.model).toLowerCase();assert.ok(!keys.has(k),'duplicate '+k);keys.add(k)}
});
test('the Brompton C Line 12-speed row carries the full official spec list',()=>{
  const p=starter.find(x=>x.model.startsWith('C Line with Advance Roller Frame'));
  assert.equal(p.priceGBP,1809);assert.equal(p.weightKg,12.5);
  const extra=['riderHeight','warranty'];const missing=SPEC_TEXT.filter(k=>!extra.includes(k)&&!p[k]);assert.deepEqual(missing,[]);
});
test('CSV in starter-data matches the JSON row count',()=>{
  const lines=fs.readFileSync('starter-data/products.csv','utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  assert.ok(lines[0].startsWith('brand,model,category'));
  assert.ok(lines[0].split(',').includes('frontCarrier'));
});
test('cleanProduct keeps new spec fields and caps their length',()=>{
  const {out,bad}=cleanProduct({brand:'X',model:'Y',hingeClamps:'z'.repeat(500),foldL:'27'});
  assert.deepEqual(bad,[]);assert.equal(out.hingeClamps.length,300);assert.equal(out.foldL,27);
});

test('brand validation accepts the new volume and P&A fields',()=>{
  const {out,bad}=cleanBrand({paSkus:'120',paCategories:'Luggage, lights',figuresYear:'2024'});
  assert.deepEqual(bad,[]);assert.equal(out.paSkus,120);assert.equal(out.figuresYear,'2024');
  assert.deepEqual(cleanBrand({figuresYear:'24'}).bad,['figuresYear (a 4-digit year)']);
});
