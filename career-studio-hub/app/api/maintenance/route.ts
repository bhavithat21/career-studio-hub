import {sources} from '../../../lib/catalog';
import {profile,discover,tick} from '../../../lib/pipeline';
import {withAuthenticatedTenant,getAuthPool,accessErrorResponse} from '../../../lib/auth';
import {runWithTenant} from '../../../lib/tenant';
import {read,write} from '../../../lib/store';
import {reserveAiCall} from '../../../lib/ai-quota';
import {cronAuthorized} from '../../../lib/maintenance-auth';
import {syncGmail} from '../../../lib/gmail';
import {getDiscoveryRun,startDiscoveryRun} from '../../../lib/discovery-run';
import {publishDiscoveryRun} from '../../../lib/discovery-queue';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=300;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function tenantMaintenance(req:Request){const body:any=req.method==='POST'?await req.json().catch(()=>({})):{};const p=await profile();if(body.source){if(!sources.some(source=>source.id===body.source)||!p.filters.sources.includes(body.source))return json({error:'Source not enabled'},400);return json(await discover(body.source));}if(body.action==='tick'){if(p.preparationMode==='ai')await reserveAiCall('scheduled-resume');return json(await tick());}return json({sources:sources.filter(source=>p.filters.sources.includes(source.id)).map(source=>source.id),instructions:'Each request operates only on your authenticated workspace.'});}
async function scheduledMaintenance(){
 // This global enumeration is reachable only after verified CRON_SECRET. Business CRUD stays tenant-scoped.
 const limit=Math.max(1,Math.min(3,Number(process.env.MAINTENANCE_TENANT_LIMIT)||3)),deadline=Date.now()+180000;
 // Reserve one slot for the oldest unserved profile so interrupted runs cannot indefinitely starve new users.
 const queued=await getAuthPool().query<{tenant_id:string}>("SELECT tenant_id FROM records WHERE key='discovery:run' AND value::jsonb->>'state' IN ('queued','running','waiting') ORDER BY updated LIMIT $1",[Math.max(1,limit-1)]);
 const profiles=await getAuthPool().query<{tenant_id:string}>("SELECT p.tenant_id FROM records p LEFT JOIN records m ON m.tenant_id=p.tenant_id AND m.key='maintenance:last-run' WHERE p.key='profile' ORDER BY COALESCE(m.updated,'1970-01-01T00:00:00.000Z'),p.tenant_id LIMIT $1",[limit+queued.rows.length]);
 const selected=[...new Map([...queued.rows,...profiles.rows].map(row=>[row.tenant_id,row])).values()].slice(0,limit),results=[];
 for(const row of selected){if(Date.now()>deadline)break;results.push(await runWithTenant(row.tenant_id,async()=>{let status='ok',queuedSources=0,resumed=false;try{const p=await profile();if(p.filters.sources.length){const old=await getDiscoveryRun(),run=await startDiscoveryRun();resumed=!!old&&old.id===run.id;queuedSources=run.steps.length;await publishDiscoveryRun(run.id);}await write('maintenance:last-run',{at:new Date().toISOString(),status:'queued'});if(p.autoPrepare&&Date.now()<deadline){if(p.preparationMode==='ai')await reserveAiCall('scheduled-resume');await tick();}if(Date.now()<deadline-30000&&await read('gmail:connection',null))try{await syncGmail(undefined,5);}catch{/* Optional mail sync never sends and does not fail job discovery. */}}catch{status='needs_attention';}finally{await write('maintenance:last-run',{at:new Date().toISOString(),status});}return {status,queuedSources,resumed};}));}
 return json({processed:results.length,results,bounded:true,backgroundContinuation:'vercel-queue',automaticMailSend:false});
}
async function handle(req:Request){if(cronAuthorized(req)){try{if(req.method!=='GET')return json({error:'Scheduled maintenance accepts GET only.'},405);return await scheduledMaintenance();}catch(error){return accessErrorResponse(error);}}return withAuthenticatedTenant(req,()=>tenantMaintenance(req));}
export const GET=handle;
export const POST=handle;
