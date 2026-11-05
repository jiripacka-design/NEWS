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
  const S = { brands: {}, products: [], win: 30, cmp: { us: '', others: [] }, sort: { k: 'brand', d: 1 }, q: '', profile: '', digest: null, removed: [], arch: 'hide', showEmpty: false, diff: false, wide: true, insTab: 'markets', pfSort: { k: 'u', d: -1 }, cview: 'ladder', ladSort: 'cheap', rankBy: 'weightKg', cscale: 'log', chHide: new Set(), chFind: '', mkSel: 'all', mkMode: 'count', mkC: '', mkAbsent: false, pickSlot: 0, pickQ: '' };
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
  // The tag shown on each article: one you set by hand wins; otherwise the classifier's best guess, with how sure it is and why.
  const evtInfo = (n) => {
    const key = n.evt0 + '|' + n.title;
    if (n._k !== key || !n._i) { n._k = key; n._i = E.EVENT_TYPES.includes(n.evt0) ? { type: n.evt0, confidence: 'set', why: [] } : E.classifyDetailed(n.title, n.summary); }
    return n._i;
  };
  const evtOf = (n) => evtInfo(n).type;
  // Priority: how much an item matters to us. Our own brand and the watchlist (by threat level) count most, then the kind of news, then recency.
  const EVT_PTS = { 'Recall': 3, 'Price change': 3, 'Launch': 2, 'Market entry': 2, 'Funding / financial': 2, 'Partnership / distribution': 1, 'People': 1, 'Award / event': 1, 'Review / test': 1, 'Other': 0 };
  function prio(n) {
    const b = n.brand, pts = []; let sc = 0;
    if (isUs(b)) { sc += 3; pts.push('our brand +3'); }
    else if (bm(b).watch) { const th = bm(b).threat, v = th === 'High' ? 3 : th === 'Medium' ? 2 : 1; sc += v; pts.push(`watchlist (${th || 'no'} threat) +${v}`); }
    const t = evtOf(n), e = EVT_PTS[t] || 0; if (e) { sc += e; pts.push(`${t} +${e}`); }
    const age = E.ageDays(n, Date.now()); if (age >= 0 && age <= 7) { sc += 1; pts.push('last 7 days +1'); }
    const level = sc >= 5 ? 'High' : sc >= 3 ? 'Medium' : 'Low';
    return { level, score: sc, why: `${level} priority (${sc} points): ${pts.join(', ') || 'nothing that raises it'}. Rules: 5+ High, 3-4 Medium, below 3 Low.` };
  }
  const chipCls = (t) => 'evt e-' + slug(t);
  function evtChip(n) {
    const t = evtOf(n);
    const inf = evtInfo(n), tip = inf.confidence === 'set' ? 'Set by you. Change it if it is wrong.' : inf.confidence === 'low' ? `Tagged automatically, but not sure${inf.why.length ? ` (matched “${inf.why[0]}”)` : ' (nothing clear in the headline)'}. Change it if it is wrong.` : `Tagged automatically (${inf.confidence} confidence), from “${inf.why.join('”, “')}”. Change it if it is wrong.`;
    if (n.live && n.id) return `<select class="evtsel ${chipCls(t)}${inf.confidence === 'low' && t !== 'Other' ? ' lowc' : ''}" data-id="${esc(n.id)}" title="${esc(tip)}">${E.EVENT_TYPES.map((x) => `<option${x === t ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    return `<span class="${chipCls(t)}">${esc(t)}</span>`;
  }
  // Feed filter: archived items are hidden unless "Show archived" is on; items of competitors you removed are always hidden.
  const passNews = (n, ignoreArchive) => {
    if (S.removed.includes(n.brand)) return false;
    if (n.dupOf && !S.showDups) return false;
    if (ignoreArchive) return true;
    return S.arch === 'show' ? true : S.arch === 'only' ? !!n.archived : !n.archived;
  };
  /* Duplicate stories (grouped on the server by lib/dedupe.js). Article fields are already escaped by mapLive. */
  function dupLine(n) {
    if (n.dupOf) return `<div class="dupline is-dup"><span>Repeat of “${n.dupTitle || 'another story'}”</span><button type="button" class="linkbtn" data-notdup="${esc(n.id)}" title="Show this as its own story from now on">Not a duplicate</button></div>`;
    const d = (n.dups || []).filter((x) => !x.archived); if (!d.length) return '';
    const srcs = [...new Map(d.map((x) => [x.source, x])).values()];
    return `<div class="dupline"><span>Also reported by</span><span>${srcs.slice(0, 4).map((x) => x.url && x.url !== '#' ? `<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.source}</a>` : x.source).join(', ')}${srcs.length > 4 ? ` and ${srcs.length - 4} more` : ''}</span></div>`;
  }
  function dupMeta() {
    const n = C.news.filter((x) => x.dupOf && !x.archived).length; if (!n) return '';
    return ` <span class="dupmeta">· ${n} repeated stor${n === 1 ? 'y' : 'ies'} ${S.showDups ? 'shown' : 'folded in'} <button type="button" class="linkbtn" id="dupToggle">${S.showDups ? 'Hide repeats' : 'Show repeats'}</button></span>`;
  }
  const tracked = () => new Set(C.brands);
  const feedItems = () => { const t = tracked(); return C.news.filter((n) => t.has(n.brand) && !n.archived); };
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
  const gloss = (rows) => `<details class="howto"${S.howOpen ? ' open' : ''}><summary>How to read this</summary><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></details>`;
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
      return { b, u, r, sku, pa, models: ps.length, pmin: pr.length ? Math.min(...pr) : null, pmax: pr.length ? Math.max(...pr) : null, rpb: u && r != null && !/low confidence/i.test(bm(b).dataNote || '') ? (r * 1e6) / u : null, depth: pa != null && sku ? pa / sku : null, offers: bm(b).offers || '', low: /low confidence/i.test(bm(b).dataNote || ''), note: bm(b).dataNote || '', cats: bm(b).paCategories || '', year: bm(b).figuresYear || '', ver: bm(b).lastVerified || '' };
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
        <div class="source-actions"><button type="button" class="primary" data-go="collect">Fill the gaps in Collect data</button></div></div>
        ${gloss([['Units / year', 'Bikes sold in a year. The small number under it is the year the figure is for.'], ['Revenue', 'Yearly sales in £ millions.'], ['Per bike', 'Revenue divided by units: a rough average price paid per bike, including accessories.'], ['SKUs', 'How many different bike models or variants the brand lists.'], ['Tracked', 'How many of its models we have in the Product Comparison.'], ['P&amp;A products', 'Parts and accessories on sale: luggage, lights, locks, saddles and so on.'], ['P&amp;A per model', 'P&amp;A products divided by SKUs. Higher means a deeper accessory range for each bike.']])}
        <div class="tbl-wrap"><table class="pm-table pf"><thead><tr>${th('b', 'Brand')}${th('u', 'Units / year', 'num')}${th('r', 'Revenue', 'num')}${th('rpb', 'Per bike', 'num')}${th('sku', 'SKUs', 'num')}${th('models', 'Tracked', 'num')}<th>Offers</th><th>Price range</th>${th('pa', 'P&amp;A products', 'num')}${th('depth', 'P&amp;A per model', 'num')}<th>P&amp;A offering</th>${th('ver', 'Verified')}</tr></thead><tbody>
        ${rows.map((r) => `<tr class="${isUs(r.b) ? 'is-us' : ''}"><td><button type="button" class="linkbtn" data-open="${esc(r.b)}">${esc(r.b)}</button> ${badges(r.b)}</td>
          <td class="num">${r.u != null ? `<div class="ubar"><i style="width:${Math.max(2, r.u / maxU * 100)}%"></i></div><strong>${num0(r.u)}</strong>${r.low ? `<span class="warn" title="${esc(r.note)}">claimed, low confidence</span>` : ''}${r.year ? `<small class="muted">${esc(r.year)}</small>` : ''}` : '<span class="muted">—</span>'}</td>
          <td class="num">${r.r != null ? '£' + r.r.toLocaleString('en-GB') + 'm' : '<span class="muted">—</span>'}</td><td class="num">${r.rpb != null ? '£' + num0(r.rpb) : '<span class="muted">—</span>'}</td>
          <td class="num">${r.sku != null ? r.sku : '<span class="muted">—</span>'}</td><td class="num">${r.models ? `<button type="button" class="cellbtn" data-go="matrix">${r.models}</button>` : '<span class="muted">0</span>'}</td>
          <td class="pa-cats">${r.offers ? esc(r.offers) : '<span class="muted">—</span>'}</td><td>${r.pmin != null ? (r.pmin === r.pmax ? gbp(r.pmin) : gbp(r.pmin) + '–' + gbp(r.pmax)) : '<span class="muted">—</span>'}</td>
          <td class="num">${r.pa != null ? r.pa : '<span class="muted">—</span>'}</td><td class="num">${r.depth != null ? r.depth.toFixed(1) : '<span class="muted">—</span>'}</td>
          <td class="pa-cats">${r.cats ? esc(r.cats) : '<span class="muted">—</span>'}</td><td>${r.ver ? esc(r.ver) : '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="sub">${withU.length < n ? `${n - withU.length} brand${n - withU.length === 1 ? ' has' : 's have'} no volume figure yet. Most manufacturers do not publish units, so treat these as estimates and check the note and sources on each profile. ` : ''}Select <button type="button" class="linkbtn" id="loadStarter3">Load researched data</button> for what has been found so far, or open <button type=\"button\" class=\"linkbtn\" data-go=\"collect\">Collect data</button> to import figures, download a spreadsheet to fill in, or get a brief for an AI model. One import feeds this table, the charts, the map and the comparison.</div></div>`;
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
  // Zoom presets in map units (the map is 960 x 481); each keeps the 2:1 shape so the page does not change height when you zoom.
  const MK_ZOOM = [['world', 'World', ''], ['europe', 'Europe', '405 95 230 115'], ['americas', 'Americas', '60 70 400 200'], ['apac', 'Asia Pacific', '640 150 300 150']];
  function insMarkets() {
    if (!window.CIWorld) { withWorld(() => { if (S.insTab === 'markets') renderInsights(); }); return '<div class="panel mk-loading"><div class="source-empty">Loading the map…</div></div>'; }
    const W = window.CIWorld, us = usName(), pick = mkBrands(), mine = placeCountries(countriesOf(us)), single = pick.length === 1;
    const by = new Map(); pick.forEach((b) => { placeCountries(countriesOf(b)).hit.forEach((t, key) => { if (!by.has(key)) by.set(key, { t, brands: [] }); by.get(key).brands.push(b); }); });
    const keys = new Set([...by.keys(), ...mine.hit.keys()]), nameOf = (key) => (by.get(key) || { t: mine.hit.get(key) }).t.n;
    // Two ways to colour the map. "count": a warm ramp, brighter where more competitors sell (blue where only we sell).
    // "gap": three colours, so the white space jumps out: competitors only (orange), both of us (green), only us (blue).
    const mode = single ? 'gap' : S.mkMode;
    const klass = (key) => { const n = (by.get(key) || { brands: [] }).brands.length, ours = mine.hit.has(key); if (!n) return 'wm-us'; if (mode === 'gap') return ours ? 'wm-g-both' : 'wm-g-them'; return 'wm-d' + (n >= 8 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : 1); };
    const shape = (key) => {
      const e = by.get(key) || { t: mine.hit.get(key), brands: [] }, t = e.t, ours = mine.hit.has(key), who = e.brands;
      // No SVG title element here: the browser's own tooltip would sit on top of the hover panel. The panel (and aria-label) carry the details.
      const tip = `${t.n}: ${who.length ? `${who.length} competitor${who.length === 1 ? '' : 's'}` : 'no competitor listed'}. ${ours ? 'We sell here.' : 'We do not sell here.'}`, c = klass(key) + (S.mkC === key ? ' wm-sel' : '');
      return t.k === 'o' ? `<path class="${c}" data-ctry="${key}" d="${W.d[t.i]}" aria-label="${esc(tip)}"/>` : `<circle class="${c}" data-ctry="${key}" cx="${W.dots[t.i][1]}" cy="${W.dots[t.i][2]}" r="4.2" aria-label="${esc(tip)}"/>`;
    };
    S.mkInfo = {}; keys.forEach((k) => { const e = by.get(k) || { t: mine.hit.get(k), brands: [] }; S.mkInfo[k] = { n: e.t.n, brands: e.brands, ours: mine.hit.has(k), single }; });
    const both = [...by.keys()].filter((k) => mine.hit.has(k)).length, theirsOnly = by.size - both, oursOnly = [...mine.hit.keys()].filter((k) => !by.has(k)).length;
    const withData = C.brands.filter((b) => !isUs(b) && countriesOf(b).length);
    const rows = [...by.entries()].map(([key, e]) => ({ key, n: e.t.n, brands: e.brands, ours: mine.hit.has(key) })).filter((r) => !S.mkAbsent || !r.ours).sort((a, c) => c.brands.length - a.brands.length || a.n.localeCompare(c.n)).slice(0, 15);
    const sel = S.mkC && keys.has(S.mkC) ? S.mkC : '', se = sel ? (by.get(sel) || { t: mine.hit.get(sel), brands: [] }) : null;
    const opts = `<option value="all"${S.mkSel === 'all' ? ' selected' : ''}>All competitors (${C.brands.filter((b) => !isUs(b)).length})</option><option value="watch"${S.mkSel === 'watch' ? ' selected' : ''}>Watchlist only (${C.brands.filter((b) => bm(b).watch && !isUs(b)).length})</option>${withData.sort((a, b) => a.localeCompare(b)).map((b) => `<option${S.mkSel === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}`;
    return `<div class="metrics"><div class="metric">Countries with a competitor<strong>${by.size}</strong></div><div class="metric">Where we both sell<strong>${both}</strong></div><div class="metric">Competitors only, we are absent<strong>${theirsOnly}</strong></div><div class="metric">Only we sell here<strong>${oursOnly}</strong></div></div>
      <div class="panel"><div class="chart-head"><div><h3>Where they sell</h3><div class="sub">${single ? esc(pick[0]) : `${pick.length} competitor${pick.length === 1 ? '' : 's'}`} against ${esc(us)}. Hover a country to see which brands sell there; select it to keep the details below.</div></div><div class="mk-ctl"><label class="cmp-bar">Show<select class="field" id="mkSel">${opts}</select></label>${single ? '' : `<div class="cmp-bar ctl"><span>Colour by</span><div class="seg" role="group" aria-label="Colour the map by"><button type="button" data-mkmode="count" class="${mode === 'count' ? 'on' : ''}" aria-pressed="${mode === 'count'}">Number of competitors</button><button type="button" data-mkmode="gap" class="${mode === 'gap' ? 'on' : ''}" aria-pressed="${mode === 'gap'}">Us vs them</button></div></div>`}</div></div>
<div class="wm-legend">${mode === 'gap' ? `<span><i class="sw g-them"></i>${single ? esc(pick[0]) : 'Competitors'} only: ${esc(us)} absent</span><span><i class="sw g-both"></i>Both sell here</span>` : '<span class="wm-scale"><span>Competitors selling there</span><i class="sw d1"></i>1<i class="sw d2"></i>2–3<i class="sw d3"></i>4–7<i class="sw d4"></i>8+</span>'}<span><i class="sw us"></i>Only ${esc(us)}</span><span><i class="sw none"></i>No data</span><span class="muted wm-src">Countries as listed on each profile under Regions · ${withData.length} of ${C.brands.length - 1} competitors have them</span></div><div class="mk-zoom seg" role="group" aria-label="Zoom the map">${MK_ZOOM.map(([k, l]) => `<button type="button" data-mkzoom="${k}" class="${(S.mkZoom || 'world') === k ? 'on' : ''}" aria-pressed="${(S.mkZoom || 'world') === k}">${l}</button>`).join('')}</div><div class="mk-wrap" id="mkWrap"><svg class="worldmap mk" viewBox="${(MK_ZOOM.find((z) => z[0] === S.mkZoom) || MK_ZOOM[0])[2] || `0 0 ${W.w} ${W.h}`}" role="img" aria-label="Flat world map of where ${esc(us)} and its competitors sell. Hover a country to see who sells there."><path class="wm-base" d="${W.d.join('')}"/>${[...keys].map(shape).join('')}</svg><div class="mk-tip" id="mkTip" hidden></div></div>
        ${se ? `<div class="mk-box"><b>${esc(se.t.n)}</b>: ${se.brands.length ? `${se.brands.length} competitor${se.brands.length === 1 ? '' : 's'} sell here.` : 'no competitor listed here.'} ${mine.hit.has(sel) ? `<b>${esc(us)} sells here too.</b>` : `<b>${esc(us)} does not sell here.</b>`}<div class="ctags">${mine.hit.has(sel) ? `<span class="us">${esc(us)}</span>` : ''}${se.brands.map((b) => `<span>${esc(b)}</span>`).join('')}</div></div>` : ''}</div>
      <div class="panel"><div class="chart-head"><div><h3>Countries with the most competitors</h3><div class="sub">The top 15 for the selection above.</div></div><label class="chk"><input type="checkbox" id="mkAbsent"${S.mkAbsent ? ' checked' : ''}> Only countries where we do not sell</label></div>
        <div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Country</th><th class="num">Competitors</th><th>We sell here</th><th>Who</th></tr></thead><tbody>${rows.map((r) => `<tr><td><button type="button" class="linkbtn" data-ctry="${r.key}">${esc(r.n)}</button></td><td class="num">${r.brands.length}</td><td>${r.ours ? '<span class="us-pill">Yes</span>' : '<span class="muted">No</span>'}</td><td class="pa-cats">${esc(r.brands.slice(0, 8).join(', '))}${r.brands.length > 8 ? ', …' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No countries listed for this selection yet.</td></tr>'}</tbody></table></div></div>
      ${regionPanel(feedItems(), Date.now(), us)}`;
  }

  function insGaps() {
    return `<div class="panel-note">${gloss([['Coverage', 'How many of the ' + C.brands.length + ' brands have this fact filled in. Select a missing brand to fill it in, or export a spreadsheet and fill many at once.']])}<div class="source-actions" style="margin-bottom:12px"><button type="button" class="primary" data-go="collect">Fill the gaps in Collect data</button></div></div>${coveragePanel()}`;
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
    ['Brakes and equipment', [['brakes', 'Brakes'], ['mudguards', 'Mudguards'], ['lighting', 'Lighting'], ['rack', 'Rack'], ['frontCarrier', 'Front carrier']]],
    ['Fit and warranty', [['riderHeight', 'Rider height'], ['maxLoadKg', 'Max load (kg)'], ['warranty', 'Warranty']]]
  ];
  const SPEC_KEYS = SPEC_GROUPS.flatMap((g) => g[1].map((x) => x[0]));
  const COLS = ['brand', 'model', 'line', 'category', 'priceGBP', 'priceEUR', 'priceUSD', 'priceNote', 'colours', 'handlebars', 'weightKg', 'foldH', 'foldW', 'foldL', 'wheelIn', ...SPEC_KEYS.filter((k) => k !== 'gears'), 'gears', 'motor', 'batteryWh', 'rangeKm', 'launch', 'url', 'sourceUrl', 'lastVerified', 'notes'];
  const COLS_ALIAS = { foldD: 'foldL', speed: 'gears' };
  const txt = (k, label) => ({ k, label, get: (p) => p[k], fmt: (v) => v });
  const ROWS = [
    { sec: 'Overview' },
    { k: 'line', label: 'Product line', get: (p) => p.line, fmt: (v) => v },
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
  const CORE = ['line', 'priceGBP', 'weightKg', 'wheelIn', ...SPEC_KEYS];
  const filled = (p) => CORE.filter((k) => (k === 'priceGBP' ? priceOf(p).v != null : p[k] != null && p[k] !== '')).length + (fold(p) ? 1 : 0);
  const fillPct = (p) => Math.round((filled(p) / (CORE.length + 1)) * 100);
  const prodById = (id) => S.products.find((p) => p.id === id);
  const prodName = (p) => `${p.brand} ${p.model}`;
  function fixCmp() {
    // Any model can go in any column, so two Brompton models can be compared. The first column is the baseline the others are measured against.
    const ours = S.products.filter((p) => isUs(p.brand));
    if (!prodById(S.cmp.us)) S.cmp.us = ours[0] ? ours[0].id : (S.products[0] ? S.products[0].id : '');
    S.cmp.others = [...new Set(S.cmp.others)].filter((id) => prodById(id) && id !== S.cmp.us).slice(0, 5);
    sv('cih_pm_cmp', S.cmp);
  }
  function addCmp(id) {
    const p = prodById(id); if (!p) return;
    if (id === S.cmp.us || S.cmp.others.includes(id)) return toast(`${prodName(p)} is already in the comparison`);
    if (!S.cmp.us) S.cmp.us = id;
    else if (S.cmp.others.length >= 5) return toast('Compare up to 6 models at a time');
    else S.cmp.others.push(id);
    fixCmp(); renderMatrix();
  }
  /* =====================  PRODUCT COMPARE (Apple-style: sticky model cards, then large spec sections)  ===================== */
  const MAXCMP = 6; // us + up to 5 competitors
  function headCard(p, i) {
    if (!p) return `<div class="ap-card empty"><button type="button" class="ap-add" data-pick="${i}"><b>+</b><span>${i === 0 ? 'Choose a model' : 'Add a model'}</span></button></div>`;
    const mp = modelPic(p), pic = mp || C.pic(p.brand), us = isUs(p.brand), upl = mp || C.picUp(p.brand);
    return `<div class="ap-card${us ? ' is-us' : ''}"><div class="ap-pic">${pic ? `<img src="${esc(pic)}" class="${upl ? 'up' : ''}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span>🚲</span>'}${i > 0 ? `<button type="button" class="ap-x" data-rm="${esc(p.id)}" aria-label="Remove ${esc(p.model)} from the comparison" title="Remove from the comparison">×</button>` : ''}</div>
      <div class="ap-brand"><button type="button" class="linkbtn" data-open="${esc(p.brand)}">${esc(p.brand)}</button> ${us ? '<span class="pm-us">US</span>' : ''}</div>
      <div class="ap-name">${esc(p.model)}</div>${p.line ? `<div class="ap-line">${esc(p.line)}</div>` : ''}<div class="ap-price">${priceOf(p).v != null ? `From ${priceTxt(p)}` : '<span class="muted">No price yet</span>'}</div>
      <div class="fillbar" title="${filled(p)} of ${CORE.length + 1} comparable specs filled in"><i style="width:${fillPct(p)}%"></i></div><div class="muted ap-fill">${fillPct(p)}% of specs filled</div>
      <div class="ap-act"><button type="button" class="linkbtn" data-pick="${i}">Change model</button><button type="button" class="linkbtn" data-edit="${esc(p.id)}">Edit</button><button type="button" class="linkbtn" data-mpic="${esc(p.id)}" title="Add or change a picture of this exact model">Picture</button></div></div>`;
  }
  /* Picker: a searchable list, opened from the + card or Change model */
  function pickerHtml() {
    const slot = S.pickSlot, ours = slot === 0, cur = [S.cmp.us, ...S.cmp.others][slot], taken = new Set([S.cmp.us, ...S.cmp.others]), q = S.pickQ.toLowerCase();
    const list = S.products.filter((p) => (p.id === cur || !taken.has(p.id)) && `${p.brand} ${p.line || ''} ${p.model}`.toLowerCase().includes(q));
    const byB = {}; list.forEach((p) => { (byB[p.brand] = byB[p.brand] || []).push(p); });
    return Object.keys(byB).sort((a, c) => (isUs(c) - isUs(a)) || a.localeCompare(c)).map((b) => `<div class="pick-g">${esc(b)}</div>${byB[b].map((p) => `<button type="button" class="pick-i" data-choose="${esc(p.id)}"><span><strong>${/^(null|undefined|none|n\/a|na|test)?$/i.test(p.model) ? 'Unnamed model' : esc(p.model)}</strong>${p.line ? ` <span class="muted">${esc(p.line)}</span>` : ''}${/^(null|undefined|none|n\/a|na)?$/i.test(p.model) ? ' <span class="muted">(open it with Edit to give it a name)</span>' : ''}${p.id === cur ? ' <span class="muted">(current)</span>' : ''}</span><small>${esc(priceTxt(p))} · ${fillPct(p)}% of specs</small></button>`).join('')}`).join('') || `<div class="source-empty">${S.products.length ? 'No models match.' : 'No models yet.'} <button type="button" class="linkbtn" data-add-from-pick>Add a model</button></div>`;
  }
  function openPicker(slot) {
    S.pickSlot = slot; S.pickQ = '';
    let d = $('#pmPick');
    if (!d) { d = document.createElement('dialog'); d.id = 'pmPick'; d.innerHTML = '<div class="mh"><strong id="pickTitle"></strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb"><input class="field" id="pickQ" placeholder="Search models or brands" autocomplete="off"><div id="pickList"></div></div>'; document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); }); }
    $('#pickTitle').textContent = slot === 0 ? 'Choose the first model (the others are measured against it)' : 'Add a model to compare'; $('#pickQ').value = ''; $('#pickList').innerHTML = pickerHtml(); d.showModal(); $('#pickQ').focus();
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
        if (ok && r.dir && typeof v === 'number' && p.id !== S.cmp.us && typeof uv === 'number') {
          const d = Math.round((v - uv) * 100) / 100;
          if (d !== 0) delta = `<small class="dl${(r.dir === 'low' ? d < 0 : d > 0) ? ' adv' : ''}" title="Compared with ${esc(prodName(us))}">${d > 0 ? '+' : '−'}${r.fmt(Math.abs(d))} vs ${isUs(us.brand) ? 'us' : 'first'}</small>`;
        }
        return `<div class="ap-c${isUs(p.brand) ? ' is-us' : ''}${best != null && v === best ? ' best' : ''}"><div class="ap-v">${ok ? (r.html ? r.html(v) : esc((r.pre ? r.pre(p) : '') + r.fmt(v))) : '<span class="muted">—</span>'}</div>${r.note && r.note(p) ? `<small class="muted">${esc(r.note(p))}</small>` : ''}${delta}</div>`;
      }).join('')}</div></div>`;
    });
    flush();
    return `<div class="ap" style="${style}"><div class="ap-head"><div class="ap-cards" style="${style}">${slots.map((p, i) => headCard(p, i)).join('')}</div></div>${out || '<div class="source-empty">Nothing to show with these settings.</div>'}</div>
      <div class="sub ap-foot"><label class="chk"><input type="checkbox" id="showDiff"${S.diff ? ' checked' : ''}> Show only differences</label> &nbsp; <label class="chk"><input type="checkbox" id="showEmpty"${S.showEmpty ? ' checked' : ''}> Show rows with no data</label>${hidden ? ` &nbsp; ${hidden} row${hidden === 1 ? '' : 's'} hidden` : ''} &nbsp; <span class="legend-best"></span> best value in the row. Orange means that model is ahead of the first column on that spec.</div>`;
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
  // Palette (v3.11): Brompton stays #002fa7 (with a white ring so it reads on black). Competitors get seven distinct hues, checked for
  // colour-blind separation and 3:1 contrast on the dark chart background, in a fixed order. A colour follows the brand: the watchlist
  // first, then A to Z, among brands that have something to plot. Brands beyond the seventh are grey with a dashed line.
  const US_BLUE = '#002fa7', PAL = ['#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'], REST = '#8a8a8a', DASH = ['', '6 4', '2 3', '10 3 2 3'];
  const AHEAD_US = '#3987e5', AHEAD_THEM = '#d95926'; // head-to-head: blue where we are ahead, orange where they are
  const PRICE_TICKS = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000];
  const logTicks = (lo, hi) => { const t = []; for (let e = Math.floor(Math.log10(Math.max(lo, 1e-9))); e <= Math.ceil(Math.log10(hi)); e++) [1, 2, 5].forEach((m) => { const v = m * 10 ** e; if (v >= lo && v <= hi) t.push(v); }); return t; };
  const kfmt = (v) => (v >= 1e6 ? v / 1e6 + 'm' : v >= 1000 ? v / 1000 + 'k' : String(v));
  const AXES = {
    price: { label: 'Price (£)', get: (p) => priceOf(p).v, fmt: (v) => gbp(v), tick: (v) => gbp(v) },
    weightKg: { label: 'Weight (kg)', get: (p) => p.weightKg, fmt: (v) => v + ' kg' },
    vol: { label: 'Folded volume (L)', get: (p) => vol(p), fmt: (v) => Math.round(v) + ' L' },
    batteryWh: { label: 'Battery (Wh)', get: (p) => p.batteryWh, fmt: (v) => v + ' Wh' },
    units: { label: 'Bikes sold per year', fmt: (v) => v.toLocaleString('en-GB'), tick: kfmt },
    rpb: { label: 'Revenue per bike (£)', fmt: (v) => gbp(v), tick: (v) => gbp(v) },
    sku: { label: 'Models listed (SKUs)', fmt: (v) => String(v) },
    pa: { label: 'P&A products (parts and accessories)', fmt: (v) => String(v) }
  };
  const RANKS = {
    price: { label: 'Price', get: (p) => priceOf(p).v, fmt: (v) => gbp(v), best: 'low' },
    weightKg: { label: 'Weight', get: (p) => p.weightKg, fmt: (v) => v + ' kg', best: 'low' },
    vol: { label: 'Folded volume', get: (p) => vol(p), fmt: (v) => Math.round(v) + ' L', best: 'low' },
    ppkg: { label: 'Price per kg of weight', get: (p) => (priceOf(p).v && p.weightKg ? priceOf(p).v / p.weightKg : null), fmt: (v) => gbp(v) + ' / kg', best: 'low' },
    batteryWh: { label: 'Battery size', get: (p) => p.batteryWh, fmt: (v) => v + ' Wh', best: 'high' },
    ppwh: { label: 'Price per Wh of battery', get: (p) => (priceOf(p).v && p.batteryWh ? priceOf(p).v / p.batteryWh : null), fmt: (v) => '£' + v.toFixed(1) + ' / Wh', best: 'low' }
  };
  const VIEWS = [
    { id: 'ladder', label: 'Price ladder', what: 'One row per brand. The line runs from its cheapest to its dearest model and each dot is a model. The blue band is our own price range, so you can see who sits inside it.' },
    { id: 'h2h', label: 'Head-to-head: every model against ours', what: 'One row per competitor model, measured against the model chosen as ours (top right). Blue means our model is ahead on that spec (cheaper, lighter or smaller when folded); orange means theirs is. The longer the bar, the bigger the gap. Rows closest to our price come first: they are the ones a customer weighs against ours.' },
    { id: 'rank', label: 'Rankings: who is lightest, smallest, cheapest', what: 'Every model as a bar, best first. Blue bars are ours. The dashed line marks the model selected as ours in the Product Comparison, so you can see who beats it.' },
    { id: 'pw', label: 'Price vs weight', x: 'price', y: 'weightKg', what: 'Higher on the chart means a heavier bike. Models to the left cost less; models lower down are lighter.' },
    { id: 'pv', label: 'Price vs folded size', x: 'price', y: 'vol', what: 'Higher means a bigger folded package; lower means it packs smaller.' },
    { id: 'port', label: 'Portability map (weight vs folded size)', x: 'weightKg', y: 'vol', size: 'price', what: 'Bottom-left is best: lighter and smaller when folded. A bigger bubble means a higher price.' },
    { id: 'pb', label: 'E-bikes: price vs battery', x: 'price', y: 'batteryWh', what: 'Higher means a bigger battery. Only electric models with a stated battery size appear. Range is left out on purpose: makers measure it differently, so it does not compare fairly.' },
    { id: 'pos', label: 'Volume vs value (brands)', x: 'units', y: 'rpb', size: 'sku', log: true, brand: true, what: 'One bubble per brand. Further right sells more bikes a year; higher earns more per bike. Bubble size is the number of models. Needs units and revenue for the brand, so only some brands appear until that data is added.' },
    { id: 'breadth', label: 'Range breadth: models vs accessories (brands)', x: 'sku', y: 'pa', size: 'units', sizeOpt: true, brand: true, what: 'One bubble per brand. Further right lists more bike models; higher sells more parts and accessories (P&A). Bubble size is bikes sold per year when known.' },
    { id: 'share', label: 'Share of voice: who is in the news', what: 'News items per week over the last 12 weeks. Blue is us. Grey and white are the competitors you watch; the dark band is everyone else. More coverage usually means more marketing activity, or more trouble.' }
  ];
  const colourOrder = () => {
    // watchlist first, then brands with models (most charts), then brands with only company figures
    const mods = new Set(S.products.map((p) => p.brand)), rank = (b) => (bm(b).watch ? 0 : mods.has(b) ? 1 : 2);
    return C.brands.filter((b) => !isUs(b) && (mods.has(b) || unitsOf(b) != null || skuOf(b) != null)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  };
  const brandStyle = (b) => {
    if (isUs(b)) return { c: US_BLUE, dash: '', us: true };
    const i = colourOrder().indexOf(b);
    return i >= 0 && i < PAL.length ? { c: PAL[i], dash: '', us: false } : { c: REST, dash: DASH[1 + (Math.max(0, i - PAL.length) % 3)], us: false };
  };
  function chartData() {
    const V = VIEWS.find((v) => v.id === S.cview) || VIEWS[0], okv = (v) => typeof v === 'number' && isFinite(v) && v > 0;
    if (V.brand) {
      const need = [V.x, V.y, ...(V.size && !V.sizeOpt ? [V.size] : [])], nm = (k) => AXES[k].label.replace(/ \(.*/, '').toLowerCase();
      const rows = C.brands.map((b) => { const u = unitsOf(b), r = revenueOf(b), low = /low confidence/i.test(bm(b).dataNote || ''), o = { p: { id: 'brand:' + b, brand: b, model: b }, brandRow: true, conv: low ? 'claimed figure, low confidence' : '', units: u, sku: skuOf(b), pa: bm(b).paSkus, rpb: u && r != null && !low ? (r * 1e6) / u : null }; return o; });
      const all = rows.filter((o) => need.every((k) => okv(o[k])));
      const why = (b) => { const o = rows.find((x) => x.p.brand === b), lack = need.filter((k) => !okv(o[k])); return 'Needs ' + lack.map(nm).join(' and '); };
      return { V, need, all, names: C.brands.slice().sort((a, b) => (isUs(b) - isUs(a)) || a.localeCompare(b)), why, plotted: new Set(all.map((o) => o.p.brand)), anyConv: all.some((o) => o.conv) };
    }
    const need = V.id === 'ladder' ? ['price'] : [...new Set([V.x, V.y, V.size].filter(Boolean))];
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
    if (logx) { const lo = Math.max(1, mn * 0.8), hi = mx * 1.25; let t = logTicks(lo, hi); if (t.length < 2) t = [Math.round(lo), Math.round(hi)]; return { t, a: Math.log(Math.min(lo, t[0])), b: Math.log(Math.max(hi, t[t.length - 1])) }; }
    const t = niceTicks(0, mx * 1.08); return { t, a: t[0], b: t[t.length - 1] };
  }
  const ptTitle = (o, extra) => o.brandRow ? `${o.p.brand}${o.units ? ': ' + o.units.toLocaleString('en-GB') + ' bikes a year' : ''}${o.rpb ? ', ' + gbp(o.rpb) + ' per bike' : ''}${o.sku ? ', ' + o.sku + ' models' : ''}${o.pa != null ? ', ' + o.pa + ' P&A products' : ''}${o.conv ? ' (' + o.conv + ')' : ''}. Select to open the profile.` : `${prodName(o.p)}: ${priceTxt(o.p)}${o.weightKg ? ', ' + o.weightKg + ' kg' : ''}${o.vol ? ', ' + Math.round(o.vol) + ' L folded' : ''}${o.batteryWh ? ', ' + o.batteryWh + ' Wh' : ''}${o.conv ? ' (' + o.conv + ')' : ''}. Select to add to the comparison.${extra || ''}`;
  function dotG(o, cx, cy, r, st, sel) {
    const hollow = !!o.conv;
    return `<g class="dot" data-tip="${esc(ptTitle(o))}" ${o.brandRow ? `data-open="${esc(o.p.brand)}"` : `data-cmp="${esc(o.p.id)}"`}>${sel ? `<circle class="sel" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 4).toFixed(1)}"/>` : ''}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${hollow ? '#000' : st.c}" stroke="${hollow ? st.c : st.us ? '#fff' : '#000'}" stroke-width="${hollow ? 2.4 : st.us ? 2 : 1.4}"/></g>`;
  }
  function scatterSvg(D) {
    const V = D.V, ay = AXES[V.y], ax = AXES[V.x], pts = D.all.filter((o) => !S.chHide.has(o.p.brand));
    if (!pts.length) return chartEmpty;
    const W = 1000, H = 540, L = 78, R = V.lines ? 180 : 90, T = 26, B = 64, logx = (V.x === 'price' || V.log) && S.cscale === 'log';
    const xa = xAxis(pts.map((o) => o[V.x]), logx), yt = niceTicks(0, Math.max(...pts.map((o) => o[V.y])) * 1.1), y0 = yt[0], y1 = yt[yt.length - 1];
    const X = (v) => L + ((logx ? Math.log(v) : v) - xa.a) / (xa.b - xa.a) * (W - L - R), Y = (v) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
    const rad = V.size ? (() => { const a = pts.map((o) => o[V.size]).filter((v) => typeof v === 'number' && v > 0), lo = Math.min(...a), hi = Math.max(...a); return (v) => (typeof v === 'number' && v > 0 ? 6 + 16 * Math.sqrt((v - lo) / ((hi - lo) || 1)) : 6); })() : null;
    const sel = new Set([S.cmp.us, ...S.cmp.others]), by = {}; pts.forEach((o) => { (by[o.p.brand] = by[o.p.brand] || []).push(o); });
    const series = Object.keys(by).sort((a, b) => isUs(a) - isUs(b)).map((b) => ({ b, st: brandStyle(b), list: by[b].sort((a, c) => a[V.x] - c[V.x]) }));
    let lead = '', labs = '';
    if (V.lines) {
      const lab = series.map((s) => { const l = s.list[s.list.length - 1]; return { s, px: X(l[V.x]), py: Y(l[V.y]), ly: Y(l[V.y]) }; }).sort((a, c) => a.ly - c.ly);
      for (let i = 1; i < lab.length; i++) if (lab[i].ly - lab[i - 1].ly < 21) lab[i].ly = lab[i - 1].ly + 21;
      const over = lab.length ? lab[lab.length - 1].ly - (H - B - 6) : 0; if (over > 0) lab.forEach((l) => { l.ly -= over; });
      lead = lab.map((l) => `<path class="lead" d="M${l.px.toFixed(1)} ${l.py.toFixed(1)} L${W - R + 8} ${l.ly.toFixed(1)}" stroke="${l.s.st.c}"/>`).join('');
      labs = lab.map((l) => `<text class="blab${l.s.st.us ? ' us' : ''}" x="${W - R + 14}" y="${(l.ly + 4).toFixed(1)}" fill="${l.s.st.us ? '#fff' : '#e6e6e6'}">${esc(l.s.b)}</text>`).join('');
    }
    const body = series.map((s) => `<g class="ser${s.st.us ? ' us' : ''}">${V.lines && s.list.length > 1 ? `${s.st.us ? `<polyline points="${s.list.map((o) => `${X(o[V.x]).toFixed(1)},${Y(o[V.y]).toFixed(1)}`).join(' ')}" stroke="#fff" stroke-width="6" fill="none" opacity=".9"/>` : ''}<polyline points="${s.list.map((o) => `${X(o[V.x]).toFixed(1)},${Y(o[V.y]).toFixed(1)}`).join(' ')}" stroke="${s.st.c}" stroke-width="${s.st.us ? 3.4 : 1.8}" stroke-dasharray="${s.st.dash}" fill="none"/>` : ''}${s.list.map((o) => dotG(o, X(o[V.x]), Y(o[V.y]), rad ? rad(o[V.size]) : s.st.us ? 7 : 5, s.st, sel.has(o.p.id))).join('')}${V.lines ? '' : s.list.map((o) => `<text class="dlab" x="${(X(o[V.x]) + (rad ? rad(o[V.size]) : 6) + 5).toFixed(1)}" y="${(Y(o[V.y]) + 4).toFixed(1)}">${esc(o.p.model.length > 24 ? o.p.model.slice(0, 23) + '…' : o.p.model)}</text>`).join('')}</g>`).join('');
    return `<svg class="chart2" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(V.label)}">
      ${yt.map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="al" x="${L - 10}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(ay.tick ? ay.tick(v) : ay.fmt(v).replace(/ (kg|L|Wh)$/, ''))}</text>`).join('')}
      ${xa.t.map((v) => `<line class="tk" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text class="al" x="${X(v).toFixed(1)}" y="${H - B + 22}" text-anchor="middle">${esc(ax.tick ? ax.tick(v) : String(v))}</text>`).join('')}
      <line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <text class="at" x="${L}" y="${T - 8}">${esc(ay.label)}</text>
      <text class="at" x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle">${esc(ax.label)}${logx ? ', log scale' : ''}</text>
      ${lead}${body}${labs}</svg>`;
  }
  function ladderSvg(D) {
    const pts = D.all.filter((o) => !S.chHide.has(o.p.brand)); if (!pts.length) return chartEmpty;
    const by = {}; pts.forEach((o) => { (by[o.p.brand] = by[o.p.brand] || []).push(o); });
    const rows = Object.keys(by).map((b) => { const l = by[b].sort((a, c) => a.price - c.price); return { b, st: brandStyle(b), l, min: l[0].price, max: l[l.length - 1].price }; })
      .sort((a, c) => (isUs(c.b) - isUs(a.b)) || (S.ladSort === 'dear' ? c.max - a.max : S.ladSort === 'az' ? a.b.localeCompare(c.b) : a.min - c.min));
    const W = 1000, L = 230, R = 210, T = 56, RH = 52, H = T + rows.length * RH + 62, logx = S.cscale === 'log', xa = xAxis(pts.map((o) => o.price), logx);
    const X = (v) => L + ((logx ? Math.log(v) : v) - xa.a) / (xa.b - xa.a) * (W - L - R), usr = rows.find((r) => r.st.us), sel = new Set([S.cmp.us, ...S.cmp.others]), by0 = T + rows.length * RH, ax = (y) => xa.t.map((v) => `<text class="al" x="${X(v).toFixed(1)}" y="${y}" text-anchor="middle">${esc(gbp(v))}</text>`).join('');
    return `<svg class="chart2 ladder" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price ladder, one row per brand">
      ${rows.map((r, i) => `<rect class="${i % 2 ? 'rowb' : 'rowa'}" x="0" y="${T + i * RH}" width="${W}" height="${RH}"/>`).join('')}
      ${usr ? `<rect class="band" x="${(X(usr.min) - 6).toFixed(1)}" y="${T - 8}" width="${Math.max(12, X(usr.max) - X(usr.min) + 12).toFixed(1)}" height="${by0 - T + 8}" rx="6"/><text class="pr band-t" x="${(X(usr.min) - 6).toFixed(1)}" y="${T - 16}">${esc(usr.b)} range: ${esc(gbp(usr.min))} to ${esc(gbp(usr.max))}</text>` : ''}
      ${xa.t.map((v) => `<line class="gl2" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${T}" y2="${by0}"/>`).join('')}
      ${ax(by0 + 24)}<text class="at" x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle">Price per model (£${logx ? ', log scale' : ''})</text>
      <line class="ax" x1="${L - 10}" x2="${L - 10}" y1="${T}" y2="${by0}"/>
      ${rows.map((r, i) => { const y = T + i * RH + RH / 2; return `<g class="lrow"><text class="rl${r.st.us ? ' us' : ''}" x="${L - 24}" y="${y - 1}" text-anchor="end">${esc(r.b)}</text><text class="rs" x="${L - 24}" y="${y + 16}" text-anchor="end">${r.l.length} model${r.l.length === 1 ? '' : 's'}</text>
        <line x1="${X(r.min).toFixed(1)}" x2="${X(r.max).toFixed(1)}" y1="${y}" y2="${y}" stroke="${r.st.c}" stroke-width="${r.st.us ? 6 : 4}" stroke-linecap="round" opacity="${r.st.us ? 1 : .85}"/>
        ${r.l.map((o) => dotG(o, X(o.price), y, r.st.us ? 8 : 6.5, r.st, sel.has(o.p.id))).join('')}
        <text class="pr" x="${(X(r.max) + 16).toFixed(1)}" y="${y + 5}">${r.l.length > 1 ? `${esc(gbp(r.min))} to ${esc(gbp(r.max))}` : esc(gbp(r.min))}</text></g>`; }).join('')}</svg>`;
  }
  function rankSvg(D) {
    const R0 = RANKS[S.rankBy] || RANKS.weightKg, keep = (p) => !S.chHide.has(p.brand);
    let rows = S.products.filter(keep).map((p) => ({ p, v: R0.get(p) })).filter((r) => typeof r.v === 'number' && isFinite(r.v) && r.v > 0);
    if (!rows.length) return `<div class="source-empty">No model has a value for “${esc(R0.label)}” yet. Add the missing specs in the Product Comparison, or use Collect data.</div>`;
    rows.sort((a, c) => (R0.best === 'low' ? a.v - c.v : c.v - a.v)); const cut = rows.length > 24; rows = rows.slice(0, 24);
    const W = 1000, L = 300, R = 120, T = 18, RH = 34, H = T + rows.length * RH + 36, mx = Math.max(...rows.map((r) => r.v)), ref = prodById(S.cmp.us), rv = ref ? R0.get(ref) : null, X = (v) => L + (v / mx) * (W - L - R);
    return `<svg class="chart2" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ranking by ${esc(R0.label)}">
      ${rows.map((r, i) => `<rect class="${i % 2 ? 'rowb' : 'rowa'}" x="0" y="${T + i * RH}" width="${W}" height="${RH}"/>`).join('')}
      ${niceTicks(0, mx).filter((v) => v <= mx * 1.0001).map((v) => `<line class="gl2" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${T}" y2="${H - 30}"/><text class="al" x="${X(v).toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(R0.fmt(v).replace(/ \/ (kg|Wh)$/, ''))}</text>`).join('')}
      ${rows.map((r, i) => { const y = T + i * RH, us = isUs(r.p.brand), sel = r.p.id === S.cmp.us || S.cmp.others.includes(r.p.id); return `<g class="dot" data-cmp="${esc(r.p.id)}" data-tip="${esc(prodName(r.p))}: ${esc(R0.fmt(r.v))}. Select to add to the comparison."><text class="rl${us ? ' us' : ''}" x="${L - 14}" y="${y + RH / 2 + 5}" text-anchor="end">${esc(r.p.brand)} · ${esc(r.p.model.length > 26 ? r.p.model.slice(0, 25) + '…' : r.p.model)}</text><rect x="${L}" y="${y + 7}" width="${Math.max(3, X(r.v) - L).toFixed(1)}" height="${RH - 14}" rx="4" fill="${us ? US_BLUE : brandStyle(r.p.brand).c}"${sel || us ? ' stroke="#fff" stroke-width="' + (sel ? 2 : 1) + '"' : ''}/><text class="pr val" x="${(X(r.v) + 10).toFixed(1)}" y="${y + RH / 2 + 5}">${esc(R0.fmt(r.v))}</text></g>`; }).join('')}
      ${rv ? `<line class="refl" x1="${X(rv).toFixed(1)}" x2="${X(rv).toFixed(1)}" y1="${T - 6}" y2="${H - 30}"/><text class="pr" x="${X(rv).toFixed(1)}" y="${T - 8}" text-anchor="middle">${esc(ref.model.length > 30 ? ref.model.slice(0, 29) + '…' : ref.model)}</text>` : ''}
    </svg>${cut ? '<div class="sub">Showing the best 24.</div>' : ''}`;
  }
  function shareData() {
    const now = Date.now(), items = feedItems(), us = usName(), watched = C.brands.filter((b) => bm(b).watch && !isUs(b));
    const cnt = {}; items.forEach((n) => { const a = E.ageDays(n, now); if (isNaN(a) || a < 0 || a >= 84) return; const w = 11 - Math.floor(a / 7); (cnt[n.brand] = cnt[n.brand] || new Array(12).fill(0))[w]++; });
    const tot = (b) => (cnt[b] || []).reduce((x, y) => x + y, 0);
    const named = [us, ...watched.concat(C.brands.filter((b) => !isUs(b) && !bm(b).watch).sort((a, c) => tot(c) - tot(a))).filter((b) => tot(b) > 0 || bm(b).watch).slice(0, 5)].filter((b, i, a) => a.indexOf(b) === i);
    const other = new Array(12).fill(0); Object.keys(cnt).forEach((b) => { if (!named.includes(b)) cnt[b].forEach((v, i) => { other[i] += v; }); });
    const series = named.map((b) => ({ b, v: cnt[b] || new Array(12).fill(0) })); series.push({ b: 'All others', v: other, other: true });
    return { series, total: series.reduce((x, s) => x + s.v.reduce((a, c) => a + c, 0), 0), weeks: 12, now };
  }
  function shareSvg(D) {
    const sd = shareData(); if (!sd.total) return '<div class="source-empty">No dated news items in the last 12 weeks yet. Run a scan from the top right.</div>';
    const W = 1000, H = 440, L = 60, R = 40, T = 24, B = 56, n = 12, sums = Array.from({ length: n }, (_, i) => sd.series.reduce((a, s) => a + s.v[i], 0)), yt = niceTicks(0, Math.max(...sums, 1) * 1.1), y1 = yt[yt.length - 1], bw = (W - L - R) / n, Y = (v) => H - B - (v / y1) * (H - T - B);
    const col = (s) => (isUs(s.b) ? US_BLUE : s.other ? '#3a3a3a' : brandStyle(s.b).c); const colors = sd.series.map(col);
    const label = (i) => { const d = new Date(sd.now - (11 - i) * 7 * 864e5); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    return `<svg class="chart2" viewBox="0 0 ${W} ${H}" role="img" aria-label="News items per week by brand">
      ${yt.map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="al" x="${L - 10}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`).join('')}
      ${Array.from({ length: n }, (_, i) => { let acc = 0; return `<g>${sd.series.map((s, k) => { const v = s.v[i]; if (!v) return ''; const y0 = Y(acc), y = Y(acc + v); acc += v; return `<rect x="${(L + i * bw + 6).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 12).toFixed(1)}" height="${(y0 - y).toFixed(1)}" fill="${colors[k]}" stroke="#000" stroke-width="2" data-tip="${esc(s.b)}: ${v} item${v === 1 ? '' : 's'}, week of ${label(i)}"/>`; }).join('')}<text class="al" x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - B + 22}" text-anchor="middle">${label(i)}</text></g>`; }).join('')}
      <line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text class="at" x="${L}" y="${T - 8}">News items per week</text></svg>
      <div class="sov-legend">${sd.series.map((s, k) => { const t = s.v.reduce((a, c) => a + c, 0); return `<span><i style="background:${colors[k]}"></i>${esc(s.b)} <b>${t}</b> <small>${Math.round((t / sd.total) * 100)}%</small></span>`; }).join('')}</div>`;
  }
  /* ----- Head-to-head and the positioning summary (v3.11): the questions sales and product ask most ----- */
  const H2H = [
    { k: 'price', l: 'Price', get: (p) => priceOf(p).v, fmt: (d) => (d < 0 ? '−' : '+') + gbp(Math.abs(d)), u: 'cheaper' },
    { k: 'weightKg', l: 'Weight', get: (p) => p.weightKg, fmt: (d) => (d < 0 ? '−' : '+') + Math.abs(Math.round(d * 10) / 10) + ' kg', u: 'lighter' },
    { k: 'vol', l: 'Folded size', get: (p) => vol(p), fmt: (d) => (d < 0 ? '−' : '+') + Math.abs(Math.round(d)) + ' L', u: 'smaller folded' }
  ];
  const baseModel = () => prodById(S.cmp.us) || S.products.find((p) => isUs(p.brand)) || null;
  function positioning() {
    const b = baseModel(); if (!b) return '';
    const others = S.products.filter((p) => !isUs(p.brand)), pv = priceOf(b).v;
    const tile = (m) => { const bv = m.get(b); if (bv == null) return `<div class="metric"><span>${m.l}</span><strong>—</strong><small>No ${m.l.toLowerCase()} for ${esc(b.model)} yet</small></div>`;
      const w = others.filter((p) => m.get(p) != null), n = w.filter((p) => m.get(p) < bv).length;
      return `<div class="metric"><span>Competitor models ${m.u}</span><strong>${n}<small> of ${w.length}</small></strong><small>than ours at ${m.k === 'price' ? priceTxt(b) : m.k === 'vol' ? Math.round(bv) + ' L' : bv + ' kg'}${w.length < others.length ? ` · ${others.length - w.length} without a figure` : ''}</small></div>`; };
    const priced = S.products.filter((p) => priceOf(p).v != null).sort((x, y) => priceOf(x).v - priceOf(y).v), rank = priced.findIndex((p) => p.id === b.id);
    const near = pv == null ? [] : others.filter((p) => { const v = priceOf(p).v; return v != null && Math.abs(v - pv) <= pv * 0.15; });
    return `<div class="metrics pos-tiles">${H2H.map(tile).join('')}<div class="metric"><span>Price rivals (within ±15%)</span><strong>${near.length}</strong><small>${near.length ? esc(near.slice(0, 3).map(prodName).join(', ')) + (near.length > 3 ? '…' : '') : pv == null ? 'Add a price to ' + esc(b.model) : `${esc(b.model)} is ${rank >= 0 ? `#${rank + 1} cheapest of ${priced.length}` : 'unpriced'}`}</small></div></div>`;
  }
  function h2hView() {
    const b = baseModel(); if (!b) return '<div class="source-empty">Add one of our own models first (Product Comparison > Add model).</div>';
    const pv = priceOf(b).v, rows = S.products.filter((p) => p.id !== b.id && (!isUs(p.brand) || !isUs(b.brand)) && !S.chHide.has(p.brand) && H2H.some((m) => m.get(p) != null && m.get(b) != null));
    if (!rows.length) return `<div class="source-empty">No competitor model shares a spec with ${esc(b.model)} yet. Add prices, weights or folded sizes in Collect data.</div>`;
    rows.sort((x, y) => { const a = priceOf(x).v, c = priceOf(y).v; if (pv == null) return x.brand.localeCompare(y.brand); return (a == null) - (c == null) || Math.abs(a - pv) - Math.abs(c - pv); });
    const max = H2H.map((m) => Math.max(1e-9, ...rows.map((p) => (m.get(p) != null && m.get(b) != null ? Math.abs(m.get(p) - m.get(b)) : 0))));
    const cell = (m, i, p) => {
      const a = m.get(p), c = m.get(b); if (a == null || c == null) return '<div class="h2h-c none">—</div>';
      const d = a - c, w = Math.max(d ? 3 : 0, Math.abs(d) / max[i] * 50), them = d < 0, lab = Math.abs(d) < 1e-9 ? 'Same' : m.fmt(d);
      return `<div class="h2h-c" data-tip="${esc(prodName(p))}: ${esc(m.k === 'price' ? priceTxt(p) : m.k === 'vol' ? Math.round(a) + ' L' : a + ' kg')} against ${esc(m.k === 'price' ? priceTxt(b) : m.k === 'vol' ? Math.round(c) + ' L' : c + ' kg')} for ${esc(b.model)}. ${d ? (them ? 'Theirs is ' + m.u + '.' : 'Ours is ' + m.u + '.') : ''}"><div class="h2h-track"><i style="${them ? `right:50%;width:${w}%` : `left:50%;width:${w}%`};background:${them ? AHEAD_THEM : AHEAD_US}"></i></div><span class="${them ? 'them' : d ? 'us' : ''}">${lab}</span></div>`;
    };
    const wins = (p) => H2H.filter((m) => m.get(p) != null && m.get(b) != null && m.get(p) < m.get(b)).length;
    return `<div class="h2h"><div class="h2h-r h2h-head"><div>Competitor model</div>${H2H.map((m) => `<div>${m.l} vs ours</div>`).join('')}<div>Ahead of ours on</div></div>
      ${rows.map((p) => { const st = brandStyle(p.brand), w = wins(p), n = H2H.filter((m) => m.get(p) != null && m.get(b) != null).length; return `<div class="h2h-r${isUs(p.brand) ? ' is-us' : ''}" data-cmp="${esc(p.id)}"><div class="h2h-n"><i class="dotc" style="background:${st.c}"></i><span><b>${esc(p.brand)}</b> ${esc(p.model)}<small>${esc(priceTxt(p))}${p.weightKg ? ' · ' + p.weightKg + ' kg' : ''}</small></span></div>${H2H.map((m, i) => cell(m, i, p)).join('')}<div class="h2h-w"><span class="h2h-score ${w ? 'them' : 'us'}">${w} of ${n}</span></div></div>`; }).join('')}</div>
      <div class="sub h2h-foot"><span><i class="sw" style="background:${AHEAD_US}"></i>${esc(b.model)} is ahead</span><span><i class="sw" style="background:${AHEAD_THEM}"></i>The competitor is ahead</span><span>Select a row to add it to the Product Comparison.</span></div>`;
  }

  function insChart() {
    const D = chartData(), V = D.V, q = S.chFind.toLowerCase(), list = D.names.filter((b) => !q || b.toLowerCase().includes(q)), can = list.filter((b) => D.plotted.has(b)), cant = list.filter((b) => !D.plotted.has(b));
    const special = V.id === 'rank' || V.id === 'share' || V.id === 'h2h', usesPrice = V.id === 'ladder' || V.x === 'price' || V.log;
    const item = (b, ok) => { const on = !S.chHide.has(b), st = brandStyle(b); return `<button type="button" class="tgl${on && ok ? '' : ' off'}" data-tgl="${esc(b)}" aria-pressed="${on}"><span class="tn">${isUs(b) ? '<b class="pm-us">US</b> ' : ''}${esc(b)}${ok ? '' : `<small>${esc(D.why(b))}</small>`}</span><i class="dotc" style="${ok && on ? `background:${st.c}` : `border-color:${st.c}`}"></i></button>`; };
    const drawn = V.id === 'rank' ? S.products.filter((p) => { const g = (RANKS[S.rankBy] || RANKS.weightKg).get(p); return typeof g === 'number' && g > 0; }).length : V.id === 'share' ? shareData().total : V.id === 'h2h' ? (baseModel() ? S.products.filter((p) => p.id !== baseModel().id && (!isUs(p.brand) || !isUs(baseModel().brand))).length : 0) : D.all.length, of = V.id === 'share' ? 'news items in the last 12 weeks' : V.brand ? `of ${C.brands.length} brands` : `of ${S.products.length} models`;
    const body = V.id === 'ladder' ? ladderSvg(D) : V.id === 'h2h' ? h2hView() : V.id === 'rank' ? rankSvg(D) : V.id === 'share' ? shareSvg(D) : scatterSvg(D);
    const extra = V.id === 'rank' ? `<label class="cmp-bar">Rank by<select class="field" id="rankBy">${Object.keys(RANKS).map((k) => `<option value="${k}"${k === S.rankBy ? ' selected' : ''}>${RANKS[k].label}</option>`).join('')}</select></label>` : V.id === 'ladder' ? `<label class="cmp-bar">Order rows<select class="field" id="ladSort"><option value="cheap"${S.ladSort === 'cheap' ? ' selected' : ''}>Cheapest first</option><option value="dear"${S.ladSort === 'dear' ? ' selected' : ''}>Dearest first</option><option value="az"${S.ladSort === 'az' ? ' selected' : ''}>A to Z</option></select></label>` : '';
    const base = baseModel(), baseSel = S.products.length ? `<label class="cmp-bar">Measured against<select class="field" id="chBase">${S.products.slice().sort((a, c) => (isUs(c.brand) - isUs(a.brand)) || prodName(a).localeCompare(prodName(c))).map((p) => `<option value="${esc(p.id)}"${base && p.id === base.id ? ' selected' : ''}>${esc(prodName(p))}${isUs(p.brand) ? '' : ' (competitor)'}</option>`).join('')}</select></label>` : '';
    return `${base ? `<div class="pos-head"><div><h3>Where ${esc(base.model)} stands</h3><div class="sub">Against every competitor model we track. Change the model on the right; the Product Comparison and the rankings use the same one.</div></div>${baseSel}</div>${positioning()}` : ''}<div class="panel cx-panel"><div class="chart-head"><div><h3>${esc(V.label)}</h3><div class="sub">${V.id === 'share' ? `${drawn} ${of}.` : `${drawn} ${of} ${V.id === 'rank' ? 'can be ranked' : 'are drawn'}.`}</div></div>
        <div class="cx-ctl"><label class="cmp-bar">View<select class="field" id="chView">${VIEWS.map((v) => `<option value="${v.id}"${v.id === V.id ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>${extra}${usesPrice && V.id !== 'rank' ? `<div class="seg" role="group" aria-label="Scale"><button type="button" id="chLin" class="${S.cscale === 'lin' ? 'on' : ''}">Linear</button><button type="button" id="chLog" class="${S.cscale === 'log' ? 'on' : ''}">Log</button></div>` : ''}</div></div>
      ${gloss([['What it shows', V.what], ...(special ? [] : [['Dots', V.brand ? 'One brand each. Select a dot to open its profile.' : 'One model each. Select a dot to add it to the Product Comparison.']]), ...(usesPrice && V.id !== 'rank' ? [['Log scale', 'Each step to the right is a multiple, not a fixed amount, so small and large values both stay readable.']] : []), ...(D.anyConv && !special ? [['Hollow dot', V.brand ? 'A figure the brand states itself and we have not checked, or one worked out from it.' : 'Priced in € or $, so the £ price is converted.']] : [])])}
      ${D.anyConv && !V.brand && !special ? `<div class="fx">Rates used for € and $ prices (approximate, change if you like): €1 = £<input class="field" id="fxEUR" type="number" step="0.01" min="0.1" max="2" value="${S.fx.EUR}"> $1 = £<input class="field" id="fxUSD" type="number" step="0.01" min="0.1" max="2" value="${S.fx.USD}"></div>` : ''}
      <div class="cx"><div class="cx-main">${body}</div>
      <aside class="cx-side">${V.id === 'share' ? '<div class="cx-sh"><strong>How it is grouped</strong></div><div class="sub">Us, the competitors on your watchlist and the busiest others get their own colour; everyone else is the dark band. Change the watchlist under Overview > Manage watchlist.</div>' : `<div class="cx-sh"><strong>Brands</strong><span class="muted">${D.names.length}</span><button type="button" class="linkbtn" id="chReset" title="Show every brand">Reset</button></div><input class="field" id="chFind" placeholder="Find brands" value="${esc(S.chFind)}" aria-label="Find brands"><div class="cx-list">${can.length ? `<div class="cx-g">On this chart</div>${can.map((b) => item(b, true)).join('')}` : ''}${cant.length ? `<div class="cx-g">Missing data for this view</div>${cant.map((b) => item(b, false)).join('')}` : ''}${list.length ? '' : '<div class="muted">No brand matches.</div>'}</div>${cant.length ? '<button type="button" class="imagebtn" data-go="collect">Collect the missing data</button>' : ''}`}</aside></div></div>`;
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
      <div class="source-actions"><button type="button" class="primary" id="addModel">Add model</button><button type="button" class="imagebtn" id="loadStarter">Load researched data</button><button type="button" class="imagebtn" data-go="collect" title="Import specs from a spreadsheet, pasted text or an AI answer, or download a spreadsheet to fill in">Import / export data</button><button type="button" class="imagebtn" id="toggleWide" title="Use the whole width of the screen for the comparison">${S.wide ? 'Standard width' : 'Full width'}</button><input type="file" id="csvFile" accept=".csv,text/csv" hidden></div></div>
      <div class="panel ap-panel">${matrixTable()}</div>
      <div class="panel"><div class="chart-head"><div><h3>All models</h3><div class="sub">${S.products.length} saved. Select Export CSV to get a spreadsheet to fill in (brands with no models appear as empty rows), then Import CSV.</div></div><input class="field" id="mdlSearch" placeholder="Filter models" value="${esc(S.q)}"></div><div class="tbl-wrap" id="mdlBox">${modelsTable()}</div>
        <details class="gaps"><summary>Brands with no models yet (${noModels.length})</summary><div class="chips">${noModels.length ? noModels.map((b) => `<button type="button" class="chip gap-chip" data-add="${esc(b)}">${esc(b)}</button>`).join('') : '<em class="muted">None.</em>'}</div></details></div>`;
  }
  RENDER.matrix = renderMatrix;
  /* ----- model dialog, CSV ----- */
  const FDEF = [
    ['Overview', [['brand', 'Brand', 'select'], ['model', 'Model', 'text'], ['line', 'Product line (e.g. C Line)', 'text'], ['category', 'Category', 'cat'], ['priceGBP', 'Price (£, incl. VAT)', 'number'], ['priceEUR', 'Price (€), if not sold in the UK', 'number'], ['priceUSD', 'Price ($), if not sold in the UK', 'number'], ['priceNote', 'Price note', 'text'], ['colours', 'Colours', 'text'], ['handlebars', 'Handlebars', 'text'], ['launch', 'Launch (2025 or 2025-09)', 'text']]],
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
      try { const bj = await (await fetch('/starter-data/brand-data.json', { credentials: 'same-origin' })).json(), updates = {}; Object.keys(bj.brands || {}).forEach((k) => { if (C.brands.includes(k)) updates[k] = bj.brands[k]; }); nb = Object.keys(updates).length; if (nb) { const r = await api('POST', '/api/brands', { updates }); setBrandData(r); applyBrands(); } } catch (e) { /* models are saved; brand figures are optional */ }
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
      const products = rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (COLS.includes(h)) o[h] = (r[i] || '').trim(); }); return o; }).filter((o) => o.model).map((o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== '' || k === 'brand' || k === 'model')));
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
  const OFFERS_LIST = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike', 'Accessories', 'Spare parts'];
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
      <fieldset class="pm-sec"><legend>What this brand sells</legend><div class="offers">${OFFERS_LIST.map((o) => `<label class="chk"><input type="checkbox" class="pb-offer" value="${o}"> ${o}</label>`).join('')}</div></fieldset>
      <div class="source-form-grid"><label>P&amp;A products (parts and accessories on sale)<input class="field" id="pb-paSkus" type="number" step="1" min="0"></label><label>P&amp;A offering (e.g. luggage, lights, locks)<input class="field" id="pb-paCategories" maxlength="300"></label><label>Year the figures are for<input class="field" id="pb-figuresYear" maxlength="4" inputmode="numeric" placeholder="2024"></label></div>
      <label>Note on the figures<input class="field" id="pb-dataNote" maxlength="400"></label>
      <label>Sources (one link per line, https://)<textarea class="field" id="pb-sources" rows="3"></textarea></label>
      <label class="toggle-label"><input type="checkbox" id="pb-watch">Pin to the watchlist</label>
      <label class="toggle-label"><input type="checkbox" id="pb-isUs">This is our brand (“us”)<span class="muted" id="pb-usnote"></span></label>
      <div class="sf-res" id="pb-err" role="status"></div><div class="form-actions"><button type="button" class="imagebtn danger" id="pb-remove" hidden>Remove competitor…</button><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save profile</button></div></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    $('#pb-today').onclick = () => { $('#pb-lastVerified').value = today(); };
    $('#pmBrandForm').onsubmit = async (e) => {
      e.preventDefault(); const n = S.profile, v = (k) => $('#pb-' + k).value.trim(), f = {
        category: v('category'), threat: v('threat'), threatReason: v('threatReason'), positioning: v('positioning'), strengths: $('#pb-strengths').value, weaknesses: $('#pb-weaknesses').value,
        regions: Object.fromEntries(REG.map((k) => [k, v('reg-' + k)])), revenueGBPm: v('revenueGBPm'), offers: [...document.querySelectorAll('.pb-offer:checked')].map((x) => x.value).join(', '), units: v('units'), skuCount: v('skuCount'), paSkus: v('paSkus'), paCategories: v('paCategories'), figuresYear: v('figuresYear'), lastVerified: v('lastVerified'), dataNote: v('dataNote'), hq: v('hq'), founded: v('founded'), employees: v('employees'), ownership: v('ownership'), website: v('website'), sources: $('#pb-sources').value,
        watch: $('#pb-watch').checked
      };
      if (!isUs(n) && $('#pb-isUs').checked) f.isUs = true;
      try { const r = await api('POST', '/api/brands', { brand: n, fields: f }); setBrandData(r); applyBrands(); d.close(); toast('Profile saved'); refresh(); } catch (err) { $('#pb-err').textContent = err.message; $('#pb-err').className = 'sf-res bad'; }
    };
  }
  function openBrandDialog() {
    const n = S.profile, b = bm(n), r = regionsOf(n) || {};
    $('#pmBrandTitle').textContent = 'Edit ' + n; $('#pb-err').textContent = ''; $('#pb-err').className = 'sf-res';
    $('#pb-category').value = catOf(n); $('#pb-threat').value = b.threat || '';
    ['threatReason', 'positioning', 'strengths', 'weaknesses', 'dataNote', 'lastVerified', 'hq', 'founded', 'employees', 'ownership', 'website', 'paCategories', 'figuresYear'].forEach((k) => { $('#pb-' + k).value = b[k] || ''; });
    $('#pb-paSkus').value = b.paSkus == null ? '' : b.paSkus;
    document.querySelectorAll('.pb-offer').forEach((x) => { x.checked = (b.offers || '').split(',').map((y) => y.trim()).includes(x.value); });
    const rm = $('#pb-remove'); rm.dataset.name = n; rm.hidden = isUs(n);
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
    C.controls(); C.feed(); C.cards(); updatePhotoBtn(); updateRestore();
  }

  /* ---------- articles: archive / restore / delete ---------- */
  async function articleAct(action, ids) {
    try {
      const r = await api('POST', '/api/articles', { action, ids }), set = new Set(ids);
      if (action === 'delete') { for (let i = C.news.length - 1; i >= 0; i--) if (set.has(C.news[i].id)) C.news.splice(i, 1); }
      else C.news.forEach((n) => { if (set.has(n.id)) n.archived = action === 'archive'; });
      C.feed(); const a = ($('.view.active') || {}).id; if (a && a !== 'news' && RENDER[a]) RENDER[a]();
      toast(action === 'delete' ? `${r.count} deleted for good` : action === 'archive' ? `${r.count} archived. Choose "Show archived too" to see them again.` : `${r.count} restored`);
    } catch (e) { toast(e.message); }
  }
  function openClean() {
    const live = (window.CIHshown || []).filter((n) => n.live && n.id), arch = S.arch === 'only';
    let d = $('#pmClean');
    if (!d) { d = document.createElement('dialog'); d.id = 'pmClean'; document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); }); }
    d.innerHTML = `<div class="mh"><strong>Clean up articles</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb"><p><strong>${live.length}</strong> article${live.length === 1 ? '' : 's'} match the filters you have set (brand, search, dates, type, priority${arch ? ', archived only' : ''}).</p>
      <p class="sub"><b>Archive</b> hides them from the feed and the Insights numbers but keeps them, and the scanner will not add them again. <b>Delete</b> removes them for good (the scanner will not bring them back either).</p>
      <div class="form-actions">${arch ? `<button type="button" class="primary" data-clean="unarchive">Restore ${live.length}</button>` : `<button type="button" class="primary" data-clean="archive">Archive ${live.length}</button>`}<button type="button" class="imagebtn danger" data-clean="delete">Delete ${live.length} for good</button><button type="button" class="imagebtn" data-close>Cancel</button></div></div>`;
    d.querySelectorAll('[data-clean]').forEach((b) => { b.disabled = !live.length; b.onclick = async () => { const act = b.dataset.clean; if (act === 'delete' && !confirm(`Delete ${live.length} article${live.length === 1 ? '' : 's'} for good? This cannot be undone.`)) return; d.close(); await articleAct(act, live.map((n) => n.id)); }; });
    d.showModal();
  }

  /* ---------- picture editor: move, zoom, trim and crop a picture to the card frame before saving ---------- */
  const FRAME = { w: 720, h: 480 };   // 3:2, the shape pictures are saved in and shown in
  function editPicture(src, opts) {
    // src: a File, or a same-origin / data: URL string. opts: { title, onSave(dataUrl), onRemove? }
    let d = $('#pmPic');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'pmPic';
      d.innerHTML = `<div class="mh"><strong id="pe-title">Picture</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb">
        <div class="pe-stage"><canvas id="pe-cv" width="${FRAME.w}" height="${FRAME.h}" aria-label="Picture preview. Drag to move it."></canvas></div>
        <p class="sub" id="pe-help">This is exactly how it will look. Drag the picture to move it, scroll or use the slider to zoom.</p>
        <div class="pe-ctl"><label>Zoom<input type="range" id="pe-zoom" min="30" max="500" value="100"></label><span class="muted" id="pe-zv">100%</span></div>
        <div class="pe-btns"><button type="button" class="imagebtn" data-pe="fit">Fit whole picture</button><button type="button" class="imagebtn" data-pe="fill">Fill the frame</button><button type="button" class="imagebtn" data-pe="trim" title="Cuts away empty white space around the bike">Trim white space</button><button type="button" class="imagebtn" data-pe="center">Centre</button><label class="chk"><input type="checkbox" id="pe-guides" checked> Guides</label></div>
        <div class="pe-nudge"><button type="button" class="imagebtn" data-pe="up" aria-label="Move up">↑</button><button type="button" class="imagebtn" data-pe="left" aria-label="Move left">←</button><button type="button" class="imagebtn" data-pe="down" aria-label="Move down">↓</button><button type="button" class="imagebtn" data-pe="right" aria-label="Move right">→</button><span class="muted">or use the arrow keys</span></div>
        <div class="form-actions"><button type="button" class="imagebtn danger" id="pe-remove" hidden>Remove picture</button><button type="button" class="imagebtn" data-close>Cancel</button><button type="button" class="primary" id="pe-save">Save picture</button></div></div>`;
      document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    }
    const cv = $('#pe-cv', d), ctx = cv.getContext('2d'), img = new Image(), st = { s: 1, cx: FRAME.w / 2, cy: FRAME.h / 2, fit: 1 };
    $('#pe-title', d).textContent = opts.title || 'Picture'; $('#pe-remove', d).hidden = !opts.onRemove;
    const draw = (guides) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, FRAME.w, FRAME.h);
      if (img.naturalWidth) ctx.drawImage(img, st.cx - img.naturalWidth * st.s / 2, st.cy - img.naturalHeight * st.s / 2, img.naturalWidth * st.s, img.naturalHeight * st.s);
      if (guides) { ctx.strokeStyle = 'rgba(0,47,167,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); [[FRAME.w / 3, 0, FRAME.w / 3, FRAME.h], [FRAME.w * 2 / 3, 0, FRAME.w * 2 / 3, FRAME.h], [0, FRAME.h / 3, FRAME.w, FRAME.h / 3], [0, FRAME.h * 2 / 3, FRAME.w, FRAME.h * 2 / 3]].forEach(([a, b, c, e]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, e); ctx.stroke(); }); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,47,167,.8)'; ctx.beginPath(); ctx.moveTo(FRAME.w / 2 - 10, FRAME.h / 2); ctx.lineTo(FRAME.w / 2 + 10, FRAME.h / 2); ctx.moveTo(FRAME.w / 2, FRAME.h / 2 - 10); ctx.lineTo(FRAME.w / 2, FRAME.h / 2 + 10); ctx.stroke(); }
      $('#pe-zoom', d).value = Math.round((st.s / st.fit) * 100); $('#pe-zv', d).textContent = Math.round((st.s / st.fit) * 100) + '%';
    };
    const redraw = () => draw($('#pe-guides', d).checked);
    const fit = () => { st.fit = Math.min(FRAME.w / img.naturalWidth, FRAME.h / img.naturalHeight) * 0.94; st.s = st.fit; st.cx = FRAME.w / 2; st.cy = FRAME.h / 2; };
    const fill = () => { st.s = Math.max(FRAME.w / img.naturalWidth, FRAME.h / img.naturalHeight); st.cx = FRAME.w / 2; st.cy = FRAME.h / 2; };
    const trim = () => {   // find the box around everything that is not white or transparent, then fit that box in the frame
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k)), o = document.createElement('canvas'); o.width = w; o.height = h;
      const c = o.getContext('2d'); c.drawImage(img, 0, 0, w, h); const px = c.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (px[i + 3] > 24 && (px[i] < 242 || px[i + 1] < 242 || px[i + 2] < 242)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      if (x1 < 0) return toast('The picture looks blank, so there is nothing to trim');
      const bw = (x1 - x0 + 1) / k, bh = (y1 - y0 + 1) / k, mx = ((x0 + x1) / 2) / k, my = ((y0 + y1) / 2) / k;
      st.s = Math.min(FRAME.w / bw, FRAME.h / bh) * 0.9; st.cx = FRAME.w / 2 - (mx - img.naturalWidth / 2) * st.s; st.cy = FRAME.h / 2 - (my - img.naturalHeight / 2) * st.s;
    };
    const clamp = () => { st.s = Math.max(st.fit * 0.3, Math.min(st.fit * 5, st.s)); };
    img.onload = () => { fit(); redraw(); };
    img.onerror = () => { toast('That file is not a readable picture'); d.close(); };
    if (typeof src === 'string') img.src = src; else { const u = URL.createObjectURL(src); img.src = u; img.addEventListener('load', () => URL.revokeObjectURL(u), { once: true }); }
    // interaction
    let drag = null; const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * FRAME.w / r.width, y: (e.clientY - r.top) * FRAME.h / r.height }; };
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); const p = pos(e); drag = { x: p.x - st.cx, y: p.y - st.cy }; cv.style.cursor = 'grabbing'; };
    cv.onpointermove = (e) => { if (!drag) return; const p = pos(e); st.cx = p.x - drag.x; st.cy = p.y - drag.y; redraw(); };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; cv.style.cursor = 'grab'; };
    cv.onwheel = (e) => { e.preventDefault(); const p = pos(e), f = e.deltaY < 0 ? 1.06 : 1 / 1.06, s0 = st.s; st.s *= f; clamp(); const r = st.s / s0; st.cx = p.x - (p.x - st.cx) * r; st.cy = p.y - (p.y - st.cy) * r; redraw(); };
    $('#pe-zoom', d).oninput = (e) => { const s0 = st.s; st.s = st.fit * (+e.target.value) / 100; clamp(); const r = st.s / s0; st.cx = FRAME.w / 2 - (FRAME.w / 2 - st.cx) * r; st.cy = FRAME.h / 2 - (FRAME.h / 2 - st.cy) * r; redraw(); };
    $('#pe-guides', d).onchange = redraw;
    d.onkeydown = (e) => { const step = e.shiftKey ? 20 : 4, m = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key]; if (m && e.target.tagName !== 'INPUT') { e.preventDefault(); st.cx += m[0]; st.cy += m[1]; redraw(); } };
    d.querySelectorAll('[data-pe]').forEach((b) => { b.onclick = () => { const a = b.dataset.pe; if (!img.naturalWidth) return; if (a === 'fit') fit(); else if (a === 'fill') fill(); else if (a === 'trim') trim(); else if (a === 'center') { st.cx = FRAME.w / 2; st.cy = FRAME.h / 2; } else { const q = { up: [0, -10], down: [0, 10], left: [-10, 0], right: [10, 0] }[a]; st.cx += q[0]; st.cy += q[1]; } redraw(); }; });
    $('#pe-save', d).onclick = async () => {
      draw(false); let q = 0.9, out = cv.toDataURL('image/jpeg', q); while (out.length > 420000 && q > 0.5) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      const btn = $('#pe-save', d); btn.disabled = true; btn.textContent = 'Saving…';
      try { await opts.onSave(out); d.close(); } catch (e) { toast('Could not save the picture: ' + e.message); redraw(); } finally { btn.disabled = false; btn.textContent = 'Save picture'; }
    };
    $('#pe-remove', d).onclick = async () => { if (!opts.onRemove) return; if (!confirm('Remove this picture and go back to the default one?')) return; try { await opts.onRemove(); d.close(); } catch (e) { toast(e.message); } };
    d.showModal(); cv.style.cursor = 'grab';
  }
  const canAdjust = (url) => /^(data:image|\/api\/brand-photos)/.test(url || '');
  async function saveModelPicture(id, dataUrl) {
    const r = await api('POST', '/api/brand-photos', { modelId: id, imageData: dataUrl });
    S.products = S.products.map((p) => (p.id === id ? Object.assign({}, p, r.product) : p)); refresh();
    toast('Picture saved for this model');
  }
  function pickModelPicture(id) { S.mpic = id; $('#mpicFile').click(); }
  async function removeModelPicture(id) { await api('DELETE', '/api/brand-photos?model=' + encodeURIComponent(id)); S.products = S.products.map((p) => (p.id === id ? (({ photo, photoSource, ...r }) => r)(p) : p)); refresh(); toast('Picture removed'); }
  const modelPic = (p) => (p.photo && p.photoSource === 'uploaded' ? p.photo : '');

  // What the tracker holds today for a brand, by the field names the Collect page uses.
  function brandNow(n) {
    const b = bm(n), r = regionsOf(n) || {};
    return { units: unitsOf(n), revenueGBPm: revenueOf(n), skuCount: skuOf(n), paSkus: b.paSkus, paCategories: b.paCategories, offers: b.offers, figuresYear: b.figuresYear, hq: b.hq, founded: b.founded, employees: b.employees, ownership: b.ownership, website: b.website, positioning: b.positioning, dataNote: b.dataNote, na: b.na || [], sourcesList: b.sources || [], regionUS: (r.US || []).join(', '), regionEMEA: (r.EMEA || []).join(', '), regionAPAC: (r.APAC || []).join(', '), regionCHINA: (r.CHINA || []).join(', '), regionsObj: { US: (r.US || []).join(', '), EMEA: (r.EMEA || []).join(', '), APAC: (r.APAC || []).join(', '), CHINA: (r.CHINA || []).join(', ') } };
  }
  /* ---------- the list of competitors: built-in ones can be hidden, you can add your own ---------- */
  const BASE_BRANDS = C.brands.slice(), BASE_MODELS = Object.fromEntries(C.models.map((m) => [m.name, Object.assign({}, m)]));
  function syncBrands() {
    const custom = Object.keys(S.brands).filter((n) => S.brands[n].custom && !BASE_BRANDS.includes(n)).sort((a, b) => a.localeCompare(b));
    const want = [...BASE_BRANDS.filter((b) => !S.removed.includes(b)), ...custom.filter((n) => !S.removed.includes(n))];
    const first = (n) => { const p = S.products.find((x) => x.brand === n); return p ? p.model : ''; };
    C.brands.splice(0, C.brands.length, ...want);
    C.models.splice(0, C.models.length, ...want.map((n) => BASE_MODELS[n] ? Object.assign({}, BASE_MODELS[n]) : { name: n, model: first(n) || 'No model added yet', category: (S.brands[n] || {}).category || 'E-bike', reviewed: true }));
    const mb = $('#mb'); if (mb) mb.textContent = C.brands.length;
  }
  function setBrandData(d) { S.brands = d.brands || {}; S.removed = d.removed || []; if (C.models.length) syncBrands(); }
  function addCompDialog() {
    const d = document.createElement('dialog'); d.id = 'pmAddComp';
    d.innerHTML = `<form id="pmAddCompForm"><div class="mh"><strong>Add a competitor</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form">
      <div class="source-form-grid"><label>Name<input class="field" id="ac-name" required maxlength="80" placeholder="e.g. Brompton rival"></label><label>Category<select class="field" id="ac-cat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></label></div>
      <label>Website (optional)<input class="field" id="ac-site" type="url" placeholder="https://"></label>
      <div class="source-form-grid"><label>First model (optional)<input class="field" id="ac-model" maxlength="120" placeholder="e.g. Folder 20"></label><label>Product line (optional)<input class="field" id="ac-line" maxlength="60" placeholder="e.g. Urban"></label></div>
      <label class="chk"><input type="checkbox" id="ac-src" checked> Start watching the news: add a Google News search${'' } and, if there is a website, its news page</label>
      <div class="sf-res" id="ac-err" role="status"></div><div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Add competitor</button></div></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); });
    $('#pmAddCompForm').onsubmit = async (e) => {
      e.preventDefault(); const name = $('#ac-name').value.trim().replace(/\s+/g, ' '), err = $('#ac-err');
      if (C.brands.some((b) => b.toLowerCase() === name.toLowerCase())) { err.textContent = `${name} is already on your list.`; err.className = 'sf-res bad'; return; }
      try {
        const r = await api('POST', '/api/brands', { addCompetitor: { name, category: $('#ac-cat').value, website: $('#ac-site').value.trim(), createSources: $('#ac-src').checked } });
        const model = $('#ac-model').value.trim();
        if (model) { const pr = await api('POST', '/api/products', { product: { brand: name, model, line: $('#ac-line').value.trim(), category: $('#ac-cat').value } }); S.products = pr.products; }
        setBrandData(r); applyBrands(); d.close(); $('#pmAddCompForm').reset(); go('competitors'); toast(`${name} added${r.sourcesAdded ? ` with ${r.sourcesAdded} news source${r.sourcesAdded === 1 ? '' : 's'}` : ''}`);
      } catch (x) { err.textContent = x.message; err.className = 'sf-res bad'; }
    };
  }
  async function openRemoveBrand(name) {
    let d = $('#pmRemComp'); if (!d) { d = document.createElement('dialog'); d.id = 'pmRemComp'; document.body.appendChild(d); d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) d.close(); }); }
    const models = S.products.filter((p) => p.brand === name).length, arts = C.news.filter((n) => n.brand === name && n.live).length, custom = !!(S.brands[name] || {}).custom;
    let srcN = 0; try { srcN = ((await api('GET', '/api/sources')).sources || []).filter((x) => x.brand === name).length; } catch (e) { /* count is only for the label */ }
    const opt = (nm, v, label, on) => `<label class="sd-opt"><input type="radio" name="${nm}" value="${v}"${on ? ' checked' : ''}> <span>${label}</span></label>`;
    d.innerHTML = `<div class="mh"><strong>Remove ${esc(name)}</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb">
      <p class="sub">${custom ? 'This is a competitor you added, so it is deleted.' : 'This is one of the built-in competitors, so it is hidden everywhere. You can bring it back with “Restore removed” on the Competitors page.'}</p>
      <h4>News sources (${srcN})</h4><div class="sd-opts">${opt('rb-src', 'delete', 'Remove its news sources', true)}${opt('rb-src', 'keep', 'Keep scanning them', false)}</div>
      <h4>Articles already collected (${arts})</h4><div class="sd-opts">${opt('rb-art', 'archive', 'Archive them: hidden, kept', true)}${opt('rb-art', 'delete', 'Delete them for good', false)}${opt('rb-art', 'keep', 'Leave them as they are', false)}</div>
      <h4>Models in the Product Comparison (${models})</h4><div class="sd-opts">${opt('rb-mod', 'delete', 'Delete the models', true)}${opt('rb-mod', 'keep', 'Keep them', false)}</div>
      <div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button type="button" class="primary danger-go" id="rb-go">Remove ${esc(name)}</button></div></div>`;
    $('#rb-go', d).onclick = async () => {
      const v = (n) => (d.querySelector(`input[name=${n}]:checked`) || {}).value || 'keep';
      if (v('rb-art') === 'delete' && arts && !confirm(`Delete ${arts} article${arts === 1 ? '' : 's'} for good?`)) return;
      try {
        const r = await api('DELETE', `/api/brands?name=${encodeURIComponent(name)}&sources=${v('rb-src')}&articles=${v('rb-art')}&models=${v('rb-mod')}`);
        setBrandData(r); S.products = (await api('GET', '/api/products')).products || []; S.cmp.others = S.cmp.others.filter((id) => S.products.some((p) => p.id === id)); fixCmp();
        if (C.loadLive) await C.loadLive(); applyBrands(); d.close(); ['#pmBrand', '#pmProfile', '#dialog'].forEach((id) => { const dl = $(id); if (dl && dl.open) dl.close(); });
        go('competitors'); toast(`${name} removed`);
      } catch (x) { toast(x.message); }
    };
    d.showModal();
  }
  async function restoreBrands() { try { const r = await api('POST', '/api/brands', { restoreBrands: true }); setBrandData(r); applyBrands(); toast(`${r.restored} competitor${r.restored === 1 ? '' : 's'} restored`); updateRestore(); } catch (e) { toast(e.message); } }
  function updateRestore() { const b = $('#restoreBrands'); if (b) { b.hidden = !S.removed.length; b.textContent = `Restore removed (${S.removed.length})`; } }

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
  const BCOLS = ['brand', 'category', 'threat', 'threatReason', 'watch', 'hq', 'founded', 'employees', 'ownership', 'website', 'positioning', 'strengths', 'weaknesses', 'regionUS', 'regionEMEA', 'regionAPAC', 'regionCHINA', 'revenueGBPm', 'units', 'skuCount', 'paSkus', 'paCategories', 'offers', 'figuresYear', 'lastVerified', 'dataNote', 'sources'];
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
      ['category', 'threat', 'threatReason', 'hq', 'founded', 'employees', 'ownership', 'website', 'positioning', 'revenueGBPm', 'units', 'skuCount', 'paSkus', 'paCategories', 'offers', 'figuresYear', 'lastVerified', 'dataNote'].forEach((k) => { if (g(k) !== '') f[k] = g(k); });
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
      const r = await api('POST', '/api/brands', { updates }); setBrandData(r); applyBrands(); toast(`Imported ${names.length} brand${names.length === 1 ? '' : 's'}`); refresh();
    } catch (err) { toast('Import failed: ' + err.message); }
  }
  function addCompetitorTools() {
    const sec = $('#competitors'); if (!sec || $('#fetchPhotos')) return;
    const head = sec.querySelector('.head'); (head || sec).insertAdjacentHTML(head ? 'afterend' : 'afterbegin', '<div class="pm-tools"><button type="button" class="primary" id="addComp">Add competitor</button><button type="button" class="imagebtn" id="fetchPhotos">Fetch missing photos</button><button type="button" class="imagebtn" data-go="collect">Collect data</button><button type="button" class="imagebtn" id="restoreBrands" hidden>Restore removed</button><input type="file" id="brandFile" accept=".json,.csv,application/json,text/csv" hidden><span class="sub" id="photoMsg"></span></div>');
  }

  /* ---------- map hover panel ---------- */
  function showTip(el, ev) {
    const wrap = $('#mkWrap'), tip = $('#mkTip'), info = S.mkInfo && S.mkInfo[el.dataset.ctry]; if (!wrap || !tip || !info) return;
    const us = usName(), list = info.brands;
    tip.innerHTML = `<div class="tip-h"><strong>${esc(info.n)}</strong><span class="${info.ours ? 'us-pill' : 'tip-no'}">${info.ours ? 'We sell here' : 'We are absent'}</span></div>
      <div class="tip-s">${list.length ? `${list.length} competitor${list.length === 1 ? '' : 's'} sell${list.length === 1 ? 's' : ''} here` : 'No competitor listed here'}</div>
      ${list.length ? `<ul>${list.slice().sort((a, b) => (!!bm(b).watch - !!bm(a).watch) || a.localeCompare(b)).slice(0, 14).map((b) => `<li class="${bm(b).watch ? 'w' : ''}">${esc(b)}${bm(b).watch ? ' <span class="tip-w">★</span>' : ''}</li>`).join('')}</ul>${list.length > 14 ? `<div class="tip-s">and ${list.length - 14} more</div>` : ''}` : ''}`;
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, x = ev.clientX - wr.left, y = ev.clientY - wr.top, gap = 18;
    // next to the pointer: to the right when there is room, otherwise to the left (and the other way round); never outside the map window
    let left = x + gap + tw <= wr.width - 6 ? x + gap : x - gap - tw;
    left = Math.max(6, Math.min(left, wr.width - tw - 6));
    const top = Math.max(6, Math.min(y - 20, wr.height - th - 6));
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  const hideTip = () => { const t = $('#mkTip'); if (t) t.hidden = true; };

  /* ---------- chart hover tooltip (v3.11): one small panel that follows the pointer, instead of the browser's slow title tooltips ---------- */
  function vizTip(el, ev) {
    let tip = $('#vizTip'); if (!tip) { tip = document.createElement('div'); tip.id = 'vizTip'; tip.className = 'viz-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    if (!el) { tip.classList.remove('on'); return; }
    if (tip.dataset.src !== el.dataset.tip) { tip.textContent = el.dataset.tip; tip.dataset.src = el.dataset.tip; }
    tip.classList.add('on');
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, gap = 14;
    let x = ev.clientX + gap; if (x + w > vw - 8) x = ev.clientX - gap - w;
    let y = ev.clientY - h - gap; if (y < 8) y = ev.clientY + gap;
    tip.style.transform = `translate(${Math.max(8, x)}px,${y}px)`;
  }

  /* ---------- events wiring ---------- */
  function wire() {
    document.addEventListener('mousemove', (e) => { const c = e.target.closest && e.target.closest('[data-tip]'); vizTip(c, e); }, { passive: true });
    document.addEventListener('scroll', () => vizTip(null), { passive: true });
    document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('howto')) { S.howOpen = e.target.open; sv('cih_pm_howto', S.howOpen); } }, true);
    document.addEventListener('mouseover', (e) => { const c = e.target.closest && e.target.closest('#mkWrap [data-ctry]'); if (c) showTip(c, e); });
    document.addEventListener('mouseout', (e) => { const c = e.target.closest && e.target.closest('#mkWrap [data-ctry]'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) hideTip(); });
    document.addEventListener('click', async (e) => {
      const t = e.target;
      const open = t.closest('[data-open]'); if (open && !t.closest('a')) { openProfile(open.dataset.open); return; }
      const nb = t.closest('[data-nb]'); if (nb) return openNews(nb.dataset.nb, nb.dataset.nt);
      const arc = t.closest('[data-arch]'); if (arc) return articleAct(arc.dataset.arch, [arc.dataset.aid]);
      const adl = t.closest('[data-adel]'); if (adl) { if (!confirm('Delete this article for good? It will not come back when sources are scanned again.')) return; return articleAct('delete', [adl.dataset.adel]); }
      if (t.id === 'cleanBtn') return openClean();
      if (t.id === 'dupToggle') { S.showDups = !S.showDups; return C.feed(); }
      const nd = t.closest('[data-notdup]'); if (nd) { try { await api('POST', '/api/news', { id: nd.dataset.notdup, notDuplicate: true }); toast('Kept as its own story'); await C.loadLive(); } catch (err) { toast(err.message); } return; }
      const mpc = t.closest('[data-mpic]'); if (mpc) { const id = mpc.dataset.mpic, p = prodById(id), cur = p && modelPic(p); if (cur && canAdjust(cur) && confirm('Adjust the current picture?\n\nOK = adjust it, Cancel = choose a new file instead.')) return editPicture(cur, { title: `Picture: ${prodName(p)}`, onSave: (u) => saveModelPicture(id, u), onRemove: () => removeModelPicture(id) }); return pickModelPicture(id); }
      if (t.id === 'addComp') { if (!$('#pmAddComp')) addCompDialog(); $('#pmAddComp').showModal(); $('#ac-name').focus(); return; }
      if (t.id === 'restoreBrands') return restoreBrands();
      if (t.id === 'pb-remove') return openRemoveBrand(t.dataset.name);
      const w = t.closest('#pmWin button'); if (w) { S.win = +w.dataset.w; return renderInsights(); }
      const mz = t.closest('[data-mkzoom]'); if (mz) { S.mkZoom = mz.dataset.mkzoom; return renderInsights(); }
      const mm = t.closest('[data-mkmode]'); if (mm) { S.mkMode = mm.dataset.mkmode; sv('cih_pm_mkmode', S.mkMode); return renderInsights(); }
      const it = t.closest('[data-itab]'); if (it) { S.insTab = it.dataset.itab; return renderInsights(); }
      const ps = t.closest('[data-psort]'); if (ps) { const k = ps.dataset.psort; S.pfSort = { k, d: S.pfSort.k === k ? -S.pfSort.d : (k === 'b' ? 1 : -1) }; return renderInsights(); }
      const gt = t.closest('[data-go]'); if (gt) { if (gt.dataset.itabGo) S.insTab = gt.dataset.itabGo; return go(gt.dataset.go); }
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
      if (t.id === 'rankBy') { S.rankBy = t.value; return renderInsights(); }
      if (t.id === 'chBase') { S.cmp.us = t.value; S.cmp.others = S.cmp.others.filter((x) => x !== t.value); fixCmp(); return renderInsights(); }
      if (t.id === 'ladSort') { S.ladSort = t.value; return renderInsights(); }
      if (t.id === 'mkSel') { S.mkSel = t.value; S.mkC = ''; return renderInsights(); }
      if (t.id === 'mkAbsent') { S.mkAbsent = t.checked; return renderInsights(); }
      if (t.id === 'fxEUR' || t.id === 'fxUSD') { const v = parseFloat(t.value); if (v > 0.1 && v < 2) { S.fx[t.id === 'fxEUR' ? 'EUR' : 'USD'] = v; sv('cih_pm_fx', S.fx); } return renderInsights(); }
      if (t.id === 'brandFile') { if (t.files[0]) await importBrands(t.files[0]); t.value = ''; return; }
      if (t.id === 'csvFile') { if (t.files[0]) await importCsv(t.files[0]); t.value = ''; return; }
      if (t.id === 'evtType') { C.evtSel = t.value; return C.feed(); }
      if (t.id === 'archSel') { S.arch = t.value; return C.feed(); }
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
      if (Object.keys(updates).length) { try { const r = await api('POST', '/api/brands', { updates }); setBrandData(r); applyBrands(); toast('Watchlist saved'); } catch (err) { return toast(err.message); } }
      $('#pmWatchDlg').close(); refresh();
    };
    $('#pmWatchDlg').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#pmWatchDlg').close(); });
  }

  /* ---------- start ---------- */
  Object.assign(C, { editPicture, canAdjust, picUp: (n) => bm(n).photoSource === 'uploaded', prio, passNews, photo: (n) => bm(n).photo || '', pic: (n) => (bm(n).photoSource === 'uploaded' && bm(n).photo) || C.images[n] || bm(n).photo || '', setPhoto: (b, photo, src) => { S.brands[b] = Object.assign({}, bm(b), { photo, photoSource: src }); }, isUs, badges, evtChip, dupLine, dupMeta, passEvt: (n) => !C.evtSel || evtOf(n) === C.evtSel, evtSel: '', openProfile, renderInsights, onNews: () => {
    // The feed reloads every minute. Only redraw Insights when the news actually changed, so the page does not jump, lose focus or close panels for nothing.
    const a = ($('.view.active') || {}).id, sig = C.news.length + '|' + (C.news[0] || {}).date + '|' + C.news.filter((n) => n.archived || n.dupOf).length;
    if (a === 'insights' && sig !== S.newsSig) { const y = window.scrollY; RENDER[a](); window.scrollTo(0, y); } S.newsSig = sig;
  } });
  mkView('matrix', ''); mkView('profile', '');
  mkNav('matrix', 'Product Comparison', 'competitors');
  const side = $('.side'); ['sources', 'competitors', 'matrix', 'social', 'insights', 'news'].forEach((v) => side.insertBefore(side.querySelector(`.nav[data-v="${v}"]`), side.firstChild)); // News, Insights, Social, Matrix, Competitors, Sources
  const evtSelect = document.createElement('select'); evtSelect.className = 'field'; evtSelect.id = 'evtType'; evtSelect.setAttribute('aria-label', 'Event type');
  evtSelect.innerHTML = '<option value="">All event types</option>' + E.EVENT_TYPES.map((t) => `<option>${t}</option>`).join(''); $('#news .tools').appendChild(evtSelect);
  const archSel = document.createElement('select'); archSel.className = 'field'; archSel.id = 'archSel'; archSel.setAttribute('aria-label', 'Archived articles'); archSel.innerHTML = '<option value="hide">Hide archived</option><option value="show">Show archived too</option><option value="only">Only archived</option>'; $('#news .tools').appendChild(archSel);
  const cleanBtn = document.createElement('button'); cleanBtn.type = 'button'; cleanBtn.className = 'imagebtn'; cleanBtn.id = 'cleanBtn'; cleanBtn.textContent = 'Clean up…'; cleanBtn.title = 'Archive or delete the articles that match the filters you have set'; $('#news .tools').appendChild(cleanBtn);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="pmWatchDlg"><form id="pmWatchForm"><div class="mh"><strong>Manage watchlist</strong><button type="button" data-close aria-label="Close">×</button></div><div class="mb source-form"><div class="sub">Pin the 5 to 8 competitors that matter most. Set a threat level on each profile.</div><div class="checks" id="pmWatchList"></div><div class="form-actions"><button type="button" class="imagebtn" data-close>Cancel</button><button class="primary">Save watchlist</button></div></div></form></dialog>`);
  document.body.insertAdjacentHTML('beforeend', '<input type="file" id="mpicFile" accept="image/png,image/jpeg,image/webp" hidden>');
  $('#mpicFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; const p = prodById(S.mpic); if (!f || !p) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 12e6) return toast('Choose a PNG, JPEG or WebP picture under 12 MB'); editPicture(f, { title: `Picture: ${prodName(p)}`, onSave: (u) => saveModelPicture(p.id, u), onRemove: modelPic(p) ? () => removeModelPicture(p.id) : null }); };
  window.CIPM = { S, api, RENDER, mkView, mkNav, go, C, usName, openModel, brandNow, setBrandData, applyBrands, exportBrandsCsv, exportCsv };
  modelDialog(); brandDialog(); addCompetitorTools(); wire();
  S.cmp = Object.assign({ us: '', others: [] }, ld('cih_pm_cmp', {})); S.wide = ld('cih_pm_wide', true); S.fx = Object.assign({}, FX_DEFAULT, ld('cih_pm_fx', {})); S.mkMode = ld('cih_pm_mkmode', 'count') === 'gap' ? 'gap' : 'count'; S.howOpen = !!ld('cih_pm_howto', false);
  (async () => {
    try { const [b, p] = await Promise.all([api('GET', '/api/brands'), api('GET', '/api/products')]); setBrandData(b); S.products = p.products || []; }
    catch (err) { toast('Could not load saved profiles and models: ' + err.message); }
    applyBrands(); const h = (location.hash || '').slice(1); go(['news', 'insights', 'social', 'matrix', 'competitors', 'sources'].includes(h) ? h : 'news');
  })();
})();
