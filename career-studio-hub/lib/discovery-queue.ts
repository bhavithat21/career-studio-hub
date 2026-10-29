import {createHmac,timingSafeEqual} from 'node:crypto';
import {send} from '@vercel/queue';
import {requireTenantId,runWithTenant} from './tenant';
import {claim,unlock} from './store';
import {getDiscoveryRun,claimDiscoveryDispatch,executeDiscoveryDispatch,noteDiscoveryContinuation,type DiscoveryDispatch} from './discovery-run';

export const DISCOVERY_TOPIC='career-studio-discovery';
export const DISCOVERY_BODY_LIMIT=8192;
type Payload={version:1;kind:'dispatch'|'wake';tenantId:string;runId:string;dispatch?:DiscoveryDispatch;wakeAt?:number};
type Envelope=Payload&{signature:string};
export class InvalidDiscoveryMessage extends Error{}
export class DiscoveryDeliveryBusy extends Error{}
function signingKey(){const key=process.env.BETTER_AUTH_SECRET;if(!key||key.length<32)throw Error('Discovery queue signing is not configured.');return key;}
function canonical(value:Payload){return JSON.stringify([1,value.kind,value.tenantId,value.runId,value.dispatch?[value.dispatch.runId,value.dispatch.source,value.dispatch.index,value.dispatch.dispatchId]:null,value.wakeAt??null]);}
function signature(value:Payload){return createHmac('sha256',signingKey()).update('career-studio-discovery-v1\n'+canonical(value)).digest('hex');}
function envelope(value:Payload):Envelope{return {...value,signature:signature(value)};}
export function verifyDiscoveryEnvelope(input:unknown):Envelope{
 const value=input as Envelope,validId=(id:unknown)=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!['dispatch','wake'].includes(value.kind)||typeof value.tenantId!=='string'||!/^\S{1,200}$/.test(value.tenantId)||/[\x00-\x1f\x7f]/.test(value.tenantId)||!validId(value.runId)||typeof value.signature!=='string'||!/^[a-f0-9]{64}$/.test(value.signature))throw new InvalidDiscoveryMessage('Invalid queue envelope.');
 if(value.kind==='dispatch'){const d=value.dispatch;if(!d||d.runId!==value.runId||!validId(d.source)||!validId(d.dispatchId)||!Number.isSafeInteger(d.index)||d.index<0||d.index>100||value.wakeAt!==undefined)throw new InvalidDiscoveryMessage('Invalid dispatch reference.');}
 else if(value.dispatch!==undefined||!Number.isSafeInteger(value.wakeAt)||(value.wakeAt as number)<0)throw new InvalidDiscoveryMessage('Invalid wake reference.');
 const expected=signature(value);if(!timingSafeEqual(Buffer.from(value.signature,'hex'),Buffer.from(expected,'hex')))throw new InvalidDiscoveryMessage('Queue envelope authentication failed.');return value;
}
/** Check the signed inline payload before the SDK can use any caller-selected broker metadata. */
export async function authenticateDiscoveryRequest(req:Request){
 if(req.headers.get('ce-type')!=='com.vercel.queue.v2beta'||req.headers.get('ce-vqsqueuename')!==DISCOVERY_TOPIC||!req.headers.get('ce-vqsconsumergroup')||!req.headers.get('ce-vqsmessageid')||!req.headers.get('ce-vqsreceipthandle')||req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||Number(req.headers.get('content-length')||0)>DISCOVERY_BODY_LIMIT||!req.body)throw new InvalidDiscoveryMessage('Authenticated inline queue delivery required.');
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>DISCOVERY_BODY_LIMIT){await reader.cancel();throw new InvalidDiscoveryMessage('Queue payload exceeds the supported limit.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}let payload:unknown;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new InvalidDiscoveryMessage('Invalid inline queue payload.');}verifyDiscoveryEnvelope(payload);
 // Rebuild the consumed body unchanged for the installed SDK's JsonTransport decoder.
 return new Request(req.url,{method:'POST',headers:req.headers,body:bytes,signal:req.signal});
}
/** Called only after session-bound tenant selection, or inside the cron-authorized tenant context. */
export async function publishDiscoveryRun(runId:string){
 const tenantId=requireTenantId();let run=await getDiscoveryRun();if(!run||run.id!==runId||['completed','paused'].includes(run.state))return false;
 let dispatch=await claimDiscoveryDispatch(runId);run=await getDiscoveryRun();if(!run||run.id!==runId||['completed','paused'].includes(run.state))return false;
 if(!dispatch){const index=run.steps.findIndex(step=>step.state==='running'&&!!step.dispatchId);if(index>=0){const step=run.steps[index];dispatch={runId,source:step.source,index,dispatchId:step.dispatchId!};}}
 let payload:Payload,idempotencyKey:string,delaySeconds=0;
 if(dispatch){payload={version:1,kind:'dispatch',tenantId,runId,dispatch};idempotencyKey=runId+':dispatch:'+dispatch.dispatchId;}
 else{const due=Math.min(...run.steps.filter(step=>step.state==='pending').map(step=>step.nextAttemptAt||Date.now()));if(!Number.isFinite(due))return false;delaySeconds=Math.max(1,Math.ceil((due-Date.now())/1000));if(delaySeconds>604740){await noteDiscoveryContinuation(runId,'The advertised retry window exceeds queue retention. Resume later or let scheduled maintenance retry.');return false;}payload={version:1,kind:'wake',tenantId,runId,wakeAt:due};idempotencyKey=runId+':wake:'+run.dispatches+':'+due;}
 try{const signed=envelope(payload);if(Buffer.byteLength(JSON.stringify(signed),'utf8')>4096)throw Error('Queue envelope is too large.');await send(DISCOVERY_TOPIC,signed,{idempotencyKey,delaySeconds,retentionSeconds:Math.max(86400,delaySeconds+60)});await noteDiscoveryContinuation(runId,'');return true;}
 catch{await noteDiscoveryContinuation(runId,'Queue publication could not be confirmed. Progress is saved; use Resume discovery or scheduled maintenance.');throw Error('Discovery queue publication could not be confirmed. Your request is saved for resuming.');}
}
/** Managed Queue deliveries verify server-signed payload provenance before choosing a tenant. */
export async function consumeDiscoveryMessage(input:unknown){
 const message=verifyDiscoveryEnvelope(input);
 return runWithTenant(message.tenantId,async()=>{
  const run=await getDiscoveryRun();if(!run||run.id!==message.runId||['completed','paused'].includes(run.state))return;
  if(message.kind==='wake'){if(Date.now()<message.wakeAt!)throw new DiscoveryDeliveryBusy('Retry window has not started.');await publishDiscoveryRun(message.runId);return;}
  const dispatch=message.dispatch!,step=run.steps[dispatch.index];if(!step||step.dispatchId!==dispatch.dispatchId||step.source!==dispatch.source||step.state!=='running'){await publishDiscoveryRun(message.runId);return;}
  const executionLock='lock:discovery-execution:'+dispatch.dispatchId;if(!await claim(executionLock,270000))throw new DiscoveryDeliveryBusy('This delivery is already processing.');
  try{await executeDiscoveryDispatch(dispatch);}finally{await unlock(executionLock);}
  // Publication is awaited before acknowledgment. A redelivery can republish this same idempotent successor.
  await publishDiscoveryRun(message.runId);
 });
}
export function discoveryQueueRetry(error:unknown,metadata:{deliveryCount:number}){if(error instanceof InvalidDiscoveryMessage||metadata.deliveryCount>=5)return {acknowledge:true as const};return {afterSeconds:error instanceof DiscoveryDeliveryBusy?300:Math.min(300,15*2**metadata.deliveryCount)};}
