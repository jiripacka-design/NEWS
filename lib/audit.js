/* Edit history, price history and alerts (v3.13.0).
   - Edit history (ci/audit.json): every change to a model or a brand profile, who made it and how
     (by hand, Collect data, re-check, undo, restore), with the values before and after. Any entry can be undone.
   - Price history (ci/prices.json): every list price (£, €, $) and every street price seen at a shop, with the date.
   - Alerts (ci/alerts.json): market changes worth an email (prices, new and discontinued models, re-check findings).
     lib/alerts.js sends the ones not yet sent. */
import crypto from 'node:crypto';
import { readJson, writeJson } from './store.js';

export const P = { audit: 'ci/audit.json', prices: 'ci/prices.json', alerts: 'ci/alerts.json' };
const MAX_AUDIT = 4000, MAX_POINTS = 120, MAX_ALERTS = 600;
export const PRICE_KEYS = ['priceGBP', 'priceEUR', 'priceUSD'];
const SKIP = new Set(['updatedAt', 'createdAt', 'id']);
const sym = { priceGBP: '£', priceEUR: '€', priceUSD: '$' };
export const money = (k, v) => (v == null || v === '' ? '—' : (sym[k] || '£') + Number(v).toLocaleString('en-GB'));
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Street prices: only the shops, links and prices matter for the history (not when each was last read).
const norm = (k, v) => (k === 'retail' && Array.isArray(v) ? v.map((r) => [r.shop, r.url, r.price ?? null]) : v);
export const pctTxt = (a, b) => { const p = ((b - a) / a) * 100; return Math.abs(p) < 0.1 ? (p < 0 ? '−' : '+') + '<0.1%' : (p > 0 ? '+' : '−') + Math.abs(p).toFixed(1).replace(/\.0$/, '') + '%'; };
const nid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

// The fields that differ between two versions of a record: {before:{k:v}, after:{k:v}} (missing = null).
export function diff(a, b) {
  const before = {}, after = {}, keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.forEach((k) => { if (SKIP.has(k)) return; const x = (a || {})[k], y = (b || {})[k]; if (!eq(norm(k, x), norm(k, y))) { before[k] = x ?? null; after[k] = y ?? null; } });
  return Object.keys(after).length ? { before, after } : null;
}
const label = (kind, r) => (kind === 'model' ? `${r.brand} ${r.model}` : r.name || r.brand || '');

/* Record changes. items: [{kind:'model'|'brand', key, name, before, after, action?}] where before/after are whole records
   (null for added / removed). Writes the edit history, the price history and alerts in one go. */
export async function recordChanges(items, { by = 'Someone', via = 'edit', alert = true } = {}) {
  const now = new Date().toISOString(), entries = [], points = [], alerts = [];
  for (const it of items) {
    const action = it.action || (!it.before ? 'add' : !it.after ? 'remove' : 'change');
    const d = action === 'change' ? diff(it.before, it.after) : { before: it.before || null, after: it.after || null };
    if (!d) continue;
    const onlyChecked = action === 'change' && Object.keys(d.after).every((k) => k === 'lastVerified');
    if (onlyChecked && via !== 'edit') continue; // "verified today" from a re-check is not worth a history line
    entries.push({ id: nid(), at: now, by, via, kind: it.kind, key: it.key, name: it.name || label(it.kind, it.after || it.before || {}), action, before: d.before, after: d.after, ...(it.noUndo ? { noUndo: true } : {}) });
    if (it.kind !== 'model') continue;
    const cur = it.after || {}, old = it.before || {}, nm = it.name || label('model', cur.brand ? cur : old);
    PRICE_KEYS.forEach((k) => { if (cur[k] != null && !eq(cur[k], old[k])) points.push({ id: it.key, field: k, value: cur[k], at: now, by, via, from: old[k] ?? null, fromAt: old.lastVerified || old.createdAt || null }); });
    if (!alert) continue;
    PRICE_KEYS.forEach((k) => { if (old[k] != null && cur[k] != null && !eq(cur[k], old[k])) { alerts.push({ type: 'price', brand: cur.brand, model: cur.model, id: it.key, text: `${nm}: list price ${money(k, old[k])} → ${money(k, cur[k])} (${pctTxt(old[k], cur[k])})`, by, via }); } });
    if (action === 'add' && via !== 'restore') alerts.push({ type: 'new-model', brand: cur.brand, model: cur.model, id: it.key, text: `New model recorded: ${nm}${cur.priceGBP ? ' at ' + money('priceGBP', cur.priceGBP) : ''}`, by, via });
    if (cur.status === 'discontinued' && old.status !== 'discontinued') alerts.push({ type: 'discontinued', brand: cur.brand, model: cur.model, id: it.key, text: `${nm} marked as discontinued`, by, via });
    if (old.status === 'discontinued' && cur.status !== 'discontinued' && action === 'change') alerts.push({ type: 'back', brand: cur.brand, model: cur.model, id: it.key, text: `${nm} is on sale again`, by, via });
  }
  if (entries.length) { const a = await readJson(P.audit, { entries: [] }); a.entries = [...entries.reverse(), ...(a.entries || [])].slice(0, MAX_AUDIT); a.updatedAt = now; await writeJson(P.audit, a); }
  if (points.length) await addPricePoints(points);
  if (alerts.length) await addAlerts(alerts);
  return entries;
}

