import crypto from 'node:crypto';
export const COOKIE='ci_session';
/* Sessions (v3.13): the cookie is "<expiry>.<name>.<signature>", so every change can say who made it.
   Older cookies ("<expiry>.<signature>") still work and count as "Someone".
   Sign-in: with SITE_USERS set ("Jiri:pass1, Anna:pass2") each person has their own password;
   without it the shared SITE_PASSWORD works and people type their name. */
const sign=(v)=>crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update(v).digest('hex');
const enc=(s)=>Buffer.from(String(s||''),'utf8').toString('base64url');
const dec=(s)=>{try{return Buffer.from(s,'base64url').toString('utf8')}catch{return ''}};
export const cleanName=(n)=>String(n||'').replace(/[^\p{L}\p{N} .'\-]/gu,'').replace(/\s+/g,' ').trim().slice(0,40);
export function token(name=''){const expiry=String(Date.now()+1209600000),n=enc(cleanName(name));return `${expiry}.${n}.${sign(expiry+'.'+n)}`}
function parse(raw=''){
  if(!process.env.SESSION_SECRET)return null;const p=String(raw).split('.');
  const [expiry,n,sig]=p.length===3?p:[p[0],null,p[1]];if(!expiry||!sig||Number(expiry)<Date.now())return null;
  const expected=sign(n==null?expiry:expiry+'.'+n);
  try{if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null}catch{return null}
  return {name:n?dec(n):''};
}
export function valid(raw=''){return !!parse(raw)}
export function cookie(req){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}
export function authorised(req){return valid(cookie(req))}
export function userOf(req){const s=parse(cookie(req));return (s&&s.name)||'Someone'}
// SITE_USERS: "Name:password" pairs separated by commas or new lines (a password may not contain a comma).
export function users(){return String(process.env.SITE_USERS||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(':');return i>0?{name:cleanName(x.slice(0,i)),password:x.slice(i+1)}:null}).filter(x=>x&&x.name&&x.password)}
const same=(a,b)=>{a=String(a);b=String(b);return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))};
// Returns the signed-in name, or null when the password is wrong.
export function check(name,password){
  const list=users();
  if(list.length){const u=list.find(x=>x.name.toLowerCase()===cleanName(name).toLowerCase());return u&&same(password,u.password)?u.name:null}
  return same(password,process.env.SITE_PASSWORD||'')?(cleanName(name)||'Someone'):null;
}
