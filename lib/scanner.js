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

async function rss(s){
  const r=await fetch(s.url,{headers:{'user-agent':'CompetitorIntelligence/3.0'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const xml=parser.parse(await r.text());
  const channel=xml?.rss?.channel;
  const atom=xml?.feed;
  const items=channel?arr(channel.item):arr(atom?.entry);
  return items.map(x=>({title:strip(x.title),summary:strip(x.description||x.summary||x.content),url:linkOf(x.link)||(typeof x.guid==='string'?x.guid:''),published:iso(x.pubDate||x.published||x.updated||x['dc:date']),source:strip(x.source)||strip(channel?.title||atom?.title)||s.name}));
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
    for(const s of config.sources.filter(x=>x.enabled)){
      const t=Date.now();
      log('source.start','info','Source scan started',{sourceId:s.id,name:s.name,type:s.type,filterMode:s.filterMode||'bike'});
      try{
        let items=s.type==='rss'?await rss(s):s.type==='google-news'?await google(s):test.items.map(x=>({...x,source:s.name}));
        const fetched=items.length;examined+=fetched;
        items=items.filter(x=>x.title&&x.url!==undefined&&((s.validation||s.filterMode==='all')||bike.test(`${x.title} ${x.summary}`)));
        const accepted=items.length;let sourceAdded=0,sourceDuplicates=0;
        for(const x of items){
          const id=idFor(s,x);if(known.has(id)){duplicates++;sourceDuplicates++;continue}
          known.add(id);sourceAdded++;added.push({id,title:x.title,summary:x.summary,url:x.url||'',published:x.published||new Date().toISOString(),source:x.source||s.name,sourceId:s.id,brand:s.brand,validation:!!s.validation,ingestedAt:new Date().toISOString()});
        }
        const result={sourceId:s.id,name:s.name,status:'ok',fetched,accepted,added:sourceAdded,duplicates:sourceDuplicates,durationMs:Date.now()-t};results.push(result);s.lastScanAt=new Date().toISOString();s.lastSuccessAt=s.lastScanAt;delete s.lastError;
        log('source.complete','success','Source scan completed',result);
      }catch(e){
        const result={sourceId:s.id,name:s.name,status:'failed',error:e.message,durationMs:Date.now()-t};results.push(result);s.lastScanAt=new Date().toISOString();s.lastError=e.message;
        log('source.complete','error','Source scan failed',result);
      }
    }
    const articles=[...added,...old.articles].sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0)).slice(0,5000);
    log('articles.merge','success','New and existing articles merged',{newArticles:added.length,totalArticles:articles.length,duplicatesSkipped:duplicates});
    const completedAt=new Date().toISOString();
    log('persist.articles','info','Saving article data',{articleCount:articles.length});
    await writeJson(paths.articles,{updatedAt:completedAt,articles});
    log('persist.articles','success','Article data saved');
    await writeJson(paths.sources,config);log('persist.sources','success','Source configuration saved');
    const report={runId,trigger,startedAt,completedAt,durationMs:Date.now()-new Date(startedAt).getTime(),sourcesChecked:results.length,sourcesSuccessful:results.filter(x=>x.status==='ok').length,articlesExamined:examined,newArticles:added.length,duplicatesSkipped:duplicates,status:results.some(x=>x.status==='failed')?'partial':'healthy',results,logs};
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
