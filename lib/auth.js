import crypto from 'node:crypto';
export const COOKIE='ci_session';
export function token(){const secret=process.env.SESSION_SECRET||'';const expiry=Date.now()+1000*60*60*24*14;const value=String(expiry);const sig=crypto.createHmac('sha256',secret).update(value).digest('hex');return `${value}.${sig}`;}
export function valid(raw=''){const [expiry,sig]=raw.split('.');if(!expiry||!sig||Number(expiry)<Date.now())return false;const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update(expiry).digest('hex');try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
export function cookie(req){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.split('=')[1]||'';}