// Finding a picture for a news item or a brand: read it from the RSS item, or from the page's preview image
// (og:image / twitter:image). Only https image links are kept; nothing is downloaded or copied.
const UA='Mozilla/5.0 (compatible; CompetitorIntelligence/3.5)';
const arr=x=>Array.isArray(x)?x:x?[x]:[];
const txt=v=>v==null?'':typeof v==='object'?(v['#text']??''):String(v);

// Server-side fetches follow links that come from feeds, so refuse anything that is not a public web address.
export function isPublicHttpUrl(u){
  try{
    const x=new URL(u);if(!/^https?:$/.test(x.protocol))return false;
    const h=x.hostname.toLowerCase();
    if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h.includes(':')||!h.includes('.'))return false;
    const m=h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if(m){const a=+m[1],b=+m[2];if(a===10||a===127||a===0||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127))return false}
    return true;
  }catch{return false}
}
const JUNK=/(^|[\/_.\-])(pixel|spacer|1x1|beacon|tracking|blank)([\/_.\-]|$)|\/emoji\/|gravatar\.com|\.(gif|svg)(\?|$)/i;
// Absolute https URL, or '' if it is not usable as a picture.
export function cleanImageUrl(u,base){
  if(!u)return '';
  try{
    const x=new URL(String(u).trim().replace(/&amp;/g,'&'),base||undefined);
    if(x.protocol==='http:')x.protocol='https:';
    if(x.protocol!=='https:'||!isPublicHttpUrl(x.href))return '';
    const s=x.href;return s.length>1000||JUNK.test(s)?'':s;
  }catch{return ''}
}
const attr=(tag,a)=>{const m=tag.match(new RegExp('\\b'+a+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));return m?(m[1]??m[2]):''};
// The preview image named in a page's <head>.
export function metaImage(html,base){
  const head=String(html||'').slice(0,400000),metas=[...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
  for(const key of ['og:image:secure_url','og:image','og:image:url','twitter:image','twitter:image:src']){
    for(const t of metas){const n=(attr(t,'property')||attr(t,'name')).toLowerCase();if(n===key){const c=cleanImageUrl(attr(t,'content'),base);if(c)return c}}
  }
  for(const t of head.match(/<link\b[^>]*>/gi)||[])if(/image_src/i.test(attr(t,'rel'))){const c=cleanImageUrl(attr(t,'href'),base);if(c)return c}
  return '';
}
// The picture that comes with an RSS/Atom item (media:content, media:thumbnail, enclosure, or the first <img> in the text).
export function itemImage(x,base){
  const isImg=m=>{const t=String(m['@_type']||m['@_medium']||'image').toLowerCase();return t.startsWith('image')};
  const media=[...arr(x['media:content']),...arr(x['media:thumbnail']),...arr(x['media:group']&&x['media:group']['media:content']),...arr(x['media:group']&&x['media:group']['media:thumbnail']),...arr(x.enclosure)].filter(m=>m&&typeof m==='object');
  for(const m of media)if(isImg(m)){const c=cleanImageUrl(m['@_url'],base);if(c)return c}
  for(const l of arr(x.link))if(l&&typeof l==='object'&&l['@_rel']==='enclosure'&&/^image/i.test(l['@_type']||'')){const c=cleanImageUrl(l['@_href'],base);if(c)return c}
  const it=x['itunes:image']&&x['itunes:image']['@_href'];if(it){const c=cleanImageUrl(it,base);if(c)return c}
  const html=[x['content:encoded'],x.content,x.description,x.summary].map(txt).join(' ');
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){const c=cleanImageUrl(attr(m[0],'src')||attr(m[0],'data-src'),base);if(c)return c}
  return '';
}
async function readCapped(r,max){
  const reader=r.body.getReader(),chunks=[];let n=0;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);n+=value.length;if(n>=max){await reader.cancel();break}}
  return Buffer.concat(chunks).toString('utf8');
}
// Fetch a page and return its preview image ('' if none). Reads at most ~300 KB.
export async function fetchPageImage(url,ms=4500){
  if(!isPublicHttpUrl(url))return '';
  const r=await fetch(url,{headers:{'user-agent':UA,accept:'text/html,*/*'},signal:AbortSignal.timeout(ms),redirect:'follow'});
  if(!r.ok||!/html|xml/i.test(r.headers.get('content-type')||'text/html'))return '';
  if(r.url&&!isPublicHttpUrl(r.url))return '';
  return metaImage(await readCapped(r,300000),r.url||url);
}
export const isGoogleNewsUrl=u=>/^https?:\/\/news\.google\.com\//i.test(u||'');
