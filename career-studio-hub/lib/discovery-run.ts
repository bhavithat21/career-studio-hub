import {sources} from './catalog';
import {profile,discover} from './pipeline';
import {read,write,claim,unlock} from './store';

const key='discovery:run',lock='lock:discovery-run';
const leaseMs=270000,maxAttempts=2;
type Step={source:string;state:'pending'|'running'|'completed'|'failed';attempts:number;dispatchId?:string;leaseUntil?:number;nextAttemptAt?:number;status?:string;fetched?:number;matched?:number;added?:number;message?:string};
export type DiscoveryRun={id:string;state:'queued'|'running'|'waiting'|'completed'|'paused';requestedAt:string;updatedAt:string;completedAt?:string;dispatches:number;steps:Step[];continuationError?:string};
export type DiscoveryDispatch={runId:string;source:string;index:number;dispatchId:string};
export const getDiscoveryRun=()=>read<DiscoveryRun|null>(key,null);
const stamp=()=>new Date().toISOString();
export function nextDiscoveryStep(run:DiscoveryRun,now=Date.now()){
 if(run.state==='completed'||run.state==='paused')return -1;
 if(run.steps.some(step=>step.state==='running'&&(step.leaseUntil||0)>now))return -1;
 return run.steps.findIndex(step=>!['completed','failed'].includes(step.state)&&step.attempts<maxAttempts&&(step.nextAttemptAt||0)<=now);
}
export async function startDiscoveryRun(input?:unknown){
 if(!await claim(lock,30000))throw Error('Discovery progress is being updated. Try again shortly.');
 try{const old=await getDiscoveryRun();if(old&&['queued','running','waiting'].includes(old.state))return old;
  const p=await profile(),enabled=p.filters.sources,requested=input===undefined?enabled:input;
  if(!Array.isArray(requested)||!requested.length||requested.length>500)throw Error('Choose enabled job sources for discovery.');const selected=[...new Set<string>(requested)];if(selected.length>sources.length||selected.some(id=>typeof id!=='string'||!enabled.includes(id)||!sources.some(source=>source.id===id)))throw Error('Choose enabled job sources for discovery.');
  const now=stamp(),run:DiscoveryRun={id:crypto.randomUUID(),state:'queued',requestedAt:now,updatedAt:now,dispatches:0,steps:selected.map(source=>({source,state:'pending',attempts:0}))};await write(key,run);return run;
 }finally{await unlock(lock);}
}
/** Persist a dispatch lease before the HTTP acknowledgement. No tenant identity comes from this object. */
export async function claimDiscoveryDispatch(expectedId?:string){
 if(!await claim(lock,30000))return null;
 try{const run=await getDiscoveryRun();if(!run||expectedId&&run.id!==expectedId)return null;
  const now=Date.now();for(const step of run.steps)if(step.state==='running'&&(step.leaseUntil||0)<=now){step.state=step.attempts>=maxAttempts?'failed':'pending';step.message='Previous worker stopped before completion; a bounded retry is available.';}
  if(run.steps.every(step=>['completed','failed'].includes(step.state))){run.state='completed';run.completedAt=stamp();await write(key,{...run,updatedAt:stamp()});return null;}
  const p=await profile();for(const step of run.steps)if(step.state==='pending'&&!p.filters.sources.includes(step.source)){step.state='completed';step.status='disabled';step.message='Source was disabled after this run was requested.';}
  if(run.dispatches>=run.steps.length*maxAttempts){run.state='paused';run.continuationError='This run reached its bounded retry limit. Review source results and start a new pull.';await write(key,{...run,updatedAt:stamp()});return null;}
  const index=nextDiscoveryStep(run,now);if(index<0){if(run.steps.every(step=>['completed','failed'].includes(step.state))){run.state='completed';run.completedAt=stamp();}else if(!run.steps.some(step=>step.state==='running'&&(step.leaseUntil||0)>now)){run.state='waiting';run.continuationError='A retry window is pending. Resume after the wait, or scheduled maintenance will retry.';}await write(key,{...run,updatedAt:stamp()});return null;}
  const step=run.steps[index];
  const dispatchId=crypto.randomUUID();Object.assign(step,{state:'running',attempts:step.attempts+1,dispatchId,leaseUntil:now+leaseMs,nextAttemptAt:0});run.state='running';run.dispatches++;run.updatedAt=stamp();run.continuationError='';await write(key,run);return {runId:run.id,source:step.source,index,dispatchId} as DiscoveryDispatch;
 }finally{await unlock(lock);}
}
export async function noteDiscoveryContinuation(runId:string,message:string){if(!await claim(lock,30000))return;try{const run=await getDiscoveryRun();if(run?.id===runId&&run.state!=='completed')await write(key,{...run,continuationError:message,updatedAt:stamp()});}finally{await unlock(lock);}}
export function discoveryRetry(result:{status?:string;message?:string},attempts:number,now=Date.now()){
 const message=String(result.message||'');if(attempts>=maxAttempts)return null;
 if(result.status==='busy')return now+120000;
 if(result.status!=='failed'||/HTTP\s*(?:401|403|429)\b|access denied|permission|schema|unexpected response|requires? (?:login|verification)/i.test(message)||!/(?:timeout|timed out|aborted|fetch failed|network|HTTP\s*5\d\d\b|ECONN|ENOTFOUND|worker stopped)/i.test(message))return null;
 const retryAfter=message.match(/retry after\s+([^;]+)$/i)?.[1]?.trim();let advertised=0;if(retryAfter){if(/^\d+$/.test(retryAfter))advertised=now+Number(retryAfter)*1000;else advertised=Date.parse(retryAfter)||0;}
 return Math.max(now+15000,advertised);
}
export async function executeDiscoveryDispatch(dispatch:DiscoveryDispatch){
 const before=await getDiscoveryRun(),saved=before?.steps[dispatch.index];if(!before||before.id!==dispatch.runId||!saved||saved.dispatchId!==dispatch.dispatchId||saved.source!==dispatch.source||saved.state!=='running')return false;
 let result:any;
 try{result=await discover(dispatch.source,210000);}catch{result={status:'failed',message:'Source worker stopped unexpectedly. Review source status before retrying.',fetched:0,matched:0,added:0};}
 if(!await claim(lock,30000))throw Error('Discovery progress is being updated. Delivery will retry.');
 try{const run=await getDiscoveryRun(),step=run?.steps[dispatch.index];if(!run||run.id!==dispatch.runId||!step||step.dispatchId!==dispatch.dispatchId)return;
  const retryAt=discoveryRetry(result,step.attempts);
  Object.assign(step,{state:retryAt?'pending':['failed','busy'].includes(result.status)?'failed':'completed',status:String(result.status||'failed'),fetched:Number(result.fetched)||0,matched:Number(result.matched)||0,added:result.cached?0:Number(result.added)||0,message:String(result.message||'').slice(0,2000),leaseUntil:0,nextAttemptAt:retryAt||0});
  run.updatedAt=stamp();run.state=run.steps.every(item=>['completed','failed'].includes(item.state))?'completed':'queued';if(run.state==='completed')run.completedAt=stamp();if(nextDiscoveryStep(run)<0&&run.state!=='completed'){run.state='waiting';run.continuationError='A retry window is pending; delayed queue delivery or scheduled maintenance will resume it.';}await write(key,run);
 }finally{await unlock(lock);}
 return true;
}