// points: [{id, field:'priceGBP'|…|'street', value, at, shop?, by?, via?}]
export async function addPricePoints(points) {
  const d = await readJson(P.prices, { series: {} }); d.series = d.series || {};
  points.forEach((p) => {
    const s = (d.series[p.id] = d.series[p.id] || []), last = [...s].reverse().find((x) => x.field === p.field && (x.shop || '') === (p.shop || ''));
    if (last && eq(last.value, p.value)) { last.seen = p.at; return; } // same price again: just note it was still that on this date
    // The first change we record for a model: also keep the price it had before, from the date it was last verified, so the line has a start.
    if (!last && p.from != null && p.shop == null) s.push({ field: p.field, value: p.from, at: p.fromAt && p.fromAt < p.at ? (p.fromAt.length === 10 ? p.fromAt + 'T12:00:00.000Z' : p.fromAt) : new Date(Date.parse(p.at) - 864e5).toISOString(), start: true });
    s.push({ field: p.field, value: p.value, at: p.at, ...(p.shop ? { shop: p.shop } : {}), ...(p.by ? { by: p.by } : {}), ...(p.via ? { via: p.via } : {}) });
    if (s.length > MAX_POINTS) s.splice(0, s.length - MAX_POINTS);
  });
  d.updatedAt = new Date().toISOString(); await writeJson(P.prices, d); return d;
}

export async function addAlerts(list) {
  const d = await readJson(P.alerts, { alerts: [], lastSent: null }), now = new Date().toISOString();
  d.alerts = [...list.map((a) => ({ id: nid(), at: now, sent: false, ...a })), ...(d.alerts || [])].slice(0, MAX_ALERTS);
  await writeJson(P.alerts, d); return d;
}

// Undo one history entry: put the "before" values back, if nobody has changed those fields since (unless force).
export async function undo(entryId, { by = 'Someone', force = false, read, write } = {}) {
  const a = await readJson(P.audit, { entries: [] }), e = (a.entries || []).find((x) => x.id === entryId);
  if (!e) return { error: 'That change is no longer in the history', status: 404 };
  if (e.undone) return { error: 'That change has already been undone', status: 409 };
  if (e.noUndo) return { error: 'This kind of change cannot be undone here', status: 409 };
  const store = await read(e.kind), recs = store.list;
  const at = recs.findIndex((r) => (e.kind === 'model' ? r.id === e.key : r.name === e.key));
  const cur = at >= 0 ? recs[at] : null;
  let next;
  if (e.action === 'add') { if (!cur) return { error: 'It has already been removed', status: 409 }; next = null; }
  else if (e.action === 'remove') { if (cur) return { error: 'It exists again already', status: 409 }; next = e.before; }
  else {
    if (!cur) return { error: e.kind === 'model' ? 'The model has been deleted since' : 'The brand has been removed since', status: 409 };
    const moved = Object.keys(e.after).filter((k) => !eq(cur[k], e.after[k]));
    if (moved.length && !force) return { error: 'Changed again since', moved, status: 409 };
    next = { ...cur }; Object.entries(e.before).forEach(([k, v]) => { if (v == null) delete next[k]; else next[k] = v; });
    next.updatedAt = new Date().toISOString();
  }
  const list = recs.slice(); if (next === null) list.splice(at, 1); else if (at >= 0) list[at] = next; else list.push(next);
  await write(e.kind, list);
  e.undone = { at: new Date().toISOString(), by }; await writeJson(P.audit, a);
  await recordChanges([{ kind: e.kind, key: e.key, name: e.name, before: cur, after: next, action: e.action === 'add' ? 'remove' : e.action === 'remove' ? 'add' : 'change' }], { by, via: 'undo' });
  return { ok: true, kind: e.kind };
}
