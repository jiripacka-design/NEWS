import test from 'node:test';import assert from 'node:assert/strict';
import {clean,upsert,seedProducts} from '../lib/products.js';
test('product validation',()=>{
  assert.ok(clean({brand:'A',model:'B',category:'E-bike',price:'1200'}).product.price===1200);
  assert.ok(clean({brand:'A',model:'B',category:'Bad'}).error);
  assert.ok(clean({brand:'A',model:'B',category:'E-bike',price:-1}).error);
  assert.ok(clean({brand:'A',model:'B',category:'E-bike',url:'http://x'}).error);
  assert.equal(clean({brand:'A',model:'B',category:'E-bike',weight:''}).product.weight,null);
});
test('upsert matches brand+model and seeds are complete',()=>{
  const seed=seedProducts();assert.equal(seed.find(p=>p.brand==='Brompton').category,'Folding bike');
  const r=upsert(seed,[{brand:'brompton',model:'c line explore',category:'Folding bike',price:1500}]);
  assert.equal(r.products.length,seed.length);assert.equal(r.products.find(p=>p.brand==='Brompton').price,1500);
});
