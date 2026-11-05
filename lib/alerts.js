/* Email alerts (v3.13.0): market changes collected in ci/alerts.json (lib/audit.js, lib/recheck.js) are sent as one email
   per day at most, through Resend. Needs RESEND_API_KEY and ALERTS_TO (or DIGEST_TO). Nothing is sent when there is nothing new. */
import { readJson, writeJson } from './store.js';
import { P } from './audit.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const GROUPS = [['price', 'List price changes'], ['street', 'Street price changes'], ['new-model', 'New models'], ['discontinued', 'Discontinued'], ['back', 'Back on sale'], ['page-gone', 'Product pages that have gone'], ['recheck', 'Spec changes waiting for review']];
export const alertTo = () => (process.env.ALERTS_TO || process.env.DIGEST_TO || '').split(',').map((x) => x.trim()).filter(Boolean);
export const canEmail = () => !!(process.env.RESEND_API_KEY && alertTo().length);

export function compose(list, siteUrl = '') {
  const groups = GROUPS.map(([t, h]) => [h, list.filter((a) => a.type === t)]).filter(([, l]) => l.length);
  const subject = `Competitor alerts: ${groups.map(([h, l]) => `${l.length} ${h.toLowerCase()}`).join(', ')}`.slice(0, 180);
  const by = (a) => (a.by && a.via !== 're-check' ? ` (recorded by ${a.by})` : '');
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;color:#111"><h2 style="margin:0 0 4px">Competitor alerts</h2><p style="color:#666;margin:0 0 18px">${list.length} change${list.length === 1 ? '' : 's'} since the last alert.</p>${groups.map(([h, l]) => `<h3 style="margin:18px 0 6px;font-size:15px">${esc(h)}</h3><ul style="margin:0;padding-left:18px">${l.map((a) => `<li style="margin:0 0 6px">${esc(a.text)}${esc(by(a))}</li>`).join('')}</ul>`).join('')}${siteUrl ? `<p style="margin-top:22px"><a href="${esc(siteUrl)}/tracker">Open the tracker</a> · changes waiting for review are in Collect data.</p>` : ''}<p style="color:#999;font-size:12px;margin-top:18px">Sent by Brompton Enemies. Change who receives these with ALERTS_TO in Vercel.</p></div>`;
  const text = `Competitor alerts\n\n${groups.map(([h, l]) => `${h}\n${l.map((a) => '- ' + a.text + by(a)).join('\n')}`).join('\n\n')}`;
  return { subject, html, text };
}

// Send the alerts not yet sent. Returns {sent, count, error?}.
export async function sendAlerts({ force = false } = {}) {
  const d = await readJson(P.alerts, { alerts: [], lastSent: null }), todo = (d.alerts || []).filter((a) => !a.sent);
  if (!todo.length) return { sent: false, count: 0, reason: 'nothing new' };
  if (!canEmail()) return { sent: false, count: todo.length, reason: 'email is not set up (RESEND_API_KEY and ALERTS_TO or DIGEST_TO)' };
  if (!force && d.lastSent && Date.now() - Date.parse(d.lastSent) < 20 * 3600e3) return { sent: false, count: todo.length, reason: 'already sent today' };
  const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '');
  const m = compose(todo.slice().reverse(), site);
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY}` }, body: JSON.stringify({ from: process.env.DIGEST_FROM || 'Competitor tracker <onboarding@resend.dev>', to: alertTo(), subject: m.subject, html: m.html, text: m.text }) });
    if (!r.ok) return { sent: false, count: todo.length, error: `HTTP ${r.status}` };
  } catch (e) { return { sent: false, count: todo.length, error: e.message }; }
  const now = new Date().toISOString(), ids = new Set(todo.map((a) => a.id));
  d.alerts = d.alerts.map((a) => (ids.has(a.id) ? { ...a, sent: now } : a)); d.lastSent = now; await writeJson(P.alerts, d);
  return { sent: true, count: todo.length };
}
