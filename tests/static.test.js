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
  assert.ok(!p.includes("go('watch')")&&!p.includes("mkNav('watch'"));assert.match(p,/\|\| 'news'\);/);
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

test('Collect data is one guided workspace: pick a brand, ask an AI or type it in, save',()=>{
  const c=fs.readFileSync('public/collect.js','utf8');
  for(const k of ['renderOverview','renderWork','buildWorkBrief','factsForm','saveFacts','addModel','clWbCopy','clNext','Where to start','Not published','Many brands at once'])assert.ok(c.includes(k),k);
  assert.ok(!c.includes('<h3>1. Import</h3>'),'the old import-first layout is gone');
});

test('v3.11: menu at the top, map hover without browser tooltips, page reader and duplicate check wired in',()=>{
  const h=fs.readFileSync('public/tracker.html','utf8'),p=fs.readFileSync('public/pm.js','utf8'),c=fs.readFileSync('public/collect.js','utf8');
  assert.match(h,/<header class="top">[^]*?<nav class="side"[^]*?<\/nav>[^]*?<\/header>/,'the section menu sits in the header');
  const mk=p.slice(p.indexOf('function insMarkets()'),p.indexOf('function insGaps()'));assert.ok(!mk.includes('<title>'),'no native tooltips on the markets map');
  for(const k of ['data-mkmode','data-mkzoom','h2hView','positioning()','data-tip','dupLine','dupToggle','data-notdup'])assert.ok(p.includes(k),k);
  for(const k of ['/api/extract','What is missing','Get the details','Check and save','checkFact','data-method'])assert.ok(c.includes(k),k);
  assert.match(fs.readFileSync('lib/scanner.js','utf8'),/isRepeat\(/);assert.match(fs.readFileSync('app/api/news/route.js','utf8'),/groupStories/);
  assert.ok(h.includes('id="runRing" width="0" height="0"'),'the hidden scan ring takes no room');
});

test('v3.12: a picture per model and re-checks are wired in',()=>{
  const p=fs.readFileSync('public/pm.js','utf8'),c=fs.readFileSync('public/collect.js','utf8'),r=fs.readFileSync('app/api/brand-photos/route.js','utf8'),v=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  for(const k of ['pictureFromPage','autoPicture','modelStrip','thumbBtn','data-mpicpage'])assert.ok(p.includes(k),k);
  for(const k of ['runRecheck','renderRc','buildRecheckBrief','data-aimode','data-verify','/api/recheck','picRow'])assert.ok(c.includes(k),k);
  assert.ok(r.includes('findOnPage')&&r.includes("q.get('src')"),'pictures can come from a product page');
  assert.ok(v.crons.some(x=>x.path==='/api/recheck'),'monthly re-check job');
});

test('every browser script parses',async()=>{
  const vm=await import('node:vm');
  for(const f of fs.readdirSync('public').filter(x=>x.endsWith('.js')))assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('public/'+f,'utf8'),{filename:f}),f);
  const h=fs.readFileSync('public/tracker.html','utf8');[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m,i)=>assert.doesNotThrow(()=>new vm.Script(m[1]),'inline script '+i));
});

test('v3.13: history, alerts, backups, discontinued, street prices, battle card and named sign-in are wired in',()=>{
  const p=fs.readFileSync('public/pm.js','utf8'),c=fs.readFileSync('public/collect.js','utf8'),h=fs.readFileSync('public/tracker.html','utf8'),x=fs.readFileSync('proxy.js','utf8'),l=fs.readFileSync('public/login.html','utf8');
  assert.ok(h.includes('<script src="/history.js"></script>'));
  for(const k of ['battleCard','bcRivals','bcPoints','histSvg','isDisc','chDisc'])assert.ok(p.includes(k),k);
  for(const k of ['streetBlock','statusBlock','data-shopadd','data-gone',"via: 'collect'","via: 're-check'"])assert.ok(c.includes(k),k);
  assert.ok(x.includes("'/api/recheck'"),'the weekly re-check job gets past the sign-in check');assert.ok(x.includes('parts.length === 3'),'the middleware accepts named sessions');
  assert.ok(!l.includes('id=n'),'sign-in asks for the password only');assert.ok(!p.includes('me-chip'),'no name chip or sign-out button in the header');
});

test('the open screen survives a refresh, Collect data sits between Competitors and Sources, and brand models sort A to Z',()=>{
  const p=fs.readFileSync('public/pm.js','utf8'),c=fs.readFileSync('public/collect.js','utf8');
  assert.ok(p.includes('rememberScreen(id)')&&p.includes('go(savedScreen()'),'the screen is saved in the address and restored on load');
  assert.ok(p.includes('window.parent.history.replaceState'),'the page that holds the tracker remembers the screen too');
  assert.ok(c.includes("mkNav('collect', 'Collect data', 'sources')"));
  assert.ok(p.includes('data-rsort')&&p.includes('rgSort'),'model table headings sort');
});
