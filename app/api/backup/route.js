import {authorised,userOf} from '../../../lib/auth.js';
import {readJson,writeJson} from '../../../lib/store.js';
import {list,createBackup,getBackup,snapshot,restore} from '../../../lib/backup.js';
import {P} from '../../../lib/audit.js';
export const maxDuration=60;
// GET: the list of stored backups.  GET ?download=now|<id>: a backup file to save.
export async function GET(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const dl=new URL(req.url).searchParams.get('download');
  if(dl){const b=dl==='now'?await snapshot():await getBackup(dl);if(!b)return Response.json({error:'No such backup'},{status:404});return new Response(JSON.stringify(b),{headers:{'content-type':'application/json','content-disposition':`attachment; filename="brompton-enemies-backup-${b.createdAt.slice(0,10)}.json"`,'cache-control':'private, no-store'}})}
  return Response.json({backups:await list()},{headers:{'cache-control':'private, no-store'}});
}
// POST {create:true}: make a backup now.  POST {restore:id} or {restore:'file', data:{…}, confirm:'RESTORE'}: put a backup back
// (a safety backup of the current data is made first).
export async function POST(req){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  const b=await req.json().catch(()=>({})),by=userOf(req);
  if(b.create)return Response.json({backup:await createBackup(`Made by ${by}`),backups:await list()});
  if(b.restore){
    if(b.confirm!=='RESTORE')return Response.json({error:'Restoring replaces the current data. Send confirm: "RESTORE".'},{status:400});
    const data=b.restore==='file'?b.data:await getBackup(String(b.restore));if(!data)return Response.json({error:'No such backup'},{status:404});
    try{
      const r=await restore(data,by);
      const a=await readJson(P.audit,{entries:[]});a.entries=[{id:Math.random().toString(36).slice(2,14),at:new Date().toISOString(),by,via:'restore',kind:'all',key:'backup',name:`Restored the backup from ${String(data.createdAt||'').slice(0,10)}`,action:'restore',before:{},after:{},noUndo:true},...(a.entries||[])];await writeJson(P.audit,a);
      return Response.json({ok:true,...r,backups:await list()});
    }catch(e){return Response.json({error:e.message},{status:400})}
  }
  return Response.json({error:'Send create or restore'},{status:400});
}
