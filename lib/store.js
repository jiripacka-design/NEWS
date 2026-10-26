import {list,put} from '@vercel/blob';
export const paths={sources:'ci/sources.json',articles:'ci/articles.json',status:'ci/status.json',history:'ci/history.json',test:'ci/test-items.json',lock:'ci/lock.json'};
export async function readJson(path,fallback){try{const r=await list({prefix:path,limit:10});const b=r.blobs.find(x=>x.pathname===path)||r.blobs[0];if(!b)return structuredClone(fallback);const q=await fetch(b.url+'?v='+Date.now(),{cache:'no-store'});if(!q.ok)return structuredClone(fallback);return await q.json()}catch{return structuredClone(fallback)}}
export async function writeJson(path,data){if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('BLOB_READ_WRITE_TOKEN is not configured');await put(path,JSON.stringify(data),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});return data}
export const defaults=[
{id:'bbc-world',name:'BBC News - World',type:'rss',url:'https://feeds.bbci.co.uk/news/world/rss.xml',brand:'BBC World validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()},
{id:'validation-feed',name:'Tracker Validation Feed',type:'test',brand:'Validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()}
];
export async function getSources(){const d=await readJson(paths.sources,{version:1,sources:defaults});if(!Array.isArray(d.sources))d.sources=[];for(const required of defaults){if(!d.sources.some(s=>s.id===required.id||s.url===required.url))d.sources.unshift(required)}return d}
