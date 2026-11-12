// Input cleaning for the editable data (brand profiles and product models). Everything is whitelisted and length-capped.
export const CATEGORIES=['Folding bike','Folding e-bike','E-bike','Cargo e-bike'];
export const REGIONS=['US','EMEA','APAC','CHINA'];
// Text specs taken from brompton.com's Specification list (Main Frame ... Front Carrier), plus Material, Colours and Handlebars.
export const SPEC_TEXT=['material','colours','handlebars','mainFrame','rearFrame','fork','grips','seatpost','saddle','seatclamp','hingeClamps','pedals','drivetrain','chainset','bottomBracket','headset','shifters','sprockets','derailleur','rearWheel','frontWheel','tyres','tubes','rollerWheels','brakes','mudguards','lighting','rack','frontCarrier','riderHeight','warranty'];
export const NA_KEYS=[...SPEC_TEXT,'priceGBP','weightKg','fold','wheelIn','gears','launch','motor','batteryWh','rangeKm','maxLoadKg','sourceUrl'];
export const OFFERS=['Folding bike','Folding e-bike','E-bike','Cargo e-bike','Accessories','Spare parts'];
export const THREATS=['High','Medium','Low'];
const str=(v,n)=>String(v==null?'':v).trim().slice(0,n);
const num=v=>{if(v===''||v==null)return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<1e9?n:undefined};
const date=v=>{const s=str(v,10);return s===''||/^\d{4}-\d{2}-\d{2}$/.test(s)?s:undefined};
const launch=v=>{const s=str(v,10);return s===''||/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)?s:undefined};
const https=v=>/^https:\/\//i.test(v)&&v.length<=1000;
// A patch only contains the fields the caller sent; fields that fail validation are reported, not silently dropped.
export function cleanBrand(b){
  const out={},bad=[];const has=k=>Object.prototype.hasOwnProperty.call(b,k);
  if(has('category')){if(b.category===''||CATEGORIES.includes(b.category))out.category=b.category;else bad.push('category')}
  for(const [k,n] of [['positioning',600],['strengths',1500],['weaknesses',1500],['threatReason',200],['dataNote',400]])if(has(k))out[k]=str(b[k],n);
  for(const [k,n] of [['hq',120],['ownership',120],['employees',60]])if(has(k))out[k]=str(b[k],n);
  if(has('founded')){const f=str(b.founded,4);if(f===''||/^\d{4}$/.test(f))out.founded=f;else bad.push('founded (a 4-digit year)')}
  for(const k of ['website','photo','photoSource'])if(has(k)){const v=str(b[k],1000);if(v===''||https(v))out[k]=v;else bad.push(k+' must start with https://')}
  if(has('threat')){if(b.threat===''||THREATS.includes(b.threat))out.threat=b.threat;else bad.push('threat')}
  for(const k of ['watch','isUs'])if(has(k))out[k]=b[k]===true;
  if(has('lastVerified')){const d=date(b.lastVerified);if(d===undefined)bad.push('lastVerified');else out.lastVerified=d}
  for(const k of ['revenueGBPm','units','skuCount','paSkus']){if(has(k)){const n=num(b[k]);if(n===undefined)bad.push(k);else out[k]=n}}
  // P&A = parts and accessories (luggage, lights, locks, saddles ...). paSkus is how many different P&A products they sell.
  if(has('paCategories'))out.paCategories=str(b.paCategories,300);
  // offers: which kinds of product the brand sells, from a fixed list, e.g. "Folding bike, Folding e-bike, Accessories"
  if(has('offers')){const o=String(b.offers||'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean),ok=OFFERS.filter(x=>o.some(y=>y.toLowerCase()===x.toLowerCase()));if(o.length&&ok.length!==o.length)bad.push('offers (use: '+OFFERS.join(', ')+')');else out.offers=ok.join(', ')}
  // na: brand facts the maker does not publish (checked, so they stop showing up as gaps)
  if(has('na')){const ok=['units','revenueGBPm','skuCount','paSkus','paCategories','offers','figuresYear','hq','founded','employees','ownership','website','regions'],a=(Array.isArray(b.na)?b.na:[]).map(x=>str(x,30));if(!a.every(x=>ok.includes(x)))bad.push('na (a list of fact names)');else out.na=[...new Set(a)]}
  if(has('figuresYear')){const f=str(b.figuresYear,4);if(f===''||/^\d{4}$/.test(f))out.figuresYear=f;else bad.push('figuresYear (a 4-digit year)')}
  if(has('sources')){const a=(Array.isArray(b.sources)?b.sources:String(b.sources||'').split(/\r?\n/)).map(x=>str(x,1000)).filter(Boolean);if(a.length>10||!a.every(https))bad.push('sources (up to 10 links starting with https://)');else out.sources=a}
  if(has('regions')){const r={};for(const k of REGIONS){const a=(Array.isArray(b.regions?.[k])?b.regions[k]:String(b.regions?.[k]||'').split(',')).map(x=>str(x,60)).filter(Boolean).slice(0,30);r[k]=a}out.regions=r}
  return {out,bad};
}
// Like cleanBrand, only the fields that were sent are returned, so a partial update (or a CSV with fewer columns) never blanks the rest.
export function cleanProduct(p){
  const bad=[],out={};const has=k=>Object.prototype.hasOwnProperty.call(p,k);
  out.brand=str(p.brand,120);out.model=str(p.model,120);
  const blank=/^(null|undefined|none|n\/a|na|nan|tbc|tbd|-+)$/i;if(blank.test(out.brand))out.brand='';if(blank.test(out.model))out.model='';
  if(!out.brand||!out.model)bad.push('brand and model are required');
  if(has('category')){if(p.category===''||p.category==null)out.category='';else if(CATEGORIES.includes(p.category))out.category=p.category;else bad.push('category')}
  for(const k of ['priceGBP','priceEUR','priceUSD','weightKg','foldL','foldW','foldH','batteryWh','rangeKm','maxLoadKg'])if(has(k)){const n=num(p[k]);if(n===undefined)bad.push(k);else out[k]=n}
  for(const [k,n] of [['line',60],['priceNote',200],['wheelIn',20],['motor',160],['gears',80],['notes',1200]])if(has(k))out[k]=str(p[k],n);
  // Free-text spec fields: the same list the Brompton product page shows, plus colours and handlebar options.
  for(const k of SPEC_TEXT)if(has(k))out[k]=str(p[k],300);
  // Specs marked "not published" (checked: the maker does not say). Only known spec keys are kept.
  if(has('na')){const a=(Array.isArray(p.na)?p.na:[]).map(x=>str(x,40));if(a.length>80||!a.every(x=>NA_KEYS.includes(x)))bad.push('na (a list of spec names)');else out.na=[...new Set(a)]}
  if(has('launch')){const l=launch(p.launch);if(l===undefined)bad.push('launch (use 2025, 2025-09 or 2025-09-30)');else out.launch=l}
  if(has('lastVerified')){const lv=date(p.lastVerified);if(lv===undefined)bad.push('lastVerified');else out.lastVerified=lv}
  for(const k of ['url','sourceUrl'])if(has(k)){const v=str(p[k],1000);if(v&&!https(v))bad.push(k+' must start with https://');else out[k]=v}
  // v3.13: on sale or discontinued (kept for history and comparisons, hidden by default)
  if(has('status')){const v=str(p.status,20);if(v&&v!=='discontinued')bad.push('status (discontinued or blank)');else out.status=v}
  if(has('discontinuedAt')){const v=p.discontinuedAt?date(p.discontinuedAt):'';if(v===undefined)bad.push('discontinuedAt');else out.discontinuedAt=v}
  // v3.13: street prices at shops: [{shop, url, price, currency, at, error}]
  if(has('retail')){const r=Array.isArray(p.retail)?p.retail:[];if(r.length>12)bad.push('retail (12 shops at most)');else{const list=[];for(const x of r){const shop=str(x&&x.shop,60),url=str(x&&x.url,1000);if(!shop||!https(url)){bad.push('retail: each shop needs a name and an https:// link');break}const o={shop,url};const n=num(x.price==null?x.price:String(x.price).replace(/[£€$,\s]/g,''));if(x.price!=null&&x.price!==''&&n===undefined){bad.push('retail price');break}if(n!=null)o.price=n;if(/^(GBP|EUR|USD)$/.test(x.currency||''))o.currency=x.currency;if(x.at&&date(String(x.at).slice(0,10)))o.at=String(x.at).slice(0,25);if(x.error)o.error=str(x.error,200);list.push(o)}out.retail=list}}
  return {out,bad};
}
export const productKey=p=>`${p.brand}|${p.model}`.toLowerCase();
