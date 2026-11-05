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
    { k: 'line', l: 'Product line', g: 'Headline', h: 'the family the model belongs to, e.g. C Line, P Line, Verge' },
    { k: 'priceGBP', l: 'Price (£)', g: 'Headline', h: 'number, £ incl. VAT, e.g. 1809' },
    { k: 'priceEUR', l: 'Price (€)', g: 'Headline', h: 'number, only if the maker has no £ price, e.g. 1999', opt: true },
    { k: 'priceUSD', l: 'Price ($)', g: 'Headline', h: 'number, only if the maker has no £ price, e.g. 899', opt: true },
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
  /* Brand-level facts: the same import reads these when a row has a brand but no model */
  const BFIELDS = [
    { k: 'units', l: 'Bikes sold per year', h: 'whole number for one year; give the year in figuresYear' },
    { k: 'revenueGBPm', l: 'Revenue (£m)', h: 'number in £ millions, group sales' },
    { k: 'skuCount', l: 'Models listed (SKUs)', h: 'whole number of bike models or variants on sale now' },
    { k: 'paSkus', l: 'P&A products', h: 'whole number of parts and accessories products on sale' },
    { k: 'paCategories', l: 'P&A offering', h: 'comma separated kinds, e.g. luggage, lights, locks, saddles' },
    { k: 'offers', l: 'Offers', h: 'any of: Folding bike, Folding e-bike, E-bike, Cargo e-bike, Accessories, Spare parts' },
    { k: 'figuresYear', l: 'Year of the figures', h: '4 digits, e.g. 2024' },
    { k: 'hq', l: 'Headquarters', h: 'city, country' },
    { k: 'founded', l: 'Founded', h: 'year' },
    { k: 'employees', l: 'Employees', h: 'number or range' },
    { k: 'ownership', l: 'Ownership', h: 'e.g. Private, listed on HKEX' },
    { k: 'website', l: 'Website', h: 'https:// address' },
    { k: 'positioning', l: 'Positioning', h: 'one sentence' },
    { k: 'regionUS', l: 'Sells in: Americas', h: 'comma separated countries' },
    { k: 'regionEMEA', l: 'Sells in: Europe, Middle East, Africa', h: 'comma separated countries' },
    { k: 'regionAPAC', l: 'Sells in: Asia Pacific', h: 'comma separated countries' },
    { k: 'regionCHINA', l: 'Sells in: Greater China', h: 'comma separated countries' },
    { k: 'sourceUrl', l: 'Source link', h: 'https:// page the figures came from' }
  ];
  const BLABEL = Object.fromEntries(BFIELDS.map((f) => [f.k, f.l]));
  const BALIAS = { units: ['units', 'units per year', 'bikes sold', 'annual units', 'volume', 'annual volume', 'bikes per year', 'units sold'], revenueGBPm: ['revenue', 'revenue gbp m', 'revenue £m', 'sales', 'turnover', 'revenue (£m)'], skuCount: ['skus', 'sku count', 'models', 'number of models', 'models listed', 'range size'], paSkus: ['p&a', 'p&a products', 'pa products', 'pa skus', 'accessory skus', 'parts and accessories', 'accessories count'], paCategories: ['p&a offering', 'pa offering', 'accessory categories', 'accessories offered'], offers: ['offers', 'product types', 'sells'], figuresYear: ['figures year', 'year of figures', 'data year'], hq: ['hq', 'headquarters', 'head office'], founded: ['founded', 'year founded'], employees: ['employees', 'headcount', 'staff'], ownership: ['ownership', 'owner'], website: ['website', 'site', 'url'], positioning: ['positioning', 'description'], regionUS: ['americas', 'region us', 'regionus', 'north america'], regionEMEA: ['emea', 'europe', 'region emea'], regionAPAC: ['apac', 'asia pacific', 'region apac'], regionCHINA: ['china', 'greater china', 'region china'], sourceUrl: ['source', 'source url', 'source link', 'sources'] };
  const BLOOKUP = {}; BFIELDS.forEach((f) => { BLOOKUP[f.k.toLowerCase()] = f.k; BLOOKUP[f.l.toLowerCase().replace(/[^a-z0-9]+/g, '')] = f.k; (BALIAS[f.k] || []).forEach((a) => { BLOOKUP[a.toLowerCase().replace(/[^a-z0-9]+/g, '')] = f.k; }); });
  const bkeyOf = (label) => BLOOKUP[String(label == null ? '' : label).toLowerCase().replace(/[^a-z0-9]+/g, '')] || null;
  const OFFERS = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike', 'Accessories', 'Spare parts'];
  function bcoerce(key, raw) {
    if (raw == null) return { skip: true };
    const s = squash(Array.isArray(raw) ? raw.join(', ') : raw); if (EMPTY.test(s)) return { skip: true };
    switch (key) {
      case 'units': case 'skuCount': case 'paSkus': { const n = firstNum(s); if (n == null) return { why: 'no number found' }; const m = /\bm(illion)?\b/i.test(s) ? 1e6 : /\bk\b/i.test(s) ? 1e3 : 1; return { set: { [key]: Math.round(n * m) } }; }
      case 'revenueGBPm': { if (/[$€]/.test(s) && !/£/.test(s)) return { why: 'revenue must be in £' }; const n = firstNum(s); if (n == null) return { why: 'no number found' }; return { set: { revenueGBPm: round(/\bbn?\b|billion/i.test(s) ? n * 1000 : n, 1) } }; }
      case 'figuresYear': { const y = s.match(/(?:^|[^0-9])((?:19|20)\d{2})(?!\d)/); return y ? { set: { figuresYear: y[1] } } : { why: 'need a 4-digit year' }; }
      case 'website': case 'sourceUrl': return /^https:\/\//i.test(s) ? { set: { [key]: s.slice(0, 1000) } } : { why: 'link must start with https://' };
      case 'offers': { const parts = s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean), ok = OFFERS.filter((o) => parts.some((x) => norm(x) === norm(o))); return ok.length === parts.length ? { set: { offers: ok.join(', ') } } : { why: 'use: ' + OFFERS.join(', ') }; }
      case 'positioning': return { set: { positioning: s.slice(0, 400) } };
      default: return { set: { [key]: s.slice(0, TEXT_MAX) } };
    }
  }
  function toBrandRecord(o) {
    const rec = { brand: '', values: {}, notes: [], rejected: [] };
    Object.keys(o).forEach((rk) => {
      if (/^brand$/i.test(rk)) { rec.brand = squash(o[rk]); return; }
      if (/^(record|type)$/i.test(rk)) return;
      if (/^notes?$/i.test(rk)) { rec.note = squash(o[rk]).slice(0, 400); return; }
      const k = bkeyOf(rk); if (!k) return;
      const r = bcoerce(k, o[rk]); if (r.skip) return;
      if (r.why) { rec.rejected.push({ key: k, raw: squash(o[rk]).slice(0, 80), why: r.why }); return; }
      Object.assign(rec.values, r.set);
    });
    return rec;
  }
  // Rows for the preview: same idea as diffRecord. now(k) gives what the tracker holds today for that brand.
  function diffBrand(rec, now) {
    return Object.keys(rec.values).map((k) => {
      const c = now[k], has = c != null && c !== '' && !(Array.isArray(c) && !c.length), cs = Array.isArray(c) ? c.join(', ') : String(c == null ? '' : c), n = rec.values[k];
      const eq = typeof n === 'number' ? Math.abs(Number(c) - n) < 0.01 : norm(cs) === norm(n);
      return { k, keys: [k], label: BLABEL[k] || k, cur: has ? cs : '', next: String(n), status: !has ? 'new' : eq ? 'same' : 'differs' };
    });
  }
  const LABEL = Object.fromEntries(FIELDS.map((f) => [f.k, f.l]));
  LABEL.foldH = 'Folded height'; LABEL.foldW = 'Folded width'; LABEL.foldL = 'Folded depth';
  const TEXT_MAX = 300;

  const ALIASES = {
    line: ['line', 'product line', 'family', 'series', 'range', 'collection'],
    priceEUR: ['price eur', 'price (€)', 'eur', 'euro price', 'price euro'],
    priceUSD: ['price usd', 'price ($)', 'usd', 'us price', 'dollar price'],
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
  const firstNum = (s) => { const m = String(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null; };
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
      case 'priceEUR': case 'priceUSD': { const n = firstNum(s); return n == null ? { why: 'no number found' } : { set: { [key]: round(n) } }; }
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
    // a header row with a brand column and at least one brand-level column (units, SKUs, P&A ...) is a brand table
    const cols = head.split(/[,\t]/).map((x) => x.replace(/"/g, '').trim());
    if (cols.length > 1 && cols.some((c) => /^brand$/i.test(c)) && cols.some((c) => bkeyOf(c) && !keyOf(c))) return 'table';
    return 'text';
  };

  // Everything that comes back is a list of { id, brand, model, values, na, notes, rejected, unknown }
  function readInput(text, ctx) {
    ctx = ctx || {};
    const kind = detect(text), out = { kind, recs: [], brandRecs: [], error: '' };
    const hasModelCol = (o) => Object.keys(o).some((k) => /^(model|id)$/i.test(k) || keyOf(k) === 'model');
    const brandish = (o) => o && typeof o === 'object' && !hasModelCol(o) && Object.keys(o).some((k) => bkeyOf(k) && !keyOf(k));
    const fromObject = (o) => {
      const fields = {}, extra = { na: [] };
      Object.keys(o).forEach((rawKey) => {
        const v = o[rawKey], k = keyOf(rawKey) || (rawKey === 'id' ? 'id' : rawKey === 'na' || /^notpublished$/i.test(norm(rawKey)) ? 'na' : null);
        if (k === 'id') extra.id = String(v || ''); else if (k === 'na') extra.na = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => keyOf(String(x).trim()) || '').filter(Boolean);
        else if (k === 'brand' || k === 'model') extra[k] = EMPTY.test(squash(v)) ? '' : squash(v); else if (k) fields[k] = v;
      });
      const rec = toRecord(fields);
      return Object.assign(rec, { id: extra.id || '', brand: extra.brand || ctx.brand || '', model: extra.model || ctx.model || '', na: [...new Set(extra.na)], unknown: [] });
    };
    try {
      if (kind === 'json') {
        let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); if (a < 0 || b < a) throw new Error('no JSON found');
        let j = JSON.parse(t.slice(a, b + 1));
        if (!Array.isArray(j)) { if (Array.isArray(j.brands)) out.brandRecs = j.brands.filter((o) => o && typeof o === 'object').map(toBrandRecord); j = Array.isArray(j.products) ? j.products : j.product ? [j.product] : (j.brands ? [] : [j]); }
        else { const bs = j.filter(brandish); if (bs.length) { out.brandRecs = bs.map(toBrandRecord); j = j.filter((o) => !brandish(o)); } }
        out.recs = j.filter((o) => o && typeof o === 'object').map(fromObject);
      } else if (kind === 'table') {
        const rows = parseDelimited(String(text).trim()), head = rows[0].map((h) => h.trim());
        const objs = rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
        const isBrandTable = !head.some((h) => /^(model|id)$/i.test(h) || keyOf(h) === 'model') && head.some((h) => bkeyOf(h) && !keyOf(h));
        if (isBrandTable) out.brandRecs = objs.map(toBrandRecord); else out.recs = objs.map(fromObject);
      } else {
        const p = parseSpecText(text), rec = toRecord(p.fields);
        out.recs = [Object.assign(rec, { id: '', brand: ctx.brand || squash(p.fields.brand || ''), model: ctx.model || squash(p.fields.model || ''), na: [], unknown: p.unknown })];
        if (!Object.keys(p.fields).length) out.error = 'No spec labels recognised. Each line should look like "Weight: 12.5 kg" or have the label on one line and the value on the next.';
      }
    } catch (e) { out.error = 'Could not read that: ' + e.message; }
    out.recs = out.recs.filter((r) => r.model || Object.keys(r.values).length);
    out.brandRecs = out.brandRecs.filter((r) => r.brand && (Object.keys(r.values).length || r.rejected.length));
    return out;
  }

  /* ---------- comparing with what is already saved ---------- */
  const isElectric = (p) => /e-bike|electric/i.test(p.category || '') || /electric/i.test(p.model || '') || !!(p.motor || p.batteryWh);
  const has = (v) => v != null && v !== '';
  const filled = (p, k) => (k === 'fold' ? !!(p.foldH && p.foldW && p.foldL) : k === 'priceGBP' ? has(p.priceGBP) || has(p.priceEUR) || has(p.priceUSD) : has(p[k]));
  const applicable = (p) => FIELDS.filter((f) => (!f.e || isElectric(p)) && !f.opt);
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
    if (p.priceGBP != null && p.priceGBP !== '') b.push('price ' + gbpTxt(p.priceGBP)); else if (p.priceEUR) b.push('price EUR ' + p.priceEUR); else if (p.priceUSD) b.push('price USD ' + p.priceUSD);
    if (p.line) b.push(p.line);
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

  const BKEY = ['units', 'revenueGBPm', 'skuCount', 'paSkus', 'paCategories', 'offers', 'figuresYear', 'hq', 'website', 'regionEMEA'];
  function buildBrandBrief(items) {
    const L = [], guide = BFIELDS.filter((f) => f.k !== 'sourceUrl').map((f) => `- ${f.k}: ${f.l}. ${f.h}`).join('\n');
    L.push('You are helping a UK bicycle retailer complete a competitor profile sheet for folding-bike and e-bike brands. Use a web search / browsing tool. Work through the brands below one at a time.', '',
      'RULES', '- Use the brand\'s own site, annual reports, filings or reputable trade press (BikeBiz, Cycling Industry News, Bike Europe, Bicycle Retailer). Prefer the most recent full year.',
      '- Never guess, estimate or fill from memory. If you cannot find a value, use null. Volumes (units) and revenue are often not published: null is the right answer then.',
      '- If a figure is the company\'s own claim rather than audited or reported, say so in notes and still give it.',
      '- Numbers are plain numbers with no units, symbols or commas. Revenue is in £ millions (convert and say how in notes). Give the year the figures are for in figuresYear.',
      '- sourceUrl is the exact page address you used (must start with https://). Only return the fields listed for each brand.',
      '- Return ONLY valid JSON, nothing before or after it, in exactly this shape:', '',
      '{"brands":[{"brand":"<brand>","<field>":<value>,"sourceUrl":"https://...","notes":""}]}', '', 'FIELD GUIDE (key: label. format)', guide, '', 'BRANDS');
    items.forEach((x, i) => L.push(`${i + 1}. ${x.brand}${x.website ? ' | ' + x.website : ''}`, `   already known: ${x.known || 'nothing yet'}`, `   missing: ${x.missing.join(', ')}`));
    return L.join('\n');
  }
  const api = { BFIELDS, BKEY, bkeyOf, toBrandRecord, diffBrand, buildBrandBrief, FIELDS, LABEL, ALIASES, keyOf, coerce, parseFold, parseSpecText, parseDelimited, detect, readInput, toRecord, isElectric, filled, applicable, missingFor, progress, findExisting, diffRecord, buildBrief, knownFacts };

  /* ===================================================================  PAGE  =================================================================== */
  api.mount = function (X) {
    const { S, api: call, RENDER, mkView, mkNav, go, C } = X, { $, esc, toast } = C;
    const today = () => new Date().toISOString().slice(0, 10);
    const ui = { text: '', brand: '', model: '', imp: null, fb: '', gapsOnly: true, q: '', open: new Set(), scope: 'gaps', bb: '', size: 8, page: 0, wb: '', allFacts: false };
    const root = mkView('collect', ''); mkNav('collect', 'Collect data', 'competitors');
    const brands = () => C.brands.slice().sort((a, b) => a.localeCompare(b));
    const us = () => X.usName();
    const rank = (p) => (p.brand === us() ? 0 : (S.brands[p.brand] || {}).watch ? 1 : 2);
    const sorted = () => S.products.slice().sort((a, b) => rank(a) - rank(b) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
    const bar = (pct) => `<div class="cl-bar" role="img" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div>`;

    function skeleton() {
      root.innerHTML = `<div class="head"><div><h2>Collect data</h2><div class="sub">Pick a brand, then let an AI find its facts or type what you know. Everything is checked before it is saved, and nothing you already have is replaced unless you tick it.</div></div></div>
        <div id="clOverview"></div><div id="clWork"></div>
        <details class="panel cl-bulk" id="clBulk"><summary><strong>Many brands at once</strong> <span class="muted">spreadsheets and bulk AI requests</span></summary>
          <div class="sub">For when you want to fill in lots of brands in one go. Download a spreadsheet with every brand or model, fill in what you know, then choose it again here. The preview appears in the brand box above, so nothing is saved until you check it.</div>
          <div class="source-actions"><button type="button" class="imagebtn" id="clTplM">Download models to fill in</button><button type="button" class="imagebtn" id="clTplB">Download brands to fill in</button><button type="button" class="imagebtn" id="clPick">Choose a filled-in file</button><input type="file" id="clFile" accept=".csv,.json,.txt,.tsv,text/*,application/json" hidden></div>
          <div id="clBriefBox"></div></details>`;
      root.dataset.ready = '1';
    }
    async function loadFile(f) { ui.text = await f.text(); $('#clText', root).value = ui.text; readNow(); const pv = $('#clPreview', root); if (pv) pv.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

    function fillContext() {
      const d = $('#clModels', root); if (!d) return;
      d.innerHTML = S.products.filter((p) => p.brand === ui.wb).map((p) => `<option value="${esc(p.model)}">`).join('');
    }

    /* ----- import preview ----- */
    function readNow() {
      ui.text = $('#clText', root).value; ui.brand = ui.wb || ''; ui.model = (($('#clModel', root) || {}).value || '').trim();
      if (!ui.text.trim()) { ui.imp = null; return renderPreview(); }
      const r = readInput(ui.text, { brand: ui.brand, model: ui.model });
      r.recs.forEach((rec) => {
        const m = findExisting(rec, S.products, C.brands); rec.brand = m.brand || rec.brand; rec.match = m.p; rec.how = m.how;
        rec.rows = diffRecord(rec, m.p); rec.rows.forEach((x) => { x.on = x.status === 'new'; });
        rec.problem = !rec.brand ? 'No brand found: the answer needs a brand on every model.' : !rec.model && !m.p ? 'Say which model this is (open “Pasting a spec table for one model?” above).' : '';
      });
      (r.brandRecs || []).forEach((rec) => {
        const nm = C.brands.find((b) => norm(b) === norm(rec.brand)); rec.exists = !!nm; rec.brand = nm || rec.brand;
        rec.rows = diffBrand(rec, nm ? X.brandNow(nm) : {}); rec.rows.forEach((x) => { x.on = x.status === 'new' || !nm; });
        // The year belongs to the volume/revenue figures. If those would not be replaced, do not stamp the old figure with the new year.
        const stale = rec.rows.some((x) => (x.k === 'units' || x.k === 'revenueGBPm') && x.status === 'differs' && !x.on), yr = rec.rows.find((x) => x.k === 'figuresYear');
        if (stale && yr && yr.status !== 'same') { yr.on = false; yr.hint = 'Left off: it would label the figure you already have with a different year. Tick bikes sold per year / revenue as well to use it.'; }
      });
      ui.imp = r; renderPreview();
    }
    function nChosen() { return ui.imp ? (ui.imp.brandRecs || []).reduce((n, r) => n + r.rows.filter((x) => x.on && x.k !== 'sourceUrl').length + (r.exists ? 0 : 1), 0) + ui.imp.recs.reduce((n, r) => n + (r.problem ? 0 : r.rows.filter((x) => x.on).length) + (r.problem ? 0 : r.na.length ? 1 : 0), 0) : 0; }
    function renderPreview() {
      const box = $('#clPreview', root); if (!box) return;
      const r = ui.imp; if (!r) { box.innerHTML = ''; return; }
      if (r.error || (!r.recs.length && !(r.brandRecs || []).length)) { box.innerHTML = `<div class="pm-empty"><strong>Nothing to import</strong><span>${esc(r.error || 'No models or values were found in that text.')}</span></div>`; return; }
      const kindTxt = { json: 'JSON (AI answer)', table: 'spreadsheet rows', text: 'spec text' }[r.kind];
      box.innerHTML = `<div class="sub" style="margin-top:12px">Read as ${kindTxt}: ${r.recs.length} model${r.recs.length === 1 ? '' : 's'}${(r.brandRecs || []).length ? ` and ${r.brandRecs.length} brand${r.brandRecs.length === 1 ? '' : 's'}` : ''}. Blank-filling values are ticked; values that would replace something you already have are not.</div>` + r.recs.map((rec, i) => {
        const nn = rec.rows.filter((x) => x.status === 'new').length, nd = rec.rows.filter((x) => x.status === 'differs').length, ns = rec.rows.filter((x) => x.status === 'same').length;
        const tag = rec.match ? `<span class="chip">Existing model${rec.how === 'near' ? ' (closest match)' : ''}</span>` : '<span class="chip">New model</span>';
        const body = rec.rows.filter((x) => x.status !== 'same').map((x) => `<tr><td><input type="checkbox" data-r="${i}" data-k="${esc(x.k)}"${x.on ? ' checked' : ''} aria-label="Use ${esc(x.label)}"></td><td>${esc(x.label)}</td><td class="muted">${esc(x.cur) || '—'}</td><td>${esc(x.next)}</td><td><span class="${x.status === 'new' ? 'cl-new' : 'cl-diff'}">${x.status === 'new' ? 'fills a blank' : 'replaces'}</span></td></tr>`).join('');
        return `<div class="cl-rec"><div class="chart-head"><div><h3>${esc(rec.brand || '?')} ${esc(rec.match ? rec.match.model : rec.model || '?')}</h3><div class="sub">${tag} ${nn} to add${nd ? `, ${nd} would replace` : ''}${ns ? `, ${ns} already there` : ''}${rec.na.length ? `, ${rec.na.length} marked not published` : ''}</div></div></div>
          ${rec.problem ? `<div class="cl-warn">${esc(rec.problem)}</div>` : ''}
          ${body ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th></th><th>Field</th><th>Now</th><th>From import</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="muted">Nothing new in this one.</div>'}
          ${rec.notes.length ? `<div class="sub">Converted: ${esc(rec.notes.join('; '))}</div>` : ''}
          ${rec.rejected.length ? `<details class="gaps"><summary>Could not use (${rec.rejected.length})</summary><div class="sub">${rec.rejected.map((x) => `${esc(LABEL[x.key] || x.key)}: "${esc(x.raw)}" (${esc(x.why)})`).join('<br>')}</div></details>` : ''}
          ${rec.unknown && rec.unknown.length ? `<details class="gaps"><summary>Lines not recognised (${rec.unknown.length})</summary><div class="sub">${rec.unknown.slice(0, 40).map(esc).join('<br>')}</div></details>` : ''}</div>`;
      }).join('') + (r.brandRecs || []).map((rec, i) => {
        const nn = rec.rows.filter((x) => x.status === 'new').length, nd = rec.rows.filter((x) => x.status === 'differs').length;
        const body = rec.rows.filter((x) => x.status !== 'same').map((x) => `<tr><td><input type="checkbox" data-br="${i}" data-k="${esc(x.k)}"${x.on ? ' checked' : ''} aria-label="Use ${esc(x.label)}"></td><td>${esc(x.label)}${x.hint ? `<div class="muted">${esc(x.hint)}</div>` : ''}</td><td class="muted">${esc(x.cur) || '—'}</td><td>${esc(x.next)}</td><td><span class="${x.status === 'new' ? 'pos' : 'neg'}">${x.status === 'new' ? 'adds' : 'replaces'}</span></td></tr>`).join('');
        return `<div class="cl-rec"><div class="chart-head"><div><h3>${esc(rec.brand)} <span class="muted">brand facts</span></h3><div class="sub">${rec.exists ? '<span class="chip">Existing competitor</span>' : '<span class="chip">New competitor: it will be added, with news sources</span>'} ${nn} to add${nd ? `, ${nd} would replace` : ''}</div></div></div>
          ${body ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th></th><th>Field</th><th>Now</th><th>From import</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="muted">Nothing new in this one.</div>'}
          ${rec.rejected.length ? `<details class="gaps"><summary>Could not use (${rec.rejected.length})</summary><div class="sub">${rec.rejected.map((x) => `${esc(BLABEL[x.key] || x.key)}: "${esc(x.raw)}" (${esc(x.why)})`).join('<br>')}</div></details>` : ''}</div>`;
      }).join('') + `<div class="source-actions" style="margin-top:12px"><button type="button" class="primary" id="clApply"${nChosen() ? '' : ' disabled'}>Save ${nChosen()} value${nChosen() === 1 ? '' : 's'}</button></div>`;
    }
    async function apply() {
      const list = [], bups = {}, news = []; let nb = 0;
      ui.imp.recs.forEach((rec) => {
        if (rec.problem) return;
        const o = { brand: rec.brand, model: rec.match ? rec.match.model : rec.model }; if (rec.match) o.id = rec.match.id;
        let n = 0; rec.rows.filter((x) => x.on).forEach((x) => x.keys.forEach((k) => { o[k] = rec.values[k]; n++; }));
        const base = rec.match ? (rec.match.na || []) : [], na = [...new Set([...base, ...rec.na])].filter((k) => !(k in o) && !(k === 'fold' && 'foldH' in o));
        if (na.length !== base.length || na.some((k) => !base.includes(k))) { o.na = na; n++; }
        if (n) { o.lastVerified = today(); list.push(o); }
      });
      (ui.imp.brandRecs || []).forEach((rec) => {
        const f = {}, on = rec.rows.filter((x) => x.on); if (!on.length && rec.exists) return;
        if (!rec.exists) news.push(rec);
        let regions = null;
        on.forEach((x) => {
          const v = rec.values[x.k];
          if (/^region/.test(x.k)) { regions = regions || X.brandNow(rec.brand).regionsObj || {}; regions[x.k.slice(6)] = v; }
          else if (x.k === 'sourceUrl') { const cur = (X.brandNow(rec.brand).sourcesList || []); f.sources = [...new Set([...cur, v])].join('\n'); }
          else f[x.k] = v;
        });
        if (regions) f.regions = regions;
        if (rec.note) f.dataNote = [X.brandNow(rec.brand).dataNote || '', rec.note].filter(Boolean).join(' ').slice(0, 1200);
        if (Object.keys(f).length) { f.lastVerified = today(); bups[rec.brand] = f; nb++; }
      });
      if (!list.length && !nb && !news.length) return toast('Nothing ticked');
      try {
        for (const rec of news) { const w = (rec.rows.find((x) => x.k === 'website') || {}).on ? rec.values.website : ''; const r0 = await call('POST', '/api/brands', { addCompetitor: { name: rec.brand, category: 'Folding bike', website: w || '', createSources: true } }); X.setBrandData(r0); }
        if (news.length) X.applyBrands();
        let msg = [];
        if (list.length) { const r = await call('POST', '/api/products', { products: list }); S.products = r.products; msg.push(`${r.added} model${r.added === 1 ? '' : 's'} added, ${r.updated} updated`); }
        if (nb) { const r = await call('POST', '/api/brands', { updates: bups }); X.setBrandData(r); X.applyBrands(); msg.push(`${nb} brand${nb === 1 ? '' : 's'} updated`); }
        if (news.length) msg.push(`${news.length} new competitor${news.length === 1 ? '' : 's'}`);
        toast(msg.join(', ')); ui.done = { models: list.length, brands: nb, fresh: news.length };
        ui.imp = null; $('#clText', root).value = ''; ui.text = ''; renderPreview(); renderList(); renderBrief(); showDone();
      } catch (e) { toast('Import failed: ' + e.message); }
    }
    // After a save: say where the data now shows up, so the person can see the link between features
    function showDone() {
      const d = ui.done; if (!d) return; const box = $('#clPreview', root); if (!box) return;
      box.innerHTML = `<div class="cl-rec" style="margin-top:12px"><div class="chart-head"><div><h3>Saved</h3><div class="sub">One import, used everywhere. Here is where it now appears:</div></div></div><div class="cl-links">
        ${d.models ? '<button type="button" class="imagebtn" data-go="matrix">Product Comparison: specs, price and the compare cards</button><button type="button" class="imagebtn" data-go="insights" data-itab-go="chart">Insights > Charts: price, weight, rankings</button>' : ''}
        ${d.brands ? '<button type="button" class="imagebtn" data-go="insights" data-itab-go="portfolio">Insights > Portfolio: volumes, SKUs, P&amp;A</button><button type="button" class="imagebtn" data-go="insights" data-itab-go="markets">Insights > Markets: the map</button><button type="button" class="imagebtn" data-go="competitors">Competitors: profiles</button>' : ''}
        ${d.fresh ? '<button type="button" class="imagebtn" data-go="news">News: new sources start on the next scan (use Run scan)</button>' : ''}</div></div>`;
      ui.done = null;
    }

    /* ----- checklist ----- */
    function renderList() { renderOverview(); renderWork(); }
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

    /* ===== guided workspace: pick a brand, then either ask an AI or type what you know ===== */
    const FACT_KEYS = ['units', 'figuresYear', 'revenueGBPm', 'skuCount', 'paSkus', 'paCategories', 'offers', 'hq', 'founded', 'employees', 'ownership', 'website', 'regions'];
    const REGION_KEYS = ['regionUS', 'regionEMEA', 'regionAPAC', 'regionCHINA'];
    const FACT_GROUPS = [['Size and volume', ['units', 'figuresYear', 'revenueGBPm', 'skuCount']], ['Accessories (P&A)', ['paSkus', 'paCategories']], ['What it sells', ['offers']], ['Where it sells', ['regions']], ['Company', ['hq', 'founded', 'employees', 'ownership', 'website']]];
    const OFFER_LIST = ['Folding bike', 'Folding e-bike', 'E-bike', 'Cargo e-bike', 'Accessories', 'Spare parts'];
    function factState(b) {
      const n = X.brandNow(b), na = n.na || [];
      const val = (k) => (k === 'regions' ? REGION_KEYS.some((r) => (n[r] || '') !== '') : n[k] != null && n[k] !== '');
      const missing = FACT_KEYS.filter((k) => !val(k) && !na.includes(k));
      return { n, na, val, missing, pct: Math.round(((FACT_KEYS.length - missing.length) / FACT_KEYS.length) * 100) };
    }
    function brandProgress(b) {
      const f = factState(b), ms = S.products.filter((p) => p.brand === b); let d = 0, t = 0;
      ms.forEach((p) => { const g = progress(p); d += g.done; t += g.total; });
      return { facts: f, models: ms.length, specs: t ? Math.round((d / t) * 100) : null, gaps: f.missing.length + ms.reduce((a, p) => a + missingFor(p).length, 0) };
    }
    const tier = (b) => (b === us() ? 0 : (S.brands[b] || {}).watch ? 1 : 2);
    const rankBrands = () => C.brands.slice().sort((a, b) => tier(a) - tier(b) || brandProgress(b).gaps - brandProgress(a).gaps || a.localeCompare(b));
    const miniBar = (label, pct) => `<div class="cl-mini"><span>${label}</span>${pct == null ? '<em class="muted">no models yet</em>' : `${bar(pct)}<b>${pct}%</b>`}</div>`;

    function renderOverview() {
      const box = $('#clOverview', root); if (!box) return;
      const all = C.brands.map((b) => ({ b, p: brandProgress(b) })), avgFacts = all.length ? Math.round(all.reduce((a, x) => a + x.p.facts.pct, 0) / all.length) : 0;
      const tot = S.products.reduce((a, p) => { const g = progress(p); return [a[0] + g.done, a[1] + g.total]; }, [0, 0]), specs = tot[1] ? Math.round((tot[0] / tot[1]) * 100) : 0;
      const noModels = all.filter((x) => !x.p.models).length, start = rankBrands().filter((b) => brandProgress(b).gaps).slice(0, 6);
      box.innerHTML = `<div class="metrics"><div class="metric">Brand facts filled<strong>${avgFacts}<small>%</small></strong></div><div class="metric">Model specs filled<strong>${specs}<small>%</small></strong></div><div class="metric">Brands with no models<strong>${noModels}<small> of ${all.length}</small></strong></div><div class="metric">Models tracked<strong>${S.products.length}</strong></div></div>
        <div class="panel"><div class="chart-head"><div><h3>Where to start</h3><div class="sub">Our brand first, then the competitors you watch, then whichever has the most gaps. Select one to open it below.</div></div><label class="cmp-bar">Or pick any brand<select class="field" id="clWb">${rankBrands().map((b) => `<option${b === ui.wb ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label></div>
        <div class="cl-start">${start.length ? start.map((b) => { const p = brandProgress(b); return `<button type="button" class="cl-st${b === ui.wb ? ' on' : ''}" data-wb="${esc(b)}"><span class="cl-st-h"><strong>${esc(b)}</strong>${b === us() ? '<span class="pm-us">US</span>' : (S.brands[b] || {}).watch ? '<span class="chip">watching</span>' : ''}</span>${miniBar('Facts', p.facts.pct)}${miniBar('Models', p.specs)}<span class="muted">${p.gaps} gap${p.gaps === 1 ? '' : 's'}</span></button>`; }).join('') : '<div class="source-empty">Every brand is complete. Nice.</div>'}</div></div>`;
    }

    function buildWorkBrief(b) {
      const f = factState(b), keys = f.missing.flatMap((k) => (k === 'regions' ? REGION_KEYS : [k])), ms = S.products.filter((p) => p.brand === b), items = ms.map((p) => ({ p, missing: missingFor(p) })).filter((x) => x.missing.length).slice(0, 12);
      const site = (S.brands[b] || {}).website, L = [];
      L.push(`You are helping a UK bicycle retailer complete a competitor profile for the folding-bike / e-bike brand "${b}"${site ? ' (' + site + ')' : ''}. Use a web search / browsing tool.`, '',
        'RULES', '- Use the brand\'s own site, annual reports or filings, or reputable trade press (BikeBiz, Cycling Industry News, Bike Europe). Prefer the most recent full year.',
        '- Never guess or fill from memory. If you cannot find a value, use null. Volumes and revenue are often unpublished: null is then the right answer.',
        '- If a figure is the company\'s own claim rather than audited, say so in notes and still give it.',
        '- Numbers are plain numbers with no units, symbols or commas. Money is GBP for models (if only EUR or USD is published use priceEUR / priceUSD instead). Revenue is in £ millions. Dimensions: foldH, foldW, foldL in cm.',
        '- sourceUrl is the exact page you used (starting https://). Keep each model\'s exact name.',
        '- Return ONLY valid JSON, nothing before or after, in exactly this shape:', '',
        `{"brands":[{"brand":"${b}","<field>":<value>,"sourceUrl":"https://...","notes":""}],"products":[{"brand":"${b}","model":"<exact model name>","<field>":<value>,"sourceUrl":"https://...","notes":""}]}`, '');
      L.push('1. BRAND FACTS (only the missing ones)');
      if (keys.length) { L.push(...BFIELDS.filter((x) => keys.includes(x.k)).map((x) => `- ${x.k}: ${x.l}. ${x.h}`)); } else L.push('Nothing is missing: return "brands": [] .');
      L.push('', '2. MODELS WE ALREADY TRACK (fill only the missing fields)');
      if (items.length) {
        const used = new Set(); items.forEach((x) => x.missing.forEach((m) => used.add(m.k)));
        items.forEach((x, i) => L.push(`${i + 1}. ${x.p.model} | known: ${knownFacts(x.p) || 'nothing yet'} | missing: ${x.missing.map((m) => m.k).join(', ')}`));
        L.push('', 'MODEL FIELD GUIDE (key: label. format)', ...FIELDS.filter((x) => used.has(x.k)).map((x) => `- ${x.k}: ${x.l}. ${x.h}`));
      } else L.push(ms.length ? 'No gaps in the models we track.' : 'We track no models for this brand yet.');
      L.push('', '3. OTHER MODELS', `If ${b} currently sells bike models that are not listed above, add each as a new object in "products": its model name, line (the family, e.g. "C Line"), priceGBP, weightKg and any other specs you can verify. Only models on sale now.`);
      return L.join('\n');
    }

    function factsForm(b) {
      const st = factState(b), n = st.n, all = ui.allFacts, one = (k) => {
        const f = BFIELDS.find((x) => x.k === k), miss = st.missing.includes(k), na = st.na.includes(k);
        if (!all && !miss && !na) return '';
        const v = n[k] == null ? '' : n[k];
        return `<div class="bf${miss ? ' miss' : ''}"><label><span class="bf-l">${esc(f.l)}</span><input class="field" data-bf="${k}" value="${esc(v)}" placeholder="${esc(f.h)}"${na ? ' disabled' : ''}></label><label class="cl-chk"><input type="checkbox" data-bna="${k}"${na ? ' checked' : ''}> Not published</label></div>`;
      };
      const offers = () => { if (!all && !st.missing.includes('offers') && !st.na.includes('offers')) return ''; const have = String(n.offers || '').split(',').map((x) => x.trim()), na = st.na.includes('offers'); return `<div class="bf${st.missing.includes('offers') ? ' miss' : ''}"><span class="bf-l">What ${esc(b)} sells</span><div class="offers">${OFFER_LIST.map((o) => `<label class="chk"><input type="checkbox" data-boffer="${o}"${have.includes(o) ? ' checked' : ''}${na ? ' disabled' : ''}> ${o}</label>`).join('')}</div><label class="cl-chk"><input type="checkbox" data-bna="offers"${na ? ' checked' : ''}> Not published</label></div>`; };
      const regions = () => { if (!all && !st.missing.includes('regions') && !st.na.includes('regions')) return ''; const na = st.na.includes('regions'); return `<div class="bf${st.missing.includes('regions') ? ' miss' : ''}"><span class="bf-l">Countries it sells in (comma separated)</span><div class="bf-reg">${[['regionUS', 'Americas'], ['regionEMEA', 'Europe, Middle East, Africa'], ['regionAPAC', 'Asia Pacific'], ['regionCHINA', 'Greater China']].map(([k, l]) => `<label><span class="muted">${l}</span><input class="field" data-bf="${k}" value="${esc(n[k] || '')}" placeholder="e.g. UK, Germany"${na ? ' disabled' : ''}></label>`).join('')}</div><label class="cl-chk"><input type="checkbox" data-bna="regions"${na ? ' checked' : ''}> Not published</label></div>`; };
      const groups = FACT_GROUPS.map(([t, ks]) => { const body = ks.map((k) => (k === 'offers' ? offers() : k === 'regions' ? regions() : one(k))).join(''); return body ? `<fieldset class="pm-sec"><legend>${esc(t)}</legend>${body}</fieldset>` : ''; }).join('');
      return `<div class="chart-head"><div><h3>About ${esc(b)}</h3><div class="sub">${st.missing.length ? `${st.missing.length} fact${st.missing.length === 1 ? '' : 's'} missing, shown below. Tick <em>Not published</em> when the company does not say, so it stops showing up.` : 'Every fact is filled in or marked not published.'}</div></div><label class="cl-chk"><input type="checkbox" id="clAllFacts"${all ? ' checked' : ''}> Show every fact</label></div>
        ${groups || '<div class="source-empty">Nothing missing here. Tick “Show every fact” to edit what is already filled in.</div>'}
        <div class="bf"><label><span class="bf-l">Where did these figures come from? (link, optional)</span><input class="field" data-bf="sourceUrl" placeholder="https://"></label></div>
        <div class="source-actions"><button type="button" class="primary" id="clSaveFacts">Save facts</button><span class="sub">Only the boxes you filled in are saved. Nothing else changes.</span></div>`;
    }
    async function saveFacts() {
      const b = ui.wb, st = factState(b), f = {}, na = new Set(st.na); let bad = false;
      root.querySelectorAll('#clFacts [data-bf]').forEach((inp) => {
        inp.classList.remove('cl-bad'); const k = inp.dataset.bf; if (inp.disabled || /^region/.test(k)) return; const v = inp.value.trim(); if (!v) return;
        if (k === 'sourceUrl') { if (!/^https:\/\//i.test(v)) { inp.classList.add('cl-bad'); bad = true; toast('The source link must start with https://'); } return; }
        const r = bcoerce(k, v); if (r.why) { inp.classList.add('cl-bad'); bad = true; toast(`${BLABEL[k] || k}: ${r.why}`); return; } Object.assign(f, r.set);
      });
      if (bad) return;
      const typed = {}; REGION_KEYS.forEach((k) => { const el = root.querySelector(`#clFacts [data-bf="${k}"]`); if (el && !el.disabled && el.value.trim() !== (st.n[k] || '')) typed[k.slice(6)] = el.value.trim(); });
      if (Object.keys(typed).length) f.regions = Object.assign({}, st.n.regionsObj || {}, typed);
      const offs = [...root.querySelectorAll('#clFacts [data-boffer]:checked')].map((x) => x.dataset.boffer); const hadOffers = root.querySelector('#clFacts [data-boffer]'); if (hadOffers && offs.length && offs.join(', ') !== (st.n.offers || '')) f.offers = offs.join(', ');
      root.querySelectorAll('#clFacts [data-bna]').forEach((x) => { if (x.checked) na.add(x.dataset.bna); else na.delete(x.dataset.bna); });
      Object.keys(f).forEach((k) => { if (k === 'regions') na.delete('regions'); else if (na.has(k)) na.delete(k); });
      f.na = [...na];
      const src = (root.querySelector('#clFacts [data-bf="sourceUrl"]') || {}).value; if (src && /^https:\/\//i.test(src.trim())) f.sources = [...new Set([...(st.n.sourcesList || []), src.trim()])].join('\n');
      const changed = Object.keys(f).filter((k) => k !== 'na' && k !== 'sources').length || JSON.stringify([...na].sort()) !== JSON.stringify(st.na.slice().sort()) || f.sources;
      if (!changed) return toast('Nothing to save yet');
      f.lastVerified = today();
      try { const r = await call('POST', '/api/brands', { updates: { [b]: f } }); X.setBrandData(r); X.applyBrands(); toast(`${b} saved`); renderList(); renderBrief(); }
      catch (e) { toast('Not saved: ' + e.message); }
    }
    function renderModelsBox() {
      const b = ui.wb, ms = S.products.filter((p) => p.brand === b).sort((x, y) => missingFor(y).length - missingFor(x).length || x.model.localeCompare(y.model));
      return `<div class="chart-head"><div><h3>${esc(b)} models (${ms.length})</h3><div class="sub">${ms.length ? 'Open a model to type its missing specs: type a value and press Enter, or tick <em>Not published</em>.' : 'No models yet. Add the first one below, or let an AI find them (section above).'}</div></div></div>
        <div id="clModelsList">${ms.map(modelCard).join('')}</div>
        <div class="cl-add"><strong>Add a model</strong><div class="cl-add-row"><input class="field" id="nmName" placeholder="Model name, e.g. C Line 4-speed"><input class="field" id="nmLine" placeholder="Line, e.g. C Line"><input class="field" id="nmPrice" placeholder="Price £ (optional)" inputmode="decimal"><button type="button" class="imagebtn" id="clAddModel">Add model</button></div></div>`;
    }
    function renderWork() {
      const box = $('#clWork', root); if (!box) return; const b = ui.wb; if (!b) { box.innerHTML = ''; return; }
      const p = brandProgress(b), ctx = box.querySelector('#clText'), keep = ctx ? ctx.value : ui.text, hadFocus = document.activeElement && document.activeElement.id;
      box.innerHTML = `<div class="panel cl-work"><div class="cl-wh"><div><h2>${esc(b)}</h2><div class="sub">${p.gaps ? `${p.facts.missing.length} brand fact${p.facts.missing.length === 1 ? '' : 's'} and ${p.gaps - p.facts.missing.length} model value${p.gaps - p.facts.missing.length === 1 ? '' : 's'} still missing.` : 'Complete.'}</div></div><div class="cl-wbars">${miniBar('Facts', p.facts.pct)}${miniBar('Models', p.specs)}<button type="button" class="imagebtn" id="clNext" title="Go to the next brand that still has gaps">Next brand with gaps →</button></div></div>
        <div class="cl-card"><div class="cl-step"><span>A</span><div><h3>Let an AI find it</h3><div class="sub">Fastest for a whole brand. Three steps, all on this page.</div></div></div>
          <ol class="cl-how"><li><button type="button" class="primary" id="clWbCopy">Copy the request for ${esc(b)}</button> <span class="muted">It lists exactly what is missing and asks for answers in a format this page understands.</span></li><li>Paste it into an AI that can browse the web (ChatGPT, Claude, Gemini or Perplexity with search on).</li><li>Paste its answer here, then check the preview before saving:</li></ol>
          <textarea class="field cl-text" id="clText" spellcheck="false" placeholder="Paste the AI's answer here (JSON), or a spec table copied from a product page, or CSV rows"></textarea>
          <details class="gaps"><summary>Pasting a spec table for one model?</summary><div class="cl-ctx"><label>Which model is it?<input class="field" id="clModel" list="clModels" placeholder="model name" autocomplete="off"></label><datalist id="clModels"></datalist></div></details>
          <div class="source-actions"><button type="button" class="primary" id="clRead">Check it</button><button type="button" class="imagebtn" id="clPick">Use a file instead</button><button type="button" class="imagebtn" id="clClear">Clear</button><button type="button" class="linkbtn" id="clShowReq">Show the request</button></div>
          <textarea class="field cl-text" id="clWbBrief" readonly hidden>${esc(buildWorkBrief(b))}</textarea>
          <div id="clPreview"></div></div>
        <div class="cl-card"><div class="cl-step"><span>B</span><div><h3>Or type what you know</h3><div class="sub">Only the missing items are shown.</div></div></div><div id="clFacts">${factsForm(b)}</div><div id="clModelsBox">${renderModelsBox()}</div></div></div>`;
      const t = $('#clText', box); t.value = keep || ''; t.addEventListener('dragover', (e) => e.preventDefault()); t.addEventListener('drop', async (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
      fillContext(); renderPreview();
      if (hadFocus && hadFocus !== 'clText') { const el = document.getElementById(hadFocus); if (el && root.contains(el)) el.focus(); }
    }
    function selectBrand(b, scroll) { if (!C.brands.includes(b)) return; ui.wb = b; ui.imp = null; ui.text = ''; ui.allFacts = false; renderList(); if (scroll) { const w = $('#clWork', root); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    async function addModel() {
      const name = ($('#nmName', root).value || '').trim(), line = ($('#nmLine', root).value || '').trim(), price = ($('#nmPrice', root).value || '').trim();
      if (!name) return toast('Give the model a name');
      const o = { brand: ui.wb, model: name }; if (line) o.line = line; if (price) { const r = coerce('priceGBP', price); if (r.why) return toast('Price: ' + r.why); Object.assign(o, r.set); }
      try { const r = await call('POST', '/api/products', { product: o }); S.products = r.products; const m = S.products.find((p) => p.brand === ui.wb && p.model.toLowerCase() === name.toLowerCase()); if (m) ui.open.add(m.id); toast(`${name} added`); renderList(); renderBrief(); } catch (e) { toast(e.message); }
    }

    /* ----- AI brief ----- */
    const brandKnown = (b) => { const n = X.brandNow(b), k = []; if (n.units) k.push(n.units.toLocaleString('en-GB') + ' bikes/yr'); if (n.skuCount) k.push(n.skuCount + ' models'); if (n.paSkus != null) k.push(n.paSkus + ' P&A products'); if (n.hq) k.push(n.hq); return k.join(', '); };
    const brandMissing = (b) => factState(b).missing.map((k) => (k === 'regions' ? 'regionEMEA (and regionUS, regionAPAC, regionCHINA)' : k));
    function briefItems() {
      if (ui.scope === 'brands') return C.brands.filter((b) => !ui.bb || b === ui.bb).slice().sort((a, b) => (b === us()) - (a === us()) || ((S.brands[b] || {}).watch ? 0 : 1) - ((S.brands[a] || {}).watch ? 0 : 1) || a.localeCompare(b)).map((b) => ({ brandFacts: true, brand: b, website: (S.brands[b] || {}).website || '', known: brandKnown(b), missing: brandMissing(b) })).filter((x) => x.missing.length);
      if (ui.scope === 'new') return C.brands.filter((b) => !S.products.some((p) => p.brand === b) && (!ui.bb || b === ui.bb)).map((b) => ({ p: null, brand: b, website: (S.brands[b] || {}).website || '' }));
      return sorted().filter((p) => (!ui.bb || p.brand === ui.bb)).map((p) => ({ p, missing: missingFor(p) })).filter((x) => x.missing.length);
    }
    function renderBrief() {
      const box = $('#clBriefBox', root); if (!box) return;
      const items = briefItems(), pages = Math.max(1, Math.ceil(items.length / ui.size)); ui.page = Math.min(ui.page, pages - 1);
      const chunk = items.slice(ui.page * ui.size, ui.page * ui.size + ui.size), txt = chunk.length ? (ui.scope === 'brands' ? buildBrandBrief(chunk) : buildBrief(chunk)) : '';
      const bl = ui.scope === 'brands' ? C.brands.filter((b) => brandMissing(b).length) : ui.scope === 'new' ? C.brands.filter((b) => !S.products.some((p) => p.brand === b)) : [...new Set(S.products.filter((p) => missingFor(p).length).map((p) => p.brand))];
      box.innerHTML = `<div class="chart-head"><div><h3>Bulk AI requests</h3><div class="sub">Pick what to ask for, copy the brief into an AI that can browse the web, then paste its JSON answer into the box in the brand section above. Always read the preview: AI answers can be wrong, and the brief tells it to use null rather than guess.</div></div></div>
        <div class="cl-ctx"><label>Ask for<select class="field" id="clScope"><option value="gaps"${ui.scope === 'gaps' ? ' selected' : ''}>Missing values in existing models</option><option value="new"${ui.scope === 'new' ? ' selected' : ''}>Models for brands that have none</option><option value="brands"${ui.scope === 'brands' ? ' selected' : ''}>Brand facts: volumes, SKUs, P&amp;A, markets</option></select></label>
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
      if (t.dataset.wb) return selectBrand(t.dataset.wb, true);
      if (t.id === 'clSaveFacts') return saveFacts();
      if (t.id === 'clNext') { const order = rankBrands().filter((b) => brandProgress(b).gaps && b !== ui.wb), i = order.findIndex((b) => tier(b) > tier(ui.wb) || (tier(b) === tier(ui.wb) && brandProgress(b).gaps <= brandProgress(ui.wb).gaps)); const n = order[i >= 0 ? i : 0]; return n ? selectBrand(n, true) : toast('Every other brand is complete'); }
      if (t.id === 'clAddModel') return addModel();
      if (t.id === 'clShowReq') { const r = $('#clWbBrief', root); r.hidden = !r.hidden; t.textContent = r.hidden ? 'Show the request' : 'Hide the request'; return; }
      if (t.id === 'clWbCopy') { const v = buildWorkBrief(ui.wb); try { await navigator.clipboard.writeText(v); toast(`Request for ${ui.wb} copied. Paste it into your AI, then paste its answer below.`); } catch (err) { const r = $('#clWbBrief', root); r.hidden = false; r.select(); toast('Press Ctrl+C to copy the request'); } const ta = $('#clText', root); if (ta) ta.focus({ preventScroll: true }); return; }
      if (t.id === 'clTplM') return X.exportCsv();
      if (t.id === 'clTplB') return X.exportBrandsCsv();
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
      if (t.id === 'clWb') return selectBrand(t.value, true);
      if (t.id === 'clAllFacts') { ui.allFacts = t.checked; const f = $('#clFacts', root); f.innerHTML = factsForm(ui.wb); return; }
      if (t.dataset.bna != null) { const row = t.closest('.bf'); if (row) row.querySelectorAll('input.field,input[data-boffer]').forEach((i) => { i.disabled = t.checked; }); return; }
      if (t.dataset.r != null && t.dataset.k) { const rec = ui.imp.recs[+t.dataset.r], row = rec.rows.find((x) => x.k === t.dataset.k); if (row) row.on = t.checked; const b = $('#clApply', root); const n = nChosen(); b.disabled = !n; b.textContent = `Save ${n} value${n === 1 ? '' : 's'}`; return; }
      if (t.dataset.br != null && t.dataset.k) { const rec = ui.imp.brandRecs[+t.dataset.br], row = rec.rows.find((x) => x.k === t.dataset.k); if (row) row.on = t.checked; if (row && t.checked && (row.k === 'units' || row.k === 'revenueGBPm')) { const y = rec.rows.find((x) => x.k === 'figuresYear'); if (y && y.status !== 'same') { y.on = true; const cb = root.querySelector(`input[data-br="${t.dataset.br}"][data-k="figuresYear"]`); if (cb) cb.checked = true; } } const b = $('#clApply', root), n = nChosen(); b.disabled = !n; b.textContent = `Save ${n} value${n === 1 ? '' : 's'}`; return; }
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

    RENDER.collect = () => { if (!root.dataset.ready) skeleton(); if (!ui.wb || !C.brands.includes(ui.wb)) ui.wb = rankBrands()[0] || ''; renderList(); renderBrief(); };
    X.collectOpen = (brand, model) => { if (brand && C.brands.includes(brand)) { ui.wb = brand; ui.imp = null; } ui.model = model || ''; go('collect'); const m = $('#clModel', root); if (m) m.value = ui.model; };
  };
  return api;
});
