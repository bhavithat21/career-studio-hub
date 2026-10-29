import {createHash} from 'node:crypto';
import {getDb} from '../db';
import {requireTenantId} from './tenant';
import {putPdf,getPdf} from './pdf-storage';
import {validateLegacyManifest,validateRecordSet,pdfDescriptor,matchesPdfBytes,snapshotDigest,type LegacyManifest,type RawLegacyRecord} from './legacy-migration-model';

type Policy={conflicts:'reject'|'archive_replace';profile:'source'|'preserve_current_filters'};
export type LegacyImportPlan={sourceDigest:string;targetDigest:string;recordCount:number;pdfCount:number;conflictCount:number;policy:Policy;fingerprint:string};
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timestamp=()=>new Date().toISOString();
const targetSql="SELECT key,value,updated FROM records WHERE tenant_id=$1 AND left(key,5)<>'lock:' AND left(key,10)<>'migration:' ORDER BY key";
async function query(sql:string,values:unknown[]){try{return await getDb().query(sql,values);}catch{throw Error('Migration database operation failed. No source records or credentials are included in this error.');}}
async function assertMigrationOwner(manifest?:Pick<LegacyManifest,'source'>){
 const tenant=requireTenantId(),env=process.env;
 if(env.HUB_LEGACY_MIGRATION_ENABLED!=='1'||!env.HUB_LEGACY_OWNER_EMAIL||!env.HUB_LEGACY_SOURCE_PROJECT_ID||!env.HUB_LEGACY_SOURCE_ORIGIN)throw Error('Legacy migration has not been enabled by the operator.');
 if(manifest&&(manifest.source.projectId!==env.HUB_LEGACY_SOURCE_PROJECT_ID||manifest.source.origin!==env.HUB_LEGACY_SOURCE_ORIGIN||manifest.source.ownerEmail!==env.HUB_LEGACY_OWNER_EMAIL.toLowerCase()))throw Error('Source identity does not match the reviewed legacy service.');
 const user=(await query('SELECT id,email,"emailVerified" FROM "user" WHERE id=$1',[tenant])).rows[0];
 if(!user||user.id!==tenant||user.emailVerified!==true||typeof user.email!=='string'||user.email.toLowerCase()!==env.HUB_LEGACY_OWNER_EMAIL.toLowerCase())throw Error('Only the verified original owner account may import this snapshot.');
 return tenant;
}
export const requireLegacyMigrationOwner=(manifest?:Pick<LegacyManifest,'source'>)=>assertMigrationOwner(manifest);
function policy(value:Policy):Policy{if(!value||!['reject','archive_replace'].includes(value.conflicts)||!['source','preserve_current_filters'].includes(value.profile))throw Error('Choose an explicit migration conflict and profile policy.');return {conflicts:value.conflicts,profile:value.profile};}
async function targetRows(tenant:string){const rows=(await query(targetSql,[tenant])).rows as RawLegacyRecord[];if(rows.length>10000||rows.reduce((sum,row)=>sum+Buffer.byteLength(row.value),0)>80*1024*1024)throw Error('Target snapshot exceeds the bounded import size.');return rows;}
function planFor(manifest:LegacyManifest,rows:RawLegacyRecord[],target:RawLegacyRecord[],selected:Policy):LegacyImportPlan{const current=new Map(target.map(row=>[row.key,row])),conflictCount=rows.filter(row=>current.has(row.key)&&(current.get(row.key)!.value!==row.value||current.get(row.key)!.updated!==row.updated)).length;const body={sourceDigest:manifest.digest,targetDigest:snapshotDigest(target),recordCount:rows.length,pdfCount:manifest.pdfs.length,conflictCount,policy:policy(selected)};return {...body,fingerprint:fingerprint(body)};}
/** Read-only plan. Call only with a manifest/records obtained through authenticated legacy service access. */
export async function inspectLegacyImport(manifestInput:unknown,recordInput:unknown[],selected:Policy){const manifest=validateLegacyManifest(manifestInput),tenant=await assertMigrationOwner(manifest),rows=validateRecordSet(manifest,recordInput),target=await targetRows(tenant);return planFor(manifest,rows,target,selected);}
/** One PDF per invocation. Immutable storage makes retries safe; no active version is created here. */
export async function stageLegacyPdf(manifestInput:unknown,key:string,bytes:Uint8Array){const manifest=validateLegacyManifest(manifestInput);await assertMigrationOwner(manifest);const expected=manifest.pdfs.find(item=>item.key===key),actual=pdfDescriptor(key,bytes);if(!expected||!matchesPdfBytes(expected,bytes))throw Error('PDF does not match the exact legacy snapshot.');await putPdf(key,bytes);const stored=await getPdf(key);if(!stored||!matchesPdfBytes(expected,new Uint8Array(await new Response(stored.body).arrayBuffer())))throw Error('Private PDF read-back verification failed.');return {key,sha256:actual.sha256,byteLength:actual.byteLength,verified:true};}
export async function actualLegacyTargetCounts(){const tenant=await assertMigrationOwner(),rows=await targetRows(tenant),count=(prefix:string)=>rows.filter(row=>row.key.startsWith(prefix)).length,versions=rows.filter(row=>row.key.startsWith('version:')).map(row=>JSON.parse(row.value)),profile=rows.find(row=>row.key==='profile');return {jobs:count('job:'),resumeVersions:versions.length,approvals:count('approval:'),applications:count('application:'),historicalImports:count('history-import:'),receipts:count('application-receipt:'),pdfReferences:new Set(versions.map(version=>version.pdfKey).filter((key:unknown)=>typeof key==='string')).size,masterPresent:!!(profile&&JSON.parse(profile.value).resume)};}
/** No public endpoint is installed. An authenticated owner/operator must review the exact read-only plan first. */
export async function commitLegacyImport(manifestInput:unknown,recordInput:unknown[],approvedPlan:LegacyImportPlan,confirmSourceSnapshot:()=>Promise<string>){
 const manifest=validateLegacyManifest(manifestInput),tenant=await assertMigrationOwner(manifest),rows=validateRecordSet(manifest,recordInput),selected=policy(approvedPlan?.policy),initial=await targetRows(tenant),expected=planFor(manifest,rows,initial,selected);
 const completionKey='migration:'+manifest.digest+':complete',prior=(await query('SELECT value FROM records WHERE tenant_id=$1 AND key=$2',[tenant,completionKey])).rows[0];if(prior)return {status:'already_imported',recordCount:rows.length,pdfCount:manifest.pdfs.length};
 if(fingerprint(expected)!==fingerprint(approvedPlan))throw Error('Migration plan or target workspace changed. Review a new plan before importing.');
 if(expected.conflictCount&&selected.conflicts!=='archive_replace')throw Error('Existing records conflict. Explicit archive-and-replace approval is required.');
 const verificationStarted=Date.now(),deadline=verificationStarted+60000;let index=0;
 await Promise.all(Array.from({length:Math.min(4,manifest.pdfs.length)},async()=>{for(;;){const position=index++;if(position>=manifest.pdfs.length)return;const pdf=manifest.pdfs[position],remaining=deadline-Date.now();if(remaining<=0)throw Error('PDF verification time limit reached. No business records were imported.');let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([(async()=>{const stored=await getPdf(pdf.key);if(!stored||!matchesPdfBytes(pdf,new Uint8Array(await new Response(stored.body).arrayBuffer())))throw Error('A staged original PDF is missing or changed.');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF verification timed out. No business records were imported.')),Math.min(15000,remaining));})]);}finally{if(timer)clearTimeout(timer);}}}));
 if(typeof confirmSourceSnapshot!=='function'||await confirmSourceSnapshot()!==manifest.digest)throw Error('Source snapshot is no longer current. No business records were imported.');
 if(Date.now()-verificationStarted>120000)throw Error('Migration verification exceeded its commit budget. No business records were imported.');
 const client=await getDb().connect();let transaction=false;try{
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');transaction=true;await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenant+':legacy-import']);
  const current=(await client.query(targetSql,[tenant])).rows as RawLegacyRecord[];
  if(snapshotDigest(current)!==expected.targetDigest)throw Error('Target workspace changed during verification. No business records were imported.');
  const backup=current.map(row=>({key:'migration:'+manifest.digest+':backup:'+Buffer.from(row.key).toString('base64url'),value:row.value,updated:row.updated}));
  const imported=rows.map(row=>({...row})),sourceProfile=imported.find(row=>row.key==='profile')!;
  if(selected.profile==='preserve_current_filters'){const targetProfile=current.find(row=>row.key==='profile');if(!targetProfile)throw Error('Current filters cannot be preserved without a target profile.');const original=JSON.parse(sourceProfile.value),existing=JSON.parse(targetProfile.value);if(!existing.filters||typeof existing.filters!=='object'||Array.isArray(existing.filters))throw Error('Current filter snapshot is invalid.');sourceProfile.value=JSON.stringify({...original,filters:existing.filters});}
  const sourceProfileRaw=rows.find(row=>row.key==='profile')!;
  const audit=[{key:'migration:'+manifest.digest+':source-profile',value:sourceProfileRaw.value,updated:sourceProfileRaw.updated},{key:'migration:'+manifest.digest+':manifest',value:JSON.stringify(manifest),updated:timestamp()},{key:completionKey,value:JSON.stringify({sourceDigest:manifest.digest,recordCount:rows.length,pdfCount:manifest.pdfs.length,originalRecordsPreserved:true,profilePolicy:selected.profile,completedAt:timestamp()}),updated:timestamp()}];
  for(const group of [backup,imported,audit])if(group.length)await client.query('INSERT INTO records(tenant_id,key,value,updated) SELECT $1,input.key,input.value,input.updated FROM unnest($2::text[],$3::text[],$4::text[]) AS input(key,value,updated) ON CONFLICT(tenant_id,key) DO UPDATE SET value=EXCLUDED.value,updated=EXCLUDED.updated',[tenant,group.map(row=>row.key),group.map(row=>row.value),group.map(row=>row.updated)]);
  await client.query('COMMIT');transaction=false;return {status:'imported',recordCount:rows.length,pdfCount:manifest.pdfs.length,archivedTargetRecords:backup.length,profilePolicy:selected.profile};
 }catch{throw Error('Atomic migration was not committed. Review source/target consistency and retry from a fresh plan.');}finally{if(transaction)try{await client.query('ROLLBACK');}catch{}client.release();}
}
