import {get,put} from '@vercel/blob';
export const paths={sources:'ci/sources.json',articles:'ci/articles.json',status:'ci/status.json',history:'ci/history.json',test:'ci/test-items.json',lock:'ci/lock.json'};
// Blob auth: use a static token if present, otherwise the store id (BLOB_STORE_ID, or the
// prefixed BLOB_READ_WRITE_TOKEN_STORE_ID that Vercel creates when the store is connected with
// that env prefix) with the OIDC token Vercel injects automatically.
export function blobAuth(){const token=process.env.BLOB_READ_WRITE_TOKEN;if(token)return {token};const storeId=process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;if(storeId)return {storeId};throw new Error('Blob storage is not configured: set BLOB_READ_WRITE_TOKEN, or connect a Blob store to this project')}
export async function readJson(path,fallback){const r=await get(path,{access:'private',useCache:false,...blobAuth()});if(!r||r.statusCode!==200||!r.stream)return structuredClone(fallback);return await new Response(r.stream).json()}
export async function writeJson(path,data){await put(path,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',...blobAuth()});return data}
export const defaults=[
{id:'bbc-world',name:'BBC News - World',type:'rss',url:'https://feeds.bbci.co.uk/news/world/rss.xml',brand:'BBC World validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()},
{id:'validation-feed',name:'Tracker Validation Feed',type:'test',brand:'Validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()}
];
export async function getSources(){const d=await readJson(paths.sources,{version:1,sources:defaults});if(!Array.isArray(d.sources))d.sources=[];for(const required of defaults){if(!d.sources.some(s=>s.id===required.id||(required.url&&s.url===required.url)))d.sources.unshift(required)}return d}
