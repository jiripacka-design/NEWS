/* Product-manager features for the Competitor Intelligence Hub (v3.7.0):
   insights (watchlist, momentum, portfolio and volumes, price chart, regions, data gaps), product comparison matrix, competitor profiles, event types and the weekly digest preview.
   Needs window.CIH (exposed by tracker.html) and window.CIEvents (events.js). Saved data lives on the
   server (/api/brands, /api/products, /api/tags) so everyone who signs in sees the same thing. */
(() => {
  'use strict';
  const C = window.CIH, E = window.CIEvents;
  if (!C || !E) { console.error('pm.js: tracker core or events.js missing'); return; }
  const { $, $$, esc, toast } = C;
  const REG = ['US', 'EMEA', 'APAC', 'CHINA'], CATS = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike'], THR = ['High', 'Medium', 'Low'];
  const S = { brands: {}, products: [], win: 30, cmp: { us: '', others: [] }, sort: { k: 'brand', d: 1 }, q: '', profile: '', digest: null, showEmpty: false, diff: false, wide: true, insTab: 'markets', pfSort: { k: 'u', d: -1 }, cview: 'ladder', cscale: 'log', chHide: new Set(), chFind: '', mkSel: 'all', mkC: '', mkAbsent: false, pickSlot: 0, pickQ: '' };
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
  // Price in pounds. Models priced only in euros or dollars are converted at editable approximate rates (Insights > Charts) so they can still be compared and plotted.
  const FX_DEFAULT = { EUR: 0.85, USD: 0.74 };
  const priceOf = (p) => {
    const fx = S.fx || FX_DEFAULT, has = (v) => v != null && v !== '';
    if (has(p.priceGBP)) return { v: p.priceGBP, conv: '' };
    if (has(p.priceEUR)) return { v: Math.round(p.priceEUR * fx.EUR), conv: `converted from €${Number(p.priceEUR).toLocaleString('en-GB')} at €1 = £${fx.EUR}` };
    if (has(p.priceUSD)) return { v: Math.round(p.priceUSD * fx.USD), conv: `converted from $${Number(p.priceUSD).toLocaleString('en-GB')} at $1 = £${fx.USD}` };
    return { v: null, conv: '' };
  };
  const priceTxt = (p) => { const x = priceOf(p); return x.v == null ? '—' : (x.conv ? '≈ ' : '') + gbp(x.v); };
  const plain = (v) => (v == null || v === '' ? '—' : esc(v));
  const fold = (p) => (p.foldL && p.foldW && p.foldH ? `${p.foldH} × ${p.foldW} × ${p.foldL} cm` : null);
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
    document.body.classList.toggle('wide', id === 'matrix' && S.wide);
    if (RENDER[id]) RENDER[id]();
    window.scrollTo(0, 0);
  }
  function refresh() { const a = ($('.view.active') || {}).id; if (RENDER[a]) RENDER[a](); }
  function openProfile(n) { S.profile = n; go('profile'); }
  function openNews(brand, type) { C.evtSel = type || ''; const sel = $('#evtType'); if (sel) sel.value = type || ''; C.setNewsBrand(brand); }

  /* =====================  INSIGHTS (watchlist + insights on one page)  ===================== */
  const TABS = [['markets', 'Markets'], ['overview', 'Overview'], ['portfolio', 'Portfolio and volumes'], ['chart', 'Charts'], ['gaps', 'Data gaps']];
  // Short plain-English explanations, shown above each table so every number can be read without a manual.
  const gloss = (rows) => `<details class="howto" open><summary>How to read this</summary><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></details>`;
  function wcard(b, mom) {
    const m = mom[b] || { cur: 0, prev: 0, spark: new Array(12).fill(0), label: 'No activity' };
    const ps = S.products.filter((p) => p.brand === b), prices = ps.map((p) => priceOf(p).v).filter((x) => x != null);
    const last = C.news.find((n) => n.brand === b);
    const range = ps.length ? ` · ${ps.length} model${ps.length === 1 ? '' : 's'}${prices.length ? ' · ' + (Math.min(...prices) === Math.max(...prices) ? gbp(prices[0]) : gbp(Math.min(...prices)) + '–' + gbp(Math.max(...prices))) : ''}` : '';
    return `<article class="wc${isUs(b) ? ' is-us' : ''}" data-open="${esc(b)}" tabindex="0" role="button">
      <header><h3>${esc(b)}</h3><span>${badges(b)}</span></header>
      <div class="wc-cat">${esc(catOf(b))}${range}</div>
      <p class="wc-reason">${bm(b).threatReason ? esc(bm(b).threatReason) : (isUs(b) ? 'Our brand: the reference for every comparison.' : '<span class="muted">No threat reason yet. Open the profile to add one.</span>')}</p>
      <div class="wc-mom">${spark(m.spark)}<span class="st ${statusCls[m.label]}">${m.label}</span><span class="muted">${m.cur} vs ${m.prev} (30 days)</span></div>
      <div class="wc-last">${last ? `<span class="${chipCls(evtOf(last))}">${esc(evtOf(last))}</span> <span class="muted">${fmtDay(last.date)}</span><br>${last.title}` : '<span class="muted">No items yet</span>'}</div></article>`;
  }
  async function manageWatch() {
    const us = usName(), dlg = $('#pmWatchDlg');
    $('#pmWatchList').innerHTML = C.brands.filter((b) => b !== us).slice().sort((a, b) => a.localeCompare(b)).map((b) => `<label><input type="checkbox" value="${esc(b)}"${bm(b).watch ? ' checked' : ''}>${esc(b)}</label>`).join('');
    dlg.showModal();
  }
  function renderInsights() {
    const root = $('#pmInsights'); if (!root) return;
    const us = usName(), W = S.win, showWin = S.insTab === 'overview';
    const body = { overview: insOverview, portfolio: insPortfolio, chart: insChart, markets: insMarkets, gaps: insGaps }[S.insTab]();
    root.innerHTML = `<div class="head"><div><h2>Insights</h2><div class="sub">Who matters, what they are doing, how big they are and how we compare. Us: <strong>${esc(us)}</strong>.</div></div>
      <div class="source-actions">${showWin ? `<div class="rangebar" id="pmWin" role="group" aria-label="Window">${[7, 30, 90].map((d) => `<button type="button" data-w="${d}" class="${d === W ? 'on' : ''}">${d} days</button>`).join('')}</div>` : ''}<button type="button" class="imagebtn" id="manageWatch">Manage watchlist</button></div></div>
      <div class="tabs2" role="tablist" aria-label="Insights sections">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === S.insTab}" data-itab="${k}" class="${k === S.insTab ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
  }
  RENDER.insights = renderInsights;

  function insOverview() {
    const now = Date.now(), us = usName(), W = S.win, items = feedItems(), mom = {};
    E.momentum(items, C.brands, now, 30, 12).forEach((m) => { mom[m.brand] = m; });
    const watched = C.brands.filter((b) => bm(b).watch && b !== us).sort((a, b) => thrOrder(a) - thrOrder(b) || a.localeCompare(b));
    const d = E.buildDigest(items.map((n) => ({ date: n.date, brand: n.brand, title: n.title, summary: n.summary, url: n.url, evt: evtOf(n) })), { us, watch: watched, threat: Object.fromEntries(watched.map((b) => [b, { level: bm(b).threat || '' }])), brands: C.brands }, now, 7);
    const ml = E.momentum(items, C.brands, now, W, 12).filter((m) => isUs(m.brand) || m.cur || m.prev).sort((a, b) => (isUs(b.brand) - isUs(a.brand)) || b.delta - a.delta || b.cur - a.cur);
    const quiet = C.brands.length - ml.filter((m) => !isUs(m.brand) || m.cur || m.prev).length;
    return `<div class="panel"><div class="chart-head"><div><h3>Brands to watch</h3><div class="sub">Us first, then the competitors you pinned.</div></div></div>
      ${gloss([['Threat', 'How much this brand could hurt our sales. You set it on the profile.'], ['Trend', 'News items in the last 30 days against the 30 days before.'], ['Line', 'Items per week over the last 12 weeks.']])}
      ${watched.length ? '' : '<div class="pm-empty"><strong>Nothing pinned yet</strong><span>Pin the 5 to 8 competitors that matter most. They appear here with a threat level and a one-line reason, and become the quick filters in News.</span><button type="button" class="primary" id="pinFirst">Pin brands</button></div>'}
      <div class="wgrid">${[us, ...watched].map((b) => wcard(b, mom)).join('')}</div></div>
      <div class="panel"><div class="chart-head"><div><h3>Changes in the last 7 days</h3><div class="sub">${d.total} item${d.total === 1 ? '' : 's'} across ${d.brandCount} brand${d.brandCount === 1 ? '' : 's'} (the 7 days before: ${d.prevTotal}). Us and the watchlist come first.</div></div></div>
        ${d.top.length ? `<div class="chg">${d.top.map((i) => `<div class="chg-row${i.brand === us ? ' is-us' : ''}"><span class="muted">${esc(E.fmtDate(i.date))}</span><span><strong>${esc(i.brand)}</strong> ${badges(i.brand)}</span><span class="${chipCls(i.evt)}">${esc(i.evt)}</span><span>${/^https?:\/\//.test(i.url || '') ? `<a href="${i.url}" target="_blank" rel="noopener noreferrer">${i.title}</a>` : i.title}</span></div>`).join('')}</div>` : '<div class="source-empty">Nothing new in the last 7 days.</div>'}</div>
      <div class="panel"><div class="chart-head"><div><h3>Momentum</h3><div class="sub">Who is getting busier.</div></div></div>
        ${gloss([['Last ' + W + 'd', 'News items in the last ' + W + ' days.'], ['Before', 'Items in the ' + W + ' days before that.'], ['Change', 'Last minus before. Green is busier, red is quieter.'], ['Status', 'Accelerating, Steady, Slowing, New activity or No activity.']])}
        <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Brand</th><th class="num">Last ${W}d</th><th class="num">Before</th><th class="num">Change</th><th>12 weeks</th><th>Status</th></tr></thead><tbody>
        ${ml.map((m) => `<tr class="${isUs(m.brand) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(m.brand)}">${esc(m.brand)}</button> ${badges(m.brand)}</td><td class="num">${m.cur}</td><td class="num">${m.prev}</td><td class="num ${m.delta > 0 ? 'pos' : m.delta < 0 ? 'neg' : ''}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${spark(m.spark)}</td><td><span class="st ${statusCls[m.label]}">${m.label}</span></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No dated items yet.</td></tr>'}
        </tbody></table></div><div class="sub">${quiet > 0 ? `${quiet} other brand${quiet === 1 ? ' has' : 's have'} no items in these windows. ` : ''}This counts items the tracker has stored, so a brand with few sources can look quiet when it is not.</div></div>
      ${digestPanel()}`;
  }

  /* ----- Portfolio and volumes: how big is each competitor, how wide is the range, how deep is the P&A offer ----- */
  const num0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'));
  function portfolioRows() {
    return C.brands.map((b) => {
      const ps = S.products.filter((p) => p.brand === b), pr = ps.map((p) => priceOf(p).v).filter((x) => x != null), u = unitsOf(b), r = revenueOf(b), sku = skuOf(b), pa = bm(b).paSkus;
      return { b, u, r, sku, pa, models: ps.length, pmin: pr.length ? Math.min(...pr) : null, pmax: pr.length ? Math.max(...pr) : null, rpb: u && r != null && !/low confidence/i.test(bm(b).dataNote || '') ? (r * 1e6) / u : null, depth: pa != null && sku ? pa / sku : null, low: /low confidence/i.test(bm(b).dataNote || ''), note: bm(b).dataNote || '', cats: bm(b).paCategories || '', year: bm(b).figuresYear || '', ver: bm(b).lastVerified || '' };
    });
  }
  function insPortfolio() {
    const rows = portfolioRows(), k = S.pfSort.k, dir = S.pfSort.d, n = rows.length;
    rows.sort((a, c) => {
      if (isUs(a.b) !== isUs(c.b)) return isUs(c.b) - isUs(a.b);
      const x = k === 'b' ? a.b : a[k], y = k === 'b' ? c.b : c[k];
      if (x == null || x === '') return y == null || y === '' ? a.b.localeCompare(c.b) : 1; if (y == null || y === '') return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir || a.b.localeCompare(c.b);
    });
    const withU = rows.filter((r) => r.u != null).sort((a, c) => c.u - a.u), withPA = rows.filter((r) => r.pa != null || r.cats), us = usName();
    const rank = withU.findIndex((r) => r.b === us), top = withU[0], maxU = top ? top.u : 1;
    const th = (key, label, cls, tip) => `<th class="${cls || ''}"${tip ? ` title="${esc(tip)}"` : ''}><button type="button" class="sortbtn" data-psort="${key}">${label}${S.pfSort.k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    return `<div class="metrics"><div class="metric">Brands with volume data<strong>${withU.length}<small> of ${n}</small></strong></div>
      <div class="metric">Largest by volume<strong style="font-size:17px">${top ? esc(top.b) + ' · ' + num0(top.u) + (top.low ? ' (claimed)' : '') : '—'}</strong></div>
      <div class="metric">Our volume rank<strong>${rank >= 0 ? '#' + (rank + 1) + '<small> of ' + withU.length + '</small>' : '—'}</strong></div>
      <div class="metric">Brands with P&amp;A data<strong>${withPA.length}<small> of ${n}</small></strong></div></div>
      <div class="panel"><div class="chart-head"><div><h3>Portfolio and volumes</h3><div class="sub">How much each brand sells, how many models it lists, and how wide its parts and accessories (P&amp;A) range is.</div></div>
        <div class="source-actions"><button type="button" class="imagebtn" id="expBrands">Export to fill in</button><button type="button" class="imagebtn" id="impBrands2">Import filled file</button></div></div>
        ${gloss([['Units / year', 'Bikes sold in a year. The small number under it is the year the figure is for.'], ['Revenue', 'Yearly sales in £ millions.'], ['Per bike', 'Revenue divided by units: a rough average price paid per bike, including accessories.'], ['SKUs', 'How many different bike models or variants the brand lists.'], ['Tracked', 'How many of its models we have in the Product Comparison.'], ['P&amp;A products', 'Parts and accessories on sale: luggage, lights, locks, saddles and so on.'], ['P&amp;A per model', 'P&amp;A products divided by SKUs. Higher means a deeper accessory range for each bike.']])}
        <div class="tbl-wrap"><table class="pm-table pf"><thead><tr>${th('b', 'Brand')}${th('u', 'Units / year', 'num')}${th('r', 'Revenue', 'num')}${th('rpb', 'Per bike', 'num')}${th('sku', 'SKUs', 'num')}${th('models', 'Tracked', 'num')}<th>Price range</th>${th('pa', 'P&amp;A products', 'num')}${th('depth', 'P&amp;A per model', 'num')}<th>P&amp;A offering</th>${th('ver', 'Verified')}</tr></thead><tbody>
        ${rows.map((r) => `<tr class="${isUs(r.b) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(r.b)}">${esc(r.b)}</button> ${badges(r.b)}</td>
          <td class="num">${r.u != null ? `<div class="ubar"><i style="width:${Math.max(2, r.u / maxU * 100)}%"></i></div><strong>${num0(r.u)}</strong>${r.low ? `<span class="warn" title="${esc(r.note)}">claimed, low confidence</span>` : ''}${r.year ? `<small class="muted">${esc(r.year)}</small>` : ''}` : '<span class="muted">—</span>'}</td>
          <td class="num">${r.r != null ? '£' + r.r.toLocaleString('en-GB') + 'm' : '<span class="muted">—</span>'}</td><td class="num">${r.rpb != null ? '£' + num0(r.rpb) : '<span class="muted">—</span>'}</td>
          <td class="num">${r.sku != null ? r.sku : '<span class="muted">—</span>'}</td><td class="num">${r.models ? `<button type="button" class="cellbtn" data-go="matrix">${r.models}</button>` : '<span class="muted">0</span>'}</td>
          <td>${r.pmin != null ? (r.pmin === r.pmax ? gbp(r.pmin) : gbp(r.pmin) + '–' + gbp(r.pmax)) : '<span class="muted">—</span>'}</td>
          <td class="num">${r.pa != null ? r.pa : '<span class="muted">—</span>'}</td><td class="num">${r.depth != null ? r.depth.toFixed(1) : '<span class="muted">—</span>'}</td>
          <td class="pa-cats">${r.cats ? esc(r.cats) : '<span class="muted">—</span>'}</td><td>${r.ver ? esc(r.ver) : '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="sub">${withU.length < n ? `${n - withU.length} brand${n - withU.length === 1 ? ' has' : 's have'} no volume figure yet. Most manufacturers do not publish units, so treat these as estimates and check the note and sources on each profile. ` : ''}Select <button type="button" class="linkbtn" id="loadStarter3">Load researched data</button> for what has been found so far, or <strong>Export to fill in</strong> to get a spreadsheet with every brand, add what you know, then select <strong>Import filled file</strong>. Empty cells are ignored, so nothing is overwritten by blanks.</div></div>`;
  }
  function digestPanel() {
    const dg = S.digest;
    return `<div class="panel"><div class="chart-head"><div><h3>Weekly digest</h3><div class="sub">The summary posted to Slack or emailed every Monday once a channel is set up (see the README).</div></div>
      <div class="source-actions"><button type="button" class="imagebtn" id="dgPreview">${dg ? 'Refresh preview' : 'Preview digest'}</button>${dg ? '<button type="button" class="imagebtn" id="dgCopy">Copy</button><button type="button" class="imagebtn" id="dgSend">Send now</button>' : ''}</div></div>
      ${dg ? `<pre class="dg">${esc(dg.text)}</pre><div class="sub">Delivery: Slack ${dg.channels.slack ? 'connected' : 'not set up'} · Email ${dg.channels.email ? 'connected' : 'not set up'}</div>` : '<div class="sub">Select Preview digest to see this week’s summary.</div>'}</div>`;
  }
  /* =====================  MARKETS (flat world map + region table)  ===================== */
  function mkBrands() {
    const others = C.brands.filter((b) => !isUs(b));
    return S.mkSel === 'all' ? others : S.mkSel === 'watch' ? others.filter((b) => bm(b).watch) : others.filter((b) => b === S.mkSel);
  }
  function insMarkets() {
    if (!window.CIWorld) { withWorld(() => { if (S.insTab === 'markets') renderInsights(); }); return '<div class="panel"><div class="source-empty">Loading the map…</div></div>'; }
    const W = window.CIWorld, us = usName(), pick = mkBrands(), mine = placeCountries(countriesOf(us)), single = pick.length === 1;
    const by = new Map(); pick.forEach((b) => { placeCountries(countriesOf(b)).hit.forEach((t, key) => { if (!by.has(key)) by.set(key, { t, brands: [] }); by.get(key).brands.push(b); }); });
    const keys = new Set([...by.keys(), ...mine.hit.keys()]), nameOf = (key) => (by.get(key) || { t: mine.hit.get(key) }).t.n;
    const klass = (key) => { const n = (by.get(key) || { brands: [] }).brands.length; if (!n) return 'wm-us'; const c = single ? 2 : n >= 8 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : 1; return `wm-n${c}${mine.hit.has(key) ? ' wm-ov' : ''}`; };
    const shape = (key) => {
      const e = by.get(key) || { t: mine.hit.get(key), brands: [] }, t = e.t, ours = mine.hit.has(key), who = e.brands;
      const tip = `${t.n}: ${who.length ? `${who.length} competitor${who.length === 1 ? '' : 's'} (${who.slice(0, 8).join(', ')}${who.length > 8 ? ', …' : ''})` : 'no competitor listed'}. ${ours ? 'We sell here.' : 'We do not sell here.'}`, c = klass(key) + (S.mkC === key ? ' wm-sel' : '');
      return t.k === 'o' ? `<path class="${c}" data-ctry="${key}" d="${W.d[t.i]}"><title>${esc(tip)}</title></path>` : `<circle class="${c}" data-ctry="${key}" cx="${W.dots[t.i][1]}" cy="${W.dots[t.i][2]}" r="4.2"><title>${esc(tip)}</title></circle>`;
    };
    const both = [...by.keys()].filter((k) => mine.hit.has(k)).length, theirsOnly = by.size - both, oursOnly = [...mine.hit.keys()].filter((k) => !by.has(k)).length;
    const withData = C.brands.filter((b) => !isUs(b) && countriesOf(b).length);
    const rows = [...by.entries()].map(([key, e]) => ({ key, n: e.t.n, brands: e.brands, ours: mine.hit.has(key) })).filter((r) => !S.mkAbsent || !r.ours).sort((a, c) => c.brands.length - a.brands.length || a.n.localeCompare(c.n)).slice(0, 15);
    const sel = S.mkC && keys.has(S.mkC) ? S.mkC : '', se = sel ? (by.get(sel) || { t: mine.hit.get(sel), brands: [] }) : null;
    const opts = `<option value="all"${S.mkSel === 'all' ? ' selected' : ''}>All competitors (${C.brands.filter((b) => !isUs(b)).length})</option><option value="watch"${S.mkSel === 'watch' ? ' selected' : ''}>Watchlist only (${C.brands.filter((b) => bm(b).watch && !isUs(b)).length})</option>${withData.sort((a, b) => a.localeCompare(b)).map((b) => `<option${S.mkSel === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}`;
    return `<div class="metrics"><div class="metric">Countries with a competitor<strong>${by.size}</strong></div><div class="metric">Where we both sell<strong>${both}</strong></div><div class="metric">Competitors only, we are absent<strong>${theirsOnly}</strong></div><div class="metric">Only we sell here<strong>${oursOnly}</strong></div></div>
      <div class="panel"><div class="chart-head"><div><h3>Where they sell</h3><div class="sub">${single ? esc(pick[0]) : `${pick.length} competitor${pick.length === 1 ? '' : 's'}`} against ${esc(us)}. Select a country for details.</div></div><div class="mk-ctl"><label class="cmp-bar">Show<select class="field" id="mkSel">${opts}</select></label></div></div>
        ${gloss([['Brighter', single ? 'A country where the selected competitor sells.' : 'More competitors sell there: grey is 1, then lighter for 2 to 3, 4 to 7, and white for 8 or more.'], ['Blue', 'Only we sell there. Blue outline: we sell there too.'], ['Source', 'The countries listed on each profile under Regions. Countries are only as complete as those lists.']])}
        <svg class="worldmap mk" viewBox="0 0 ${W.w} ${W.h}" role="img" aria-label="Flat world map of where ${esc(us)} and its competitors sell"><path class="wm-base" d="${W.d.join('')}"/>${[...keys].map(shape).join('')}</svg>
        <div class="wm-legend"><span><i class="sw n1"></i>1 competitor</span>${single ? '' : '<span><i class="sw n2"></i>2 to 3</span><span><i class="sw n3"></i>4 to 7</span><span><i class="sw n4"></i>8 or more</span>'}<span><i class="sw us"></i>Only ${esc(us)}</span><span><i class="sw ov"></i>${esc(us)} also sells here</span><span class="muted">${withData.length} of ${C.brands.length - 1} competitors have countries listed</span></div>
        ${se ? `<div class="mk-box"><b>${esc(se.t.n)}</b>: ${se.brands.length ? `${se.brands.length} competitor${se.brands.length === 1 ? '' : 's'} sell here.` : 'no competitor listed here.'} ${mine.hit.has(sel) ? `<b>${esc(us)} sells here too.</b>` : `<b>${esc(us)} does not sell here.</b>`}<div class="ctags">${mine.hit.has(sel) ? `<span class="us">${esc(us)}</span>` : ''}${se.brands.map((b) => `<span>${esc(b)}</span>`).join('')}</div></div>` : ''}</div>
      <div class="panel"><div class="chart-head"><div><h3>Countries with the most competitors</h3><div class="sub">The top 15 for the selection above.</div></div><label class="chk"><input type="checkbox" id="mkAbsent"${S.mkAbsent ? ' checked' : ''}> Only countries where we do not sell</label></div>
        <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Country</th><th class="num">Competitors</th><th>We sell here</th><th>Who</th></tr></thead><tbody>${rows.map((r) => `<tr><td><button type="button" class="linkbtn" data-ctry="${r.key}">${esc(r.n)}</button></td><td class="num">${r.brands.length}</td><td>${r.ours ? '<span class="us-pill">Yes</span>' : '<span class="muted">No</span>'}</td><td class="pa-cats">${esc(r.brands.slice(0, 8).join(', '))}${r.brands.length > 8 ? ', …' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No countries listed for this selection yet.</td></tr>'}</tbody></table></div></div>
      ${regionPanel(feedItems(), Date.now(), us)}`;
  }

  function insGaps() {
    return `<div class="panel-note">${gloss([['Coverage', 'How many of the ' + C.brands.length + ' brands have this fact filled in. Select a missing brand to fill it in, or export a spreadsheet and fill many at once.']])}<div class="source-actions" style="margin-bottom:12px"><button type="button" class="imagebtn" id="expBrands">Export brand template (CSV)</button><button type="button" class="imagebtn" id="impBrands2">Import filled file</button></div></div>${coveragePanel()}`;
  }

  function regionPanel(items, now, us) {
    const fresh = {};
    items.forEach((n) => { if (evtOf(n) !== 'Market entry') return; const a = E.ageDays(n, now); if (isNaN(a) || a < 0 || a >= 90) return; E.detectRegions(n.title + ' ' + n.summary).forEach((r) => { (fresh[n.brand] = fresh[n.brand] || new Set()).add(r); }); });
    const usR = regionsOf(us) || {}, usHas = (k) => (usR[k] || []).length > 0;
    const withData = C.brands.filter((b) => regionsOf(b)), without = C.brands.filter((b) => !regionsOf(b));
    const overlap = (b) => REG.filter((k) => usHas(k) && ((regionsOf(b) || {})[k] || []).length).length;
    const rows = [...new Set([us, ...withData, ...Object.keys(fresh)])].filter((b) => C.brands.includes(b)).sort((a, b) => (isUs(b) - isUs(a)) || overlap(b) - overlap(a) || a.localeCompare(b));
    return `<div class="panel"><div class="chart-head"><div><h3>Region matrix</h3><div class="sub">Where each brand operates (number of countries listed). <span class="newtag">NEW</span> marks a market-entry story in the last 90 days that mentions the region, read from the headline, so check it. Highlighted columns are where we operate.</div></div></div>
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
      ['Models with specs', bm2((b) => S.products.some((p) => p.brand === b)), 'Feeds the product comparison and price map.'],
      ['Revenue', bm2((b) => revenueOf(b) != null), 'Annual revenue in £m.', (b) => '£' + revenueOf(b).toLocaleString('en-GB') + 'm'],
      ['Annual units', bm2((b) => unitsOf(b) != null), 'Bikes sold per year.', (b) => unitsOf(b).toLocaleString('en-GB')],
      ['Portfolio size (SKUs)', bm2((b) => skuOf(b) != null), 'Number of models or SKUs.', (b) => String(skuOf(b))],
      ['P&A offering', bm2((b) => bm(b).paSkus != null || !!bm(b).paCategories), 'Parts and accessories: how many products and which kinds.', (b) => (bm(b).paSkus != null ? bm(b).paSkus + ' products' : bm(b).paCategories)],
      ['Regions', bm2((b) => !!regionsOf(b)), 'Countries per region.'],
      ['Threat level', bm2((b) => !!bm(b).threat), 'High, Medium or Low with a reason.'],
      ['Verified', bm2((b) => !!bm(b).lastVerified), 'A “last verified” date and sources.']
    ];
    return `<div class="panel"><div class="chart-head"><div><h3>Data coverage</h3><div class="sub">Revenue, units and similar fields exist for only a few brands, so they are listed here instead of drawn as mostly empty charts. Select a brand to fill it in.</div></div></div>
      <div class="cov">${T.map(([label, have, hint, show]) => `<div class="cov-tile"><div class="cov-top"><span>${esc(label)}</span><strong>${have.length}<small> of ${B.length}</small></strong></div><div class="cov-bar"><i style="width:${have.length / B.length * 100}%"></i></div><div class="sub">${esc(hint)}</div>
        ${show && have.length ? `<div class="cov-known">${have.map((b) => `<span><b>${esc(b)}</b> ${esc(show(b))}</span>`).join('')}</div>` : ''}
        <details class="gaps"><summary>Missing (${B.length - have.length})</summary><div class="chips">${gapChips(miss(have))}</div></details></div>`).join('')}</div></div>`;
  }

  /* =====================  PRODUCT COMPARISON  ===================== */
  // Text specs, in the order and wording of brompton.com's Specification list.
  const SPEC_GROUPS = [
    ['Frame and fork', [['material', 'Material'], ['mainFrame', 'Main frame'], ['rearFrame', 'Rear frame'], ['fork', 'Fork']]],
    ['Contact points', [['grips', 'Grips'], ['seatpost', 'Seatpost'], ['saddle', 'Saddle'], ['seatclamp', 'Seat clamp'], ['hingeClamps', 'Hinge clamps'], ['pedals', 'Pedals']]],
    ['Drivetrain', [['gears', 'Speed'], ['drivetrain', 'Drivetrain'], ['chainset', 'Chainset'], ['bottomBracket', 'Bottom bracket'], ['headset', 'Headset'], ['shifters', 'Shifters'], ['sprockets', 'Sprockets'], ['derailleur', 'Derailleur']]],
    ['Wheels and tyres', [['rearWheel', 'Rear wheel'], ['frontWheel', 'Front wheel'], ['tyres', 'Tyres'], ['tubes', 'Tubes'], ['rollerWheels', 'Roller wheels']]],
    ['Brakes and equipment', [['brakes', 'Brakes'], ['mudguards', 'Mudguards'], ['lighting', 'Lighting'], ['rack', 'Rack'], ['frontCarrier', 'Front carrier']]]
  ];
  const SPEC_KEYS = SPEC_GROUPS.flatMap((g) => g[1].map((x) => x[0]));
  const COLS = ['brand', 'model', 'category', 'priceGBP', 'priceEUR', 'priceUSD', 'priceNote', 'colours', 'handlebars', 'weightKg', 'foldH', 'foldW', 'foldL', 'wheelIn', ...SPEC_KEYS.filter((k) => k !== 'gears'), 'gears', 'motor', 'batteryWh', 'rangeKm', 'launch', 'url', 'sourceUrl', 'lastVerified', 'notes'];
  const COLS_ALIAS = { foldD: 'foldL', speed: 'gears' };
  const txt = (k, label) => ({ k, label, get: (p) => p[k], fmt: (v) => v });
  const ROWS = [
    { sec: 'Overview' },
    { k: 'priceGBP', label: 'Price', get: (p) => priceOf(p).v, fmt: gbp, dir: 'low', pre: (p) => (priceOf(p).conv ? '≈ ' : ''), note: (p) => [priceOf(p).conv, p.priceNote].filter(Boolean).join('. ') },
    txt('colours', 'Colours'), txt('handlebars', 'Handlebars'),
    { k: 'launch', label: 'Launch', get: (p) => p.launch, fmt: (v) => v },
    { sec: 'Size and weight' },
    { k: 'weightKg', label: 'Weight', get: (p) => p.weightKg, fmt: (v) => v + ' kg', dir: 'low' },
    { k: 'fold', label: 'Folded size (H × W × D)', get: (p) => fold(p), fmt: (v) => v },
    { k: 'vol', label: 'Folded volume', get: vol, fmt: (v) => Math.round(v) + ' L', dir: 'low' },
    { k: 'wheelIn', label: 'Wheel size', get: (p) => p.wheelIn, fmt: (v) => v + (/^\d+$/.test(v) ? '"' : '') },
    ...SPEC_GROUPS.flatMap(([title, f]) => [{ sec: title }, ...f.map(([k, l]) => txt(k, l))]),
    { sec: 'Electric' },
    txt('motor', 'Motor'),
    { k: 'batteryWh', label: 'Battery', get: (p) => p.batteryWh, fmt: (v) => v + ' Wh', dir: 'high' },
    { k: 'rangeKm', label: 'Range', get: (p) => p.rangeKm, fmt: (v) => v + ' km', dir: 'high' },
    { sec: 'Record' },
    { k: 'lastVerified', label: 'Last verified', get: (p) => p.lastVerified, fmt: (v) => fmtDay(v) },
    txt('notes', 'Notes'),
    { k: 'src', label: 'Source', get: (p) => p.sourceUrl || p.url, fmt: (v) => v, html: (v) => link(v) }
  ];
  // Share of the 35 comparable specs that have a value (the Brompton page's 30 spec rows, plus price, weight, folded size, wheel size).
  const CORE = ['priceGBP', 'weightKg', 'wheelIn', ...SPEC_KEYS];
  const filled = (p) => CORE.filter((k) => (k === 'priceGBP' ? priceOf(p).v != null : p[k] != null && p[k] !== '')).length + (fold(p) ? 1 : 0);
  const fillPct = (p) => Math.round((filled(p) / (CORE.length + 1)) * 100);
  const prodById = (id) => S.products.find((p) => p.id === id);
  const prodName = (p) => `${p.brand} ${p.model}`;
  function fixCmp() {
    const ours = S.products.filter((p) => isUs(p.brand));
    if (!prodById(S.cmp.us) || !isUs(prodById(S.cmp.us).brand)) S.cmp.us = ours[0] ? ours[0].id : '';
    S.cmp.others = S.cmp.others.filter((id) => prodById(id) && !isUs(prodById(id).brand)).slice(0, 5);
    sv('cih_pm_cmp', S.cmp);
  }
  function addCmp(id) {
    const p = prodById(id); if (!p) return;
    if (isUs(p.brand)) S.cmp.us = id;
    else if (S.cmp.others.includes(id)) return;
    else if (S.cmp.others.length >= 5) return toast('Compare up to 6 models at a time (us plus 5)');
    else S.cmp.others.push(id);
    fixCmp(); renderMatrix();
  }
  /* =====================  PRODUCT COMPARE (Apple-style: sticky model cards, then large spec sections)  ===================== */
  const MAXCMP = 6; // us + up to 5 competitors
  function headCard(p, i) {
    if (!p) return `<div class="ap-card empty"><button type="button" class="ap-add" data-pick="${i}"><b>+</b><span>${i === 0 ? 'Choose our model' : 'Add a model'}</span></button></div>`;
    const pic = C.pic(p.brand), us = isUs(p.brand);
    return `<div class="ap-card${us ? ' is-us' : ''}"><div class="ap-pic">${pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span>🚲</span>'}${i > 0 ? `<button type="button" class="ap-x" data-rm="${esc(p.id)}" aria-label="Remove ${esc(p.model)} from the comparison" title="Remove from the comparison">×</button>` : ''}</div>
      <div class="ap-brand"><button type="button" class="linkbtn" data-open="${esc(p.brand)}">${esc(p.brand)}</button> ${us ? '<span class="pm-us">US</span>' : ''}</div>
      <div class="ap-name">${esc(p.model)}</div><div class="ap-price">${priceOf(p).v != null ? `From ${priceTxt(p)}` : '<span class="muted">No price yet</span>'}</div>
      <div class="fillbar" title="${filled(p)} of ${CORE.length + 1} comparable specs filled in"><i style="width:${fillPct(p)}%"></i></div><div class="muted ap-fill">${fillPct(p)}% of specs filled</div>
      <div class="ap-act"><button type="button" class="linkbtn" data-pick="${i}">Change model</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button></div></div>`;
  }
  /* Picker: a searchable list, opened from the + card or Change model */
  function pickerHtml() {
    const slot = S.pickSlot, ours = slot === 0, cur = [S.cmp.us, ...S.cmp.others][slot], taken = new Set([S.cmp.us, ...S.cmp.others]), q = S.pickQ.toLowerCase();
    const list = S.products.filter((p) => (ours ? isUs(p.brand) : !isUs(p.brand)) && (p.id === cur || !taken.has(p.id)) && `${p.brand} ${p.model}`.toLowerCase().includes(q));
    const byB = {}; list.forEach((p) => { (byB[p.brand] = byB[p.brand] || []).push(p); });
    return Object.keys(byB).sort().map((b) => `<div class="pick-g">${esc(b)}</div>${byB[b].map((p) => `<button type="button" class="pick-i" data-choose="${esc(p.id)}"><span><strong>${esc(p.model)}</strong>${p.id === cur ? ' <span class="muted">(current)</span>' : ''}</span><small>${esc(priceTxt(p))} · ${fillPct(p)}% of specs</small></button>`).join('')}`).join('') || `<div class="source-empty">${S.products.length ? 'No models match.' : 'No models yet.'} <button type="button" class="linkbtn" data-add-from-pick>Add a model</button></div>`;
  }
  function openPicker(slot) {
    S.pickSlot = slot; S.pickQ = '';
    let d = $('#pmPick');
    if (!d) { d = document.createElement('dialog'); d.id = 'pmPick'; d.innerHTML = '<div class="mh"><strong id="pickTitle"></strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb"><input class="field" id="pickQ" placeholder="Search models or brands" autocomplete="off"><div id="pickList"></div></div>'; document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); }); }
    $('#pickTitle').textContent = slot === 0 ? 'Choose our model' : 'Add a competitor model'; $('#pickQ').value = ''; $('#pickList').innerHTML = pickerHtml(); d.showModal(); $('#pickQ').focus();
  }
  function choose(id) {
    const slot = S.pickSlot, o = S.cmp.others;
    if (slot === 0) S.cmp.us = id; else if (slot - 1 < o.length) o[slot - 1] = id; else o.push(id);
    S.cmp.others = [...new Set(o)]; fixCmp(); $('#pmPick').close(); renderMatrix();
  }
  function matrixTable() {
    const ids = [S.cmp.us, ...S.cmp.others], cols = ids.map(prodById).filter(Boolean), us = prodById(S.cmp.us);
    if (!S.products.length) return '<div class="pm-empty"><strong>No models to compare yet</strong><span>Select Load researched data to start with 13 models, or add your own. Specs and prices cannot be scraped reliably, so they are entered here (or imported from a CSV) and saved on the server.</span><button type="button" class="primary" id="loadStarter2">Load researched data</button></div>';
    const n = Math.min(MAXCMP, Math.max(cols.length + 1, 3)), slots = []; for (let i = 0; i < n; i++) slots.push(prodById(ids[i]) || null);
    const style = `--n:${n}`; let hidden = 0, out = '', sec = '', secOpen = false;
    const flush = () => { if (secOpen) { out += '</section>'; secOpen = false; } };
    ROWS.forEach((r) => {
      if (r.sec) { sec = r.sec; flush(); return; }
      const vals = slots.map((p) => (p ? r.get(p) : null)), has = vals.filter((v) => v != null && v !== '');
      if (!S.showEmpty && !has.length) { hidden++; return; }
      if (S.diff && has.length === cols.length && cols.length > 1 && new Set(has.map((v) => String(v).trim().toLowerCase())).size === 1) { hidden++; return; }
      if (!secOpen) { out += `<section class="ap-sec"><h3>${esc(sec)}</h3>`; secOpen = true; }
      const nums = vals.filter((v) => typeof v === 'number'), best = r.dir && nums.length > 1 ? (r.dir === 'low' ? Math.min(...nums) : Math.max(...nums)) : null, uv = us ? r.get(us) : null;
      out += `<div class="ap-row"><div class="ap-l">${r.label}</div><div class="ap-vals" style="${style}">${slots.map((p, i) => {
        if (!p) return '<div class="ap-c"></div>';
        const v = vals[i], ok = v != null && v !== ''; let delta = '';
        if (ok && r.dir && typeof v === 'number' && !isUs(p.brand) && typeof uv === 'number') {
          const d = Math.round((v - uv) * 100) / 100;
          if (d !== 0) delta = `<small class="dl${(r.dir === 'low' ? d < 0 : d > 0) ? ' adv' : ''}" title="Compared with ${esc(prodName(us))}">${d > 0 ? '+' : '−'}${r.fmt(Math.abs(d))} vs us</small>`;
        }
        return `<div class="ap-c${isUs(p.brand) ? ' is-us' : ''}${best != null && v === best ? ' best' : ''}"><div class="ap-v">${ok ? (r.html ? r.html(v) : esc((r.pre ? r.pre(p) : '') + r.fmt(v))) : '<span class="muted">—</span>'}</div>${r.note && r.note(p) ? `<small class="muted">${esc(r.note(p))}</small>` : ''}${delta}</div>`;
      }).join('')}</div></div>`;
    });
    flush();
    return `<div class="ap" style="${style}"><div class="ap-head"><div class="ap-cards" style="${style}">${slots.map((p, i) => headCard(p, i)).join('')}</div></div>${out || '<div class="source-empty">Nothing to show with these settings.</div>'}</div>
      <div class="sub ap-foot"><label class="chk"><input type="checkbox" id="showDiff"${S.diff ? ' checked' : ''}> Show only differences</label> &nbsp; <label class="chk"><input type="checkbox" id="showEmpty"${S.showEmpty ? ' checked' : ''}> Show rows with no data</label>${hidden ? ` &nbsp; ${hidden} row${hidden === 1 ? '' : 's'} hidden` : ''} &nbsp; <span class="legend-best"></span> best value in the row. Orange “vs us” means the competitor is ahead of us on that spec.</div>`;
  }
  function modelsTable() {
    const q = S.q.toLowerCase(), k = S.sort.k, d = S.sort.d;
    const list = S.products.filter((p) => !q || `${p.brand} ${p.model} ${p.category}`.toLowerCase().includes(q)).sort((a, b) => {
      const x = k === 'vol' ? vol(a) : k === 'fill' ? fillPct(a) : k === 'priceGBP' ? priceOf(a).v : a[k], y = k === 'vol' ? vol(b) : k === 'fill' ? fillPct(b) : k === 'priceGBP' ? priceOf(b).v : b[k];
      if (x == null || x === '') return y == null || y === '' ? 0 : 1; if (y == null || y === '') return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * d || (isUs(b.brand) - isUs(a.brand));
    });
    const th = (key, label, cls) => `<th class="${cls || ''}"><button type="button" class="sortbtn" data-sort="${key}">${label}${S.sort.k === key ? (S.sort.d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    return `<table class="pm-table"><thead><tr>${th('brand', 'Brand')}${th('model', 'Model')}${th('category', 'Category')}${th('priceGBP', 'Price', 'num')}${th('weightKg', 'Weight', 'num')}${th('vol', 'Folded', 'num')}${th('batteryWh', 'Battery', 'num')}${th('rangeKm', 'Range', 'num')}${th('launch', 'Launch')}${th('lastVerified', 'Verified')}${th('fill', 'Specs', 'num')}<th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="${isUs(p.brand) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(p.brand)}">${esc(p.brand)}</button></td><td>${esc(p.model)}</td><td>${esc(p.category || '—')}</td><td class="num">${priceTxt(p)}</td><td class="num">${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td class="num">${vol(p) != null ? Math.round(vol(p)) + ' L' : '—'}</td><td class="num">${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td class="num">${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td><td>${p.lastVerified ? esc(p.lastVerified) : '—'}</td><td class="num">${fillPct(p)}%</td><td class="acts"><button type="button" class="linkbtn" data-cmp="${esc(p.id)}">Compare</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted">No models match.</td></tr>'}
      </tbody></table>`;
  }
  /* =====================  CHARTS  ===================== */
  // Palette: Brompton is #002fa7. Everyone else uses #FFFFFF, #DBDBDB, #F6F6F6 and #707070, told apart by line style as well as shade.
  const US_BLUE = '#002fa7', PAL = ['#FFFFFF', '#DBDBDB', '#707070', '#F6F6F6'], DASH = ['', '7 4', '2 3', '11 3 2 3'];
  const PRICE_TICKS = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000];
  const AXES = {
    price: { label: 'Price (£)', get: (p) => priceOf(p).v, fmt: (v) => gbp(v) },
    weightKg: { label: 'Weight (kg)', get: (p) => p.weightKg, fmt: (v) => v + ' kg' },
    vol: { label: 'Folded volume (L)', get: (p) => vol(p), fmt: (v) => Math.round(v) + ' L' },
    batteryWh: { label: 'Battery (Wh)', get: (p) => p.batteryWh, fmt: (v) => v + ' Wh' }
  };
  const VIEWS = [
    { id: 'ladder', label: 'Price ladder', what: 'One row per brand. The line runs from its cheapest to its dearest model and each dot is a model. The blue band is our own price range, so you can see who sits inside it.' },
    { id: 'pw', label: 'Price vs weight', x: 'price', y: 'weightKg', lines: true, what: 'Higher on the chart means a heavier bike. Models to the left cost less; models lower down are lighter.' },
    { id: 'pv', label: 'Price vs folded size', x: 'price', y: 'vol', lines: true, what: 'Higher means a bigger folded package; lower means it packs smaller.' },
    { id: 'port', label: 'Portability map (weight vs folded size)', x: 'weightKg', y: 'vol', size: 'price', what: 'Bottom-left is best: lighter and smaller when folded. A bigger bubble means a higher price.' },
    { id: 'pb', label: 'E-bikes: price vs battery', x: 'price', y: 'batteryWh', lines: true, what: 'Higher means a bigger battery. Only electric models with a stated battery size appear. Range is left out on purpose: makers measure it differently, so it does not compare fairly.' }
  ];
  const brandStyle = (b) => {
    if (isUs(b)) return { c: US_BLUE, dash: '', us: true };
    const names = [...new Set(S.products.map((p) => p.brand))].filter((x) => !isUs(x)).sort(), i = Math.max(0, names.indexOf(b));
    return { c: PAL[i % 4], dash: DASH[Math.floor(i / 4) % 4], us: false };
  };
  function chartData() {
    const V = VIEWS.find((v) => v.id === S.cview) || VIEWS[0], need = V.id === 'ladder' ? ['price'] : [...new Set([V.x, V.y, V.size].filter(Boolean))];
    const okv = (v) => typeof v === 'number' && isFinite(v) && v > 0;
    const rows = S.products.map((p) => { const o = { p, conv: priceOf(p).conv }; need.forEach((k) => { o[k] = AXES[k].get(p); }); return o; });
    const all = rows.filter((o) => need.every((k) => okv(o[k])));
    const names = [...new Set(S.products.map((p) => p.brand))].sort((a, b) => (isUs(b) - isUs(a)) || a.localeCompare(b));
    const nm = (k) => AXES[k].label.replace(/ \(.*/, '').toLowerCase();
    const why = (b) => { const mine = rows.filter((o) => o.p.brand === b), lack = need.filter((k) => !mine.some((o) => okv(o[k]))); return lack.length ? 'No model has ' + lack.map(nm).join(' or ') + ' yet' : 'No single model has ' + need.map(nm).join(' and '); };
    return { V, need, all, names, why, plotted: new Set(all.map((o) => o.p.brand)), anyConv: all.some((o) => o.conv) };
  }
  const chartEmpty = '<div class="source-empty">Nothing to draw with the brands switched on. Turn some brands back on in the list, or add the missing specs in the Product Comparison.</div>';
  function xAxis(vals, logx) {
    const mn = Math.min(...vals), mx = Math.max(...vals);
    if (logx) { const lo = Math.max(1, mn * 0.8), hi = mx * 1.25; let t = PRICE_TICKS.filter((v) => v >= lo && v <= hi); if (t.length < 2) t = [Math.round(lo), Math.round(hi)]; return { t, a: Math.log(Math.min(lo, t[0])), b: Math.log(Math.max(hi, t[t.length - 1])) }; }
    const t = niceTicks(0, mx * 1.08); return { t, a: t[0], b: t[t.length - 1] };
  }
  const ptTitle = (o, extra) => `${prodName(o.p)}: ${priceTxt(o.p)}${o.weightKg ? ', ' + o.weightKg + ' kg' : ''}${o.vol ? ', ' + Math.round(o.vol) + ' L folded' : ''}${o.batteryWh ? ', ' + o.batteryWh + ' Wh' : ''}${o.conv ? ' (' + o.conv + ')' : ''}. Select to add to the comparison.${extra || ''}`;
  function dotG(o, cx, cy, r, st, sel) {
    const hollow = !!o.conv;
    return `<g class="dot" data-cmp="${esc(o.p.id)}">${sel ? `<circle class="sel" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 4).toFixed(1)}"/>` : ''}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${hollow ? '#000' : st.c}" stroke="${hollow ? st.c : st.us ? '#fff' : '#000'}" stroke-width="${hollow ? 2.4 : st.us ? 2 : 1.4}"/><title>${esc(ptTitle(o))}</title></g>`;
  }
  function scatterSvg(D) {
    const V = D.V, ay = AXES[V.y], ax = AXES[V.x], pts = D.all.filter((o) => !S.chHide.has(o.p.brand));
    if (!pts.length) return chartEmpty;
    const W = 1000, H = 540, L = 72, R = V.lines ? 180 : 70, T = 26, B = 64, logx = V.x === 'price' && S.cscale === 'log';
    const xa = xAxis(pts.map((o) => o[V.x]), logx), yt = niceTicks(0, Math.max(...pts.map((o) => o[V.y])) * 1.1), y0 = yt[0], y1 = yt[yt.length - 1];
    const X = (v) => L + ((logx ? Math.log(v) : v) - xa.a) / (xa.b - xa.a) * (W - L - R), Y = (v) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
    const rad = V.size ? (() => { const a = pts.map((o) => o[V.size]), lo = Math.min(...a), hi = Math.max(...a); return (v) => 6 + 16 * Math.sqrt((v - lo) / ((hi - lo) || 1)); })() : null;
    const sel = new Set([S.cmp.us, ...S.cmp.others]), by = {}; pts.forEach((o) => { (by[o.p.brand] = by[o.p.brand] || []).push(o); });
    const series = Object.keys(by).sort((a, b) => isUs(a) - isUs(b)).map((b) => ({ b, st: brandStyle(b), list: by[b].sort((a, c) => a[V.x] - c[V.x]) }));
    let lead = '', labs = '';
    if (V.lines) {
      const lab = series.map((s) => { const l = s.list[s.list.length - 1]; return { s, px: X(l[V.x]), py: Y(l[V.y]), ly: Y(l[V.y]) }; }).sort((a, c) => a.ly - c.ly);
      for (let i = 1; i < lab.length; i++) if (lab[i].ly - lab[i - 1].ly < 21) lab[i].ly = lab[i - 1].ly + 21;
      const over = lab.length ? lab[lab.length - 1].ly - (H - B - 6) : 0; if (over > 0) lab.forEach((l) => { l.ly -= over; });
      lead = lab.map((l) => `<path class="lead" d="M${l.px.toFixed(1)} ${l.py.toFixed(1)} L${W - R + 8} ${l.ly.toFixed(1)}" stroke="${l.s.st.c}"/>`).join('');
      labs = lab.map((l) => `<text class="blab${l.s.st.us ? ' us' : ''}" x="${W - R + 14}" y="${(l.ly + 4).toFixed(1)}" fill="${l.s.st.us ? '#fff' : l.s.st.c}">${esc(l.s.b)}</text>`).join('');
    }
    const body = series.map((s) => `<g class="ser${s.st.us ? ' us' : ''}">${V.lines && s.list.length > 1 ? `${s.st.us ? `<polyline points="${s.list.map((o) => `${X(o[V.x]).toFixed(1)},${Y(o[V.y]).toFixed(1)}`).join(' ')}" stroke="#fff" stroke-width="6" fill="none" opacity=".9"/>` : ''}<polyline points="${s.list.map((o) => `${X(o[V.x]).toFixed(1)},${Y(o[V.y]).toFixed(1)}`).join(' ')}" stroke="${s.st.c}" stroke-width="${s.st.us ? 3.4 : 1.8}" stroke-dasharray="${s.st.dash}" fill="none"/>` : ''}${s.list.map((o) => dotG(o, X(o[V.x]), Y(o[V.y]), rad ? rad(o[V.size]) : s.st.us ? 7 : 5, s.st, sel.has(o.p.id))).join('')}${V.lines ? '' : s.list.map((o) => `<text class="dlab" x="${(X(o[V.x]) + (rad ? rad(o[V.size]) : 6) + 5).toFixed(1)}" y="${(Y(o[V.y]) + 4).toFixed(1)}">${esc(o.p.model.length > 24 ? o.p.model.slice(0, 23) + '…' : o.p.model)}</text>`).join('')}</g>`).join('');
    return `<svg class="chart2" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(V.label)}">
      ${yt.map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="al" x="${L - 10}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(ay.fmt(v).replace(/ (kg|L|Wh)$/, ''))}</text>`).join('')}
      ${xa.t.map((v) => `<line class="tk" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text class="al" x="${X(v).toFixed(1)}" y="${H - B + 22}" text-anchor="middle">${esc(V.x === 'price' ? gbp(v) : String(v))}</text>`).join('')}
      <line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <text class="at" x="${L}" y="${T - 8}">${esc(ay.label)}</text>
      <text class="at" x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle">${esc(ax.label)}${logx ? ', log scale' : ''}</text>
      ${lead}${body}${labs}</svg>`;
  }
  function ladderSvg(D) {
    const pts = D.all.filter((o) => !S.chHide.has(o.p.brand)); if (!pts.length) return chartEmpty;
    const by = {}; pts.forEach((o) => { (by[o.p.brand] = by[o.p.brand] || []).push(o); });
    const rows = Object.keys(by).map((b) => { const l = by[b].sort((a, c) => a.price - c.price); return { b, st: brandStyle(b), l, min: l[0].price, max: l[l.length - 1].price }; }).sort((a, c) => (isUs(c.b) - isUs(a.b)) || a.min - c.min);
    const W = 1000, L = 200, R = 190, T = 30, RH = 40, H = T + rows.length * RH + 56, logx = S.cscale === 'log', xa = xAxis(pts.map((o) => o.price), logx);
    const X = (v) => L + ((logx ? Math.log(v) : v) - xa.a) / (xa.b - xa.a) * (W - L - R), usr = rows.find((r) => r.st.us), sel = new Set([S.cmp.us, ...S.cmp.others]), by0 = T + rows.length * RH;
    return `<svg class="chart2" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price ladder, one row per brand">
      ${usr ? `<rect class="band" x="${(X(usr.min) - 5).toFixed(1)}" y="${T - 14}" width="${Math.max(10, X(usr.max) - X(usr.min) + 10).toFixed(1)}" height="${by0 - T + 14}" rx="6"/><text class="pr" x="${(X(usr.min) - 5).toFixed(1)}" y="${T - 20}">Our range ${esc(gbp(usr.min))} to ${esc(gbp(usr.max))}</text>` : ''}
      ${xa.t.map((v) => `<line class="gl" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${T - 14}" y2="${by0}"/><text class="al" x="${X(v).toFixed(1)}" y="${by0 + 22}" text-anchor="middle">${esc(gbp(v))}</text>`).join('')}
      <text class="at" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Price per model (£${logx ? ', log scale' : ''})</text>
      ${rows.map((r, i) => { const y = T + i * RH + RH / 2; return `<g><line class="gl" x1="${L}" x2="${W - R}" y1="${y + RH / 2}" y2="${y + RH / 2}"/><text class="rl${r.st.us ? ' us' : ''}" x="${L - 14}" y="${y + 4}" text-anchor="end">${esc(r.b)}</text>
        <line x1="${X(r.min).toFixed(1)}" x2="${X(r.max).toFixed(1)}" y1="${y}" y2="${y}" stroke="${r.st.c}" stroke-width="${r.st.us ? 5 : 3}" stroke-linecap="round" opacity="${r.st.us ? 1 : .75}"/>
        ${r.l.map((o) => dotG(o, X(o.price), y, r.st.us ? 7 : 5.5, r.st, sel.has(o.p.id))).join('')}
        <text class="pr" x="${(X(r.max) + 12).toFixed(1)}" y="${y + 4}">${r.l.length > 1 ? `${esc(gbp(r.min))} to ${esc(gbp(r.max))}` : esc(gbp(r.min))} · ${r.l.length} model${r.l.length === 1 ? '' : 's'}</text></g>`; }).join('')}</svg>`;
  }
  function insChart() {
    const D = chartData(), V = D.V, q = S.chFind.toLowerCase(), list = D.names.filter((b) => !q || b.toLowerCase().includes(q)), can = list.filter((b) => D.plotted.has(b)), cant = list.filter((b) => !D.plotted.has(b));
    const item = (b, ok) => { const on = !S.chHide.has(b), st = brandStyle(b); return `<button type="button" class="tgl${on && ok ? '' : ' off'}" data-tgl="${esc(b)}" aria-pressed="${on}"><span class="tn">${isUs(b) ? '<b class="pm-us">US</b> ' : ''}${esc(b)}${ok ? '' : `<small>${esc(D.why(b))}</small>`}</span><i class="dotc" style="${ok && on ? `background:${st.c}` : `border-color:${st.c}`}"></i></button>`; };
    const usesPrice = V.id === 'ladder' || V.x === 'price';
    return `<div class="panel cx-panel"><div class="chart-head"><div><h3>${esc(V.label)}</h3><div class="sub">${D.all.length} of ${S.products.length} models are drawn.</div></div>
        <div class="cx-ctl"><label class="cmp-bar">View<select class="field" id="chView">${VIEWS.map((v) => `<option value="${v.id}"${v.id === V.id ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>${usesPrice ? `<div class="seg" role="group" aria-label="Price scale"><button type="button" id="chLin" class="${S.cscale === 'lin' ? 'on' : ''}">Linear</button><button type="button" id="chLog" class="${S.cscale === 'log' ? 'on' : ''}">Log</button></div>` : ''}</div></div>
      ${gloss([['What it shows', V.what], ['Dots', 'One model each. Select a dot to add it to the Product Comparison.'], ...(usesPrice ? [['Log scale', 'Each step to the right is a multiple, not a fixed amount, so cheap and premium models both stay readable.']] : []), ...(D.anyConv ? [['Hollow dot', 'Priced in € or $, so the £ price is converted.']] : [])])}
      ${D.anyConv ? `<div class="fx">Rates used for € and $ prices (approximate, change if you like): €1 = £<input class="field" id="fxEUR" type="number" step="0.01" min="0.1" max="2" value="${S.fx.EUR}"> $1 = £<input class="field" id="fxUSD" type="number" step="0.01" min="0.1" max="2" value="${S.fx.USD}"></div>` : ''}
      <div class="cx"><div class="cx-main">${V.id === 'ladder' ? ladderSvg(D) : scatterSvg(D)}</div>
      <aside class="cx-side"><div class="cx-sh"><strong>Brands</strong><span class="muted">${D.names.length}</span><button type="button" class="linkbtn" id="chReset" title="Show every brand">Reset</button></div><input class="field" id="chFind" placeholder="Find brands" value="${esc(S.chFind)}" aria-label="Find brands"><div class="cx-list">${can.length ? `<div class="cx-g">On this chart</div>${can.map((b) => item(b, true)).join('')}` : ''}${cant.length ? `<div class="cx-g">Missing data for this view</div>${cant.map((b) => item(b, false)).join('')}` : ''}${list.length ? '' : '<div class="muted">No brand matches.</div>'}</div></aside></div></div>`;
  }

  function niceTicks(lo, hi) {
    if (lo === hi) { lo = Math.max(0, lo - 1); hi += 1; }
    const raw = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw), t = [];
    for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) { t.push(+v.toFixed(6)); if (t.length > 12) break; }
    return t;
  }
  function renderMatrix() {
    fixCmp();
    const noModels = C.brands.filter((b) => !S.products.some((p) => p.brand === b));
    $('#matrix').innerHTML = `<div class="head"><div><h2>Product Comparison</h2><div class="sub">Compare up to ${MAXCMP} models side by side. Select + to add a model, × to take one out. Us: <strong>${esc(usName())}</strong>.</div></div>
      <div class="source-actions"><button type="button" class="primary" id="addModel">Add model</button><button type="button" class="imagebtn" id="loadStarter">Load researched data</button><button type="button" class="imagebtn" id="impCsv">Import CSV</button><button type="button" class="imagebtn" id="expCsv">Export CSV</button><button type="button" class="imagebtn" id="toggleWide">${S.wide ? 'Show menu' : 'Full width'}</button><input type="file" id="csvFile" accept=".csv,text/csv" hidden></div></div>
      <div class="panel ap-panel">${matrixTable()}</div>
      <div class="panel"><div class="chart-head"><div><h3>All models</h3><div class="sub">${S.products.length} saved. Select Export CSV to get a spreadsheet to fill in (brands with no models appear as empty rows), then Import CSV.</div></div><input class="field" id="mdlSearch" placeholder="Filter models" value="${esc(S.q)}"></div><div class="tbl-wrap" id="mdlBox">${modelsTable()}</div>
        <details class="gaps"><summary>Brands with no models yet (${noModels.length})</summary><div class="chips">${noModels.length ? noModels.map((b) => `<button type="button" class="chip gap-chip" data-add="${esc(b)}">${esc(b)}</button>`).join('') : '<em class="muted">None.</em>'}</div></details></div>`;
  }
  RENDER.matrix = renderMatrix;
  /* ----- model dialog, CSV ----- */
  const FDEF = [
    ['Overview', [['brand', 'Brand', 'select'], ['model', 'Model', 'text'], ['category', 'Category', 'cat'], ['priceGBP', 'Price (£, incl. VAT)', 'number'], ['priceEUR', 'Price (€), if not sold in the UK', 'number'], ['priceUSD', 'Price ($), if not sold in the UK', 'number'], ['priceNote', 'Price note', 'text'], ['colours', 'Colours', 'text'], ['handlebars', 'Handlebars', 'text'], ['launch', 'Launch (2025 or 2025-09)', 'text']]],
    ['Size and weight', [['weightKg', 'Weight (kg)', 'number'], ['wheelIn', 'Wheel size (in)', 'text'], ['foldH', 'Folded height (cm)', 'number'], ['foldW', 'Folded width (cm)', 'number'], ['foldL', 'Folded depth (cm)', 'number']]],
    ...SPEC_GROUPS.map(([t, f]) => [t, f.map(([k, l]) => [k, l, 'text'])]),
    ['Electric', [['motor', 'Motor', 'text'], ['batteryWh', 'Battery (Wh)', 'number'], ['rangeKm', 'Range (km)', 'number']]],
    ['Record', [['url', 'Product page link', 'url'], ['sourceUrl', 'Where the specs came from (link)', 'url'], ['lastVerified', 'Last verified', 'date'], ['notes', 'Notes', 'text']]]
  ];
  const FKEYS = FDEF.flatMap((g) => g[1].map((x) => x[0]));
  function modelDialog() {
    const inp = ([k, l, t]) => `<label>${l}${t === 'select' ? `<select class="field" id="pm-${k}" required>${[...C.brands].sort((a, b) => (isUs(b) - isUs(a)) || a.localeCompare(b)).map((b) => `<option>${esc(b)}</option>`).join('')}</select>` : t === 'cat' ? `<select class="field" id="pm-${k}"><option value="">Same as brand</option>${CATS.map((c) => `<option>${c}</option>`).join('')}</select>` : `<input class="field" id="pm-${k}" type="${t}"${t === 'number' ? ' step="any" min="0"' : ''}${k === 'model' ? ' required maxlength="120"' : ''}>`}</label>`;
    const d = document.createElement('dialog'); d.id = 'pmModel';
    d.innerHTML = `<form id="pmModelForm"><div class="mh"><strong id="pmModelTitle">Add model</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form"><input type="hidden" id="pm-id">
      ${FDEF.map(([t, f], i) => `<fieldset class="pm-sec"><legend>${esc(t)}</legend><div class="source-form-grid">${f.map(inp).join('')}</div></fieldset>`).join('')}
      <div class="sf-res" id="pm-err" role="status"></div>
      <div class="form-actions"><button type="button" class="imagebtn danger" id="pm-del" hidden>Delete model</button><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save model</button></div></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    $('#pmModelForm').onsubmit = async (e) => {
      e.preventDefault();
      const o = { id: $('#pm-id').value }; FKEYS.forEach((k) => { o[k] = $('#pm-' + k).value.trim(); });
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
    FKEYS.forEach((k) => { $('#pm-' + k).value = p && p[k] != null ? p[k] : ''; });
    if (!p) { $('#pm-brand').value = brand || usName(); $('#pm-lastVerified').value = today(); const m = C.models.find((x) => x.name === $('#pm-brand').value); $('#pm-model').placeholder = m ? `e.g. ${m.model}` : ''; }
    $('#pm-del').hidden = !p; $('#pmModel').showModal();
  }
  /* One click: load the researched models bundled with the app (starter-data/products.json). Existing models are updated, none are deleted. */
  async function loadStarter() {
    try {
      const r = await fetch('/starter-data/products.json', { credentials: 'same-origin' }); if (!r.ok) throw new Error('starter file not found');
      const list = (await r.json()).products || [];
      if (!confirm(`Load ${list.length} researched models (Brompton, Tern, Dahon, Ahooga, Gocycle) and the researched brand figures (volumes, SKUs, P&A, company facts)?\n\nModels with the same brand and model name, and the brand fields in the file, are updated; nothing is deleted. Each row lists its source and date, so check prices before relying on them.`)) return;
      const d = await api('POST', '/api/products', { products: list }); S.products = d.products;
      let nb = 0;
      try { const bj = await (await fetch('/starter-data/brand-data.json', { credentials: 'same-origin' })).json(), updates = {}; Object.keys(bj.brands || {}).forEach((k) => { if (C.brands.includes(k)) updates[k] = bj.brands[k]; }); nb = Object.keys(updates).length; if (nb) { const r = await api('POST', '/api/brands', { updates }); S.brands = r.brands; applyBrands(); } } catch (e) { /* models are saved; brand figures are optional */ }
      toast(`${d.added} models added, ${d.updated} updated${nb ? `; figures for ${nb} brands loaded` : ''}`); refresh();
    } catch (err) { toast('Could not load: ' + err.message); }
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
    const blank = C.brands.filter((b) => !S.products.some((p) => p.brand === b)).map((b) => COLS.map((k) => csvCell(k === 'brand' ? b : '')).join(','));
    const rows = [COLS.join(','), ...S.products.map((p) => COLS.map((k) => csvCell(p[k])).join(',')), ...blank];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })); a.download = 'competitor_models.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800);
    toast('Fill in the model column and the specs you know, then import. Rows with no model name are skipped.');
  }
  async function importCsv(file) {
    try {
      const rows = parseCSV(await file.text()); if (rows.length < 2) throw new Error('The file has no data rows');
      const head = rows[0].map((h) => { h = h.trim(); return COLS_ALIAS[h] || h; }), unknown = head.filter((h) => h && !COLS.includes(h));
      if (!head.includes('brand') || !head.includes('model')) throw new Error('The first row must include the columns brand and model');
      const products = rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (COLS.includes(h)) o[h] = (r[i] || '').trim(); }); return o; }).filter((o) => o.model);
      if (!products.length) throw new Error('No rows with a model name were found');
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
    if (un != null) L.push(`<div><small>Annual units${b.figuresYear ? ' (' + esc(b.figuresYear) + ')' : ''}</small><strong>${un.toLocaleString('en-GB')}</strong></div>`);
    if (sku != null) L.push(`<div><small>Portfolio (SKUs)</small><strong>${sku}</strong></div>`);
    if (b.paSkus != null) L.push(`<div><small>P&amp;A products</small><strong>${b.paSkus}</strong></div>`);
    if (b.paCategories) L.push(`<div><small>P&amp;A offering</small><strong>${esc(b.paCategories)}</strong></div>`);
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
    return `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Model</th><th>Category</th><th class="num">Price</th><th class="num">Weight</th><th class="num">Battery</th><th class="num">Range</th><th>Launch</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr><td>${esc(p.model)}</td><td>${esc(p.category || '—')}</td><td class="num">${priceTxt(p)}</td><td class="num">${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td class="num">${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td class="num">${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td><td class="acts"><button type="button" class="linkbtn" data-cmp="${esc(p.id)}">Compare${isUs(n) ? '' : ' with us'}</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div><button type="button" class="imagebtn" data-add="${esc(n)}">Add a model</button>`;
  }
  function renderProfile() {
    const n = S.profile; if (!n) return go('competitors');
    const b = bm(n), pic = C.pic(n), src = b.sources || [];
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
      <h2>Current range and pricing</h2>${ps.length ? `<table><tr><th>Model</th><th>Price</th><th>Weight</th><th>Folded</th><th>Battery</th><th>Range</th><th>Launch</th></tr>${ps.map((p) => `<tr><td>${esc(p.model)}</td><td>${priceTxt(p)}</td><td>${p.weightKg != null ? p.weightKg + ' kg' : '—'}</td><td>${esc(fold(p) || '—')}</td><td>${p.batteryWh != null ? p.batteryWh + ' Wh' : '—'}</td><td>${p.rangeKm != null ? p.rangeKm + ' km' : '—'}</td><td>${plain(p.launch)}</td></tr>`).join('')}</table>` : '<p class="m">No models recorded</p>'}
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
      <div class="source-form-grid"><label>P&amp;A products (parts and accessories on sale)<input class="field" id="pb-paSkus" type="number" step="1" min="0"></label><label>P&amp;A offering (e.g. luggage, lights, locks)<input class="field" id="pb-paCategories" maxlength="300"></label><label>Year the figures are for<input class="field" id="pb-figuresYear" maxlength="4" inputmode="numeric" placeholder="2024"></label></div>
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
        regions: Object.fromEntries(REG.map((k) => [k, v('reg-' + k)])), revenueGBPm: v('revenueGBPm'), units: v('units'), skuCount: v('skuCount'), paSkus: v('paSkus'), paCategories: v('paCategories'), figuresYear: v('figuresYear'), lastVerified: v('lastVerified'), dataNote: v('dataNote'), hq: v('hq'), founded: v('founded'), employees: v('employees'), ownership: v('ownership'), website: v('website'), sources: $('#pb-sources').value,
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
    ['threatReason', 'positioning', 'strengths', 'weaknesses', 'dataNote', 'lastVerified', 'hq', 'founded', 'employees', 'ownership', 'website', 'paCategories', 'figuresYear'].forEach((k) => { $('#pb-' + k).value = b[k] || ''; });
    $('#pb-paSkus').value = b.paSkus == null ? '' : b.paSkus;
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
  const hasPhoto = (b) => !!C.pic(b);
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
  const BCOLS = ['brand', 'category', 'threat', 'threatReason', 'watch', 'hq', 'founded', 'employees', 'ownership', 'website', 'positioning', 'strengths', 'weaknesses', 'regionUS', 'regionEMEA', 'regionAPAC', 'regionCHINA', 'revenueGBPm', 'units', 'skuCount', 'paSkus', 'paCategories', 'figuresYear', 'lastVerified', 'dataNote', 'sources'];
  function exportBrandsCsv() {
    const names = C.brands.slice().sort((a, b) => (isUs(b) - isUs(a)) || a.localeCompare(b));
    const val = (b, k) => {
      const x = bm(b);
      if (k === 'brand') return b;
      if (k === 'watch') return x.watch ? 'yes' : '';
      if (k === 'strengths' || k === 'weaknesses') return lines(x[k]).join(' | ');
      if (k === 'revenueGBPm') return revenueOf(b) == null ? '' : revenueOf(b);
      if (k === 'units') return unitsOf(b) == null ? '' : unitsOf(b);
      if (k === 'skuCount') return skuOf(b) == null ? '' : skuOf(b);
      if (k === 'sources') return (x.sources || []).join(' | ');
      if (k.startsWith('region')) return ((regionsOf(b) || {})[k.slice(6)] || []).join(', ');
      return x[k] == null ? '' : x[k];
    };
    const rows = [BCOLS.join(','), ...names.map((b) => BCOLS.map((k) => csvCell(val(b, k))).join(','))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })); a.download = 'competitor_brand_data.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800);
    toast('Fill in what you know, then use Import. Empty cells are ignored. Separate several items in one cell with " | ".');
  }
  function brandsFromCsv(text) {
    const rows = parseCSV(text); if (rows.length < 2) throw new Error('The file has no data rows');
    const head = rows[0].map((h) => h.trim()); if (!head.includes('brand')) throw new Error('The first row must include the column brand');
    const out = {};
    rows.slice(1).forEach((r) => {
      const g = (k) => { const i = head.indexOf(k); return i < 0 ? '' : (r[i] || '').trim(); };
      const raw = g('brand'); if (!raw) return;
      const name = C.brands.find((x) => x.toLowerCase() === raw.toLowerCase()) || raw, f = {};
      ['category', 'threat', 'threatReason', 'hq', 'founded', 'employees', 'ownership', 'website', 'positioning', 'revenueGBPm', 'units', 'skuCount', 'paSkus', 'paCategories', 'figuresYear', 'lastVerified', 'dataNote'].forEach((k) => { if (g(k) !== '') f[k] = g(k); });
      if (g('watch')) f.watch = /^(y|yes|true|1|x)$/i.test(g('watch'));
      ['strengths', 'weaknesses'].forEach((k) => { if (g(k)) f[k] = g(k).split(/\s*\|\s*|\r?\n/).filter(Boolean).join('\n'); });
      if (g('sources')) f.sources = g('sources').split(/\s*\|\s*|\s+/).filter(Boolean).join('\n');
      const reg = {}; let any = false;
      REG.forEach((k) => { const v = g('region' + k); if (v) { reg[k] = v; any = true; } else reg[k] = ((regionsOf(name) || {})[k] || []).join(', '); });
      if (any) f.regions = reg;
      if (Object.keys(f).length) out[name] = f;
    });
    return out;
  }
  async function importBrands(file) {
    try {
      const csv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let j = csv ? brandsFromCsv(await file.text()) : JSON.parse(await file.text()); j = j && j.brands && typeof j.brands === 'object' ? j.brands : j;
      const names = Object.keys(j || {}).filter((k) => j[k] && typeof j[k] === 'object'); if (!names.length) throw new Error('No brands found in the file');
      const unknown = names.filter((k) => !C.brands.includes(k));
      if (!confirm(`Import data for ${names.length} brand${names.length === 1 ? '' : 's'} (${names.join(', ')})? Filled-in fields replace what is saved for those brands; empty cells and other fields are kept.${unknown.length ? '\nNot in your brand list: ' + unknown.join(', ') : ''}`)) return;
      const updates = {}; names.forEach((k) => { updates[k] = j[k]; });
      const r = await api('POST', '/api/brands', { updates }); S.brands = r.brands; applyBrands(); toast(`Imported ${names.length} brand${names.length === 1 ? '' : 's'}`); refresh();
    } catch (err) { toast('Import failed: ' + err.message); }
  }
  function addCompetitorTools() {
    const sec = $('#competitors'); if (!sec || $('#fetchPhotos')) return;
    sec.insertAdjacentHTML('afterbegin', '<div class="pm-tools"><button type="button" class="imagebtn" id="fetchPhotos">Fetch missing photos</button><button type="button" class="imagebtn" id="expBrands">Export brand data</button><button type="button" class="imagebtn" id="impBrands">Import brand data</button><input type="file" id="brandFile" accept=".json,.csv,application/json,text/csv" hidden><span class="sub" id="photoMsg"></span></div>');
  }

  /* ---------- events wiring ---------- */
  function wire() {
    document.addEventListener('click', async (e) => {
      const t = e.target;
      const open = t.closest('[data-open]'); if (open && !t.closest('a')) { openProfile(open.dataset.open); return; }
      const nb = t.closest('[data-nb]'); if (nb) return openNews(nb.dataset.nb, nb.dataset.nt);
      const w = t.closest('#pmWin button'); if (w) { S.win = +w.dataset.w; return renderInsights(); }
      const it = t.closest('[data-itab]'); if (it) { S.insTab = it.dataset.itab; return renderInsights(); }
      const ps = t.closest('[data-psort]'); if (ps) { const k = ps.dataset.psort; S.pfSort = { k, d: S.pfSort.k === k ? -S.pfSort.d : (k === 'b' ? 1 : -1) }; return renderInsights(); }
      const gt = t.closest('[data-go]'); if (gt) return go(gt.dataset.go);
      const pk = t.closest('[data-pick]'); if (pk) return openPicker(+pk.dataset.pick);
      const rm = t.closest('[data-rm]'); if (rm) { S.cmp.others = S.cmp.others.filter((x) => x !== rm.dataset.rm); fixCmp(); return renderMatrix(); }
      const ch = t.closest('[data-choose]'); if (ch) return choose(ch.dataset.choose);
      if (t.closest('[data-add-from-pick]')) { $('#pmPick').close(); return openModel(null); }
      const ct = t.closest('[data-ctry]'); if (ct) { S.mkC = S.mkC === ct.dataset.ctry ? '' : ct.dataset.ctry; return renderInsights(); }
      const tg = t.closest('[data-tgl]'); if (tg) { const b = tg.dataset.tgl; if (S.chHide.has(b)) S.chHide.delete(b); else S.chHide.add(b); return renderInsights(); }
      const ed = t.closest('[data-edit]'); if (ed) { const p = prodById(ed.dataset.edit); if (p) openModel(p); return; }
      const ad = t.closest('[data-add]'); if (ad) return openModel(null, ad.dataset.add);
      const cm = t.closest('[data-cmp]'); if (cm) { addCmp(cm.dataset.cmp); if (($('.view.active') || {}).id !== 'matrix') go('matrix'); return; }
      const un = t.closest('[data-unc]'); if (un) { S.cmp.others = S.cmp.others.filter((x) => x !== un.dataset.unc); fixCmp(); return renderMatrix(); }
      const so = t.closest('[data-sort]'); if (so) { S.sort = { k: so.dataset.sort, d: S.sort.k === so.dataset.sort ? -S.sort.d : 1 }; $('#mdlBox').innerHTML = modelsTable(); return; }
      switch (t.id) {
        case 'fetchPhotos': return fetchPhotos();
        case 'expBrands': return exportBrandsCsv();
        case 'impBrands2': return $('#brandFile').click();
        case 'chLin': case 'chLog': S.cscale = t.id === 'chLin' ? 'lin' : 'log'; return renderInsights();
        case 'chReset': S.chHide.clear(); S.chFind = ''; return renderInsights();
        case 'toggleWide': S.wide = !S.wide; document.body.classList.toggle('wide', S.wide); sv('cih_pm_wide', S.wide); return renderMatrix();
        case 'loadStarter2': case 'loadStarter3': return loadStarter();
        case 'impBrands': return $('#brandFile').click();
        case 'addModel': return openModel(null);
        case 'loadStarter': return loadStarter();
        case 'impCsv': return $('#csvFile').click();
        case 'expCsv': return exportCsv();
        case 'manageWatch': case 'pinFirst': return manageWatch();
        case 'profBack': return go('competitors');
        case 'profEdit': return openBrandDialog();
        case 'profPrint': return exportProfile(S.profile, 'print');
        case 'profHtml': return exportProfile(S.profile, 'file');
        case 'dgPreview': try { S.digest = await api('GET', '/api/digest'); renderInsights(); } catch (err) { toast(err.message); } return;
        case 'dgCopy': try { await navigator.clipboard.writeText(S.digest.text); toast('Digest copied'); } catch (err) { toast('Could not copy'); } return;
        case 'dgSend': try { const r = await api('POST', '/api/digest'); toast('Slack: ' + (r.sent.slack || 'not set up') + ' · Email: ' + (r.sent.email || 'not set up')); } catch (err) { toast(err.message); } return;
        default:
      }
    });
    document.addEventListener('keydown', (e) => { const c = e.target.closest && e.target.closest('.wc'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openProfile(c.dataset.open); } });
    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'showEmpty') { S.showEmpty = t.checked; return renderMatrix(); }
      if (t.id === 'showDiff') { S.diff = t.checked; return renderMatrix(); }
      if (t.id === 'chView') { S.cview = t.value; return renderInsights(); }
      if (t.id === 'mkSel') { S.mkSel = t.value; S.mkC = ''; return renderInsights(); }
      if (t.id === 'mkAbsent') { S.mkAbsent = t.checked; return renderInsights(); }
      if (t.id === 'fxEUR' || t.id === 'fxUSD') { const v = parseFloat(t.value); if (v > 0.1 && v < 2) { S.fx[t.id === 'fxEUR' ? 'EUR' : 'USD'] = v; sv('cih_pm_fx', S.fx); } return renderInsights(); }
      if (t.id === 'brandFile') { if (t.files[0]) await importBrands(t.files[0]); t.value = ''; return; }
      if (t.id === 'csvFile') { if (t.files[0]) await importCsv(t.files[0]); t.value = ''; return; }
      if (t.id === 'evtType') { C.evtSel = t.value; return C.feed(); }
      if (t.classList.contains('evtsel')) {
        try { await api('POST', '/api/tags', { id: t.dataset.id, type: t.value }); const n = C.news.find((x) => x.id === t.dataset.id); if (n) n.evt0 = t.value; C.feed(); toast('Event type saved'); } catch (err) { toast(err.message); }
      }
    });
    document.addEventListener('input', (e) => {
      if (e.target.id === 'mdlSearch') { S.q = e.target.value; $('#mdlBox').innerHTML = modelsTable(); }
      if (e.target.id === 'pickQ') { S.pickQ = e.target.value; $('#pickList').innerHTML = pickerHtml(); }
      if (e.target.id === 'chFind') { S.chFind = e.target.value; renderInsights(); const f = $('#chFind'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
    });
    $('#pmWatchForm').onsubmit = async (e) => {
      e.preventDefault(); const on = new Set($$('#pmWatchList input:checked').map((x) => x.value)), updates = {};
      C.brands.forEach((b) => { if (!isUs(b) && !!bm(b).watch !== on.has(b)) updates[b] = { watch: on.has(b) }; });
      if (Object.keys(updates).length) { try { const r = await api('POST', '/api/brands', { updates }); S.brands = r.brands; applyBrands(); toast('Watchlist saved'); } catch (err) { return toast(err.message); } }
      $('#pmWatchDlg').close(); refresh();
    };
    $('#pmWatchDlg').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#pmWatchDlg').close(); });
  }

  /* ---------- start ---------- */
  Object.assign(C, { photo: (n) => bm(n).photo || '', pic: (n) => (bm(n).photoSource === 'uploaded' && bm(n).photo) || C.images[n] || bm(n).photo || '', setPhoto: (b, photo, src) => { S.brands[b] = Object.assign({}, bm(b), { photo, photoSource: src }); }, isUs, badges, evtChip, passEvt: (n) => !C.evtSel || evtOf(n) === C.evtSel, evtSel: '', openProfile, renderInsights, onNews: () => { const a = ($('.view.active') || {}).id; if (a === 'insights') RENDER[a](); } });
  mkView('matrix', ''); mkView('profile', '');
  mkNav('matrix', 'Product Comparison', 'competitors');
  const side = $('.side'); ['sources', 'competitors', 'matrix', 'social', 'insights', 'news'].forEach((v) => side.insertBefore(side.querySelector(`.nav[data-v="${v}"]`), side.firstChild)); // News, Insights, Social, Matrix, Competitors, Sources
  const evtSelect = document.createElement('select'); evtSelect.className = 'field'; evtSelect.id = 'evtType'; evtSelect.setAttribute('aria-label', 'Event type');
  evtSelect.innerHTML = '<option value="">All event types</option>' + E.EVENT_TYPES.map((t) => `<option>${t}</option>`).join(''); $('#news .tools').appendChild(evtSelect);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="pmWatchDlg"><form id="pmWatchForm"><div class="mh"><strong>Manage watchlist</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form"><div class="sub">Pin the 5 to 8 competitors that matter most. Set a threat level on each profile.</div><div class="checks" id="pmWatchList"></div><div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save watchlist</button></div></div></form></dialog>`);
  modelDialog(); brandDialog(); addCompetitorTools(); wire();
  S.cmp = Object.assign({ us: '', others: [] }, ld('cih_pm_cmp', {})); S.wide = ld('cih_pm_wide', true); S.fx = Object.assign({}, FX_DEFAULT, ld('cih_pm_fx', {}));
  (async () => {
    try { const [b, p] = await Promise.all([api('GET', '/api/brands'), api('GET', '/api/products')]); S.brands = b.brands || {}; S.products = p.products || []; }
    catch (err) { toast('Could not load saved profiles and models: ' + err.message); }
    applyBrands(); const h = (location.hash || '').slice(1); go(['news', 'insights', 'social', 'matrix', 'competitors', 'sources'].includes(h) ? h : 'news');
  })();
})();
