import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const X=await import('../lib/extract.js'),K=createRequire(import.meta.url)('../public/collect.js');
const page=`<html><head><meta property="og:title" content="Verge X11 | Tern Bicycles"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Tern Verge X11","offers":[{"@type":"Offer","price":"2900.00","priceCurrency":"GBP"}],"weight":{"@type":"QuantitativeValue","value":"10.2","unitCode":"KGM"},"color":["Black","Blue"]}]}</script></head><body>
<table><tr><th>Brakes</th><td>Shimano 105 hydraulic disc</td></tr><tr><td>Tyres:</td><td>Schwalbe One, 20&quot; x 1.35&quot;</td></tr><tr><td>Only one cell</td></tr></table>
<dl><dt>Gears</dt><dd>11-speed</dd><dt>Folded size</dt><dd>79 x 72 x 34 cm</dd></dl><ul><li>Frame: Aluminium, OCL+ design</li><li>Plain list item without a label</li></ul></body></html>`;
test('a product page is read into "Label: value" lines from product data, tables, lists',()=>{
  const r=X.extractSpecs(page,'https://www.ternbicycles.com/verge-x11');
  assert.equal(r.title,'Tern Verge X11');assert.deepEqual(r.price,{value:2900,currency:'GBP'});
  for(const l of ['Price: £2900','Weight: 10.2 kg','Colours: Black, Blue','Brakes: Shimano 105 hydraulic disc','Tyres: Schwalbe One, 20" x 1.35"','Gears: 11-speed','Folded size: 79 x 72 x 34 cm','Frame: Aluminium, OCL+ design','Source link: https://www.ternbicycles.com/verge-x11'])assert.ok(r.lines.includes(l),l);
});
test('the lines go through the same checks as pasted text',()=>{
  const r=X.extractSpecs(page,'https://www.ternbicycles.com/verge-x11'),imp=K.readInput(r.lines.join('\n'),{brand:'Tern',model:'Verge X11'});
  const v=imp.recs[0].values;assert.equal(v.priceGBP,2900);assert.equal(v.weightKg,10.2);assert.equal(v.foldH,79);assert.equal(v.gears,'11-speed');assert.equal(v.sourceUrl,'https://www.ternbicycles.com/verge-x11');
  const eur=X.extractSpecs('<script type="application/ld+json">{"@type":"Product","name":"A","offers":{"price":"1999","priceCurrency":"EUR"}}</script>','');
  assert.equal(K.readInput(eur.lines.join('\n'),{brand:'Ahooga',model:'A'}).recs[0].values.priceEUR,1999);
});
test('only public https pages can be read',()=>{
  for(const bad of ['http://a.com','https://localhost/x','https://127.0.0.1/','https://10.0.0.1/','https://[::1]/','https://printer.local/','ftp://a.com','nonsense'])assert.equal(X.safeUrl(bad),null,bad);
  assert.equal(X.safeUrl('https://www.brompton.com/c-line'),'https://www.brompton.com/c-line');
});
