import crypto from 'node:crypto';
import {seedProducts} from './seed-products.js';
export const CATEGORIES=['Folding bike','Folding e-bike','E-bike'];
const TEXT={folded:120,wheel:60,gears:80,motor:120,frame:80,notes:500};
const NUM=['price','weight','battery','range','launched'];
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:NaN};
// Validate and normalise one product. Returns {product} or {error}.
export function clean(b,prev={}){
  const brand=String(b.brand||'').trim().slice(0,80),model=String(b.model||'').trim().slice(0,120);
  if(!brand||!model)return{error:'Brand and model are required'};
  if(!CATEGORIES.includes(b.category))return{error:`Category must be one of: ${CATEGORIES.join(', ')}`};
  const p={id:prev.id||String(b.id||'')||crypto.randomUUID(),brand,model,category:b.category};
  for(const k of NUM){const n=num(b[k]);if(Number.isNaN(n))return{error:`${k} must be a positive number`};p[k]=n}
  if(p.launched!==null&&(p.launched<1990||p.launched>2100||!Number.isInteger(p.launched)))return{error:'launched must be a year'};
  for(const [k,max] of Object.entries(TEXT))p[k]=String(b[k]||'').trim().slice(0,max);
  const url=String(b.url||'').trim();if(url&&!/^https:\/\//i.test(url))return{error:'Link must start with https://'};p.url=url.slice(0,500);
  p.updatedAt=new Date().toISOString();return{product:p};
}
// Merge incoming rows into the list; rows without an id match an existing brand+model.
export function upsert(list,rows){
  const out=[...list],errors=[];
  rows.forEach((r0,i)=>{let r=r0;
    const key=x=>`${x.brand}|${x.model}`.toLowerCase();
    let at=out.findIndex(x=>r.id&&x.id===r.id);if(at<0)at=out.findIndex(x=>key(x)===key(r));
    if(at>=0&&!(r.id&&out[at].id===r.id))r={...r,brand:out[at].brand,model:out[at].model}; // matched by name: keep the stored spelling
    const c=clean(r,at>=0?out[at]:{});if(c.error){errors.push(`Row ${i+1}: ${c.error}`);return}
    if(at>=0)out[at]=c.product;else out.push(c.product);
  });
  return{products:out,errors};
}
export {seedProducts};
