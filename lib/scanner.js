import crypto from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import {paths,readJson,writeJson,getSources} from './store.js';

const parser=new XMLParser({ignoreAttributes:false,processEntities:true});
const arr=x=>Array.isArray(x)?x:x?[x]:[];
const txt=v=>v==null?'':typeof v==='object'?(v['#text']??''):v;
const strip=s=>String(txt(s)||'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
const iso=d=>{const t=new Date(txt(d));return isNaN(t)?null:t.toISOString()};
const linkOf=l=>{if(typeof l==='string')return l;const a=arr(l);const pick=a.find(k=>typeof k==='object'&&(!k['@_rel']||k['@_rel']==='alternate'))||a[0];return typeof pick==='string'?pick:pick?.['@_href']||pick?.['#text']||''};
const bike=/bike|bicycle|e-bike|ebike|folding|cycle|cargo|cycling/i;
const idFor=(s,x)=>crypto.createHash('sha256').update([s.id,x.url||'',x.title||'',x.url?'':(x.published||'')].join('|').toLowerCase()).digest('hex').slice(0,32);

const UA='Mozilla/5.0 (compatible; CompetitorIntelligence/3.2)';
async function fetchText(url,ms=8000){const r=await fetch(url,{headers:{'user-agent':UA,accept:'application/rss+xml,application/atom+xml,application/xml,text/html,*/*'},signal:AbortSignal.timeout(ms),redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}
const withTimeout=(p,ms)=>{let t;return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(new Error('Timed out')),ms)})]).finally(()=>clearTimeout(t))};
const esc=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const brandRe=b=>new RegExp('\\b('+String(b||'').split('/').map(x=>esc(x.trim()).replace(/[’']/g,'.?')).filter(Boolean).join('|')+')\\b','i');
const FEED_PATHS=['/blogs/news.atom','/feed','/feed/','/rss','/news/feed','/blog/feed'];
async function rss(s){return parseItems(await fetchText(s.url),s)}
function parseItems(text,s){
  const xml=parser.parse(text);
  const channel=xml?.rss?.channel;
  const atom=xml?.feed;
  const items=channel?arr(channel.item):arr(atom?.entry);
  return items.map(x=>({title:strip(x.title),summary:strip(x.description||x.summary||x.content),url:linkOf(x.link)||(typeof x.guid==='string'?x.guid:''),published:iso(x.pubDate||x.published||x.updated||x['dc:date']),source:strip(x.source)||strip(channel?.title||atom?.title)||s.name}));
}
// Website: find the RSS/Atom feed (advertised in <head>, or at common paths), remember it, then read it.
async function site(s){
  const tryFeed=async(u,ms)=>{try{const it=parseItems(await fetchText(u,ms),s);return it.length?it:null}catch{return null}};
  if(s.feedUrl){const it=await tryFeed(s.feedUrl);if(it)return it}
  if(s.noFeedAt&&Date.now()-Date.parse(s.noFeedAt)<7*864e5)throw new Error('No RSS/Atom feed found - check this site manually');
  const html=await fetchText(s.url);
  const adv=[...html.matchAll(/<link[^>]+>/gi)].map(m=>m[0]).filter(t=>/type=["']application\/(rss|atom)\+xml/i.test(t)).map(t=>(t.match(/href=["']([^"']+)["']/i)||[])[1]).filter(Boolean).map(h=>{try{return new URL(h.replace(/&amp;/g,'&'),s.url).href}catch{return null}}).filter(Boolean);
  const o=new URL(s.url).origin,b=s.url.replace(/\/$/,'');
  const cands=[...new Set([...adv,...FEED_PATHS.map(p=>o+p),...FEED_PATHS.map(p=>b+p)])].slice(0,6);
  for(const u of cands){const it=await tryFeed(u,4000);if(it){s.feedUrl=u;delete s.noFeedAt;return it}}
  s.noFeedAt=new Date().toISOString();
  throw new Error('No RSS/Atom feed found - check this site manually');
}
async function google(s){
  const url='https://news.google.com/rss/search?q='+encodeURIComponent(s.query||s.brand)+'&hl=en-GB&gl=GB&ceid=GB:en';
  return rss({...s,url});
}

export async function runScan(trigger='manual'){
  const startedAt=new Date().toISOString();
  const runId=crypto.randomUUID();
  const logs=[];
  const log=(step,status,message,details={})=>logs.push({timestamp:new Date().toISOString(),step,status,message,details});
  log('scan.start','info','Scan started',{runId,trigger});
  const lock=await readJson(paths.lock,null);
  log('lock.check','info','Existing scan lock checked',{active:!!lock});
  if(lock&&Date.now()-new Date(lock.startedAt).getTime()<20*60*1000){
    log('lock.check','error','A recent scan lock is active',{existingRunId:lock.runId,startedAt:lock.startedAt});
    const e=new Error('A scan is already running');e.logs=logs;throw e;
  }
  await writeJson(paths.lock,{runId,startedAt,trigger});
  log('lock.acquire','success','Scan lock acquired');
  try{
    const config=await getSources();
    log('config.load','success','Source configuration loaded',{totalSources:config.sources.length,enabledSources:config.sources.filter(x=>x.enabled).length});
    const old=await readJson(paths.articles,{articles:[]});
    log('articles.load','success','Existing articles loaded',{articleCount:old.articles.length});
    const test=await readJson(paths.test,{items:[]});
    log('validation.load','success','Validation items loaded',{itemCount:test.items.length});
    const known=new Set(old.articles.map(x=>x.id));
    const added=[],results=[];let examined=0,duplicates=0;
    // Least-recently-scanned first, 10 at a time, stop starting new sources near the 60s function limit.
    const queue=config.sources.filter(x=>x.enabled).sort((a,b)=>(Date.parse(a.lastScanAt)||0)-(Date.parse(b.lastScanAt)||0));
    const deadline=Date.now()+42000;let skipped=0;
    const seenUrl=new Set(old.articles.filter(a=>a.url).map(a=>`${a.brand}|${a.url}`));
    const scanSource=async s=>{
      if(Date.now()>deadline){skipped++;return}
      const t=Date.now();
      log('source.start','info','Source scan started',{sourceId:s.id,name:s.name,type:s.type,filterMode:s.filterMode||'bike'});
      try{
        let items=await withTimeout((async()=>s.type==='rss'?await rss(s):s.type==='site'?await site(s):s.type==='google-news'?await google(s):test.items.map(x=>({...x,source:s.name})))(),20000);
        const fetched=items.length;examined+=fetched;
        const bre=brandRe(s.brand),hay=x=>`${x.title} ${x.summary}`;
        items=items.filter(x=>x.title&&x.url!==undefined&&(s.validation||s.filterMode==='all'||(s.filterMode==='brand'?bre.test(hay(x))&&(s.type!=='google-news'||bike.test(hay(x))):bike.test(hay(x)))));
        const accepted=items.length;let sourceAdded=0,sourceDuplicates=0;
        for(const x of items){
          const id=idFor(s,x),uk=x.url?`${s.brand}|${x.url}`:'';if(known.has(id)||(uk&&seenUrl.has(uk))){duplicates++;sourceDuplicates++;continue}if(uk)seenUrl.add(uk);
          known.add(id);sourceAdded++;added.push({id,title:x.title,summary:x.summary,url:x.url||'',published:x.published||new Date().toISOString(),source:x.source||s.name,sourceId:s.id,brand:s.brand,validation:!!s.validation,ingestedAt:new Date().toISOString()});
        }
        const result={sourceId:s.id,name:s.name,status:'ok',fetched,accepted,added:sourceAdded,duplicates:sourceDuplicates,durationMs:Date.now()-t};results.push(result);s.lastScanAt=new Date().toISOString();s.lastSuccessAt=s.lastScanAt;delete s.lastError;
        log('source.complete','success','Source scan completed',result);
      }catch(e){
        const result={sourceId:s.id,name:s.name,status:/^No RSS/.test(e.message)?'no-feed':'failed',error:e.message,durationMs:Date.now()-t};results.push(result);s.lastScanAt=new Date().toISOString();s.lastError=e.message;
        log('source.complete','error','Source scan failed',result);
      }
    };
    await Promise.all(Array.from({length:10},async()=>{while(queue.length)await scanSource(queue.shift())}));
    if(skipped)log('scan.deferred','info','Time budget reached; deferred sources are scanned first next run',{skipped});
    const articles=[...added,...old.articles].sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0)).slice(0,5000);
    log('articles.merge','success','New and existing articles merged',{newArticles:added.length,totalArticles:articles.length,duplicatesSkipped:duplicates});
    const completedAt=new Date().toISOString();
    log('persist.articles','info','Saving article data',{articleCount:articles.length});
    await writeJson(paths.articles,{updatedAt:completedAt,articles});
    log('persist.articles','success','Article data saved');
    await writeJson(paths.sources,config);log('persist.sources','success','Source configuration saved');
    const report={runId,trigger,startedAt,completedAt,durationMs:Date.now()-new Date(startedAt).getTime(),sourcesChecked:results.length,sourcesDeferred:skipped,sourcesSuccessful:results.filter(x=>x.status==='ok').length,articlesExamined:examined,newArticles:added.length,duplicatesSkipped:duplicates,status:results.some(x=>x.status==='failed')?'partial':'healthy',results,logs};
    log('persist.status','info','Saving status and history');
    const history=await readJson(paths.history,{runs:[]});
    log('persist.status','success','Status and history saved',{historyRuns:Math.min(history.runs.length+1,50)});
    report.logs=logs;
    await writeJson(paths.status,report);
    await writeJson(paths.history,{runs:[report,...history.runs].slice(0,50)});
    return report;
  }catch(e){
    log('scan.error','error','Scan terminated with an error',{error:e.message});
    e.logs=logs;throw e;
  }finally{
    try{await writeJson(paths.lock,null);log('lock.release','success','Scan lock released')}catch(e){log('lock.release','error','Scan lock could not be released',{error:e.message})}
  }
}
