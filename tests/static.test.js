import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('logging implementation and download API are present',()=>{const s=fs.readFileSync('lib/scanner.js','utf8');assert.match(s,/source\.start/);assert.match(s,/source\.complete/);assert.match(s,/persist\.articles/);assert.match(s,/lock\.release/);assert.match(fs.readFileSync('app/api/logs/route.js','utf8'),/content-disposition/)});
test('required validation sources remain configured',()=>{const s=fs.readFileSync('lib/store.js','utf8');assert.match(s,/bbc-world/);assert.match(s,/validation-feed/)});
test('Sources tab exposes log download and the old admin page redirects to it',()=>{assert.match(fs.readFileSync('public/tracker.html','utf8'),/id="dlLog"/);assert.match(fs.readFileSync('public/admin.html','utf8'),/tracker#sources/)});
test('seed sources, site discovery and manual posts are present',()=>{assert.match(fs.readFileSync('lib/seed-sources.js','utf8'),/seed-gn-brompton/);assert.match(fs.readFileSync('lib/scanner.js','utf8'),/application\\\/\(rss\|atom\)/);assert.match(fs.readFileSync('app/api/manual/route.js','utf8'),/sourceId:'manual'/);assert.match(fs.readFileSync('public/tracker.html','utf8'),/id="socialList"/)});
test('curated news in the page and in lib/curated.js stay in sync',async()=>{const {curated}=await import('../lib/curated.js');const h=fs.readFileSync('public/tracker.html','utf8');const rows=h.match(/const rows=\[\[/)&&h.slice(h.indexOf('const rows=[['),h.indexOf(']];const news=rows.map')).match(/\['\d{4}-\d{2}-\d{2}'/g);assert.equal(rows.length,curated.length);for(const c of curated)assert.ok(h.includes(c.title.replace(/'/g,"\\'")),c.title)});
test('page no longer ships the fake Settings page or the browser-only reference list',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  for(const gone of ['data-v="settings"','id="settings"','Configured</span>','Reference list','sourceTableBody','saveSourceRows'])assert.ok(!h.includes(gone),gone);
  assert.ok(h.includes('id="scanLine"'));
});
test('lockfile resolves from the public npm registry only',()=>{
  const l=fs.readFileSync('package-lock.json','utf8');
  assert.ok(!/visualstudio\.com/.test(l));
});

test('the rebuild-and-download mechanism is gone and pictures are saved on the server',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  for(const gone of ['Download rebuilt tracker','downloadEmbeddedTracker','initImageDB','competitor_tracker_with_embedded_images'])assert.ok(!h.includes(gone),gone);
  assert.match(h,/imageData:data/);assert.match(fs.readFileSync('app/api/brand-photos/route.js','utf8'),/imageData/);
});
test('any source can be removed, with the choice to keep, archive or delete its articles',()=>{
  const r=fs.readFileSync('app/api/sources/route.js','utf8'),m=fs.readFileSync('lib/maintain.js','utf8');
  assert.ok(!r.includes('required system source'));assert.match(r,/articles/);assert.match(m,/archive/);assert.match(m,/deleted/);
  assert.match(fs.readFileSync('lib/store.js','utf8'),/!gone\.has\(required\.id\)/);
});
test('Watchlist is merged into Insights and News is the landing page',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  assert.ok(!p.includes("go('watch')")&&!p.includes("mkNav('watch'"));assert.match(p,/: 'news'\);/);
  for(const t of ['insOverview','insPortfolio','insChart','insMarkets'])assert.ok(p.includes('function '+t));assert.ok(!p.includes('insActivity'));assert.ok(!/pareto/i.test(p));
});

test('picture buttons are scoped to the Competitors grid so other buttons keep their own actions',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  assert.ok(h.includes("$$('#grid .imagebtn')"));assert.ok(!h.includes("$$('.imagebtn').forEach"));
});
test('brand CSV export and import exist for the competitor fill-in workflow',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  for(const k of ['exportBrandsCsv','brandsFromCsv','paSkus','paCategories','figuresYear'])assert.ok(p.includes(k),k);
});

test('Brompton is branded blue #002fa7 and the app is named Brompton Enemies',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  assert.ok(h.includes('--us:#002fa7'));assert.ok(!/f2b13c|f2b84b/i.test(h));
  assert.ok(h.includes('<h1>Brompton Enemies</h1>'));assert.ok(!h.includes('Competitor Intelligence'));
  assert.match(fs.readFileSync('app/layout.js','utf8'),/Brompton Enemies/);
});
test('Product matrix is now Product Comparison, with remove buttons and a clickable + picker',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  assert.ok(!/Product matrix/i.test(p));assert.ok(p.includes("'Product Comparison'"));
  for(const k of ['data-rm','data-pick','openPicker','ap-x','ap-add'])assert.ok(p.includes(k),k);
});
test('the world map is flat (Miller cylindrical) and Markets is the first Insights tab',()=>{
  const m=fs.readFileSync('public/world-map.js','utf8'),p=fs.readFileSync('public/pm.js','utf8');
  assert.match(m,/Miller cylindrical/);assert.match(p,/TABS = \[\['markets'/);assert.ok(p.includes("insTab: 'markets'"));
});
test('page wiring that live news and the filters depend on is present',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  for(const k of ["const curatedNews=news.slice()","$('#search').oninput=feed","$('#priority').onchange=feed","$('#newsYear').onchange=feed","$('#cs').oninput=cards","$('#cat').onchange=cards","$('#close').onclick=()=>$('#dialog').close()","$('#clear').onclick"])assert.ok(h.includes(k),k);
  assert.ok(h.indexOf('const curatedNews=news.slice()')<h.indexOf('async function loadLive('));
});

test('Run scan draws a clockwise progress ring from top-centre and reads /api/progress',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8'),p=fs.readFileSync('app/api/progress/route.js','utf8'),s=fs.readFileSync('lib/scanner.js','utf8');
  assert.ok(h.includes('id="rrBar"'));assert.ok(h.includes('/api/progress'));assert.match(h,/M\$\{cx\} \$\{top\}H\$\{x1\}A/);
  assert.match(p,/paths\.progress/);assert.match(s,/setProgress\('sources'/);assert.match(s,/phase:'done'/);
});
test('archived and deleted articles are respected by the scanner and the digest',()=>{
  const s=fs.readFileSync('lib/scanner.js','utf8'),d=fs.readFileSync('lib/digest.js','utf8');
  assert.match(s,/paths\.deleted/);assert.match(s,/!a\.archived/);assert.match(d,/!x\.archived/);
});
test('competitors can be added and removed through the brands API',()=>{
  const r=fs.readFileSync('app/api/brands/route.js','utf8');
  for(const k of ['addCompetitor','restoreBrands','export async function DELETE','removeSources','removeModels','actOnArticles'])assert.ok(r.includes(k),k);
});
test('any model can be compared with any other, including two Brompton models',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  const fix=p.slice(p.indexOf('function fixCmp()'),p.indexOf('function addCmp'));
  assert.ok(!/!isUs\(prodById\(id\)\.brand\)/.test(fix),'fixCmp must not strip our models from the other columns');
  const pick=p.slice(p.indexOf('function pickerHtml()'),p.indexOf('function openPicker'));
  assert.ok(!/isUs\(p\.brand\)\s*:\s*!isUs/.test(pick),'the picker must list every brand');
  assert.ok(!/if \(isUs\(p\.brand\)\) S\.cmp\.us = id/.test(p),'addCmp must not force our models into the first column');
});
