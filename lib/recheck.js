/* Re-checking model specs against their product pages (v3.12.0).
   For each model with a product page link (url, or the sourceUrl the specs came from), the page is read again with
   lib/extract.js and run through the same checks as Collect data (public/collect.js). Then:
     - nothing different:   the model is marked "verified today" straight away;
     - new or changed values: they wait in a review list (ci/recheck.json) until someone saves or dismisses them.
   Nothing already saved is ever overwritten without a person saying so. */
import K from '../public/collect.js';
import { fetchSpecs } from './extract.js';
import { paths, readJson, writeJson } from './store.js';
import { addPricePoints, addAlerts, money, pctTxt } from './audit.js';

export const STALE_DAYS = 90;
export const today = () => new Date().toISOString().slice(0, 10);
export const ageDays = (d) => (d ? Math.floor((Date.now() - Date.parse(d)) / 864e5) : Infinity);
export const isStale = (p, days = STALE_DAYS) => ageDays(p.lastVerified) > days;
export const pageOf = (p) => [p.url, p.sourceUrl].find((u) => /^https:\/\//i.test(String(u || ''))) || '';
const IGNORE = new Set(['sourceUrl', 'url', 'lastVerified', 'launchDate']);

// Compare a read page with what is saved. Pure: tested without the network.
export function compare(p, page) {
  const r = K.readInput(page.lines.join('\n'), { brand: p.brand, model: p.model }), rec = r.recs[0];
  if (!rec) return { changes: [], fills: [], rejected: [] };
  const rows = K.diffRecord(rec, p).filter((x) => !x.keys.some((k) => IGNORE.has(k)) && !(p.na || []).includes(x.k));
  const pick = (x) => ({ k: x.k, keys: x.keys, label: x.label, cur: x.cur, next: x.next, values: Object.fromEntries(x.keys.map((k) => [k, rec.values[k]])) });
  return { changes: rows.filter((x) => x.status === 'differs').map(pick), fills: rows.filter((x) => x.status === 'new').map(pick), rejected: rec.rejected.filter((x) => !IGNORE.has(x.key)).map((x) => ({ label: K.LABEL[x.key] || x.key, raw: x.raw, why: x.why })) };
}

const why = (e) => (e.name === 'TimeoutError' ? 'the page took too long to answer' : /fetch failed|ENOTFOUND|ECONNRE/i.test(e.message) ? 'could not reach the site' : e.message);
const gone = (e) => /HTTP (404|410)\b/.test(e.message || '');

export async function recheckModel(p, fetcher = fetchSpecs) {
  const base = { id: p.id, brand: p.brand, model: p.model, at: new Date().toISOString() }, url = pageOf(p);
  if (!url) return { ...base, status: 'no-link' };
  try {
    const page = await fetcher(url);
    if (!page.lines || page.lines.length < 2) return { ...base, url, status: 'failed', error: 'No specification table found on the page' };
    const c = compare(p, page), img = !p.photo && page.image ? page.image : '';
    return { ...base, url, ...c, image: img, status: c.changes.length ? 'changed' : c.fills.length ? 'new' : 'same' };
  } catch (e) {
    // A page that no longer exists often means the model was dropped: say so, and suggest marking it discontinued.
    if (gone(e)) return { ...base, url, status: 'gone', error: 'the product page no longer exists (it may be discontinued)' };
    return { ...base, url, status: 'failed', error: why(e) };
  }
}

// Street prices: read the price from each shop page saved on the model. Prices are observations, so they are saved straight away.
export async function checkStreet(p, fetcher = fetchSpecs) {
  const out = [];
  for (const r of p.retail || []) {
    const x = { ...r, at: new Date().toISOString() };
    try {
      const page = await fetcher(r.url), pr = page.price;
      if (pr && pr.value > 0) { x.price = Math.round(pr.value * 100) / 100; x.currency = pr.currency || 'GBP'; delete x.error; } else x.error = 'no price found on the page';
    } catch (e) { x.error = gone(e) ? 'the shop page no longer exists' : why(e); }
    out.push(x);
  }
  return out;
}

const sig = (r) => JSON.stringify([r.status, (r.changes || []).map((x) => [x.k, x.next]), (r.fills || []).map((x) => x.k)]);

/* Re-check a set of models (small parallel batches, within a time budget). Spec changes wait for review; unchanged models
   are marked verified; street prices are saved; anything new is added to the email alerts. */
export async function recheck(ids, { budgetMs = 50000, fetcher, street = true, by = 'Re-check' } = {}) {
  const t0 = Date.now(), pr = await readJson(paths.products, { updatedAt: null, products: [] }), want = new Set(ids), list = (pr.products || []).filter((p) => want.has(p.id));
  const out = [], streets = {};
  for (let i = 0; i < list.length; i += 4) {
    if (Date.now() - t0 > budgetMs) break;
    await Promise.all(list.slice(i, i + 4).map(async (p) => {
      out.push(await recheckModel(p, fetcher));
      if (street && (p.retail || []).length) streets[p.id] = await checkStreet(p, fetcher);
    }));
  }
  const q = await readJson(paths.recheck, { updatedAt: null, results: {} }), d = today(), now = new Date().toISOString(), alerts = [], points = []; let touched = false;
  const nm = (p) => `${p.brand} ${p.model}`;
  out.forEach((r) => {
    const at = pr.products.findIndex((x) => x.id === r.id), p = pr.products[at];
    if (r.status === 'same') { if (at >= 0) { pr.products[at] = { ...p, lastVerified: d }; touched = true; } delete q.results[r.id]; return; }
    if (r.status === 'changed' || r.status === 'new' || r.status === 'gone') {
      const was = q.results[r.id]; q.results[r.id] = r; // waits for a person
      if (!was || sig(was) !== sig(r)) {
        const text = r.status === 'gone' ? `${nm(r)}: its product page has gone (${r.url}). It may be discontinued.`
          : `${nm(r)}: the product page now shows ${[...(r.changes || []).map((x) => `${x.label} ${x.cur} → ${x.next}`), ...(r.fills || []).slice(0, 3).map((x) => `${x.label}: ${x.next}`)].join('; ')}${(r.fills || []).length > 3 ? ` and ${(r.fills || []).length - 3} more new details` : ''}. Waiting for review in Collect data.`;
        alerts.push({ type: r.status === 'gone' ? 'page-gone' : 'recheck', brand: r.brand, model: r.model, id: r.id, text, by, via: 're-check' });
      }
      return;
    }
    delete q.results[r.id]; // could not be read: reported back, not kept
  });
  Object.entries(streets).forEach(([id, retail]) => {
    const at = pr.products.findIndex((x) => x.id === id); if (at < 0) return; const p = pr.products[at];
    retail.forEach((x) => {
      if (x.price == null || x.error) return;
      points.push({ id, field: 'street', shop: x.shop, value: x.price, at: now, via: 're-check' });
      const old = (p.retail || []).find((o) => o.url === x.url);
      if (old && old.price != null && Math.abs(old.price - x.price) >= 1) { alerts.push({ type: 'street', brand: p.brand, model: p.model, id, text: `${nm(p)} at ${x.shop}: ${money('priceGBP', old.price)} → ${money('priceGBP', x.price)} (${pctTxt(old.price, x.price)})${p.priceGBP ? `, list price ${money('priceGBP', p.priceGBP)}` : ''}`, by, via: 're-check' }); }
    });
    pr.products[at] = { ...p, retail }; touched = true;
  });
  q.updatedAt = now; await writeJson(paths.recheck, q);
  if (touched) { pr.updatedAt = now; await writeJson(paths.products, pr); }
  if (points.length) await addPricePoints(points);
  if (alerts.length) await addAlerts(alerts);
  return { results: out, street: streets, pending: q.results, products: touched ? pr.products : null, checked: out.length, left: list.length - out.length, alerts: alerts.length };
}

export async function resolve(ids) {
  const q = await readJson(paths.recheck, { updatedAt: null, results: {} });
  ids.forEach((id) => { delete q.results[id]; }); q.updatedAt = new Date().toISOString(); await writeJson(paths.recheck, q); return q.results;
}

// For the weekly job: on-sale models whose specs were last verified more than STALE_DAYS ago (oldest first),
// plus every on-sale model with shop links, so street prices are read every week.
export async function staleIds(limit = 40) {
  const pr = await readJson(paths.products, { products: [] }), on = (pr.products || []).filter((p) => p.status !== 'discontinued');
  const old = on.filter((p) => pageOf(p) && isStale(p)).sort((a, b) => ageDays(b.lastVerified) - ageDays(a.lastVerified));
  const shops = on.filter((p) => (p.retail || []).length && !old.includes(p));
  return [...old, ...shops].slice(0, limit).map((p) => p.id);
}
