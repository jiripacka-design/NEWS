/* Collect data (v3.8.0): the quick way to fill the gaps in the product matrix.
   1. Import   - paste a spec table, an AI answer (JSON) or a spreadsheet (CSV); it is read, matched to a model and previewed.
   2. Checklist - every model with the values still missing, tick off as you go ("Not published" counts as done).
   3. AI brief  - a ready-made prompt that lists what is missing; the AI's JSON answer goes back into 1.
   The reading, checking and brief-writing code is pure (no page needed) so it is unit tested in tests/collect.test.js.
   The page part only starts when pm.js has published window.CIPM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CICollect = api; if (root.CIPM) api.mount(root.CIPM); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- the fields (same list and order as a Brompton product page) ---------- */
  // k = key on the model, l = label, g = group, h = hint (format + example), e = only for electric bikes
  const FIELDS = [
    { k: 'priceGBP', l: 'Price (£)', g: 'Headline', h: 'number, £ incl. VAT, e.g. 1809' },
    { k: 'weightKg', l: 'Weight (kg)', g: 'Headline', h: 'number in kg, e.g. 12.5' },
    { k: 'fold', l: 'Folded size', g: 'Headline', h: 'height x width x depth, e.g. 64.5 x 58.5 x 27 cm' },
    { k: 'wheelIn', l: 'Wheel size', g: 'Headline', h: 'e.g. 16 or 20' },
    { k: 'gears', l: 'Speed', g: 'Headline', h: 'e.g. 12-speed' },
    { k: 'material', l: 'Material', g: 'Headline', h: 'e.g. Steel, Titanium and steel, Aluminium' },
    { k: 'colours', l: 'Colours', g: 'Headline', h: 'comma separated' },
    { k: 'handlebars', l: 'Handlebars', g: 'Headline', h: 'options, e.g. Low, Mid, High' },
    { k: 'launch', l: 'Launch', g: 'Headline', h: 'year, e.g. 2025' },
    { k: 'mainFrame', l: 'Main frame', g: 'Frame and fork', h: 'text as the maker words it' },
    { k: 'rearFrame', l: 'Rear frame', g: 'Frame and fork', h: 'text' },
    { k: 'fork', l: 'Fork', g: 'Frame and fork', h: 'text' },
    { k: 'grips', l: 'Grips', g: 'Contact points', h: 'text' },
    { k: 'seatpost', l: 'Seatpost', g: 'Contact points', h: 'text' },
    { k: 'saddle', l: 'Saddle', g: 'Contact points', h: 'text' },
    { k: 'seatclamp', l: 'Seat clamp', g: 'Contact points', h: 'text' },
    { k: 'hingeClamps', l: 'Hinge clamps', g: 'Contact points', h: 'text' },
    { k: 'pedals', l: 'Pedals', g: 'Contact points', h: 'text' },
    { k: 'drivetrain', l: 'Drivetrain', g: 'Drivetrain', h: 'text, include gear range if given' },
    { k: 'chainset', l: 'Chainset', g: 'Drivetrain', h: 'text, include chainring teeth' },
    { k: 'bottomBracket', l: 'Bottom bracket', g: 'Drivetrain', h: 'text' },
    { k: 'headset', l: 'Headset', g: 'Drivetrain', h: 'text' },
    { k: 'shifters', l: 'Shifters', g: 'Drivetrain', h: 'text' },
    { k: 'sprockets', l: 'Sprockets', g: 'Drivetrain', h: 'text, e.g. 11-18 tooth' },
    { k: 'derailleur', l: 'Derailleur / hub gear', g: 'Drivetrain', h: 'text' },
    { k: 'rearWheel', l: 'Rear wheel', g: 'Wheels and tyres', h: 'text' },
    { k: 'frontWheel', l: 'Front wheel', g: 'Wheels and tyres', h: 'text' },
    { k: 'tyres', l: 'Tyres', g: 'Wheels and tyres', h: 'text with size, e.g. 349 x 35C Schwalbe Marathon Racer' },
    { k: 'tubes', l: 'Tubes', g: 'Wheels and tyres', h: 'text, e.g. Schrader valve' },
    { k: 'rollerWheels', l: 'Roller wheels', g: 'Wheels and tyres', h: 'text' },
    { k: 'brakes', l: 'Brakes', g: 'Brakes and equipment', h: 'text' },
    { k: 'mudguards', l: 'Mudguards', g: 'Brakes and equipment', h: 'text, e.g. Included' },
    { k: 'lighting', l: 'Lighting', g: 'Brakes and equipment', h: 'text' },
    { k: 'rack', l: 'Rack', g: 'Brakes and equipment', h: 'text' },
    { k: 'frontCarrier', l: 'Front carrier', g: 'Brakes and equipment', h: 'text' },
    { k: 'riderHeight', l: 'Rider height', g: 'Fit and warranty', h: 'e.g. 142-190 cm' },
    { k: 'maxLoadKg', l: 'Max load (kg)', g: 'Fit and warranty', h: 'number in kg (rider plus luggage)' },
    { k: 'warranty', l: 'Warranty', g: 'Fit and warranty', h: 'text, e.g. 7-year frame warranty' },
    { k: 'motor', l: 'Motor', g: 'Electric', h: 'text, e.g. 250 W front hub', e: true },
    { k: 'batteryWh', l: 'Battery (Wh)', g: 'Electric', h: 'number in Wh (volts x amp-hours if only those are given)', e: true },
    { k: 'rangeKm', l: 'Range (km)', g: 'Electric', h: 'number in km, the maker\'s claim; put the original claim in notes', e: true },
    { k: 'sourceUrl', l: 'Source link', g: 'Record', h: 'https:// link to the page the values came from' }
  ];
  const LABEL = Object.fromEntries(FIELDS.map((f) => [f.k, f.l]));
  LABEL.foldH = 'Folded height'; LABEL.foldW = 'Folded width'; LABEL.foldL = 'Folded depth';
  const TEXT_MAX = 300;

  const ALIASES = {
    priceGBP: ['price', 'rrp', 'msrp', 'retail price', 'price gbp', 'uk price', 'price from'],
    weightKg: ['weight', 'bike weight', 'weight kg', 'weight from', 'total weight', 'weight (kg)'],
    fold: ['folded size', 'folded dimensions', 'folded', 'dimensions folded', 'folded size (hxwxd)', 'size folded'],
    wheelIn: ['wheel size', 'wheel diameter', 'wheels size'],
    gears: ['speed', 'speeds', 'gears', 'gearing', 'number of gears'],
    material: ['material', 'frame material', 'materials'],
    colours: ['colours', 'colors', 'colour', 'color', 'colour options', 'available colours'],
    handlebars: ['handlebars', 'handlebar', 'handlebar options', 'bar options'],
    launch: ['launch', 'launched', 'model year', 'year', 'release'],
    mainFrame: ['main frame', 'frame', 'front frame'],
    rearFrame: ['rear frame', 'rear triangle'],
    fork: ['fork', 'forks'],
    grips: ['grips', 'handlebar grips'],
    seatpost: ['seatpost', 'seat post'],
    saddle: ['saddle', 'seat'],
    seatclamp: ['seat clamp', 'seatpost clamp'],
    hingeClamps: ['hinge clamps', 'hinge clamp', 'hinge'],
    pedals: ['pedals', 'pedal'],
    drivetrain: ['drivetrain', 'drive train', 'transmission'],
    chainset: ['chainset', 'crankset', 'cranks', 'crank', 'chainring'],
    bottomBracket: ['bottom bracket'],
    headset: ['headset'],
    shifters: ['shifters', 'shifter', 'shift levers', 'gear shifters'],
    sprockets: ['sprockets', 'cassette', 'sprocket', 'rear cogs'],
    derailleur: ['derailleur', 'rear derailleur', 'gear hub', 'hub gear', 'internal gear hub', 'rear hub'],
    rearWheel: ['rear wheel'],
    frontWheel: ['front wheel'],
    tyres: ['tyres', 'tires', 'tyre', 'tire'],
    tubes: ['tubes', 'tube', 'inner tubes', 'valve'],
    rollerWheels: ['roller wheels', 'roller wheel', 'rollers'],
    brakes: ['brakes', 'brake', 'braking'],
    mudguards: ['mudguards', 'mudguard', 'fenders', 'mud guards'],
    lighting: ['lighting', 'lights', 'light'],
    rack: ['rack', 'rear rack', 'luggage rack'],
    frontCarrier: ['front carrier', 'front rack', 'front luggage'],
    riderHeight: ['rider height', 'rider height range', 'suitable rider height', 'recommended rider height', 'height range'],
    maxLoadKg: ['max load', 'max rider weight', 'maximum load', 'payload', 'load capacity', 'max weight', 'weight limit', 'max system weight'],
    warranty: ['warranty', 'frame warranty', 'guarantee'],
    motor: ['motor', 'motor power', 'electric motor'],
    batteryWh: ['battery', 'battery capacity', 'battery wh'],
    rangeKm: ['range', 'max range', 'claimed range', 'assisted range'],
    sourceUrl: ['source', 'source url', 'source link', 'product page'],
    brand: ['make', 'manufacturer'], model: ['name', 'product', 'model name'],
    url: [], category: ['category', 'type'], notes: ['notes'], priceNote: ['price note'],
    foldH: [], foldW: [], foldL: ['folded depth', 'foldd'], lastVerified: [], launchDate: []
  };
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const LOOKUP = {};
  Object.keys(ALIASES).forEach((k) => { LOOKUP[norm(k)] = k; ALIASES[k].forEach((a) => { LOOKUP[norm(a)] = k; }); });
  LOOKUP.speed = 'gears'; LOOKUP.weightkg = 'weightKg';
  const keyOf = (label) => LOOKUP[norm(label)] || null;
  const CATS = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike'];

  /* ---------- turning raw text into values ---------- */
  const EMPTY = /^(?:|-+|—|–|n\/?a|na|null|none|unknown|undefined|not (?:found|published|available|specified|stated|listed)|tbc|tbd|\?+)$/i;
  const round = (n, d) => { const m = Math.pow(10, d == null ? 2 : d); return Math.round(n * m) / m; };
  const firstNum = (s) => { const m = String(s).replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null; };
  const allNums = (s) => (String(s).replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) || []).map(parseFloat);
  const squash = (s) => String(s).replace(/[*†‡]+/g, '').replace(/\s+/g, ' ').trim();

  function parseFold(raw) {
    const s = String(raw), u = /mm\b/i.test(s) ? 0.1 : /\bcm\b/i.test(s) ? 1 : /\b(?:in|inch|inches)\b|["”″]|''/i.test(s) ? 2.54 : null;
    const tag = {}; let m; const re = /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|inches|inch|in|"|”|″|'')?\s*([HWDL])\b/gi;
    while ((m = re.exec(s))) tag[m[2].toUpperCase() === 'L' ? 'D' : m[2].toUpperCase()] = parseFloat(m[1].replace(',', '.'));
    let h, w, d, assumed = false;
    if (tag.H != null && tag.W != null && tag.D != null) { h = tag.H; w = tag.W; d = tag.D; }
    else { const n = allNums(s); if (n.length < 3) return null; [h, w, d] = n; assumed = true; }
    const unit = u != null ? u : (Math.max(h, w, d) > 150 ? 0.1 : 1);
    return { foldH: round(h * unit, 1), foldW: round(w * unit, 1), foldL: round(d * unit, 1), assumed };
  }

  // coerce(key, raw) -> { skip } | { why } | { set: { key: value }, note? }
  function coerce(key, raw) {
    if (raw == null) return { skip: true };
    if (typeof raw === 'object' && !Array.isArray(raw)) return { why: 'not a single value' };
    const s = squash(Array.isArray(raw) ? raw.join(', ') : raw);
    if (EMPTY.test(s)) return { skip: true };
    switch (key) {
      case 'priceGBP': {
        if (/[$€]/.test(s) && !/£/.test(s)) return { why: 'price must be in £' };
        const n = firstNum(s); return n == null ? { why: 'no number found' } : { set: { priceGBP: round(n) } };
      }
      case 'weightKg': case 'maxLoadKg': {
        const n = firstNum(s); if (n == null) return { why: 'no number found' };
        const v = /\blbs?\b|pounds?/i.test(s) ? n * 0.45359 : /\bg\b|grams?/i.test(s) && !/kg/i.test(s) ? n / 1000 : n;
        return { set: { [key]: round(v) }, note: v !== n ? `converted from ${s}` : '' };
      }
      case 'fold': {
        const f = parseFold(s); if (!f) return { why: 'need three numbers (height, width, depth)' };
        return { set: { foldH: f.foldH, foldW: f.foldW, foldL: f.foldL }, note: f.assumed ? 'read as height x width x depth, check the order' : '' };
      }
      case 'foldH': case 'foldW': case 'foldL': case 'rangeKm': case 'batteryWh': case 'foldD': {
        if (key === 'rangeKm') {
          const n = allNums(s); if (!n.length) return { why: 'no number found' };
          const mi = /\bmiles?\b|\bmi\b/i.test(s), v = Math.max(...n) * (mi ? 1.609 : 1);
          return { set: { rangeKm: round(v, 0) }, note: mi ? `converted from ${s}` : '' };
        }
        if (key === 'batteryWh') {
          const wh = s.match(/(\d+(?:\.\d+)?)\s*wh/i), v = s.match(/(\d+(?:\.\d+)?)\s*v\b/i), ah = s.match(/(\d+(?:\.\d+)?)\s*ah/i);
          if (wh) return { set: { batteryWh: round(parseFloat(wh[1]), 0) } };
          if (v && ah) return { set: { batteryWh: round(parseFloat(v[1]) * parseFloat(ah[1]), 0) }, note: `volts x amp-hours from ${s}` };
          const n = firstNum(s); return n == null ? { why: 'no number found' } : { set: { batteryWh: round(n, 0) } };
        }
        const n = firstNum(s); return n == null ? { why: 'no number found' } : { set: { [key === 'foldD' ? 'foldL' : key]: round(n, 1) } };
      }
      case 'launch': { const y = s.match(/\b(19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?\b/); return y ? { set: { launch: y[0] } } : { why: 'need a year like 2025' }; }
      case 'wheelIn': {
        const q = s.match(/^(\d{2})\s*(?:"|”|″|''|in\b|inch(?:es)?)?/i);
        return { set: { wheelIn: (q && /^\d{2}$/.test(s.replace(/\s*(?:"|”|″|''|in|inch(?:es)?)$/i, '')) ? q[1] : s).slice(0, 20) } };
      }
      case 'category': { const c = CATS.find((x) => norm(x) === norm(s)); return c ? { set: { category: c } } : { why: 'category must be one of ' + CATS.join(', ') }; }
      case 'sourceUrl': case 'url': return /^https:\/\//i.test(s) ? { set: { [key]: s.slice(0, 1000) } } : { why: 'link must start with https://' };
      case 'lastVerified': return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { set: { lastVerified: s } } : { skip: true };
      case 'notes': return { set: { notes: s.slice(0, 1200) } };
      default: return { set: { [key]: s.slice(0, TEXT_MAX) } };
    }
  }

  // Raw { key: text } -> a record { values, notes, rejected }
  function toRecord(fields) {
    const rec = { values: {}, notes: [], rejected: [] };
    Object.keys(fields).forEach((k) => {
      if (k === 'brand' || k === 'model') return;
      const r = coerce(k, fields[k]);
      if (r.skip) return;
      if (r.why) { rec.rejected.push({ key: k, raw: squash(fields[k]).slice(0, 80), why: r.why }); return; }
      Object.assign(rec.values, r.set);
      if (r.note) rec.notes.push(`${LABEL[k] || k}: ${r.note}`);
    });
    return rec;
  }

  /* ---------- reading what the person pasted ---------- */
  function parseSpecText(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean), fields = {}, unknown = [];
    const put = (k, v) => { v = squash(v); if (v && !(k in fields)) fields[k] = v; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], same = line.match(/^([^:\t]{2,40}?)\s*(?::|\t+|\s{2,}|\s[-–—]\s)\s*(\S.*)$/);
      if (same && keyOf(same[1])) { put(keyOf(same[1]), same[2]); continue; }
      const k = keyOf(line.replace(/:$/, ''));
      if (k) {
        const vals = []; let j = i + 1;
        const isLabelLine = (l) => keyOf(l.replace(/:$/, '')) || (() => { const m = l.match(/^([^:\t]{2,40}?)\s*(?::|\t+|\s{2,}|\s[-–—]\s)\s*\S/); return m && keyOf(m[1]); })();
        while (j < lines.length && vals.length < 3 && !isLabelLine(lines[j])) { vals.push(lines[j]); j++; }
        if (vals.length) { put(k, vals.join(' ')); i = j - 1; continue; }
      }
      unknown.push(line);
    }
    return { fields, unknown };
  }

  function parseDelimited(text) {
    const first = text.split(/\r?\n/, 1)[0], d = first.includes('\t') && !first.includes(',') ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  }

  const detect = (text) => {
    const t = String(text).trim();
    if (/```/.test(t) || /^[\[{]/.test(t) || /\{\s*"[A-Za-z_]+"\s*:/.test(t)) return 'json';
    const head = t.split(/\r?\n/, 1)[0].toLowerCase();
    if (/(^|[,\t"])\s*model\s*([,\t"]|$)/.test(head) && /(^|[,\t"])\s*brand\s*([,\t"]|$)/.test(head)) return 'table';
    return 'text';
  };

  // Everything that comes back is a list of { id, brand, model, values, na, notes, rejected, unknown }
  function readInput(text, ctx) {
    ctx = ctx || {};
    const kind = detect(text), out = { kind, recs: [], error: '' };
    const fromObject = (o) => {
      const fields = {}, extra = { na: [] };
      Object.keys(o).forEach((rawKey) => {
        const v = o[rawKey], k = keyOf(rawKey) || (rawKey === 'id' ? 'id' : rawKey === 'na' || /^notpublished$/i.test(norm(rawKey)) ? 'na' : null);
        if (k === 'id') extra.id = String(v || ''); else if (k === 'na') extra.na = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => keyOf(String(x).trim()) || '').filter(Boolean);
        else if (k === 'brand' || k === 'model') extra[k] = squash(v); else if (k) fields[k] = v;
      });
      const rec = toRecord(fields);
      return Object.assign(rec, { id: extra.id || '', brand: extra.brand || ctx.brand || '', model: extra.model || ctx.model || '', na: [...new Set(extra.na)], unknown: [] });
    };
    try {
      if (kind === 'json') {
        let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); if (a < 0 || b < a) throw new Error('no JSON found');
        let j = JSON.parse(t.slice(a, b + 1));
        if (!Array.isArray(j)) j = Array.isArray(j.products) ? j.products : j.product ? [j.product] : [j];
        out.recs = j.filter((o) => o && typeof o === 'object').map(fromObject);
      } else if (kind === 'table') {
        const rows = parseDelimited(String(text).trim()), head = rows[0].map((h) => h.trim());
        out.recs = rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return fromObject(o); });
      } else {
        const p = parseSpecText(text), rec = toRecord(p.fields);
        out.recs = [Object.assign(rec, { id: '', brand: ctx.brand || squash(p.fields.brand || ''), model: ctx.model || squash(p.fields.model || ''), na: [], unknown: p.unknown })];
        if (!Object.keys(p.fields).length) out.error = 'No spec labels recognised. Each line should look like "Weight: 12.5 kg" or have the label on one line and the value on the next.';
      }
    } catch (e) { out.error = 'Could not read that: ' + e.message; }
    out.recs = out.recs.filter((r) => r.model || Object.keys(r.values).length);
    return out;
  }

  /* ---------- comparing with what is already saved ---------- */
  const isElectric = (p) => /e-bike|electric/i.test(p.category || '') || /electric/i.test(p.model || '') || !!(p.motor || p.batteryWh);
  const filled = (p, k) => (k === 'fold' ? !!(p.foldH && p.foldW && p.foldL) : p[k] != null && p[k] !== '');
  const applicable = (p) => FIELDS.filter((f) => !f.e || isElectric(p));
  const missingFor = (p) => applicable(p).filter((f) => !filled(p, f.k) && !(p.na || []).includes(f.k));
  const progress = (p) => { const a = applicable(p), done = a.filter((f) => filled(p, f.k) || (p.na || []).includes(f.k)).length; return { done, total: a.length, pct: Math.round((done / a.length) * 100) }; };
  const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a) - Number(b)) < 0.01 : norm(a) === norm(b));

  function findExisting(rec, products, brands) {
    if (rec.id) { const p = products.find((x) => x.id === rec.id); if (p) return { p, how: 'id' }; }
    const brand = (brands || []).find((b) => norm(b) === norm(rec.brand)) || rec.brand, mk = norm(rec.model);
    const mine = products.filter((x) => norm(x.brand) === norm(brand));
    let p = mine.find((x) => norm(x.model) === mk); if (p) return { p, how: 'name', brand };
    const tok = (m) => String(m).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !['with', 'the', 'and'].includes(w)), tk = tok(rec.model);
    const sub = (a, b) => a.length && a.every((w) => b.includes(w));
    const near = mine.filter((x) => mk.length >= 3 && (sub(tk, tok(x.model)) || sub(tok(x.model), tk)));
    if (near.length === 1) return { p: near[0], how: 'near', brand };
    return { p: null, how: '', brand };
  }

  // Rows for the preview: new = fills a blank, differs = would replace a value (off by default), same = already there
  function diffRecord(rec, existing) {
    const rows = [], cur = existing || {}, v = rec.values, doneFold = ['foldH', 'foldW', 'foldL'].every((k) => k in v);
    const show = (k, o) => (k === 'foldH' ? `${o.foldH || ''}` : String(o[k] == null ? '' : o[k]));
    const keys = Object.keys(v).filter((k) => !(doneFold && (k === 'foldW' || k === 'foldL')));
    keys.forEach((k) => {
      if (doneFold && k === 'foldH') {
        const c = ['foldH', 'foldW', 'foldL'].map((x) => cur[x]), n = ['foldH', 'foldW', 'foldL'].map((x) => v[x]);
        const fmt = (a) => (a.every((x) => x) ? `${a[0]} x ${a[1]} x ${a[2]} cm` : '');
        rows.push({ k: 'fold', keys: ['foldH', 'foldW', 'foldL'], label: 'Folded size (H x W x D)', cur: fmt(c), next: fmt(n), status: !fmt(c) ? 'new' : c.every((x, i) => same(x, n[i])) ? 'same' : 'differs' });
        return;
      }
      const c = cur[k], has = c != null && c !== '';
      rows.push({ k, keys: [k], label: LABEL[k] || k, cur: has ? show(k, cur) : '', next: String(v[k]), status: !has ? 'new' : same(c, v[k]) ? 'same' : 'differs' });
    });
    return rows;
  }

  /* ---------- the AI brief ---------- */
  const gbpTxt = (v) => '£' + Math.round(v).toLocaleString('en-GB');
  function knownFacts(p) {
    const b = [];
    if (p.priceGBP != null && p.priceGBP !== '') b.push('price ' + gbpTxt(p.priceGBP));
    if (p.weightKg) b.push(p.weightKg + ' kg'); if (p.gears) b.push(p.gears); if (p.wheelIn) b.push(p.wheelIn + ' in wheels'); if (p.category) b.push(p.category);
    return b.join(', ');
  }
  function buildBrief(items, opts) {
    opts = opts || {};
    const models = items.filter((x) => x.p), fresh = items.filter((x) => !x.p);
    const used = new Set(); models.forEach((x) => x.missing.forEach((f) => used.add(f.k)));
    if (fresh.length) FIELDS.forEach((f) => used.add(f.k));
    const guide = FIELDS.filter((f) => used.has(f.k)).map((f) => `- ${f.k}: ${f.l}. ${f.h}`).join('\n');
    const L = [];
    L.push('You are helping a UK bicycle retailer complete a competitor comparison sheet for folding bikes. Use a web search / browsing tool. Work through the items below one at a time.', '');
    L.push('RULES', '- Take values only from the manufacturer\'s own product page (UK edition and GBP when there is one). If that fails, use a large UK retailer and say so in notes.',
      '- Never guess, estimate or fill from memory. If you cannot find a value, use null.',
      '- Copy text values in the maker\'s own words, short. Numbers are plain numbers with no units or symbols.',
      '- If the page shows several variants, use the base model and name the variant in notes.',
      '- Put the exact page address you used in sourceUrl (must start with https://).', '- Only return the fields listed for each item. Do not change anything else.',
      '- Return ONLY valid JSON, nothing before or after it, in exactly this shape:', '',
      '{"products":[{"id":"<copy the id>","brand":"<brand>","model":"<model>","<field>":<value>,"sourceUrl":"https://...","notes":""}]}', '');
    if (models.length) {
      L.push('FIELD GUIDE (key: label. format)', guide, '', 'MODELS TO COMPLETE');
      models.forEach((x, i) => L.push(`${i + 1}. ${x.p.brand} ${x.p.model} (id: ${x.p.id})${x.p.sourceUrl || x.p.url ? ' | start here: ' + (x.p.sourceUrl || x.p.url) : ''}`,
        `   already known: ${knownFacts(x.p) || 'nothing yet'}`, `   missing: ${x.missing.map((f) => f.k).join(', ')}`));
    }
    if (fresh.length) {
      L.push('', models.length ? 'ALSO: NEW MODELS' : 'FIND MODELS', 'These brands have no models in the sheet yet. For each brand, find its main folding bike (and its main folding e-bike if it makes one), at most 2 per brand. Return them with "id":"" and as many of the fields in the guide as the page states.', '',
        'FIELD GUIDE (key: label. format)', guide, '', 'BRANDS');
      fresh.forEach((x, i) => L.push(`${i + 1}. ${x.brand}${x.website ? ' | ' + x.website : ''}`));
    }
    return L.join('\n');
  }

  const api = { FIELDS, LABEL, ALIASES, keyOf, coerce, parseFold, parseSpecText, parseDelimited, detect, readInput, toRecord, isElectric, filled, applicable, missingFor, progress, findExisting, diffRecord, buildBrief, knownFacts };

  /* ===================================================================  PAGE  =================================================================== */
  api.mount = function (X) {
    const { S, api: call, RENDER, mkView, mkNav, go, C } = X, { $, esc, toast } = C;
    const today = () => new Date().toISOString().slice(0, 10);
    const ui = { text: '', brand: '', model: '', imp: null, fb: '', gapsOnly: true, q: '', open: new Set(), scope: 'gaps', bb: '', size: 8, page: 0 };
    const root = mkView('collect', ''); mkNav('collect', 'Collect data', 'competitors');
    const brands = () => C.brands.slice().sort((a, b) => a.localeCompare(b));
    const us = () => X.usName();
    const rank = (p) => (p.brand === us() ? 0 : (S.brands[p.brand] || {}).watch ? 1 : 2);
    const sorted = () => S.products.slice().sort((a, b) => rank(a) - rank(b) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
    const bar = (pct) => `<div class="cl-bar" role="img" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div>`;

    function skeleton() {
      root.innerHTML = `<div class="head"><div><h2>Collect data</h2><div class="sub">Three ways to fill the gaps: import what you have, work down the checklist, or hand the list to an AI model and paste its answer back. Nothing is overwritten unless you tick it.</div></div></div>
        <div class="panel" id="clImportBox"><h3>1. Import</h3>
          <div class="sub">Paste a spec table copied from a product page, an AI answer (JSON) or a spreadsheet (CSV), or drop a file on the box. For a pasted spec table, say which model it is for.</div>
          <div class="cl-ctx"><label>Brand<select class="field" id="clBrand"></select></label><label>Model<input class="field" id="clModel" list="clModels" placeholder="needed for pasted spec text" autocomplete="off"></label><datalist id="clModels"></datalist></div>
          <textarea class="field cl-text" id="clText" spellcheck="false" placeholder="Weight: 12.5 kg&#10;Folded size: 25.3&quot; H x 23&quot; W x 10.6&quot; D&#10;Brakes: Brompton Dual Pivot Calipers&#10;&#10;or paste JSON from an AI model, or a CSV with brand and model columns"></textarea>
          <div class="source-actions"><button type="button" class="primary" id="clRead">Read it</button><button type="button" class="imagebtn" id="clPick">Choose a file</button><button type="button" class="imagebtn" id="clClear">Clear</button><input type="file" id="clFile" accept=".csv,.json,.txt,.md,text/*" hidden></div>
          <div id="clPreview"></div></div>
        <div class="panel" id="clListBox"></div>
        <div class="panel" id="clBriefBox"></div>`;
      root.dataset.ready = '1';
      const t = $('#clText', root); t.value = ui.text;
      t.addEventListener('dragover', (e) => e.preventDefault());
      t.addEventListener('drop', async (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    }
    async function loadFile(f) { ui.text = await f.text(); $('#clText', root).value = ui.text; readNow(); }

    function fillContext() {
      const b = $('#clBrand', root); if (!b) return;
      b.innerHTML = `<option value="">Choose brand</option>` + brands().map((n) => `<option${n === ui.brand ? ' selected' : ''}>${esc(n)}</option>`).join('');
      $('#clModels', root).innerHTML = S.products.filter((p) => p.brand === ui.brand).map((p) => `<option value="${esc(p.model)}">`).join('');
    }

    /* ----- import preview ----- */
    function readNow() {
      ui.text = $('#clText', root).value; ui.brand = $('#clBrand', root).value; ui.model = $('#clModel', root).value.trim();
      if (!ui.text.trim()) { ui.imp = null; return renderPreview(); }
      const r = readInput(ui.text, { brand: ui.brand, model: ui.model });
      r.recs.forEach((rec) => {
        const m = findExisting(rec, S.products, C.brands); rec.brand = m.brand || rec.brand; rec.match = m.p; rec.how = m.how;
        rec.rows = diffRecord(rec, m.p); rec.rows.forEach((x) => { x.on = x.status === 'new'; });
        rec.problem = !rec.brand ? 'Choose a brand above.' : !rec.model && !m.p ? 'Type the model name above.' : '';
      });
      ui.imp = r; renderPreview();
    }
    function nChosen() { return ui.imp ? ui.imp.recs.reduce((n, r) => n + (r.problem ? 0 : r.rows.filter((x) => x.on).length) + (r.problem ? 0 : r.na.length ? 1 : 0), 0) : 0; }
    function renderPreview() {
      const box = $('#clPreview', root); if (!box) return;
      const r = ui.imp; if (!r) { box.innerHTML = ''; return; }
      if (r.error || !r.recs.length) { box.innerHTML = `<div class="pm-empty"><strong>Nothing to import</strong><span>${esc(r.error || 'No models or values were found in that text.')}</span></div>`; return; }
      const kindTxt = { json: 'JSON (AI answer)', table: 'spreadsheet rows', text: 'spec text' }[r.kind];
      box.innerHTML = `<div class="sub" style="margin-top:12px">Read as ${kindTxt}: ${r.recs.length} model${r.recs.length === 1 ? '' : 's'}. Blank-filling values are ticked; values that would replace something you already have are not.</div>` + r.recs.map((rec, i) => {
        const nn = rec.rows.filter((x) => x.status === 'new').length, nd = rec.rows.filter((x) => x.status === 'differs').length, ns = rec.rows.filter((x) => x.status === 'same').length;
        const tag = rec.match ? `<span class="chip">Existing model${rec.how === 'near' ? ' (closest match)' : ''}</span>` : '<span class="chip">New model</span>';
        const body = rec.rows.filter((x) => x.status !== 'same').map((x) => `<tr><td><input type="checkbox" data-r="${i}" data-k="${esc(x.k)}"${x.on ? ' checked' : ''} aria-label="Use ${esc(x.label)}"></td><td>${esc(x.label)}</td><td class="muted">${esc(x.cur) || '—'}</td><td>${esc(x.next)}</td><td><span class="${x.status === 'new' ? 'cl-new' : 'cl-diff'}">${x.status === 'new' ? 'fills a blank' : 'replaces'}</span></td></tr>`).join('');
        return `<div class="cl-rec"><div class="chart-head"><div><h3>${esc(rec.brand || '?')} ${esc(rec.match ? rec.match.model : rec.model || '?')}</h3><div class="sub">${tag} ${nn} to add${nd ? `, ${nd} would replace` : ''}${ns ? `, ${ns} already there` : ''}${rec.na.length ? `, ${rec.na.length} marked not published` : ''}</div></div></div>
          ${rec.problem ? `<div class="cl-warn">${esc(rec.problem)}</div>` : ''}
          ${body ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th></th><th>Field</th><th>Now</th><th>From import</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="muted">Nothing new in this one.</div>'}
          ${rec.notes.length ? `<div class="sub">Converted: ${esc(rec.notes.join('; '))}</div>` : ''}
          ${rec.rejected.length ? `<details class="gaps"><summary>Could not use (${rec.rejected.length})</summary><div class="sub">${rec.rejected.map((x) => `${esc(LABEL[x.key] || x.key)}: "${esc(x.raw)}" (${esc(x.why)})`).join('<br>')}</div></details>` : ''}
          ${rec.unknown && rec.unknown.length ? `<details class="gaps"><summary>Lines not recognised (${rec.unknown.length})</summary><div class="sub">${rec.unknown.slice(0, 40).map(esc).join('<br>')}</div></details>` : ''}</div>`;
      }).join('') + `<div class="source-actions" style="margin-top:12px"><button type="button" class="primary" id="clApply"${nChosen() ? '' : ' disabled'}>Add ${nChosen()} value${nChosen() === 1 ? '' : 's'} to the matrix</button></div>`;
    }
    async function apply() {
      const list = [];
      ui.imp.recs.forEach((rec) => {
        if (rec.problem) return;
        const o = { brand: rec.brand, model: rec.match ? rec.match.model : rec.model }; if (rec.match) o.id = rec.match.id;
        let n = 0; rec.rows.filter((x) => x.on).forEach((x) => x.keys.forEach((k) => { o[k] = rec.values[k]; n++; }));
        const base = rec.match ? (rec.match.na || []) : [], na = [...new Set([...base, ...rec.na])].filter((k) => !(k in o) && !(k === 'fold' && 'foldH' in o));
        if (na.length !== base.length || na.some((k) => !base.includes(k))) { o.na = na; n++; }
        if (n) { o.lastVerified = today(); list.push(o); }
      });
      if (!list.length) return toast('Nothing ticked');
      try { const r = await call('POST', '/api/products', { products: list }); S.products = r.products; toast(`${r.added} added, ${r.updated} updated`); ui.imp = null; $('#clText', root).value = ''; ui.text = ''; renderPreview(); renderList(); renderBrief(); }
      catch (e) { toast('Import failed: ' + e.message); }
    }

    /* ----- checklist ----- */
    function renderList() {
      const box = $('#clListBox', root); if (!box) return;
      const all = sorted(), tot = all.reduce((a, p) => { const g = progress(p); return [a[0] + g.done, a[1] + g.total]; }, [0, 0]), pct = tot[1] ? Math.round((tot[0] / tot[1]) * 100) : 0;
      const bl = [...new Set(all.map((p) => p.brand))].sort((a, b) => a.localeCompare(b)), q = ui.q.toLowerCase();
      let shown = all.filter((p) => (!ui.fb || p.brand === ui.fb) && (!q || `${p.brand} ${p.model}`.toLowerCase().includes(q)) && (!ui.gapsOnly || missingFor(p).length));
      const none = C.brands.filter((b) => !S.products.some((p) => p.brand === b));
      box.innerHTML = `<div class="chart-head"><div><h3>2. Checklist</h3><div class="sub">${tot[0]} of ${tot[1]} values filled across ${all.length} model${all.length === 1 ? '' : 's'} (${pct}%). Type a value and press Enter, or tick <em>Not published</em> when the maker does not say. Either way the row is done.</div></div>
        <div class="source-actions"><select class="field" id="clFb" aria-label="Brand"><option value="">All brands</option>${bl.map((b) => `<option${b === ui.fb ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select><input class="field" id="clQ" placeholder="Filter models" value="${esc(ui.q)}"><label class="cl-chk"><input type="checkbox" id="clGaps"${ui.gapsOnly ? ' checked' : ''}> Only models with gaps</label></div></div>
        ${bar(pct)}
        <div id="clModelsList">${shown.length ? shown.map(modelCard).join('') : `<div class="pm-empty"><strong>${all.length ? 'No gaps in this view' : 'No models yet'}</strong><span>${all.length ? 'Everything shown is complete. Untick "Only models with gaps" to see them anyway.' : 'Use Add model on the Product matrix, or import a CSV or an AI answer above.'}</span></div>`}</div>
        <details class="gaps"><summary>Brands with no models yet (${none.length})</summary><div class="chips">${none.length ? none.map((b) => `<button type="button" class="chip gap-chip" data-newmodel="${esc(b)}">${esc(b)}</button>`).join('') : '<em class="muted">None.</em>'}</div><div class="sub">Select a brand to add its first model by name. The AI brief below can also look up their main models for you.</div></details>`;
    }
    function modelCard(p) {
      const g = progress(p), miss = missingFor(p), na = (p.na || []).filter((k) => FIELDS.some((f) => f.k === k)), open = ui.open.has(p.id);
      const groups = []; miss.forEach((f) => { let gr = groups.find((x) => x[0] === f.g); if (!gr) groups.push(gr = [f.g, []]); gr[1].push(f); });
      const rows = groups.map(([t, fs]) => `<tr class="pm-sec"><th colspan="3">${esc(t)}</th></tr>` + fs.map((f) => `<tr><td>${esc(f.l)}</td><td><input class="field" data-id="${esc(p.id)}" data-k="${esc(f.k)}" placeholder="${esc(f.h)}" maxlength="400" aria-label="${esc(f.l)} for ${esc(p.model)}"></td><td><label class="cl-chk"><input type="checkbox" data-na="${esc(f.k)}" data-id="${esc(p.id)}"> Not published</label></td></tr>`).join('')).join('');
      return `<details class="cl-model" data-id="${esc(p.id)}"${open ? ' open' : ''}><summary><span class="cl-name">${esc(p.brand)} ${esc(p.model)}${p.brand === us() ? ' <span class="chip">us</span>' : ''}</span><span class="cl-meta">${bar(g.pct)}<span class="muted">${g.pct}% · ${miss.length} missing</span></span></summary>
        ${miss.length ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Field</th><th>Value</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="muted" style="padding:8px">Complete.</div>'}
        ${na.length ? `<div class="sub">Not published: ${na.map((k) => `<button type="button" class="chip" data-undo="${esc(k)}" data-id="${esc(p.id)}" title="Put back on the list">${esc(LABEL[k] || k)} ×</button>`).join(' ')}</div>` : ''}</details>`;
    }
    async function saveField(id, k, raw, inp) {
      const p = S.products.find((x) => x.id === id); if (!p) return;
      const r = coerce(k, raw); if (r.skip) return; if (r.why) { inp.classList.add('cl-bad'); return toast(`${LABEL[k] || k}: ${r.why}`); }
      const o = { id, brand: p.brand, model: p.model, ...r.set, lastVerified: today() }, na = (p.na || []).filter((x) => x !== k); if (na.length !== (p.na || []).length) o.na = na;
      try { const res = await call('POST', '/api/products', { product: o }); S.products = res.products; ui.open.add(id); renderList(); renderBrief(); focusFirst(id); if (r.note) toast(r.note); }
      catch (e) { toast('Not saved: ' + e.message); }
    }
    async function setNa(id, k, on) {
      const p = S.products.find((x) => x.id === id); if (!p) return;
      const na = on ? [...new Set([...(p.na || []), k])] : (p.na || []).filter((x) => x !== k);
      try { const res = await call('POST', '/api/products', { product: { id, brand: p.brand, model: p.model, na } }); S.products = res.products; ui.open.add(id); renderList(); renderBrief(); focusFirst(id); }
      catch (e) { toast('Not saved: ' + e.message); }
    }
    const focusFirst = (id) => { const el = root.querySelector(`details[data-id="${id}"] input.field`); if (el) el.focus(); };

    /* ----- AI brief ----- */
    function briefItems() {
      if (ui.scope === 'new') return C.brands.filter((b) => !S.products.some((p) => p.brand === b) && (!ui.bb || b === ui.bb)).map((b) => ({ p: null, brand: b, website: (S.brands[b] || {}).website || '' }));
      return sorted().filter((p) => (!ui.bb || p.brand === ui.bb)).map((p) => ({ p, missing: missingFor(p) })).filter((x) => x.missing.length);
    }
    function renderBrief() {
      const box = $('#clBriefBox', root); if (!box) return;
      const items = briefItems(), pages = Math.max(1, Math.ceil(items.length / ui.size)); ui.page = Math.min(ui.page, pages - 1);
      const chunk = items.slice(ui.page * ui.size, ui.page * ui.size + ui.size), txt = chunk.length ? buildBrief(chunk) : '';
      const bl = ui.scope === 'new' ? C.brands.filter((b) => !S.products.some((p) => p.brand === b)) : [...new Set(S.products.filter((p) => missingFor(p).length).map((p) => p.brand))];
      box.innerHTML = `<div class="chart-head"><div><h3>3. Give it to an AI model</h3><div class="sub">Pick what to ask for, copy the brief into an AI that can browse the web, then paste its JSON answer into the Import box at the top. Always read the preview: AI answers can be wrong, and the brief tells it to use null rather than guess.</div></div></div>
        <div class="cl-ctx"><label>Ask for<select class="field" id="clScope"><option value="gaps"${ui.scope === 'gaps' ? ' selected' : ''}>Missing values in existing models</option><option value="new"${ui.scope === 'new' ? ' selected' : ''}>Models for brands that have none</option></select></label>
          <label>Brand<select class="field" id="clBb"><option value="">All</option>${bl.sort((a, b) => a.localeCompare(b)).map((b) => `<option${b === ui.bb ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
          <label>Per brief<select class="field" id="clSize">${[4, 8, 12, 20].map((n) => `<option${n === ui.size ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Brief<select class="field" id="clPage">${Array.from({ length: pages }, (_, i) => `<option value="${i}"${i === ui.page ? ' selected' : ''}>${i + 1} of ${pages}</option>`).join('')}</select></label></div>
        ${txt ? `<textarea class="field cl-text" id="clBrief" readonly>${esc(txt)}</textarea><div class="source-actions"><button type="button" class="primary" id="clCopy">Copy brief</button><button type="button" class="imagebtn" id="clDl">Download as text</button><span class="muted">${chunk.length} of ${items.length} item${items.length === 1 ? '' : 's'} in this brief</span></div>` : `<div class="pm-empty"><strong>Nothing to ask for</strong><span>${ui.scope === 'new' ? 'Every tracked brand has at least one model.' : 'No model has missing values.'}</span></div>`}`;
    }

    /* ----- events ----- */
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'clRead') return readNow();
      if (t.id === 'clPick') return $('#clFile', root).click();
      if (t.id === 'clClear') { ui.text = ''; ui.imp = null; $('#clText', root).value = ''; return renderPreview(); }
      if (t.id === 'clApply') return apply();
      if (t.id === 'clCopy') { const v = $('#clBrief', root).value; try { await navigator.clipboard.writeText(v); toast('Brief copied'); } catch (err) { $('#clBrief', root).select(); toast('Press Ctrl+C to copy'); } return; }
      if (t.id === 'clDl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#clBrief', root).value], { type: 'text/plain;charset=utf-8' })); a.download = `ai-brief-${ui.scope}-${ui.page + 1}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 800); return; }
      if (t.dataset.undo) return setNa(t.dataset.id, t.dataset.undo, false);
      if (t.dataset.newmodel) {
        const name = (prompt(`Model name for ${t.dataset.newmodel}?`) || '').trim(); if (!name) return;
        try { const r = await call('POST', '/api/products', { product: { brand: t.dataset.newmodel, model: name } }); S.products = r.products; toast('Model added'); renderList(); renderBrief(); } catch (err) { toast(err.message); }
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'clFile') { if (t.files[0]) loadFile(t.files[0]); t.value = ''; return; }
      if (t.id === 'clBrand') { ui.brand = t.value; fillContext(); return; }
      if (t.dataset.r != null && t.dataset.k) { const rec = ui.imp.recs[+t.dataset.r], row = rec.rows.find((x) => x.k === t.dataset.k); if (row) row.on = t.checked; const b = $('#clApply', root); const n = nChosen(); b.disabled = !n; b.textContent = `Add ${n} value${n === 1 ? '' : 's'} to the matrix`; return; }
      if (t.id === 'clFb') { ui.fb = t.value; return renderList(); }
      if (t.id === 'clGaps') { ui.gapsOnly = t.checked; return renderList(); }
      if (t.id === 'clScope') { ui.scope = t.value; ui.bb = ''; ui.page = 0; return renderBrief(); }
      if (t.id === 'clBb') { ui.bb = t.value; ui.page = 0; return renderBrief(); }
      if (t.id === 'clSize') { ui.size = +t.value; ui.page = 0; return renderBrief(); }
      if (t.id === 'clPage') { ui.page = +t.value; return renderBrief(); }
      if (t.dataset.na) return setNa(t.dataset.id, t.dataset.na, t.checked);
      if (t.dataset.k && t.dataset.id && t.classList.contains('field') && t.value.trim()) return saveField(t.dataset.id, t.dataset.k, t.value, t);
    });
    root.addEventListener('input', (e) => { if (e.target.id === 'clQ') { ui.q = e.target.value; const pos = e.target.selectionStart; renderList(); const q = $('#clQ', root); q.focus(); q.setSelectionRange(pos, pos); } });
    root.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('cl-model')) { if (d.open) ui.open.add(d.dataset.id); else ui.open.delete(d.dataset.id); } }, true);
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.k && e.target.dataset.id && e.target.classList.contains('field')) { e.preventDefault(); e.target.blur(); } });

    RENDER.collect = () => { if (!root.dataset.ready) skeleton(); fillContext(); renderPreview(); renderList(); renderBrief(); };
    X.collectOpen = (brand, model) => { ui.brand = brand || ui.brand; ui.model = model || ''; go('collect'); const m = $('#clModel', root); if (m) m.value = ui.model; fillContext(); const b = $('#clBrand', root); if (b) b.value = ui.brand; };
  };
  return api;
});
