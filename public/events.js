/* Shared logic for the tracker: event tagging, momentum, region detection and the weekly digest.
   One file, loaded by the browser (window.CIEvents) and imported by the server routes, so the
   dashboard and the emailed/Slack digest always agree. Pure functions only: no DOM, no network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CIEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EVENT_TYPES = ['Launch', 'Price change', 'Partnership / distribution', 'Funding / financial', 'Recall', 'Market entry', 'Other'];
  const IMPORTANCE = { 'Recall': 6, 'Price change': 5, 'Funding / financial': 4, 'Market entry': 4, 'Launch': 3, 'Partnership / distribution': 3, 'Other': 1 };

  // Order matters: the first rule that matches wins. The title is tried first, then the summary.
  const RULES = [
    ['Recall', /\brecalls?(ed)?\b|\bsafety (notice|warning|alert|issue)s?\b|\bstop[- ]use\b|\bfire (risk|hazard)\b/i],
    ['Price change', /\bprice (cuts?|drops?|rises?|hikes?|increases?|decreases?|reductions?|changes?|adjustments?|war)\b|\bprices? (cut|drop|rise|up|down|increase|fall)s?\b|\b(cuts?|slashes|lowers?|raises|hikes|increases) (its |their |the )?prices?\b|\bdiscount(s|ed)?\b|\bon sale\b|\bsale (starts?|ends?|event)\b|\bblack friday\b|\bcyber monday\b|\bnew price\b|\bnow (costs|from [£$€])/i],
    ['Funding / financial', /\b(funding|fundrais\w+|invest(s|ed|ment|ments|or|ors)?|series [a-e]|seed round|acqui(res?|red|sition|sitions)|merger|merges|buyout|takeover|bankrupt\w*|insolven\w*|enters? administration|liquidat\w+|receivership|restructur\w+|ipo|valuation|revenues?|profits?|turnover|annual results|financial results|earnings|stake)\b|\braise[sd]? (?:an? )?(?:[a-z]{2,4}\s?)?[£$€]?\s?\d/i],
    ['Market entry', /\b(enters?|entering|entered) (the )?[\w\- ]{0,20}(market|region|country)\b|\bexpan(ds|ding|sion|ded)\b|\b(launch(es|ed)?|arrives?|arrived|debuts?|lands?|opens?|now available|available) (in|across|to) (the )?(uk|u\.k\.|us|u\.s\.|usa|united states|america|canada|europe\w*|germany|france|netherlands|belgium|spain|italy|japan|china|australia|singapore|korea|india|asia|middle east|nordics?|scandinavia|apac|emea)\b|\b(uk|us|usa|european|german|french|china|chinese|japan\w*|australia\w*|asia\w*) (launch|expansion|entry|arrival|debut)\b|\bnew (market|markets|flagship|showroom|subsidiary)\b|\bopens? (a |its |new )?(first )?(\w+ ){0,2}(store|flagship|showroom|office|subsidiary|hq|headquarters)\b/i],
    ['Partnership / distribution', /\b(partner(s|ed|ing|ship|ships)?|collaborat\w+|teams? up|tie[- ]?ups?|distribut\w+|wholesale|b2b|dealers?|stockists?|retail(er)? (network|partner)|supply (deal|agreement)|licen[cs]\w+|agreement|joint venture)\b/i],
    ['Launch', /\b(launch\w*|unveil\w*|introduc\w+|reveal\w*|debut\w*|new (model|models|bike|bikes|e-?bikes?|range|series|edition|colou?rs?|version|generation|folding|cargo)|all-new|first look|pre-?order\w*|available now|release[sd]?|presents?|announces? (the )?(new|its)|kickstarter|crowdfund\w*)\b/i]
  ];

  function classify(title, summary) {
    for (const text of [title, summary]) {
      const t = String(text || '');
      if (!t) continue;
      for (const [type, re] of RULES) if (re.test(t)) return type;
    }
    return 'Other';
  }

  const REGION_WORDS = {
    US: /\b(us|u\.s\.|usa|united states|america\w*|canada|canadian)\b/i,
    EMEA: /\b(uk|u\.k\.|united kingdom|britain|british|england|europe\w*|eu|germany|german|france|french|netherlands|dutch|belgium|belgian|spain|spanish|italy|italian|nordics?|scandinavia\w*|middle east|uae|africa\w*)\b/i,
    APAC: /\b(apac|asia\w*|japan\w*|singapore\w*|australia\w*|korea\w*|taiwan\w*|india\w*|new zealand)\b/i,
    CHINA: /\b(china|chinese|hong kong)\b/i
  };
  function detectRegions(text) {
    const t = String(text || '');
    return Object.keys(REGION_WORDS).filter((k) => REGION_WORDS[k].test(t));
  }

  const DAY = 864e5;
  const toDay = (s) => Date.parse(String(s || '').slice(0, 10) + 'T00:00:00Z');
  const dayStart = (now) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  // Whole days between the item date and today (0 = today, negative = dated in the future, NaN = no valid date).
  function ageDays(item, now) { const t = toDay(item.date); return isNaN(t) ? NaN : Math.round((dayStart(now) - t) / DAY); }

  // Activity in the last `days` days against the `days` before that, plus weekly counts for a sparkline.
  function momentum(items, brands, now, days, weeks) {
    days = days || 30; weeks = weeks || 12;
    const set = new Set(brands), by = {};
    brands.forEach((b) => { by[b] = { brand: b, cur: 0, prev: 0, spark: new Array(weeks).fill(0) }; });
    for (const it of items) {
      const r = by[it.brand]; if (!r || !set.has(it.brand)) continue;
      const a = ageDays(it, now); if (isNaN(a) || a < 0) continue;
      if (a < days) r.cur++; else if (a < days * 2) r.prev++;
      const w = Math.floor(a / 7); if (w < weeks) r.spark[weeks - 1 - w]++;
    }
    return brands.map((b) => {
      const r = by[b]; r.delta = r.cur - r.prev;
      r.label = r.cur === 0 && r.prev === 0 ? 'No activity'
        : r.prev === 0 ? 'New activity'
        : r.cur >= r.prev * 1.5 && r.delta >= 2 ? 'Accelerating'
        : r.cur <= r.prev * 0.5 && -r.delta >= 2 ? 'Slowing' : 'Steady';
      return r;
    });
  }

  // brand -> event type -> count, for the last `days` days.
  function countsByType(items, brands, now, days, evtOf) {
    const out = {}, set = new Set(brands);
    for (const it of items) {
      if (!set.has(it.brand)) continue;
      const a = ageDays(it, now); if (isNaN(a) || a < 0 || a >= days) continue;
      const b = out[it.brand] || (out[it.brand] = { total: 0 }), t = evtOf(it);
      b[t] = (b[t] || 0) + 1; b.total++;
    }
    return out;
  }

  const fmtDate = (s) => { const t = toDay(s); return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

  // meta: { us, watch:[brand], threat:{brand:{level,reason}}, brands:[tracked brands] }
  function buildDigest(items, meta, now, days) {
    days = days || 7;
    const brands = meta.brands || [...new Set(items.map((i) => i.brand))];
    const set = new Set(brands), watch = new Set(meta.watch || []), us = meta.us || '';
    const tagged = items.filter((i) => set.has(i.brand)).map((i) => ({ ...i, evt: i.evt || classify(i.title, i.summary) }));
    const win = tagged.filter((i) => { const a = ageDays(i, now); return a >= 0 && a < days; });
    const prevTotal = tagged.filter((i) => { const a = ageDays(i, now); return a >= days && a < days * 2; }).length;
    const rank = (i) => (i.brand === us ? 3 : 0) + (watch.has(i.brand) ? 2 : 0) + (IMPORTANCE[i.evt] || 1) / 10;
    const top = win.slice().sort((a, b) => rank(b) - rank(a) || String(b.date).localeCompare(a.date));
    const byType = {};
    win.forEach((i) => { byType[i.evt] = (byType[i.evt] || 0) + 1; });
    const movers = momentum(tagged, brands, now, 30).filter((m) => (m.label === 'Accelerating' || m.label === 'New activity') && m.cur >= 2).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const watchCounts = [...watch].filter((b) => set.has(b)).map((b) => ({ brand: b, n: win.filter((i) => i.brand === b).length, level: (meta.threat && meta.threat[b] && meta.threat[b].level) || '' })).sort((a, b) => b.n - a.n);
    return {
      generatedAt: new Date(now).toISOString(), days, total: win.length, prevTotal,
      brandCount: new Set(win.map((i) => i.brand)).size, byType, top: top.slice(0, 12), movers, watchCounts,
      us, usItems: win.filter((i) => i.brand === us).length
    };
  }

  const dateLine = (d, now) => 'week to ' + new Date(now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  function digestText(d, now, mode) {
    const slack = mode === 'slack', b = (s) => (slack ? `*${s}*` : s), link = (i) => (i.url && /^https?:\/\//.test(i.url) ? (slack ? `<${i.url}|${String(i.title).replace(/[<>|]/g, '')}>` : `${i.title}\n   ${i.url}`) : i.title);
    const L = [];
    L.push(b(`Competitor digest · ${dateLine(d, now)}`));
    L.push(d.total ? `${d.total} item${d.total === 1 ? '' : 's'} across ${d.brandCount} brand${d.brandCount === 1 ? '' : 's'} (prior ${d.days} days: ${d.prevTotal})` : `No new items in the last ${d.days} days (prior ${d.days} days: ${d.prevTotal}).`);
    if (d.top.length) {
      L.push('', b('Top changes'));
      d.top.forEach((i) => L.push(`• [${i.evt}] ${i.brand}${i.brand === d.us ? ' (us)' : ''} — ${link(i)} (${fmtDate(i.date)})`));
    }
    const types = Object.entries(d.byType).sort((a, b2) => b2[1] - a[1]);
    if (types.length) L.push('', `${b('By type')}: ${types.map(([t, n]) => `${t} ${n}`).join(' · ')}`);
    if (d.watchCounts.length) L.push(`${b('Watchlist')}: ${d.watchCounts.map((w) => `${w.brand}${w.level ? ' [' + w.level + ']' : ''} ${w.n}`).join(' · ')}`);
    if (d.us) L.push(`${b('Us (' + d.us + ')')}: ${d.usItems} item${d.usItems === 1 ? '' : 's'}`);
    if (d.movers.length) L.push(`${b('Accelerating (30 days vs prior 30)')}: ${d.movers.map((m) => `${m.brand} ${m.prev}→${m.cur}`).join(' · ')}`);
    return L.join('\n');
  }
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function digestHtml(d, now) {
    const lines = digestText({ ...d, top: [] }, now, 'text').split('\n'), tail = lines.slice(2).filter(Boolean);
    const li = d.top.map((i) => `<li><strong>[${escHtml(i.evt)}] ${escHtml(i.brand)}${i.brand === d.us ? ' (us)' : ''}</strong> — ${i.url && /^https?:\/\//.test(i.url) ? `<a href="${escHtml(i.url)}">${escHtml(i.title)}</a>` : escHtml(i.title)} <small>(${escHtml(fmtDate(i.date))})</small></li>`).join('');
    return `<div style="font-family:Arial,sans-serif;max-width:640px"><h2 style="margin:0 0 4px">${escHtml(lines[0])}</h2><p>${escHtml(lines[1])}</p>${li ? `<h3>Top changes</h3><ul>${li}</ul>` : ''}${tail.map((l) => `<p>${escHtml(l)}</p>`).join('')}</div>`;
  }

  return { EVENT_TYPES, IMPORTANCE, classify, detectRegions, ageDays, momentum, countsByType, buildDigest, digestText, digestHtml, fmtDate };
});
