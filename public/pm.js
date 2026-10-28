/* Product-manager features for the Competitor Intelligence Hub (v3.4.0):
   watchlist, insights (momentum, what changed, regions, data coverage), product comparison matrix,
   price/positioning map, competitor profiles, event types and the weekly digest preview.
   Needs window.CIH (exposed by tracker.html) and window.CIEvents (events.js). Saved data lives on the
   server (/api/brands, /api/products, /api/tags) so everyone who signs in sees the same thing. */
(() => {
  'use strict';
  const C = window.CIH, E = window.CIEvents;
  if (!C || !E) { console.error('pm.js: tracker core or events.js missing'); return; }
  const { $, $$, esc, toast } = C;
  const REG = ['US', 'EMEA', 'APAC', 'CHINA'], CATS = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike'], THR = ['High', 'Medium', 'Low'];
  const S = { brands: {}, products: [], win: 30, cmp: { us: '', others: [] }, sort: { k: 'brand', d: 1 }, q: '', mapX: 'priceGBP', mapY: 'weightKg', profile: '', digest: null };
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const ld = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } };
  async function api(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }

  /* ---------- brand data helpers ---------- */
  const bm = (n) => S.brands[n] || {};
  const usName = () => Object.keys(S.brands).find((k) => S.brands[k].isUs) || 'Brompton';
  const isUs = (n) => n === usName();
  const regionsOf = (n) => {
    for (const r of [bm(n).regions, C.details[n] && C.details[n].regions]) if (r && REG.some((k) => (r[k] || []).length)) return r;
    return null;
  };
  const revenueOf = (n) => (bm(n).revenueGBPm != null ? bm(n).revenueGBPm : (C.brandMetrics[n] && C.brandMetrics[n].revenue != null ? C.brandMetrics[n].revenue : null));
  const unitsOf = (n) => (bm(n).units != null ? bm(n).units : (C.brandMetrics[n] && C.brandMetrics[n].units != null ? C.brandMetrics[n].units : null));
  const skuOf = (n) => (bm(n).skuCount != null ? bm(n).skuCount : (C.brandMetrics[n] && C.brandMetrics[n].skuCount != null ? C.brandMetrics[n].skuCount : null));
  const catOf = (n) => bm(n).category || C.defaultCategory[n] || 'E-bike';
  const thrOrder = (n) => { const i = THR.indexOf(bm(n).threat); return i < 0 ? 3 : i; };
  const gbp = (v) => (v == null || v === '' ? '—' : '£' + Math.round(v).toLocaleString('en-GB'));
  const plain = (v) => (v == null || v === '' ? '—' : esc(v));
  const fold = (p) => (p.foldL && p.foldW && p.foldH ? `${p.foldL} × ${p.foldW} × ${p.foldH} cm` : null);
  const vol = (p) => (p.foldL && p.foldW && p.foldH ? (p.foldL * p.foldW * p.foldH) / 1000 : null);
  const fmtDay = (s) => (s ? E.fmtDate(s) + ' ' + String(s).slice(0, 4) : '—');
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- events ---------- */
  const evtOf = (n) => {
    if (n._k !== n.evt0 || !n._e) { n._k = n.evt0; n._e = E.EVENT_TYPES.includes(n.evt0) ? n.evt0 : E.classify(n.title, n.summary); }
    return n._e;
  };
  const chipCls = (t) => 'evt e-' + slug(t);
  function evtChip(n) {
    const t = evtOf(n);
    if (n.live && n.id) return `<select class="evtsel ${chipCls(t)}" data-id="${esc(n.id)}" title="Change the event type">${E.EVENT_TYPES.map((x) => `<option${x === t ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    return `<span class="${chipCls(t)}">${esc(t)}</span>`;
  }
  const tracked = () => new Set(C.brands);
  const feedItems = () => { const t = tracked(); return C.news.filter((n) => t.has(n.brand)); };
  const badges = (n) => (isUs(n) ? '<span class="pm-us" title="Our brand">US</span>' : '') + (bm(n).watch ? '<span class="pm-watch" title="On the watchlist">★</span>' : '') + (bm(n).threat ? `<span class="thr t-${bm(n).threat.toLowerCase()}">${bm(n).threat}</span>` : '');

  /* ---------- small view helpers ---------- */
  const spark = (a) => {
    const w = 84, h = 22, m = Math.max(1, ...a);
    const pts = a.map((v, i) => `${(2 + i * (w - 4) / (a.length - 1)).toFixed(1)},${(h - 2 - v / m * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  };
  const statusCls = { Accelerating: 'up', 'New activity': 'up', Slowing: 'down', Steady: 'flat', 'No activity': 'none' };
  const link = (u, t) => (/^https?:\/\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>` : '—');
  const gapChips = (names) => names.length ? names.map((b) => `<button type="button" class="chip gap-chip" data-open="${esc(b)}">${esc(b)}</button>`).join('') : '<em class="muted">None. Every brand has this.</em>';
  function mkView(id, html) { const s = document.createElement('section'); s.className = 'view'; s.id = id; s.innerHTML = html; $('main').appendChild(s); return s; }
  function mkNav(id, label, before) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = id; b.textContent = label; b.onclick = () => go(id);
    const side = $('.side'), ref = before ? side.querySelector(`.nav[data-v="${before}"]`) : null;
    if (ref) side.insertBefore(b, ref); else side.appendChild(b);
  }
  const RENDER = {};
  function go(id) {
    C.nav(id);
    if (id === 'profile') $$('.nav').forEach((x) => x.classList.toggle('active', x.dataset.v === 'competitors'));
    if (RENDER[id]) RENDER[id]();
    window.scrollTo(0, 0);
  }
  function refresh() { const a = ($('.view.active') || {}).id; if (RENDER[a]) RENDER[a](); }
  function openProfile(n) { S.profile = n; go('profile'); }
  function openNews(brand, type) { C.evtSel = type || ''; const sel = $('#evtType'); if (sel) sel.value = type || ''; C.setNewsBrand(brand); }

  /* =====================  WATCHLIST  ===================== */
  function wcard(b, mom) {
    const m = mom[b] || { cur: 0, prev: 0, spark: new Array(12).fill(0), label: 'No activity' };
    const ps = S.products.filter((p) => p.brand === b), prices = ps.map((p) => p.priceGBP).filter((x) => x != null);
    const last = C.news.find((n) => n.brand === b);
    const range = ps.length ? ` · ${ps.length} model${ps.length === 1 ? '' : 's'}${prices.length ? ' · ' + (Math.min(...prices) === Math.max(...prices) ? gbp(prices[0]) : gbp(Math.min(...prices)) + '–' + gbp(Math.max(...prices))) : ''}` : '';
    return `<article class="wc${isUs(b) ? ' is-us' : ''}" data-open="${esc(b)}" tabindex="0" role="button">
      <header><h3>${esc(b)}</h3><span>${badges(b)}</span></header>
      <div class="wc-cat">${esc(catOf(b))}${range}</div>
      <p class="wc-reason">${bm(b).threatReason ? esc(bm(b).threatReason) : (isUs(b) ? 'Our brand: the reference for every comparison.' : '<span class="muted">No threat reason yet. Open the profile to add one.</span>')}</p>
      <div class="wc-mom">${spark(m.spark)}<span class="st ${statusCls[m.label]}">${m.label}</span><span class="muted">${m.cur} vs ${m.prev} (30 days)</span></div>
      <div class="wc-last">${last ? `<span class="${chipCls(evtOf(last))}">${esc(evtOf(last))}</span> <span class="muted">${fmtDay(last.date)}</span><br>${last.title}` : '<span class="muted">No items yet</span>'}</div></article>`;
  }
  function renderWatch() {
    const now = Date.now(), us = usName(), mom = {};
    E.momentum(feedItems(), C.brands, now, 30, 12).forEach((m) => { mom[m.brand] = m; });
    const watched = C.brands.filter((b) => bm(b).watch && b !== us).sort((a, b) => thrOrder(a) - thrOrder(b) || a.localeCompare(b));
    const d = E.buildDigest(feedItems().map((n) => ({ date: n.date, brand: n.brand, title: n.title, summary: n.summary, url: n.url, evt: evtOf(n) })), { us, watch: watched, threat: Object.fromEntries(watched.map((b) => [b, { level: bm(b).threat || '' }])), brands: C.brands }, now, 7);
    const dg = S.digest;
    $('#watch').innerHTML = `<div class="head"><div><h2>Watchlist</h2><div class="sub">The brands that matter, their threat level and what changed. Us: <strong>${esc(us)}</strong>.</div></div><button type="button" class="imagebtn" id="manageWatch">Manage watchlist</button></div>
      ${watched.length ? '' : `<div class="pm-empty"><strong>Nothing pinned yet</strong><span>Pin the 5 to 8 competitors that matter most. They appear here with a threat level and a one-line reason, and become the quick filters in News.</span><button type="button" class="primary" id="pinFirst">Pin brands</button></div>`}
      <div class="wgrid">${[us, ...watched].map((b) => wcard(b, mom)).join('')}</div>
      <div class="panel"><div class="chart-head"><div><h3>Changes in the last 7 days</h3><div class="sub">${d.total} item${d.total === 1 ? '' : 's'} across ${d.brandCount} brand${d.brandCount === 1 ? '' : 's'} (the 7 days before: ${d.prevTotal}). Us and the watchlist come first.</div></div></div>
        ${d.top.length ? `<div class="chg">${d.top.map((i) => `<div class="chg-row${i.brand === us ? ' is-us' : ''}"><span class="muted">${esc(E.fmtDate(i.date))}</span><span><strong>${esc(i.brand)}</strong> ${badges(i.brand)}</span><span class="${chipCls(i.evt)}">${esc(i.evt)}</span><span>${/^https?:\/\//.test(i.url || '') ? `<a href="${i.url}" target="_blank" rel="noopener noreferrer">${i.title}</a>` : i.title}</span></div>`).join('')}</div>` : '<div class="source-empty">Nothing new in the last 7 days.</div>'}</div>
      <div class="panel"><div class="chart-head"><div><h3>Weekly digest</h3><div class="sub">The same summary that is posted to Slack or emailed every Monday once a channel is set up (see the README).</div></div>
        <div class="source-actions"><button type="button" class="imagebtn" id="dgPreview">${dg ? 'Refresh preview' : 'Preview digest'}</button>${dg ? '<button type="button" class="imagebtn" id="dgCopy">Copy</button><button type="button" class="imagebtn" id="dgSend">Send now</button>' : ''}</div></div>
        ${dg ? `<pre class="dg">${esc(dg.text)}</pre><div class="sub">Delivery: Slack ${dg.channels.slack ? 'connected' : 'not set up'} · Email ${dg.channels.email ? 'connected' : 'not set up'}</div>` : '<div class="sub">Select Preview digest to see this week’s summary.</div>'}</div>`;
  }
  RENDER.watch = renderWatch;
  async function manageWatch() {
    const us = usName(), dlg = $('#pmWatchDlg');
    $('#pmWatchList').innerHTML = C.brands.filter((b) => b !== us).slice().sort((a, b) => a.localeCompare(b)).map((b) => `<label><input type="checkbox" value="${esc(b)}"${bm(b).watch ? ' checked' : ''}>${esc(b)}</label>`).join('');
    dlg.showModal();
  }

  /* =====================  INSIGHTS  ===================== */
  function renderInsights() {
    const root = $('#pmInsights'); if (!root) return;
    const now = Date.now(), W = S.win, us = usName(), items = feedItems();
    const mom = E.momentum(items, C.brands, now, W, 12).filter((m) => isUs(m.brand) || m.cur || m.prev).sort((a, b) => (isUs(b.brand) - isUs(a.brand)) || b.delta - a.delta || b.cur - a.cur);
    const quiet = C.brands.length - mom.filter((m) => !isUs(m.brand) || m.cur || m.prev).length;
    const types = E.countsByType(items, C.brands, now, W, evtOf);
    const trows = Object.keys(types).sort((a, b) => (isUs(b) - isUs(a)) || types[b].total - types[a].total || a.localeCompare(b));
    const tot = {}; E.EVENT_TYPES.forEach((t) => { tot[t] = trows.reduce((s, b) => s + (types[b][t] || 0), 0); });
    root.innerHTML = `<div class="head"><div><h2>Insights</h2><div class="sub">What changed, who is accelerating, where competitors operate and how complete our data is.</div></div>
      <div class="rangebar" id="pmWin" role="group" aria-label="Window">${[7, 30, 90].map((d) => `<button type="button" data-w="${d}" class="${d === W ? 'on' : ''}">${d} days</button>`).join('')}</div></div>
      <div class="panel"><div class="chart-head"><div><h3>Momentum</h3><div class="sub">Items in the last ${W} days against the ${W} before. The line shows the last 12 weeks.</div></div></div>
        <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Brand</th><th class="num">Last ${W}d</th><th class="num">Before</th><th class="num">Change</th><th>12 weeks</th><th>Status</th></tr></thead><tbody>
        ${mom.map((m) => `<tr class="${isUs(m.brand) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(m.brand)}">${esc(m.brand)}</button> ${badges(m.brand)}</td><td class="num">${m.cur}</td><td class="num">${m.prev}</td><td class="num ${m.delta > 0 ? 'pos' : m.delta < 0 ? 'neg' : ''}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${spark(m.spark)}</td><td><span class="st ${statusCls[m.label]}">${m.label}</span></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No dated items yet.</td></tr>'}
        </tbody></table></div><div class="sub">${quiet > 0 ? `${quiet} other brand${quiet === 1 ? ' has' : 's have'} no items in these windows. ` : ''}This counts items the tracker has stored, so a brand with few sources can look quiet when it is not.</div></div>
      <div class="panel"><div class="chart-head"><div><h3>What changed, by brand and type</h3><div class="sub">Items in the last ${W} days. Select a number to open those items in News. Tags are automatic; change one on a news item if it is wrong.</div></div></div>
        <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Brand</th>${E.EVENT_TYPES.map((t) => `<th class="num"><span class="${chipCls(t)}">${esc(t)}</span></th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
        ${trows.map((b) => `<tr class="${isUs(b) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(b)}">${esc(b)}</button> ${badges(b)}</td>${E.EVENT_TYPES.map((t) => `<td class="num">${types[b][t] ? `<button type="button" class="cellbtn" data-nb="${esc(b)}" data-nt="${esc(t)}">${types[b][t]}</button>` : '<span class="muted">·</span>'}</td>`).join('')}<td class="num"><strong>${types[b].total}</strong></td></tr>`).join('') || `<tr><td colspan="${E.EVENT_TYPES.length + 2}" class="muted">No items in the last ${W} days.</td></tr>`}
        </tbody>${trows.length ? `<tfoot><tr><td>All brands</td>${E.EVENT_TYPES.map((t) => `<td class="num">${tot[t] || '·'}</td>`).join('')}<td class="num">${trows.reduce((s, b) => s + types[b].total, 0)}</td></tr></tfoot>` : ''}</table></div></div>
      ${regionPanel(items, now, us)}${coveragePanel()}`;
  }
  RENDER.insights = renderInsights;

  function regionPanel(items, now, us) {
    const fresh = {};
    items.forEach((n) => { if (evtOf(n) !== 'Market entry') return; const a = E.ageDays(n, now); if (isNaN(a) || a < 0 || a >= 90) return; E.detectRegions(n.title + ' ' + n.summary).forEach((r) => { (fresh[n.brand] = fresh[n.brand] || new Set()).add(r); }); });
    const usR = regionsOf(us) || {}, usHas = (k) => (usR[k] || []).length > 0;
    const withData = C.brands.filter((b) => regionsOf(b)), without = C.brands.filter((b) => !regionsOf(b));
    const overlap = (b) => REG.filter((k) => usHas(k) && ((regionsOf(b) || {})[k] || []).length).length;
    const rows = [...new Set([us, ...withData, ...Object.keys(fresh)])].filter((b) => C.brands.includes(b)).sort((a, b) => (isUs(b) - isUs(a)) || overlap(b) - overlap(a) || a.localeCompare(b));
    return `<div class="panel"><div class="chart-head"><div><h3>Region matrix</h3><div class="sub">Where each brand operates (number of countries listed). <span class="newtag">NEW</span> marks a market-entry story in the last 90 days that mentions the region, read from the headline, so check it. Amber columns are where we operate.</div></div></div>
      <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Brand</th>${REG.map((k) => `<th class="num${usHas(k) ? ' us-col' : ''}">${k}${usHas(k) ? '<small>we are here</small>' : ''}</th>`).join('')}<th class="num">Overlap with us</th></tr></thead><tbody>
      ${rows.map((b) => { const r = regionsOf(b) || {}; return `<tr class="${isUs(b) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(b)}">${esc(b)}</button> ${badges(b)}</td>${REG.map((k) => { const n = (r[k] || []).length, nw = fresh[b] && fresh[b].has(k); return `<td class="num${usHas(k) ? ' us-col' : ''}${nw && usHas(k) && !isUs(b) ? ' hot' : ''}" title="${esc((r[k] || []).join(', '))}">${n ? n : '<span class="muted">·</span>'}${nw ? ' <span class="newtag">NEW</span>' : ''}</td>`; }).join('')}<td class="num">${isUs(b) ? '—' : `${overlap(b)} of ${REG.filter(usHas).length}`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="sub">Region data exists for ${withData.length} of ${C.brands.length} brands. Add the rest on each profile.</div>
      <details class="gaps"><summary>Brands with no region data (${without.length})</summary><div class="chips">${gapChips(without)}</div></details></div>`;
  }

  function coveragePanel() {
    const B = C.brands, bm2 = (f) => B.filter(f), miss = (have) => B.filter((b) => !have.includes(b));
    const T = [
      ['Category confirmed', bm2((b) => !!bm(b).category), 'Set on each profile; until then the card shows a starting guess.'],
      ['Models with specs', bm2((b) => S.products.some((p) => p.brand === b)), 'Feeds the product matrix and price map.'],
      ['Revenue', bm2((b) => revenueOf(b) != null), 'Annual revenue in £m.', (b) => '£' + revenueOf(b).toLocaleString('en-GB') + 'm'],
      ['Annual units', bm2((b) => unitsOf(b) != null), 'Bikes sold per year.', (b) => unitsOf(b).toLocaleString('en-GB')],
      ['Portfolio size (SKUs)', bm2((b) => skuOf(b) != null), 'Number of models or SKUs.', (b) => String(skuOf(b))],
      ['Regions', bm2((b) => !!regionsOf(b)), 'Countries per region.'],
      ['Threat level', bm2((b) => !!bm(b).threat), 'High, Medium or Low with a reason.'],
      ['Verified', bm2((b) => !!bm(b).lastVerified), 'A “last verified” date and sources.']
    ];
    return `<div class="panel"><div class="chart-head"><div><h3>Data coverage</h3><div class="sub">Revenue, units and similar fields exist for only a few brands, so they are listed here instead of drawn as mostly empty charts. Select a brand to fill it in.</div></div></div>
      <div class="cov">${T.map(([label, have, hint, show]) => `<div class="cov-tile"><div class="cov-top"><span>${esc(label)}</span><strong>${have.length}<small> of ${B.length}</small></strong></div><div class="cov-bar"><i style="width:${have.length / B.length * 100}%"></i></div><div class="sub">${esc(hint)}</div>
        ${show && have.length ? `<div class="cov-known">${have.map((b) => `<span><b>${esc(b)}</b> ${esc(show(b))}</span>`).join('')}</div>` : ''}
        <details class="gaps"><summary>Missing (${B.length - have.length})</summary><div class="chips">${gapChips(miss(have))}</div></details></div>`).join('')}</div></div>`;
  }

  /* =====================  PRODUCT MATRIX  ===================== */
  const COLS = ['brand', 'model', 'category', 'priceGBP', 'priceNote', 'weightKg', 'foldL', 'foldW', 'foldH', 'wheelIn', 'motor', 'batteryWh', 'rangeKm', 'gears', 'launch', 'url', 'sourceUrl', 'lastVerified', 'notes'];
  const ROWS = [
    { k: 'priceGBP', label: 'Price', get: (p) => p.priceGBP, fmt: gbp, dir: 'low', note: (p) => p.priceNote },
    { k: 'weightKg', label: 'Weight', get: (p) => p.weightKg, fmt: (v) => v + ' kg', dir: 'low' },
    { k: 'fold', label: 'Folded size', get: (p) => fold(p), fmt: (v) => v },
    { k: 'vol', label: 'Folded volume', get: vol, fmt: (v) => Math.round(v) + ' L', dir: 'low' },
    { k: 'wheelIn', label: 'Wheel size', get: (p) => p.wheelIn, fmt: (v) => v + (/^\d+$/.test(v) ? '"' : '') },
    { k: 'motor', label: 'Motor', get: (p) => p.motor, fmt: (v) => v },
    { k: 'batteryWh', label: 'Battery', get: (p) => p.batteryWh, fmt: (v) => v + ' Wh', dir: 'high' },
    { k: 'rangeKm', label: 'Range', get: (p) => p.rangeKm, fmt: (v) => v + ' km', dir: 'high' },
    { k: 'gears', label: 'Gears', get: (p) => p.gears, fmt: (v) => v },
    { k: 'launch', label: 'Launch', get: (p) => p.launch, fmt: (v) => v },
    { k: 'lastVerified', label: 'Last verified', get: (p) => p.lastVerified, fmt: (v) => fmtDay(v) },
    { k: 'src', label: 'Source', get: (p) => p.sourceUrl || p.url, fmt: (v) => v, html: (v) => link(v) }
  ];
  const prodById = (id) => S.products.find((p) => p.id === id);
  const prodName = (p) => `${p.brand} ${p.model}`;
  function fixCmp() {
    const ours = S.products.filter((p) => isUs(p.brand));
    if (!prodById(S.cmp.us) || !isUs(prodById(S.cmp.us).brand)) S.cmp.us = ours[0] ? ours[0].id : '';
    S.cmp.others = S.cmp.others.filter((id) => prodById(id) && !isUs(prodById(id).brand)).slice(0, 4);
    sv('cih_pm_cmp', S.cmp);
  }
  function addCmp(id) {
    const p = prodById(id); if (!p) return;
    if (isUs(p.brand)) S.cmp.us = id;
    else if (S.cmp.others.includes(id)) return;
    else if (S.cmp.others.length >= 4) return toast('Compare up to 4 competitors at a time');
    else S.cmp.others.push(id);
    fixCmp(); renderMatrix();
  }
  function matrixTable() {
    const cols = [S.cmp.us, ...S.cmp.others].map(prodById).filter(Boolean), us = prodById(S.cmp.us);
    if (!cols.length) return '<div class="pm-empty"><strong>No models to compare yet</strong><span>Add your own models and the competitors’ models below. Specs and prices cannot be scraped reliably, so they are entered here (or imported from a CSV) and saved on the server.</span></div>';
    const head = cols.map((p) => `<th class="${isUs(p.brand) ? 'is-us' : ''}"><div class="mh-brand"><button type="button" class="linkbtn" data-open="${esc(p.brand)}">${esc(p.brand)}</button> ${isUs(p.brand) ? '<span class="pm-us">US</span>' : ''}</div><div class="mh-model">${esc(p.model)}</div><div class="muted">${esc(p.category || catOf(p.brand))}</div><div class="mh-act"><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button>${isUs(p.brand) ? '' : `<button type="button" class="linkbtn" data-unc="${esc(p.id)}">Remove</button>`}</div></th>`).join('');
    const body = ROWS.map((r) => {
      const vals = cols.map((p) => r.get(p)), nums = vals.filter((v) => typeof v === 'number');
      const best = r.dir && nums.length > 1 ? (r.dir === 'low' ? Math.min(...nums) : Math.max(...nums)) : null;
      const uv = us ? r.get(us) : null;
      return `<tr><th scope="row">${r.label}</th>${cols.map((p, i) => {
        const v = vals[i], has = v != null && v !== '';
        let delta = '';
        if (has && r.dir && typeof v === 'number' && !isUs(p.brand) && typeof uv === 'number') {
          const d = Math.round((v - uv) * 100) / 100;
          if (d !== 0) delta = `<small class="dl${(r.dir === 'low' ? d < 0 : d > 0) ? ' adv' : ''}" title="Compared with ${esc(prodName(us))}">${d > 0 ? '+' : '−'}${r.fmt(Math.abs(d))} vs us</small>`;
        }
        return `<td class="${isUs(p.brand) ? 'is-us' : ''}${best != null && v === best ? ' best' : ''}">${has ? (r.html ? r.html(v) : esc(r.fmt(v))) : '<span class="muted">—</span>'}${r.note && r.note(p) ? `<small class="muted">${esc(r.note(p))}</small>` : ''}${delta}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<div class="tbl-wrap"><table class="pm-table matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="sub"><span class="legend-best"></span> best value in the row. Orange “vs us” means the competitor is ahead of us on that spec (cheaper, lighter, smaller fold, bigger battery or longer range).</div>`;
  }
  function modelsTable() {
    const q = S.q.toLowerCase(), k = S.sort.k, d = S.sort.d;
    const list = S.products.filter((p) => !q || `${p.brand} ${p.model} ${p.category}`.toLowerCase().includes(q)).sort((a, b) => {
      const x = k === 'vol' ? vol(a) : a[k], y = k === 'vol' ? vol(b) : b[k];
      if (x == null || x === '') return y == null || y === '' ? 0 : 1; if (y == null || y === '') return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * d || (isUs(b.brand) - isUs(a.brand));
    });
    const th = (key, label, cls) => `<th class="${cls || ''}"><button type="button" class="sortbtn" data-sort="${key}">${label}${S.sort.k === key ? (S.sort.d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    return `<table class="pm-table"><thead><tr>${th('brand', 'Brand')}${th('model', 'Model')}${th('category', 'Category')}${th('priceGBP', 'Price', 'num')}${th('weightKg', 'Weight', 'num')}${th('vol', 'Folded', 'num')}${th('batteryWh', 'Battery', 'num')}${th('rangeKm', 'Range', 'num')}${th('launch', 'Launch')}${th('lastVerified', 'Verified')}<th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="${isUs(p.brand) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(p.brand)}">${esc(p.brand)}</button></td><td>${esc(p.model)}</td><td>${esc(p.category || '—')}</td><td class="num">${gbp(p.priceGBP)}</td><td class="num">${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td class="num">${vol(p) != null ? Math.round(vol(p)) + ' L' : '—'}</td><td class="num">${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td class="num">${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td><td>${p.lastVerified ? esc(p.lastVerified) : '—'}</td><td class="acts"><button type="button" class="linkbtn" data-cmp="${esc(p.id)}">Compare</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted">No models match.</td></tr>'}
      </tbody></table>`;
  }
  const AX = { priceGBP: ['Price (£)', (p) => p.priceGBP, gbp], rangeKm: ['Range (km)', (p) => p.rangeKm, (v) => v + ' km'], weightKg: ['Weight (kg)', (p) => p.weightKg, (v) => v + ' kg'], batteryWh: ['Battery (Wh)', (p) => p.batteryWh, (v) => v + ' Wh'], vol: ['Folded volume (L)', vol, (v) => Math.round(v) + ' L'] };
  function niceTicks(lo, hi) {
    if (lo === hi) { lo = Math.max(0, lo - 1); hi += 1; }
    const raw = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw), t = [];
    for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) { t.push(+v.toFixed(6)); if (t.length > 12) break; }
    return t;
  }
  function mapSvg() {
    const [xl, xg, xf] = AX[S.mapX], [yl, yg, yf] = AX[S.mapY];
    const pts = S.products.map((p) => ({ p, x: xg(p), y: yg(p) })).filter((o) => typeof o.x === 'number' && typeof o.y === 'number');
    const note = `${pts.length} of ${S.products.length} models have both values.`;
    if (pts.length < 2) return `<div class="source-empty">Add at least two models with both “${esc(xl)}” and “${esc(yl)}” to see the map. ${note}</div>`;
    const W = 760, H = 380, L = 64, R = 20, T = 16, B = 46, xt = niceTicks(Math.min(...pts.map((o) => o.x)), Math.max(...pts.map((o) => o.x))), yt = niceTicks(Math.min(...pts.map((o) => o.y)), Math.max(...pts.map((o) => o.y)));
    const x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1], X = (v) => L + (v - x0) / (x1 - x0) * (W - L - R), Y = (v) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
    const sel = new Set([S.cmp.us, ...S.cmp.others]), label = pts.length <= 20;
    return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(xl)} against ${esc(yl)}">
      ${yt.map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="al" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(yf(v))}</text>`).join('')}
      ${xt.map((v) => `<line class="gl" y1="${T}" y2="${H - B}" x1="${X(v)}" x2="${X(v)}"/><text class="al" x="${X(v)}" y="${H - B + 18}" text-anchor="middle">${esc(xf(v))}</text>`).join('')}
      <text class="at" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(xl)}</text><text class="at" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>
      ${pts.map((o) => { const us = isUs(o.p.brand), on = sel.has(o.p.id), cx = X(o.x), cy = Y(o.y); return `<g class="dot${us ? ' us' : ''}${on ? ' on' : ''}" data-cmp="${esc(o.p.id)}"><circle cx="${cx}" cy="${cy}" r="${us ? 8 : 5.5}"/><title>${esc(prodName(o.p))}: ${esc(xf(o.x))}, ${esc(yf(o.y))}</title>${label || us || on ? `<text x="${cx + 10}" y="${cy + 4}">${esc(prodName(o.p))}</text>` : ''}</g>`; }).join('')}</svg><div class="sub">${note} Select a dot to add it to the comparison. Empty areas can be gaps in the market.</div>`;
  }
  function renderMatrix() {
    fixCmp();
    const ours = S.products.filter((p) => isUs(p.brand)), avail = S.products.filter((p) => !isUs(p.brand) && !S.cmp.others.includes(p.id));
    const byBrand = {}; avail.forEach((p) => { (byBrand[p.brand] = byBrand[p.brand] || []).push(p); });
    const noModels = C.brands.filter((b) => !S.products.some((p) => p.brand === b));
    const opt = (v, l) => `<option value="${v}"${S.mapX === v || S.mapY === v ? '' : ''}>${l}</option>`;
    $('#matrix').innerHTML = `<div class="head"><div><h2>Product matrix</h2><div class="sub">Our model against up to 4 competitors, side by side. Us: <strong>${esc(usName())}</strong>.</div></div>
      <div class="source-actions"><button type="button" class="primary" id="addModel">Add model</button><button type="button" class="imagebtn" id="impCsv">Import CSV</button><button type="button" class="imagebtn" id="expCsv">Export CSV</button><input type="file" id="csvFile" accept=".csv,text/csv" hidden></div></div>
      <div class="panel"><div class="cmp-bar"><label>Our model<select class="field" id="cmpUs">${ours.length ? ours.map((p) => `<option value="${esc(p.id)}"${p.id === S.cmp.us ? ' selected' : ''}>${esc(p.model)}</option>`).join('') : '<option value="">No models yet</option>'}</select></label>
        <label>Add a competitor model<select class="field" id="cmpAdd"><option value="">${avail.length ? 'Choose…' : 'No other models yet'}</option>${Object.keys(byBrand).sort().map((b) => `<optgroup label="${esc(b)}">${byBrand[b].map((p) => `<option value="${esc(p.id)}">${esc(p.model)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <span class="muted">${S.cmp.others.length} of 4 competitors</span></div>${matrixTable()}</div>
      <div class="panel"><div class="chart-head"><div><h3>Price and positioning map</h3><div class="sub">Every model with both values. Amber is us.</div></div><div class="cmp-bar"><label>Across<select class="field" id="mapX">${Object.keys(AX).map((k) => `<option value="${k}"${k === S.mapX ? ' selected' : ''}>${AX[k][0]}</option>`).join('')}</select></label><label>Up<select class="field" id="mapY">${Object.keys(AX).map((k) => `<option value="${k}"${k === S.mapY ? ' selected' : ''}>${AX[k][0]}</option>`).join('')}</select></label></div></div><div id="mapBox">${mapSvg()}</div></div>
      <div class="panel"><div class="chart-head"><div><h3>All models</h3><div class="sub">${S.products.length} saved. CSV columns: ${COLS.join(', ')}.</div></div><input class="field" id="mdlSearch" placeholder="Filter models" value="${esc(S.q)}"></div><div class="tbl-wrap" id="mdlBox">${modelsTable()}</div>
        <details class="gaps"><summary>Brands with no models yet (${noModels.length})</summary><div class="chips">${noModels.length ? noModels.map((b) => `<button type="button" class="chip gap-chip" data-add="${esc(b)}">${esc(b)}</button>`).join('') : '<em class="muted">None.</em>'}</div></details></div>`;
  }
  RENDER.matrix = renderMatrix;

  /* ----- model dialog, CSV ----- */
  const FIELDS = [['brand', 'Brand', 'select'], ['model', 'Model', 'text'], ['category', 'Category', 'cat'], ['priceGBP', 'Price (£, incl. VAT)', 'number'], ['priceNote', 'Price note', 'text'], ['weightKg', 'Weight (kg)', 'number'], ['wheelIn', 'Wheel size (in)', 'text'], ['motor', 'Motor', 'text'], ['batteryWh', 'Battery (Wh)', 'number'], ['rangeKm', 'Range (km)', 'number'], ['gears', 'Gears', 'text'], ['launch', 'Launch (2025 or 2025-09)', 'text'], ['url', 'Product page link', 'url'], ['sourceUrl', 'Where the specs came from (link)', 'url'], ['lastVerified', 'Last verified', 'date']];
  function modelDialog() {
    const d = document.createElement('dialog'); d.id = 'pmModel';
    d.innerHTML = `<form id="pmModelForm"><div class="mh"><strong id="pmModelTitle">Add model</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form"><input type="hidden" id="pm-id">
      <div class="source-form-grid">${FIELDS.map(([k, l, t]) => `<label>${l}${t === 'select' ? `<select class="field" id="pm-${k}" required>${[...C.brands].sort((a, b) => (isUs(b) - isUs(a)) || a.localeCompare(b)).map((b) => `<option>${esc(b)}</option>`).join('')}</select>` : t === 'cat' ? `<select class="field" id="pm-${k}"><option value="">Same as brand</option>${CATS.map((c) => `<option>${c}</option>`).join('')}</select>` : `<input class="field" id="pm-${k}" type="${t}"${t === 'number' ? ' step="any" min="0"' : ''}${k === 'model' ? ' required maxlength="120"' : ''}>`}</label>`).join('')}
      <label>Folded size, cm (L × W × H)<span class="tri"><input class="field" id="pm-foldL" type="number" step="any" min="0" placeholder="L"><input class="field" id="pm-foldW" type="number" step="any" min="0" placeholder="W"><input class="field" id="pm-foldH" type="number" step="any" min="0" placeholder="H"></span></label></div>
      <label>Notes<input class="field" id="pm-notes" maxlength="600"></label><div class="sf-res" id="pm-err" role="status"></div>
      <div class="form-actions"><button type="button" class="imagebtn danger" id="pm-del" hidden>Delete model</button><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save model</button></div></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    $('#pmModelForm').onsubmit = async (e) => {
      e.preventDefault();
      const o = { id: $('#pm-id').value }; [...FIELDS.map((f) => f[0]), 'foldL', 'foldW', 'foldH', 'notes'].forEach((k) => { o[k] = $('#pm-' + k).value.trim(); });
      try { const r = await api('POST', '/api/products', { product: o }); S.products = r.products; d.close(); toast('Model saved'); if (!$('#pm-id').value) { const n = S.products.find((p) => p.brand === o.brand && p.model.toLowerCase() === o.model.toLowerCase()); if (n) addCmp(n.id); } renderMatrix(); } catch (err) { $('#pm-err').textContent = err.message; $('#pm-err').className = 'sf-res bad'; }
    };
    $('#pm-del').onclick = async () => {
      const p = prodById($('#pm-id').value); if (!p || !confirm(`Delete ${prodName(p)}?`)) return;
      try { const r = await api('DELETE', '/api/products?id=' + encodeURIComponent(p.id)); S.products = r.products; d.close(); toast('Model deleted'); refresh(); } catch (err) { toast(err.message); }
    };
  }
  function openModel(p, brand) {
    $('#pmModelTitle').textContent = p ? 'Edit model' : 'Add model'; $('#pm-err').textContent = ''; $('#pm-err').className = 'sf-res';
    $('#pm-id').value = p ? p.id : '';
    [...FIELDS.map((f) => f[0]), 'foldL', 'foldW', 'foldH', 'notes'].forEach((k) => { $('#pm-' + k).value = p && p[k] != null ? p[k] : ''; });
    if (!p) { $('#pm-brand').value = brand || usName(); $('#pm-lastVerified').value = today(); const m = C.models.find((x) => x.name === $('#pm-brand').value); $('#pm-model').placeholder = m ? `e.g. ${m.model}` : ''; }
    $('#pm-del').hidden = !p; $('#pmModel').showModal();
  }
  function parseCSV(t) {
    t = t.replace(/^\uFEFF/, ''); const rows = []; let r = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; } else f += c;
    }
    if (f !== '' || r.length) { r.push(f); rows.push(r); }
    return rows.filter((x) => x.some((y) => y.trim() !== ''));
  }
  const csvCell = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function exportCsv() {
    const rows = [COLS.join(','), ...S.products.map((p) => COLS.map((k) => csvCell(p[k])).join(','))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })); a.download = 'competitor_models.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800);
    if (!S.products.length) toast('Template downloaded. Fill in a row per model and import it.');
  }
  async function importCsv(file) {
    try {
      const rows = parseCSV(await file.text()); if (rows.length < 2) throw new Error('The file has no data rows');
      const head = rows[0].map((h) => h.trim()), unknown = head.filter((h) => h && !COLS.includes(h));
      if (!head.includes('brand') || !head.includes('model')) throw new Error('The first row must include the columns brand and model');
      const products = rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (COLS.includes(h)) o[h] = (r[i] || '').trim(); }); return o; });
      if (!confirm(`Import ${products.length} model${products.length === 1 ? '' : 's'}? Matching brand + model rows are updated; empty cells in a column that is present will clear that value.${unknown.length ? '\nIgnored columns: ' + unknown.join(', ') : ''}`)) return;
      const r = await api('POST', '/api/products', { products }); S.products = r.products; toast(`${r.added} added, ${r.updated} updated`); renderMatrix();
    } catch (err) { toast('Import failed: ' + err.message); }
  }

  /* =====================  WORLD MAP  ===================== */
  // Free-text country names from the profile are matched to the map's names (world-atlas spelling).
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
  const ALIAS = { usa: 'United States of America', us: 'United States of America', 'united states': 'United States of America', america: 'United States of America', uk: 'United Kingdom', 'great britain': 'United Kingdom', britain: 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom', 'northern ireland': 'United Kingdom', uae: 'United Arab Emirates', 'czech republic': 'Czechia', 'russian federation': 'Russia', holland: 'Netherlands', 'ivory coast': "Côte d'Ivoire", 'north macedonia': 'Macedonia', bosnia: 'Bosnia and Herz.', 'bosnia and herzegovina': 'Bosnia and Herz.', 'dr congo': 'Dem. Rep. Congo', 'democratic republic of the congo': 'Dem. Rep. Congo', 'republic of the congo': 'Congo', turkiye: 'Turkey', burma: 'Myanmar', 'viet nam': 'Vietnam', korea: 'South Korea', 'republic of korea': 'South Korea', swaziland: 'eSwatini', 'dominican republic': 'Dominican Rep.', 'central african republic': 'Central African Rep.', 'equatorial guinea': 'Eq. Guinea', 'south sudan': 'S. Sudan', 'western sahara': 'W. Sahara', 'falkland islands': 'Falkland Is.', 'solomon islands': 'Solomon Is.', 'cape verde': 'Cabo Verde', 'east timor': 'Timor-Leste', 'palestinian territories': 'Palestine', 'faroe islands': 'Faeroe Is.', 'cayman islands': 'Cayman Is.', 'british virgin islands': 'British Virgin Is.', 'marshall islands': 'Marshall Is.', 'cook islands': 'Cook Is.', 'french polynesia': 'Fr. Polynesia', 'turks and caicos': 'Turks and Caicos Is.', 'antigua and barbuda': 'Antigua and Barb.', 'sao tome and principe': 'São Tomé and Principe', 'us virgin islands': 'U.S. Virgin Is.', 'northern mariana islands': 'N. Mariana Is.', 'st lucia': 'Saint Lucia', 'st kitts and nevis': 'St. Kitts and Nevis', 'saint kitts and nevis': 'St. Kitts and Nevis', 'saint vincent and the grenadines': 'St. Vin. and Gren.', 'st vincent': 'St. Vin. and Gren.' };
  let WIDX = null;
  function worldIndex() {
    if (WIDX) return WIDX;
    const W = window.CIWorld; WIDX = new Map();
    W.names.forEach((n, i) => WIDX.set(norm(n), { k: 'o', i, n })); W.dots.forEach((d, i) => WIDX.set(norm(d[0]), { k: 'd', i, n: d[0] }));
    Object.keys(ALIAS).forEach((a) => { const t = WIDX.get(norm(ALIAS[a])); if (t && !WIDX.has(norm(a))) WIDX.set(norm(a), t); });
    return WIDX;
  }
  const countriesOf = (n) => { const r = regionsOf(n); return r ? REG.flatMap((k) => r[k] || []) : []; };
  function placeCountries(list) {
    const idx = worldIndex(), hit = new Map(), miss = [];
    list.forEach((c) => { const t = idx.get(norm(c)); if (t) hit.set(t.k + t.i, t); else miss.push(c); });
    return { hit, miss };
  }
  function mapHtml(n) {
    const W = window.CIWorld, mine = placeCountries(countriesOf(n)), us = isUs(n) ? { hit: new Map(), miss: [] } : placeCountries(countriesOf(usName()));
    if (!mine.hit.size && !mine.miss.length) return `<p class="muted">No countries listed yet. Add them under Regions in Edit profile (one region per field, countries separated by commas) and they appear here.</p>`;
    const keys = new Set([...mine.hit.keys(), ...us.hit.keys()]);
    const shape = (key) => {
      const t = mine.hit.get(key) || us.hit.get(key), both = mine.hit.has(key) && us.hit.has(key), cls = both ? 'both' : mine.hit.has(key) ? 'theirs' : 'ours', lab = esc(t.n) + (both ? ': both of us sell here' : cls === 'ours' ? ': only we sell here' : '');
      return t.k === 'o' ? `<path class="wm-${cls}" d="${W.d[t.i]}"><title>${lab}</title></path>` : `<circle class="wm-${cls}" cx="${W.dots[t.i][1]}" cy="${W.dots[t.i][2]}" r="3.6"><title>${lab}</title></circle>`;
    };
    return `<svg class="worldmap" viewBox="0 0 ${W.w} ${W.h}" role="img" aria-label="Countries where ${esc(n)} sells"><path class="wm-base" d="${W.d.join('')}"/>${[...keys].map(shape).join('')}</svg>
      <div class="wm-legend"><span><i class="sw theirs"></i>${esc(n)}</span>${isUs(n) ? '' : `<span><i class="sw ours"></i>Only ${esc(usName())}</span><span><i class="sw both"></i>Both</span>`}<span class="muted">${mine.hit.size} countr${mine.hit.size === 1 ? 'y' : 'ies'} placed</span></div>
      ${mine.miss.length ? `<div class="sub">Not placed on the map (name not recognised or not a country): ${mine.miss.map(esc).join(', ')}</div>` : ''}`;
  }
  function withWorld(cb) {
    if (window.CIWorld) return cb();
    const sc = document.createElement('script'); sc.src = '/world-map.js'; sc.onload = cb;
    sc.onerror = () => { const el = $('#profMap'); if (el) el.innerHTML = '<p class="muted">The map file could not be loaded.</p>'; };
    document.head.appendChild(sc);
  }

  /* =====================  PROFILE  ===================== */
  const lines = (t) => String(t || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const bullets = (t, empty) => { const l = lines(t); return l.length ? `<ul class="bul">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`; };
  function regionsHtml(n) {
    const r = regionsOf(n); if (!r) return '<p class="muted">No region data yet.</p>';
    return `<div class="regs">${REG.map((k) => `<div><strong>${k}</strong><div>${(r[k] || []).length ? r[k].map((c) => `<span class="ctry">${esc(c)}</span>`).join('') : '<span class="muted">None listed</span>'}</div></div>`).join('')}</div>`;
  }
  function commercialHtml(n) {
    const d = C.details[n], rev = revenueOf(n), un = unitsOf(n), sku = skuOf(n), b = bm(n), L = [];
    if (rev != null) L.push(`<div><small>Revenue</small><strong>£${rev.toLocaleString('en-GB')}m</strong></div>`);
    if (un != null) L.push(`<div><small>Annual units</small><strong>${un.toLocaleString('en-GB')}</strong></div>`);
    if (sku != null) L.push(`<div><small>Portfolio (SKUs)</small><strong>${sku}</strong></div>`);
    if (d && !L.length) L.push(`<div><small>Revenue (reported or estimated)</small><strong>${esc(d.rev)}</strong></div><div><small>Bikes</small><strong>${esc(d.units)}</strong></div>`);
    const note = [b.dataNote, d && d.conf ? 'Confidence: ' + d.conf : '', d && d.basis].filter(Boolean).join(' · ');
    return L.length || note ? `<div class="facts">${L.join('')}</div>${note ? `<p class="muted">${esc(note)}</p>` : ''}` : '<p class="muted">No commercial figures on file.</p>';
  }
  function companyHtml(n) {
    const b = bm(n), F = [['Head office', b.hq], ['Founded', b.founded], ['Size', b.employees], ['Ownership', b.ownership]].filter((x) => x[1]);
    const site = b.website ? `<div><small>Website</small><strong>${link(b.website, b.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</strong></div>` : '';
    return F.length || site ? `<div class="facts">${F.map(([l, v]) => `<div><small>${l}</small><strong>${esc(v)}</strong></div>`).join('')}${site}</div>` : '<p class="muted">Not filled in yet. Select Edit profile.</p>';
  }
  function eventsHtml(n, max) {
    const ev = C.news.filter((x) => x.brand === n).slice(0, max || 15);
    return ev.length ? `<div class="timeline">${ev.map((x) => `<div><span class="muted">${fmtDay(x.date)}</span><span class="${chipCls(evtOf(x))}">${esc(evtOf(x))}</span><span>${/^https?:\/\//.test(x.url || '') ? `<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.title}</a>` : x.title}<small class="muted"> · ${x.source}</small></span></div>`).join('')}</div>` : '<p class="muted">No events captured yet.</p>';
  }
  function rangeHtml(n) {
    const ps = S.products.filter((p) => p.brand === n); if (!ps.length) return `<p class="muted">No models recorded.</p><button type="button" class="imagebtn" data-add="${esc(n)}">Add a model</button>`;
    return `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Model</th><th>Category</th><th class="num">Price</th><th class="num">Weight</th><th class="num">Battery</th><th class="num">Range</th><th>Launch</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr><td>${esc(p.model)}</td><td>${esc(p.category || '—')}</td><td class="num">${gbp(p.priceGBP)}</td><td class="num">${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td class="num">${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td class="num">${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td><td class="acts"><button type="button" class="linkbtn" data-cmp="${esc(p.id)}">Compare${isUs(n) ? '' : ' with us'}</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div><button type="button" class="imagebtn" data-add="${esc(n)}">Add a model</button>`;
  }
  function renderProfile() {
    const n = S.profile; if (!n) return go('competitors');
    const b = bm(n), pic = C.images[n] || b.photo, src = b.sources || [];
    $('#profile').innerHTML = `<div class="head"><div><button type="button" class="linkbtn" id="profBack">← All competitors</button><h2>${esc(n)} ${badges(n)}</h2><div class="sub">${esc(catOf(n))}${b.category ? '' : ' (starting guess, not confirmed)'} · ${esc((C.models.find((m) => m.name === n) || {}).model || '')}</div></div>
      <div class="source-actions"><button type="button" class="primary" id="profEdit">Edit profile</button><button type="button" class="imagebtn" id="profPrint">Print / save as PDF</button><button type="button" class="imagebtn" id="profHtml">Download</button></div></div>
      <div class="prof">
        <div class="prof-main">
          <div class="panel"><h3>Positioning</h3>${b.positioning ? `<p>${esc(b.positioning)}</p>` : '<p class="muted">Not filled in yet. Select Edit profile.</p>'}${b.threat ? `<p><span class="thr t-${b.threat.toLowerCase()}">${b.threat} threat</span> ${esc(b.threatReason || '')}</p>` : ''}</div>
          <div class="two"><div class="panel"><h3>Strengths</h3>${bullets(b.strengths, 'Not filled in yet.')}</div><div class="panel"><h3>Weaknesses</h3>${bullets(b.weaknesses, 'Not filled in yet.')}</div></div>
          <div class="panel"><h3>Where they sell</h3><div id="profMap"><p class="muted">Loading map…</p></div></div>
          <div class="panel"><h3>Current range and pricing</h3>${rangeHtml(n)}</div>
          <div class="panel"><h3>Recent events</h3>${eventsHtml(n)}</div>
        </div>
        <aside class="prof-side">
          ${pic ? `<div class="panel prof-pic"><img src="${pic}" referrerpolicy="no-referrer" alt="${esc(n)}"></div>` : ''}
          <div class="panel"><h3>Company</h3>${companyHtml(n)}</div>
          <div class="panel"><h3>Regions</h3>${regionsHtml(n)}</div>
          <div class="panel"><h3>Commercials</h3>${commercialHtml(n)}</div>
          <div class="panel"><h3>Verification</h3><p>${b.lastVerified ? `Last verified <strong>${esc(fmtDay(b.lastVerified))}</strong>` : '<span class="muted">Not verified yet.</span>'}</p>${src.length ? `<ul class="bul">${src.map((u) => `<li>${link(u)}</li>`).join('')}</ul>` : '<p class="muted">No sources listed.</p>'}</div>
        </aside></div>`;
  }
  RENDER.profile = renderProfile;
  const _rp = renderProfile; RENDER.profile = () => { _rp(); const n = S.profile; withWorld(() => { const el = $('#profMap'); if (el && S.profile === n) el.innerHTML = mapHtml(n); }); };
  function profileDoc(n) {
    const b = bm(n), ps = S.products.filter((p) => p.brand === n), ev = C.news.filter((x) => x.brand === n).slice(0, 15), r = regionsOf(n), rev = revenueOf(n), un = unitsOf(n);
    const li = (t) => lines(t).map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="m">Not filled in</li>';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(n)} · competitor profile</title><style>body{font:14px/1.5 Arial,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}h1{margin:0}h2{font-size:15px;margin:24px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}.m{color:#777}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}ul{margin:0;padding-left:18px}a{color:#0b4fb3}small{color:#777}@media print{body{margin:0}}</style></head><body>
      <h1>${esc(n)}${isUs(n) ? ' (us)' : ''}</h1><div class="m">${esc(catOf(n))}${b.threat ? ' · ' + b.threat + ' threat' + (b.threatReason ? ': ' + esc(b.threatReason) : '') : ''}</div>
      <h2>Company</h2><p>${[b.hq && 'Head office: ' + esc(b.hq), b.founded && 'Founded ' + esc(b.founded), b.employees && 'Size: ' + esc(b.employees), b.ownership && 'Ownership: ' + esc(b.ownership), b.website && esc(b.website)].filter(Boolean).join(' · ') || '<span class="m">Not filled in</span>'}</p>
      <h2>Positioning</h2><p>${b.positioning ? esc(b.positioning) : '<span class="m">Not filled in</span>'}</p>
      <div class="two"><div><h2>Strengths</h2><ul>${li(b.strengths)}</ul></div><div><h2>Weaknesses</h2><ul>${li(b.weaknesses)}</ul></div></div>
      <h2>Current range and pricing</h2>${ps.length ? `<table><tr><th>Model</th><th>Price</th><th>Weight</th><th>Folded</th><th>Battery</th><th>Range</th><th>Launch</th></tr>${ps.map((p) => `<tr><td>${esc(p.model)}</td><td>${gbp(p.priceGBP)}</td><td>${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td>${esc(fold(p) || '—')}</td><td>${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td>${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td></tr>`).join('')}</table>` : '<p class="m">No models recorded</p>'}
      <h2>Recent events</h2>${ev.length ? `<table>${ev.map((x) => `<tr><td>${esc(E.fmtDate(x.date))} ${esc(String(x.date).slice(0, 4))}</td><td>${esc(evtOf(x))}</td><td>${x.title} <small>${x.source}</small></td></tr>`).join('')}</table>` : '<p class="m">None captured</p>'}
      <h2>Regions</h2>${r ? REG.map((k) => `<div><strong>${k}:</strong> ${(r[k] || []).length ? esc(r[k].join(', ')) : '<span class="m">none listed</span>'}</div>`).join('') : '<p class="m">No region data</p>'}
      <h2>Commercials</h2><p>${[rev != null ? 'Revenue £' + rev + 'm' : '', un != null ? 'Units ' + un.toLocaleString('en-GB') : '', b.dataNote ? esc(b.dataNote) : ''].filter(Boolean).join(' · ') || '<span class="m">None on file</span>'}</p>
      <h2>Verification</h2><p>${b.lastVerified ? 'Last verified ' + esc(fmtDay(b.lastVerified)) : '<span class="m">Not verified</span>'}</p>${(b.sources || []).length ? `<ul>${b.sources.map((u) => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join('')}</ul>` : ''}
      <p><small>Prepared ${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))} from the Competitor Intelligence Hub.</small></p></body></html>`;
  }
  function exportProfile(n, mode) {
    const html = profileDoc(n);
    if (mode === 'print') { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); return; } toast('Pop-up blocked. Downloading instead.'); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); a.download = `${slug(n)}-profile.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800);
  }

  /* ----- brand edit dialog ----- */
  function brandDialog() {
    const d = document.createElement('dialog'); d.id = 'pmBrand';
    d.innerHTML = `<form id="pmBrandForm"><div class="mh"><strong id="pmBrandTitle">Edit profile</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form">
      <div class="source-form-grid"><label>Category<select class="field" id="pb-category">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>Threat level<select class="field" id="pb-threat"><option value="">Not set</option>${THR.map((t) => `<option>${t}</option>`).join('')}</select></label></div>
      <label>Why they matter (one line)<input class="field" id="pb-threatReason" maxlength="200"></label>
      <div class="source-form-grid"><label>Head office (city, country)<input class="field" id="pb-hq" maxlength="120"></label><label>Founded (year)<input class="field" id="pb-founded" maxlength="4" inputmode="numeric"></label><label>Size (employees)<input class="field" id="pb-employees" maxlength="60"></label><label>Ownership<input class="field" id="pb-ownership" maxlength="120" placeholder="e.g. private, listed, owned by …"></label></div>
      <label>Website (https://)<input class="field" id="pb-website" type="url" placeholder="https://"></label>
      <label>Positioning<textarea class="field" id="pb-positioning" rows="3" maxlength="600"></textarea></label>
      <div class="source-form-grid"><label>Strengths (one per line)<textarea class="field" id="pb-strengths" rows="4"></textarea></label><label>Weaknesses (one per line)<textarea class="field" id="pb-weaknesses" rows="4"></textarea></label></div>
      <div class="source-form-grid">${REG.map((k) => `<label>${k}: countries, comma separated<input class="field" id="pb-reg-${k}"></label>`).join('')}</div>
      <div class="source-form-grid"><label>Revenue (£m, per year)<input class="field" id="pb-revenueGBPm" type="number" step="any" min="0"></label><label>Annual units<input class="field" id="pb-units" type="number" step="any" min="0"></label><label>Portfolio size (SKUs)<input class="field" id="pb-skuCount" type="number" step="1" min="0"></label><label>Last verified<span class="tri2"><input class="field" id="pb-lastVerified" type="date"><button type="button" class="imagebtn" id="pb-today">Today</button></span></label></div>
      <label>Note on the figures<input class="field" id="pb-dataNote" maxlength="400"></label>
      <label>Sources (one link per line, https://)<textarea class="field" id="pb-sources" rows="3"></textarea></label>
      <label class="toggle-label"><input type="checkbox" id="pb-watch">Pin to the watchlist</label>
      <label class="toggle-label"><input type="checkbox" id="pb-isUs">This is our brand (“us”)<span class="muted" id="pb-usnote"></span></label>
      <div class="sf-res" id="pb-err" role="status"></div><div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save profile</button></div></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    $('#pb-today').onclick = () => { $('#pb-lastVerified').value = today(); };
    $('#pmBrandForm').onsubmit = async (e) => {
      e.preventDefault(); const n = S.profile, v = (k) => $('#pb-' + k).value.trim(), f = {
        category: v('category'), threat: v('threat'), threatReason: v('threatReason'), positioning: v('positioning'), strengths: $('#pb-strengths').value, weaknesses: $('#pb-weaknesses').value,
        regions: Object.fromEntries(REG.map((k) => [k, v('reg-' + k)])), revenueGBPm: v('revenueGBPm'), units: v('units'), skuCount: v('skuCount'), lastVerified: v('lastVerified'), dataNote: v('dataNote'), hq: v('hq'), founded: v('founded'), employees: v('employees'), ownership: v('ownership'), website: v('website'), sources: $('#pb-sources').value,
        watch: $('#pb-watch').checked
      };
      if (!isUs(n) && $('#pb-isUs').checked) f.isUs = true;
      try { const r = await api('POST', '/api/brands', { brand: n, fields: f }); S.brands = r.brands; applyBrands(); d.close(); toast('Profile saved'); refresh(); } catch (err) { $('#pb-err').textContent = err.message; $('#pb-err').className = 'sf-res bad'; }
    };
  }
  function openBrandDialog() {
    const n = S.profile, b = bm(n), r = regionsOf(n) || {};
    $('#pmBrandTitle').textContent = 'Edit ' + n; $('#pb-err').textContent = ''; $('#pb-err').className = 'sf-res';
    $('#pb-category').value = catOf(n); $('#pb-threat').value = b.threat || '';
    ['threatReason', 'positioning', 'strengths', 'weaknesses', 'dataNote', 'lastVerified', 'hq', 'founded', 'employees', 'ownership', 'website'].forEach((k) => { $('#pb-' + k).value = b[k] || ''; });
    REG.forEach((k) => { $('#pb-reg-' + k).value = (r[k] || []).join(', '); });
    ['revenueGBPm', 'units', 'skuCount'].forEach((k) => { const v = k === 'revenueGBPm' ? revenueOf(n) : k === 'units' ? unitsOf(n) : skuOf(n); $('#pb-' + k).value = v == null ? '' : v; });
    $('#pb-sources').value = (b.sources || []).join('\n'); $('#pb-watch').checked = !!b.watch;
    $('#pb-isUs').checked = isUs(n); $('#pb-isUs').disabled = isUs(n); $('#pb-usnote').textContent = isUs(n) ? ' To change who “us” is, tick this on another brand.' : '';
    $('#pmBrand').showModal();
  }

  /* ---------- apply saved brand data to the older parts of the page ---------- */
  function applyBrands() {
    C.models.forEach((m) => { const b = S.brands[m.name]; m.category = (b && b.category) || C.defaultCategory[m.name] || 'E-bike'; m.reviewed = !!(b && b.category); });
    const cat = $('#cat'); if (cat) { const keep = cat.value; cat.innerHTML = '<option value="all">All categories</option>' + CATS.map((c) => `<option>${c}</option>`).join(''); if ([...cat.options].some((o) => o.value === keep)) cat.value = keep; }
    const q = [usName(), ...C.brands.filter((b) => bm(b).watch && !isUs(b)).sort((a, b) => thrOrder(a) - thrOrder(b))].slice(0, 8);
    if (q.length > 1) C.quick.splice(0, C.quick.length, ...q);
    C.controls(); C.feed(); C.cards(); updatePhotoBtn();
  }

  /* ---------- brand photos and brand-data import ---------- */
  const hasPhoto = (b) => !!(C.images[b] || bm(b).photo);
  function updatePhotoBtn() { const n = C.brands.filter((b) => !hasPhoto(b)).length, el = $('#fetchPhotos'); if (el) { el.textContent = n ? `Fetch missing photos (${n})` : 'All brands have a photo'; el.disabled = !n; } }
  async function fetchPhotos() {
    const miss = C.brands.filter((b) => !hasPhoto(b)), btn = $('#fetchPhotos'), msg = $('#photoMsg'); if (!miss.length) return;
    btn.disabled = true; let ok = 0; const fail = [];
    for (const [i, b] of miss.entries()) {
      msg.textContent = `Looking ${i + 1} of ${miss.length}: ${b}…`;
      try { const r = await api('POST', '/api/brand-photos', { brand: b }); S.brands[b] = Object.assign({}, bm(b), { photo: r.photo }); ok++; C.cards(); } catch (e) { fail.push(b); }
    }
    msg.textContent = `${ok} found.${fail.length ? ` None found for ${fail.join(', ')}: add a website on the profile and try again, or use Update picture.` : ''}`; updatePhotoBtn();
  }
  async function importBrands(file) {
    try {
      let j = JSON.parse(await file.text()); j = j && j.brands && typeof j.brands === 'object' ? j.brands : j;
      const names = Object.keys(j || {}).filter((k) => j[k] && typeof j[k] === 'object'); if (!names.length) throw new Error('No brands found in the file');
      const unknown = names.filter((k) => !C.brands.includes(k));
      if (!confirm(`Import data for ${names.length} brand${names.length === 1 ? '' : 's'} (${names.join(', ')})? Fields in the file replace what is saved for those brands; other fields are kept.${unknown.length ? '\nNot in your brand list: ' + unknown.join(', ') : ''}`)) return;
      const updates = {}; names.forEach((k) => { updates[k] = j[k]; });
      const r = await api('POST', '/api/brands', { updates }); S.brands = r.brands; applyBrands(); toast(`Imported ${names.length} brand${names.length === 1 ? '' : 's'}`); refresh();
    } catch (err) { toast('Import failed: ' + err.message); }
  }
  function addCompetitorTools() {
    const sec = $('#competitors'); if (!sec || $('#fetchPhotos')) return;
    sec.insertAdjacentHTML('afterbegin', '<div class="pm-tools"><button type="button" class="imagebtn" id="fetchPhotos">Fetch missing photos</button><button type="button" class="imagebtn" id="impBrands">Import brand data</button><input type="file" id="brandFile" accept=".json,application/json" hidden><span class="sub" id="photoMsg"></span></div>');
  }

  /* ---------- events wiring ---------- */
  function wire() {
    document.addEventListener('click', async (e) => {
      const t = e.target;
      const open = t.closest('[data-open]'); if (open && !t.closest('a')) { openProfile(open.dataset.open); return; }
      const nb = t.closest('[data-nb]'); if (nb) return openNews(nb.dataset.nb, nb.dataset.nt);
      const w = t.closest('#pmWin button'); if (w) { S.win = +w.dataset.w; return renderInsights(); }
      const ed = t.closest('[data-edit]'); if (ed) { const p = prodById(ed.dataset.edit); if (p) openModel(p); return; }
      const ad = t.closest('[data-add]'); if (ad) return openModel(null, ad.dataset.add);
      const cm = t.closest('[data-cmp]'); if (cm) { addCmp(cm.dataset.cmp); if (($('.view.active') || {}).id !== 'matrix') go('matrix'); return; }
      const un = t.closest('[data-unc]'); if (un) { S.cmp.others = S.cmp.others.filter((x) => x !== un.dataset.unc); fixCmp(); return renderMatrix(); }
      const so = t.closest('[data-sort]'); if (so) { S.sort = { k: so.dataset.sort, d: S.sort.k === so.dataset.sort ? -S.sort.d : 1 }; $('#mdlBox').innerHTML = modelsTable(); return; }
      switch (t.id) {
        case 'fetchPhotos': return fetchPhotos();
        case 'impBrands': return $('#brandFile').click();
        case 'addModel': return openModel(null);
        case 'impCsv': return $('#csvFile').click();
        case 'expCsv': return exportCsv();
        case 'manageWatch': case 'pinFirst': return manageWatch();
        case 'profBack': return go('competitors');
        case 'profEdit': return openBrandDialog();
        case 'profPrint': return exportProfile(S.profile, 'print');
        case 'profHtml': return exportProfile(S.profile, 'file');
        case 'dgPreview': try { S.digest = await api('GET', '/api/digest'); renderWatch(); } catch (err) { toast(err.message); } return;
        case 'dgCopy': try { await navigator.clipboard.writeText(S.digest.text); toast('Digest copied'); } catch (err) { toast('Could not copy'); } return;
        case 'dgSend': try { const r = await api('POST', '/api/digest'); toast('Slack: ' + (r.sent.slack || 'not set up') + ' · Email: ' + (r.sent.email || 'not set up')); } catch (err) { toast(err.message); } return;
        default:
      }
    });
    document.addEventListener('keydown', (e) => { const c = e.target.closest && e.target.closest('.wc'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openProfile(c.dataset.open); } });
    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'cmpUs') { S.cmp.us = t.value; fixCmp(); return renderMatrix(); }
      if (t.id === 'cmpAdd') { if (t.value) addCmp(t.value); return; }
      if (t.id === 'mapX' || t.id === 'mapY') { S[t.id] = t.value; $('#mapBox').innerHTML = mapSvg(); return; }
      if (t.id === 'brandFile') { if (t.files[0]) await importBrands(t.files[0]); t.value = ''; return; }
      if (t.id === 'csvFile') { if (t.files[0]) await importCsv(t.files[0]); t.value = ''; return; }
      if (t.id === 'evtType') { C.evtSel = t.value; return C.feed(); }
      if (t.classList.contains('evtsel')) {
        try { await api('POST', '/api/tags', { id: t.dataset.id, type: t.value }); const n = C.news.find((x) => x.id === t.dataset.id); if (n) n.evt0 = t.value; C.feed(); toast('Event type saved'); } catch (err) { toast(err.message); }
      }
    });
    document.addEventListener('input', (e) => { if (e.target.id === 'mdlSearch') { S.q = e.target.value; $('#mdlBox').innerHTML = modelsTable(); } });
    $('#pmWatchForm').onsubmit = async (e) => {
      e.preventDefault(); const on = new Set($$('#pmWatchList input:checked').map((x) => x.value)), updates = {};
      C.brands.forEach((b) => { if (!isUs(b) && !!bm(b).watch !== on.has(b)) updates[b] = { watch: on.has(b) }; });
      if (Object.keys(updates).length) { try { const r = await api('POST', '/api/brands', { updates }); S.brands = r.brands; applyBrands(); toast('Watchlist saved'); } catch (err) { return toast(err.message); } }
      $('#pmWatchDlg').close(); refresh();
    };
    $('#pmWatchDlg').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#pmWatchDlg').close(); });
  }

  /* ---------- start ---------- */
  Object.assign(C, { photo: (n) => bm(n).photo || '', isUs, badges, evtChip, passEvt: (n) => !C.evtSel || evtOf(n) === C.evtSel, evtSel: '', openProfile, renderInsights, onNews: () => { const a = ($('.view.active') || {}).id; if (a === 'watch' || a === 'insights') RENDER[a](); } });
  mkView('watch', ''); mkView('matrix', ''); mkView('profile', '');
  mkNav('watch', 'Watchlist', 'news'); mkNav('matrix', 'Product matrix', 'competitors');
  const side = $('.side'); side.insertBefore(side.querySelector('.nav[data-v="watch"]'), side.firstChild);
  const evtSelect = document.createElement('select'); evtSelect.className = 'field'; evtSelect.id = 'evtType'; evtSelect.setAttribute('aria-label', 'Event type');
  evtSelect.innerHTML = '<option value="">All event types</option>' + E.EVENT_TYPES.map((t) => `<option>${t}</option>`).join(''); $('#news .tools').appendChild(evtSelect);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="pmWatchDlg"><form id="pmWatchForm"><div class="mh"><strong>Manage watchlist</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form"><div class="sub">Pin the 5 to 8 competitors that matter most. Set a threat level on each profile.</div><div class="checks" id="pmWatchList"></div><div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save watchlist</button></div></div></form></dialog>`);
  modelDialog(); brandDialog(); addCompetitorTools(); wire();
  S.cmp = Object.assign({ us: '', others: [] }, ld('cih_pm_cmp', {}));
  (async () => {
    try { const [b, p] = await Promise.all([api('GET', '/api/brands'), api('GET', '/api/products')]); S.brands = b.brands || {}; S.products = p.products || []; }
    catch (err) { toast('Could not load saved profiles and models: ' + err.message); }
    applyBrands(); go('watch');
  })();
})();
