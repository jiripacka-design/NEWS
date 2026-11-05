/* Weekly backups (v3.13.0): one JSON file with everything people have entered (models, brands, sources, tags, edit and
   price history, alerts, re-check reviews, duplicates kept apart). Kept in storage under ci/backups/ (the last 12) and
   downloadable from History & backups. Uploaded pictures are not included (they stay where they are). */
import { paths, readJson, writeJson, getSources } from './store.js';
import { P } from './audit.js';
export const PARTS = { products: paths.products, brands: paths.brands, sources: paths.sources, tags: paths.tags, notdup: paths.notdup, recheck: paths.recheck, audit: P.audit, prices: P.prices, alerts: P.alerts };
const INDEX = 'ci/backups/index.json', KEEP = 12;
const file = (id) => `ci/backups/${id}.json`;
export async function snapshot() {
  const data = {}; for (const [k, p] of Object.entries(PARTS)) data[k] = k === 'sources' ? await getSources() : await readJson(p, null); // sources: including the built-in ones
  return { app: 'brompton-enemies', version: 1, createdAt: new Date().toISOString(), data };
}
export const summary = (b) => ({ models: ((b.data.products || {}).products || []).length, brands: Object.keys((b.data.brands || {}).brands || {}).length, sources: ((b.data.sources || {}).sources || []).length });
export async function list() { return (await readJson(INDEX, { backups: [] })).backups || []; }
export async function createBackup(by = 'Weekly backup') {
  const b = await snapshot(), id = b.createdAt.replace(/[:.]/g, '-'), idx = await readJson(INDEX, { backups: [] });
  await writeJson(file(id), b);
  idx.backups = [{ id, at: b.createdAt, by, ...summary(b), bytes: JSON.stringify(b).length }, ...(idx.backups || [])];
  const old = idx.backups.slice(KEEP); idx.backups = idx.backups.slice(0, KEEP);
  for (const o of old) await writeJson(file(o.id), null); // free the space of the oldest
  await writeJson(INDEX, idx); return idx.backups[0];
}
export async function getBackup(id) { if (!/^[\w-]{10,40}$/.test(id)) return null; return readJson(file(id), null); }
// Put a backup back. Takes a safety backup first, so a restore can itself be undone by restoring that one.
export async function restore(b, by) {
  if (!b || b.app !== 'brompton-enemies' || !b.data || typeof b.data !== 'object') throw new Error('This is not a Brompton Enemies backup file');
  const safety = await createBackup(`Before restore by ${by}`);
  const done = [];
  for (const [k, p] of Object.entries(PARTS)) { if (b.data[k] != null) { await writeJson(p, b.data[k]); done.push(k); } }
  return { restored: done, safety };
}
