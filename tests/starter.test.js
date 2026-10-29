import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cleanBrand,cleanProduct} from '../lib/validate.js';
test('starter brand data and Brompton model CSV pass the same validation as the importers',()=>{
  const b=JSON.parse(fs.readFileSync('starter-data/brand-data.json','utf8')).brands;
  assert.ok(Object.keys(b).length>=3);
  for(const [name,f] of Object.entries(b)){const {bad}=cleanBrand(f);assert.deepEqual(bad,[],name)}
  const lines=fs.readFileSync('starter-data/brompton-models.csv','utf8').trim().split(/\r?\n/);
  const head=lines[0].split(',');assert.ok(head.includes('brand')&&head.includes('priceGBP'));
  assert.equal(lines.length-1,8);
  for(const l of lines.slice(1)){
    const cells=[];let cur='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){cells.push(cur);cur=''}else cur+=ch}cells.push(cur);
    const p=Object.fromEntries(head.map((h,i)=>[h,cells[i]]));const {bad}=cleanProduct(p);assert.deepEqual(bad,[],p.model);assert.equal(p.brand,'Brompton');
  }
});
