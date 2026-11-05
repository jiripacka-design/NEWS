/* Read a product page and turn it into "Label: value" lines that Collect data already knows how to check (v3.11.0).
   It looks in the places makers put specs: structured product data (JSON-LD), specification tables, definition lists
   and "Label: value" list items. Nothing is saved here: the page shows a preview first. */
import { metaImage, cleanImageUrl } from './images.js';
const UA = 'Mozilla/5.0 (compatible; BromptonEnemies/3.11; product spec reader)';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', times: '×', ndash: '–', mdash: '—', deg: '°', reg: '', trade: '', copy: '' };
export const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m));
export const text = (h) => decode(String(h || '').replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

// Only public https pages: no local or private network addresses.
export function safeUrl(u) {
  let x; try { x = new URL(String(u || '').trim()); } catch (e) { return null; }
  if (x.protocol !== 'https:') return null;
  const h = x.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null; // names only, no raw IP addresses
  return x.href;
}

function ldProducts(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); const t = [].concat(o['@type'] || []); if (t.some((x) => /^(Product|ProductGroup|IndividualProduct)$/i.test(x))) out.push(o); if (o['@graph']) walk(o['@graph']); };
    walk(j);
  }
  return out;
}
const first = (v) => (Array.isArray(v) ? v[0] : v);

export function extractSpecs(html, url) {
  const lines = [], seen = new Set();
  const add = (label, value) => {
    label = text(label).replace(/[:：]\s*$/, '').trim(); value = text(value).trim();
    if (!label || !value || label.length > 45 || value.length > 300 || label === value) return;
    const k = label.toLowerCase(); if (seen.has(k)) return; seen.add(k); lines.push(`${label}: ${value}`);
  };
  let title = '', price = null;
  // 1. structured product data
  const ps = ldProducts(html);
  ps.forEach((p) => {
    if (!title && p.name) title = text(p.name);
    const offers = [].concat(p.offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
    offers.forEach((o) => { const v = parseFloat(o.price != null ? o.price : o.lowPrice), c = String(o.priceCurrency || '').toUpperCase(); if (v > 0 && (!price || v < price.value)) price = { value: v, currency: c }; });
    if (p.weight) { const w = first(p.weight); const v = typeof w === 'object' ? w.value : w, u = typeof w === 'object' ? (w.unitText || w.unitCode || '') : ''; if (v) add('Weight', `${v} ${/lb|LBR/i.test(u) ? 'lb' : /GRM|^g$/i.test(u) ? 'g' : 'kg'}`); }
    if (p.color) add('Colours', [].concat(p.color).join(', '));
    if (p.material) add('Material', [].concat(p.material).join(', '));
    [].concat(p.additionalProperty || []).forEach((a) => a && add(a.name, a.value != null ? `${a.value}${a.unitText ? ' ' + a.unitText : ''}` : ''));
  });
  // 2. tables: <th>Label</th><td>Value</td> or two cells
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[2]);
    if (cells.length === 2) add(cells[0], cells[1]);
  }
  // 3. definition lists
  for (const d of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) add(d[1], d[2]);
  // 4. "Label: value" list items and spec rows built from divs
  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) { const t = text(li[1]), m = t.match(/^([^:]{2,40}):\s*(.{1,250})$/); if (m) add(m[1], m[2]); }
  for (const d of html.matchAll(/<(?:div|span|p)[^>]*class=["'][^"']*(?:label|name|title|key)[^"']*["'][^>]*>([^<]{2,45})<\/(?:div|span|p)>\s*<(?:div|span|p)[^>]*class=["'][^"']*(?:value|desc|data|detail)[^"']*["'][^>]*>([\s\S]{1,400}?)<\/(?:div|span|p)>/gi)) add(d[1], d[2]);
  if (!title) { const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i); if (og) title = text(og[1]).replace(/\s+[|–-]\s+[^|–-]+$/, ''); }
  if (!price) { const m = html.match(/<meta[^>]+(?:property|itemprop)=["'](?:product:price:amount|og:price:amount|price)["'][^>]+content=["']([\d.,]+)/i), c = html.match(/<meta[^>]+(?:property|itemprop)=["'](?:product:price:currency|og:price:currency|priceCurrency)["'][^>]+content=["']([A-Z]{3})/i); if (m) price = { value: parseFloat(m[1].replace(/,/g, '')), currency: c ? c[1] : '' }; }
  const sym = { GBP: '£', EUR: '€', USD: '$' };
  if (price && price.value > 0) {
    const label = price.currency === 'EUR' ? 'Price EUR' : price.currency === 'USD' ? 'Price USD' : 'Price';
    lines.unshift(`${label}: ${sym[price.currency] || (price.currency ? price.currency + ' ' : '£')}${price.value}`);
  }
  if (url) lines.push(`Source link: ${url}`);
  // The model's picture: the product data's own image first, then the page's preview image.
  let image = ''; for (const p of ps) { const im = first(p.image); const u = cleanImageUrl(im && typeof im === 'object' ? im.url || im.contentUrl : im, url || undefined); if (u) { image = u; break; } }
  if (!image) image = metaImage(html, url || undefined);
  return { title: title.slice(0, 160), lines: lines.slice(0, 300), price, structured: ps.length > 0, image };
}

export async function fetchSpecs(u) {
  const url = safeUrl(u); if (!url) throw new Error('Use a public web page link that starts with https://');
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*', 'accept-language': 'en-GB,en;q=0.8' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
  if (!r.ok) throw new Error(`the site answered HTTP ${r.status}${r.status === 403 ? ' (it blocks automated readers; copy the spec table from the page and paste it instead)' : ''}`);
  if (!safeUrl(r.url || url)) throw new Error('the page redirected somewhere that cannot be read');
  const html = (await r.text()).slice(0, 3_000_000);
  return extractSpecs(html, url);
}
