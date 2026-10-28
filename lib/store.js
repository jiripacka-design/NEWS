import fs from 'node:fs/promises';
import nodePath from 'node:path';
import {seedSources} from './seed-sources.js';
export const paths={sources:'ci/sources.json',articles:'ci/articles.json',status:'ci/status.json',history:'ci/history.json',test:'ci/test-items.json',lock:'ci/lock.json',brands:'ci/brands.json',products:'ci/products.json',tags:'ci/tags.json'};
// Blob auth: use a static token if present, otherwise the store id (BLOB_STORE_ID, or the
// prefixed BLOB_READ_WRITE_TOKEN_STORE_ID that Vercel creates when the store is connected with
// that env prefix) with the OIDC token Vercel injects automatically.
export function blobAuth(){const token=process.env.BLOB_READ_WRITE_TOKEN;if(token)return {token};const storeId=process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;if(storeId)return {storeId};throw new Error('Blob storage is not configured: set BLOB_READ_WRITE_TOKEN, or connect a Blob store to this project')}
// CI_LOCAL_STORE=<dir> keeps the JSON files on disk instead of Vercel Blob. For local development and tests only.
const localFile=p=>nodePath.join(process.env.CI_LOCAL_STORE,p);
export async function readJson(path,fallback){
  if(process.env.CI_LOCAL_STORE){try{return JSON.parse(await fs.readFile(localFile(path),'utf8'))}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e}}
  const {get}=await import('@vercel/blob');
  const r=await get(path,{access:'private',useCache:false,...blobAuth()});if(!r||r.statusCode!==200||!r.stream)return structuredClone(fallback);return await new Response(r.stream).json()}
export async function writeJson(path,data){
  if(process.env.CI_LOCAL_STORE){const f=localFile(path);await fs.mkdir(nodePath.dirname(f),{recursive:true});await fs.writeFile(f,JSON.stringify(data));return data}
  const {put}=await import('@vercel/blob');
  await put(path,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',...blobAuth()});return data}
export const defaults=[
{id:'bbc-world',name:'BBC News - World',type:'rss',url:'https://feeds.bbci.co.uk/news/world/rss.xml',brand:'BBC World validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()},
{id:'validation-feed',name:'Tracker Validation Feed',type:'test',brand:'Validation',enabled:true,validation:true,filterMode:'all',createdAt:new Date().toISOString()}
];
export async function getSources(){const d=await readJson(paths.sources,{version:1,sources:defaults});if(!Array.isArray(d.sources))d.sources=[];const gone=new Set(d.removed||[]);for(const x of seedSources){if(!gone.has(x.id)&&!d.sources.some(s=>s.id===x.id||(x.url&&s.url===x.url)))d.sources.push({createdAt:new Date().toISOString(),...x})}for(const required of defaults){if(!d.sources.some(s=>s.id===required.id||(required.url&&s.url===required.url)))d.sources.unshift(required)}return d}
