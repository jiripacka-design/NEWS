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
test('required system sources cannot be deleted through the API',()=>{
  const r=fs.readFileSync('app/api/sources/route.js','utf8');
  assert.match(r,/required system source/);assert.match(r,/validation:false/);
});
test('Watchlist is merged into Insights and News is the landing page',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  assert.ok(!p.includes("go('watch')")&&!p.includes("mkNav('watch'"));assert.match(p,/: 'news'\);/);
  for(const t of ['insOverview','insPortfolio','insChart'])assert.ok(p.includes('function '+t));
});

test('picture buttons are scoped to the Competitors grid so other buttons keep their own actions',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8');
  assert.ok(h.includes("$$('#grid .imagebtn')"));assert.ok(!h.includes("$$('.imagebtn').forEach"));
});
test('brand CSV export and import exist for the competitor fill-in workflow',()=>{
  const p=fs.readFileSync('public/pm.js','utf8');
  for(const k of ['exportBrandsCsv','brandsFromCsv','paSkus','paCategories','figuresYear'])assert.ok(p.includes(k),k);
});
