/* Shared logic for the tracker: event tagging, momentum, region detection and the weekly digest.
   One file, loaded by the browser (window.CIEvents) and imported by the server routes, so the
   dashboard and the emailed/Slack digest always agree. Pure functions only: no DOM, no network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CIEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EVENT_TYPES = ['Launch', 'Price change', 'Partnership / distribution', 'Funding / financial', 'Recall', 'Market entry', 'Review / test', 'Award / event', 'People', 'Other'];
  const IMPORTANCE = { 'Recall': 6, 'Price change': 5, 'Funding / financial': 4, 'Market entry': 4, 'Launch': 3, 'Partnership / distribution': 3, 'People': 2, 'Award / event': 2, 'Review / test': 1, 'Other': 1 };

  // Each type has weighted patterns. A pattern that matches the headline counts three times as much as one that matches the
  // summary, the type with the highest total wins, and the gap to the runner-up decides how sure the tag is. This replaces the old
  // "first rule that matches wins", where the order of the list decided the answer.
  const CTRY = 'uk|u\\.k\\.|us|u\\.s\\.|usa|united states|america|canada|europe\\w*|germany|france|netherlands|belgium|spain|italy|japan|china|australia|singapore|korea|india|asia|middle east|nordics?|scandinavia|apac|emea|taiwan|hong kong|ireland|sweden|norway|denmark|switzerland|austria|poland|brazil|mexico|uae|dubai';
  const W = {
    'Recall': [[/\brecalls?(ed)?\b/i, 8], [/\bstop[- ]use\b/i, 8], [/\bsafety (notice|warning|alert|issue|concern)s?\b/i, 6], [/\bfire (risk|hazard)\b/i, 5], [/\b(defect(ive)?|faulty|fault) (frame|fork|brake|battery|part|component)s?\b/i, 4], [/\burges? (owners|riders|customers)\b/i, 4], [/\bbattery (fire|overheat\w*)\b/i, 5]],
    'Price change': [[/\bprice (cuts?|drops?|rises?|hikes?|increases?|decreases?|reductions?|changes?|adjustments?|war|rise)\b/i, 8], [/\bprices? (cut|drop|rise|up|down|increase|fall|hike)s?\b/i, 7], [/\b(cuts?|slashes|lowers?|raises|hikes|increases|reduces) (its |their |the )?(bike |e-?bike )?prices?\b/i, 8], [/\b(discount(s|ed)?|% off|\d+ ?% (off|saving))\b/i, 4], [/\bon sale\b/i, 3], [/\b(black friday|cyber monday|boxing day|summer sale|winter sale|sale (starts?|ends?|event))\b/i, 4], [/\bnew (rrp|price|pricing)\b/i, 5], [/\bnow (costs|from [£$€])/i, 4], [/\b(cheaper|more expensive|price war|tariffs?)\b/i, 3], [/\bpric(e|ing) (rise|increase) /i, 2]],
    'Funding / financial': [[/\b(funding|fundrais\w+|series [a-e]\b|seed round|pre-?seed)\b/i, 8], [/\braise[sd]? (?:an? )?(?:[a-z]{2,4}\s?)?[£$€]?\s?\d/i, 8], [/\b(acqui(res?|red|sition|sitions)|merger|merges|buyout|takeover|buys)\b/i, 8], [/\b(bankrupt\w*|insolven\w*|enters? administration|in administration|liquidat\w+|receivership|restructur\w+|redundanc\w+)\b/i, 8], [/\b(ipo|valuation|unicorn|listing|shares?)\b/i, 5], [/\b(invest(s|ed|ment|ments|or|ors)?|backed by|backing)\b/i, 4], [/\b(revenues?|profits?|turnover|annual results|financial results|earnings|accounts|losses|loss-making|sales (rose|fell|grew|figures|up|down))\b/i, 5], [/\bstake\b/i, 3]],
    'Market entry': [[/\b(enters?|entering|entered) (the )?[\w\- ]{0,20}(market|region|country)\b/i, 8], [new RegExp('\\b(enters?|entering|entered|expands? (in)?to) (the )?(' + CTRY + ')\\b', 'i'), 8], [new RegExp('\\b(launch(es|ed)?|arrives?|arrived|debuts?|lands?|now available|available|rolls? out|expands?|expanding|opens?) (in|across|to|into) (the )?(' + CTRY + ')\\b', 'i'), 8], [new RegExp('\\b(' + CTRY + ') (launch|expansion|entry|arrival|debut|rollout)\\b', 'i'), 6], [/\bnew (market|markets|flagship|showroom|subsidiary|distributor in)\b/i, 5], [/\bopens? (a |its |new )?(first |second )?(\w+ ){0,2}(store|flagship|showroom|office|subsidiary|hq|headquarters|factory)\b/i, 6], [/\bexpan(ds|ding|sion|ded)\b/i, 3], [/\binternational (launch|expansion)\b/i, 5], [/\bsets? up (a )?(\w+ ){0,2}(base|operation|presence)\b/i, 4]],
    'Partnership / distribution': [[/\bpartner(s|ed|ing|ship|ships)?\b/i, 5], [/\b(collaborat\w+|collab)\b/i, 6], [/\b(teams? up|tie[- ]?ups?|joins? forces)\b/i, 5], [/\bdistribut\w+\b/i, 5], [/\b(wholesale|b2b|dealers?|stockists?|retail(er)? (network|partner|rollout)|resellers?)\b/i, 4], [/\b(supply (deal|agreement)|licen[cs]\w+|joint venture|exclusive (deal|agreement|rights))\b/i, 5], [/\bnow (stocked|available) (at|in|through) [A-Z]/, 4], [/\bagreement\b/i, 3], [/\b(appointed|named) .{0,20}(distributor|importer|agent)\b/i, 7]],
    'Launch': [[/\b((re)?launch(es|ed|ing)?|unveil\w*|reveal\w*|debut\w*)\b/i, 5], [/\b(limited|special|anniversary|signature) edition\b/i, 5], [/\bintroduc(es|ed|ing)\b/i, 4], [/\bnew (model|models|bike|bikes|e-?bikes?|range|series|edition|colou?rs?|version|generation|folding|cargo|folder|collection|line)\b/i, 5], [/\b(all-new|first look|pre-?orders?|available now|goes on sale|on sale now)\b/i, 5], [/\b(announces?|announced) (the )?(new|its|a) (\w+ ){0,2}(bike|e-?bike|model|range|series|edition|folder|version|product|line|collection)s?\b/i, 5], [/\b(kickstarter|crowdfund\w*|indiegogo)\b/i, 5], [/\b(releases?|released|updates?|updated|upgrades?|upgraded|refreshe?s?|redesign\w*)\b/i, 3], [/\b(mk ?\d|mark \d|gen ?\d|v\d)\b/i, 1]],
    'Review / test': [[/\breview(s|ed)?\b/i, 7], [/\b(tested|testing|hands-?on|first ride|long-?term test|road test|we (rode|tried|tested)|ridden)\b/i, 7], [/\b(verdict|ride report|rated|scored)\b/i, 4], [/\b(best|top \d+|ranked|buyer'?s? guide|buying guide|which (is|one)|guide to)\b/i, 4], [/\b(vs\.?|versus|compared|comparison|head[- ]to[- ]head)\b/i, 3], [/\b(how (to|does)|explained|everything you need)\b/i, 2]],
    'Award / event': [[/\b(awards?|winners?|shortlisted|nominated|accolade|prize|best (of|in) (show|class|test))\b/i, 5], [/\b(wins?|won) (the |a |an )?(\w+ ){0,3}(award|prize|title|gold|silver|bronze)\b/i, 6], [/\b(eurobike|interbike|taipei cycle|china cycle|cycle show|bike show|expo|exhibition|trade fair|trade show|showcase|pop-?up|open day|roadshow)\b/i, 6], [/\b(sponsor\w*|ambassador|partners? with the (race|team|tour|club))\b/i, 3], [/\b(championships?|world cup|race|rally|festival|ride-?out|tour de)\b/i, 3], [/\b(anniversary|celebrates?|celebrating|\d+ years of)\b/i, 3]],
    'People': [[/\b(appoints?|appointed|appointment|hires?|hired|recruits?)\b/i, 6], [/\bchief (financial|executive|operating|technology|marketing|product|commercial|sales|design) officer\b/i, 7], [/\b(names?|named) (a |its |the )?(new )?(ceo|chief|head|director|chair\w*|president|managing)\b/i, 6], [/\b(new|incoming|outgoing|former) (ceo|cfo|coo|cto|cmo|md|chair\w*|president|managing director|head of|director|founder)\b/i, 7], [/\b(joins?|joined) (as|the (board|team))\b/i, 5], [/\b(steps? down|stepping down|resigns?|resigned|retires?|retiring|departs?|promoted|succeeds?|succession)\b/i, 6], [/\b(ceo|cfo|managing director|chairman|chair)\b/i, 2]]
  };
  const MIN_SCORE = 4;
  // Returns the tag, how sure it is ('high' / 'medium' / 'low') and the words that triggered it, so the page can say why.
  function classifyDetailed(title, summary) {
    const t = String(title || ''), s = String(summary || ''), scores = {}, why = {};
    for (const type of Object.keys(W)) {
      const hit = [], hits = [];
      for (const [re, w] of W[type]) {
        const mt = t.match(re), ms = !mt && s ? s.match(re) : null;   // each pattern counts once: in the headline (x3) or, failing that, the summary
        const m = mt || ms; if (!m) continue;
        const k = m[0].trim().toLowerCase(); if (hits.some((h) => h === k || h.includes(k) || k.includes(h))) continue;   // two patterns matching the same words are one signal, not two
        hit.push(mt ? w * 3 : w); hits.push(k);
      }
      // strongest signal in full plus a third of the rest, so several patterns that say the same thing do not outvote a different, clearer signal
      hit.sort((x, y) => y - x);
      const sc = (hit.length ? hit[0] + 0.35 * hit.slice(1).reduce((x, y) => x + y, 0) : 0) * (type === 'Recall' ? 1.25 : 1);   // a safety recall outranks anything else in the same headline
      if (sc) { scores[type] = Math.round(sc * 10) / 10; why[type] = hits.slice(0, 3); }
    }
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a] || (IMPORTANCE[b] || 1) - (IMPORTANCE[a] || 1));
    if (!ranked.length || scores[ranked[0]] < MIN_SCORE) return { type: 'Other', confidence: 'low', why: [], scores };
    const top = ranked[0], second = ranked[1] ? scores[ranked[1]] : 0, gap = scores[top] - second;
    const confidence = scores[top] >= 12 && gap >= 6 ? 'high' : scores[top] >= 8 && gap >= 3 ? 'medium' : 'low';
    return { type: top, confidence, why: why[top], scores };
  }
  const classify = (title, summary) => classifyDetailed(title, summary).type;

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

  return { EVENT_TYPES, IMPORTANCE, classify, classifyDetailed, detectRegions, ageDays, momentum, countsByType, buildDigest, digestText, digestHtml, fmtDate };
});
