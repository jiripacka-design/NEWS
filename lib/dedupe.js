/* Duplicate check for news (v3.11.0).
   The same story often arrives several times: from the publisher's own feed, from Google News
   (which adds " - Publisher" to the headline and wraps the link) and from trade sites that copy the press release.
   Two items are the same story when
     - their links point to the same page once tracking parameters, "www." and trailing slashes are removed, or
     - they are about the same brand, were published within DAYS of each other and their headlines share
       most of their words (Dice similarity of the meaningful words >= SAME).
   The scanner uses `isRepeat` to skip exact repeats; /api/news uses `groupStories` to fold the rest into one card. */

export const SAME = 0.72;      // headline word overlap that counts as the same story
export const EXACT = 0.95;     // overlap the scanner treats as a plain repeat and does not store again
export const DAYS = 10;

const STOP = new Set('a an and are as at be by for from has have in into is it its new of on or our the their this to was will with after over up out via vs its about more than how why what who new'.split(' '));

// "Brompton opens Paris store - BikeBiz" -> "brompton opens paris store"
export function cleanTitle(t) {
  let s = String(t || '').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  // publisher suffixes: " - BikeBiz", " | Cycling Industry News", " – road.cc"
  s = s.replace(/\s+[-|–—]\s+[^-|–—]{2,60}$/, '');
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function words(t) {
  return [...new Set(cleanTitle(t).split(' ').filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w))))];
}
export function similarity(a, b) {
  const A = Array.isArray(a) ? a : words(a), B = Array.isArray(b) ? b : words(b);
  if (!A.length || !B.length) return 0;
  const set = new Set(B); let n = 0; A.forEach((w) => { if (set.has(w)) n++; });
  return (2 * n) / (A.length + B.length);
}
// https://www.site.com/story/?utm_source=x#top -> site.com/story
export function canonicalUrl(u) {
  try {
    const x = new URL(String(u || ''));
    if (!/^https?:$/.test(x.protocol)) return '';
    if (/(^|\.)news\.google\.com$/.test(x.hostname)) return ''; // wrapped links differ per item; compare headlines instead
    [...x.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid|gclid|mc_|ref$|source$|cmp$|ocid$)/i.test(k)) x.searchParams.delete(k); });
    const q = x.searchParams.toString();
    return (x.hostname.replace(/^www\.|^m\.|^amp\./, '') + x.pathname.replace(/\/(amp\/?)?$/, '') + (q ? '?' + q : '')).toLowerCase();
  } catch (e) { return ''; }
}
const dayOf = (a) => Date.parse(a.published || a.ingestedAt || a.date || '') || 0;
const closeInTime = (a, b) => { const x = dayOf(a), y = dayOf(b); return !x || !y || Math.abs(x - y) <= DAYS * 864e5; };
// A "General" item (industry news) can match a brand's item only when its headline names that brand, so two brands are never joined through it.
const names = (b) => cleanTitle(b).split(' ').filter((w) => w.length > 2);
const mentions = (g, b) => { const w = new Set(words(g.title)), n = names(b.brand); return n.length > 0 && n.some((x) => w.has(x)); };
const sameBrand = (a, b) => a.brand === b.brand || (a.brand === 'General' && mentions(a, b)) || (b.brand === 'General' && mentions(b, a));

// Is `x` (a new item) a plain repeat of something already stored? Used before storing a scanned item.
export function isRepeat(x, list, cache) {
  const cu = canonicalUrl(x.url), w = words(x.title);
  for (const a of list) {
    if (a.validation || x.validation) continue;
    if (cu && cu === canonicalUrl(a.url)) return a;
    if (w.length >= 3 && sameBrand(a, x) && closeInTime(a, x)) {
      const aw = cache ? (cache.get(a) || (cache.set(a, words(a.title)), cache.get(a))) : words(a.title);
      if (similarity(w, aw) >= EXACT) return a;
    }
  }
  return null;
}

// The best item to show for a story: a real publisher link beats a Google News wrapper, then a picture, then a longer summary, then the earliest.
const score = (a) => (/news\.google\./.test(a.url || '') ? 0 : 4) + (a.image ? 2 : 0) + Math.min(2, String(a.summary || '').length / 200) - (a.archived ? 10 : 0);

/* Groups articles into stories. Returns Map(id -> id of the article shown for that story) for every article that is
   folded into another one. `notDup` is a Set of ids the person marked "not a duplicate". */
export function groupStories(articles, notDup) {
  const keep = notDup || new Set(), list = articles.filter((a) => a && a.id && !a.validation && !keep.has(a.id));
  const parent = new Map(list.map((a) => [a.id, a.id]));
  const find = (id) => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const join = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent.set(y, x); };
  const byUrl = new Map();
  list.forEach((a) => { const u = canonicalUrl(a.url); if (!u) return; if (byUrl.has(u)) join(byUrl.get(u), a.id); else byUrl.set(u, a.id); });
  const W = new Map(list.map((a) => [a.id, words(a.title)]));
  const sorted = list.slice().sort((a, b) => dayOf(a) - dayOf(b));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], aw = W.get(a.id); if (aw.length < 3) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]; if (dayOf(b) - dayOf(a) > DAYS * 864e5) break;
      if (!sameBrand(a, b)) continue;
      const bw = W.get(b.id); if (bw.length < 3) continue;
      if (similarity(aw, bw) >= SAME) join(a.id, b.id);
    }
  }
  const groups = new Map(); list.forEach((a) => { const r = find(a.id); (groups.get(r) || groups.set(r, []).get(r)).push(a); });
  const out = new Map();
  groups.forEach((g) => {
    if (g.length < 2) return;
    const best = g.slice().sort((a, b) => score(b) - score(a) || dayOf(a) - dayOf(b))[0];
    g.forEach((a) => { if (a.id !== best.id) out.set(a.id, best.id); });
  });
  return out;
}
