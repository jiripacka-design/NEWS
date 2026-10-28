import {paths,readJson} from './store.js';
import {curated} from './curated.js';
import events from '../public/events.js';
// Everything the digest needs: scanned + manually logged articles (with any manual event tags) plus the curated items.
export async function loadDigestInputs(){
  const [a,t,b]=await Promise.all([readJson(paths.articles,{articles:[]}),readJson(paths.tags,{tags:{}}),readJson(paths.brands,{brands:{}})]);
  const tags=t.tags||{};
  const live=(a.articles||[]).filter(x=>!x.validation).map(x=>{const manual=tags[x.id]||x.eventType;return{id:x.id,date:String(x.published||x.ingestedAt||'').slice(0,10),brand:x.brand,title:x.title||'',summary:x.summary||'',url:x.url||'',evt:events.EVENT_TYPES.includes(manual)?manual:events.classify(x.title,x.summary)}});
  const cur=curated.map(c=>({date:c.date,brand:c.brand,title:c.title,summary:c.summary,url:c.url,evt:c.eventType}));
  const brands=b.brands||{};
  const us=Object.keys(brands).find(k=>brands[k].isUs)||'Brompton';
  const watch=Object.keys(brands).filter(k=>brands[k].watch);
  const threat={};for(const k of watch)threat[k]={level:brands[k].threat||'',reason:brands[k].threatReason||''};
  return {items:[...cur,...live],meta:{us,watch,threat}};
}
export async function makeDigest(now=Date.now()){
  const {items,meta}=await loadDigestInputs();
  // Only brands that actually appear are counted; "General" industry items and validation feeds are not competitors.
  const brands=[...new Set(items.map(i=>i.brand))].filter(x=>x&&x!=='General'&&!/validation/i.test(x));
  const d=events.buildDigest(items,{...meta,brands},now,7);
  return {digest:d,text:events.digestText(d,now,'text'),slack:events.digestText(d,now,'slack'),html:events.digestHtml(d,now)};
}
export function channels(){return {slack:!!process.env.SLACK_WEBHOOK_URL,email:!!(process.env.RESEND_API_KEY&&process.env.DIGEST_TO)}}
export async function sendDigest(made){
  const out={slack:null,email:null};
  if(process.env.SLACK_WEBHOOK_URL){
    try{const r=await fetch(process.env.SLACK_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:made.slack})});out.slack=r.ok?'sent':`failed (HTTP ${r.status})`}catch(e){out.slack='failed ('+e.message+')'}
  }
  if(process.env.RESEND_API_KEY&&process.env.DIGEST_TO){
    try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.RESEND_API_KEY}`},body:JSON.stringify({from:process.env.DIGEST_FROM||'Competitor tracker <onboarding@resend.dev>',to:process.env.DIGEST_TO.split(',').map(x=>x.trim()).filter(Boolean),subject:'Competitor digest',html:made.html,text:made.text})});out.email=r.ok?'sent':`failed (HTTP ${r.status})`}catch(e){out.email='failed ('+e.message+')'}
  }
  return out;
}
