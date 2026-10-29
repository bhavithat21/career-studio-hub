#!/usr/bin/env node
import {Pool} from 'pg';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const EXPECTED_PROJECT='prj_M6nlI9M1e8ymlaT0wnpREjUEVokS';
const AUTH_TABLES=new Set(['user','session','account','verification','rateLimit']);
const OBJECTS_SQL="SELECT n.nspname AS schema_name,c.relname AS object_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','f','S')";
const lockId=1837092621;
function child(args,{capture=false}={}){return new Promise((resolve,reject)=>{let output='',size=0,done=false;const proc=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:capture?['ignore','pipe','pipe']:'inherit',windowsHide:true,shell:false});const fail=()=>{if(done)return;done=true;clearTimeout(timer);proc.kill();reject(Error('Build subprocess failed. Database diagnostics and environment values are not printed.'));},timer=setTimeout(fail,capture?90000:600000);proc.on('error',fail);if(capture){proc.stdout.on('data',chunk=>{size+=chunk.length;if(size>128*1024)return fail();output+=chunk;});proc.stderr.on('data',()=>{});}proc.on('close',code=>{if(done)return;done=true;clearTimeout(timer);if(code!==0)return reject(Error('Build subprocess failed. Database diagnostics and environment values are not printed.'));if(!capture)return resolve(null);try{resolve(JSON.parse(output));}catch{reject(Error('Database migration plan returned unexpected metadata.'));}});});}
const runMigration=apply=>child([path.join(root,'scripts/migrate-auth.mjs'),'--schema-only','--json',...(apply?['--apply']:[])],{capture:true});
export function validateInitialPlan(plan){if(plan?.mode!=='plan'||plan.schemaOnly!==true||plan.unsafeChanges!==0||plan.schemaProblems!==0||!Array.isArray(plan.createTables)||!['user','session','account','verification'].every(table=>plan.createTables.includes(table))||plan.createTables.some(table=>!AUTH_TABLES.has(table))||!Array.isArray(plan.addColumns)||plan.addColumns.length||!Array.isArray(plan.addIndexes)||plan.addIndexes.some(item=>!AUTH_TABLES.has(item?.table)))throw Error('Initial database migration plan was unsafe or unexpected. No migration was approved.');return true;}
/** The one-time flag never opens an HTTP route or copies credentials off Vercel. */
export async function initializeDatabase({env=process.env,poolFactory=options=>new Pool(options),migrate=runMigration,tenantSql=()=>readFileSync(path.join(root,'db/tenant-records.sql'),'utf8'),emit=message=>console.log(JSON.stringify(message))}={}){
 if(env.HUB_INITIALIZE_DATABASE!=='1')return {status:'skipped'};
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!==EXPECTED_PROJECT||!env.DATABASE_URL)throw Error('Initial database setup is allowed only in the reviewed production Vercel project.');
 const pool=poolFactory({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:15000,idleTimeoutMillis:1000});let client,inTransaction=false;
 try{client=await pool.connect();await client.query('BEGIN');inTransaction=true;const lock=await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked',[lockId]);if(lock.rows[0]?.locked!==true)throw Error('Another initial database setup is running.');
  const empty=await client.query(OBJECTS_SQL);if(empty.rows.length)throw Error('Initial database setup refused: existing application objects require operator review.');
  const plan=await migrate(false);validateInitialPlan(plan);emit({databaseInitialization:'safe_empty_plan',createTables:plan.createTables,unsafeChanges:0,schemaProblems:0});
  // Recheck after planning before authorizing any DDL. Concurrent Hub initializers
  // share the advisory lock; existing or partially initialized databases fail closed.
  if((await client.query(OBJECTS_SQL)).rows.length)throw Error('Database changed after planning. Initial migration was not applied.');
  await migrate(true);await client.query(tenantSql());await client.query('COMMIT');inTransaction=false;
  emit({databaseInitialization:'completed',authTables:plan.createTables,tenantTable:'records'});return {status:'initialized'};
 }finally{if(client){if(inTransaction)try{await client.query('ROLLBACK');}catch{}client.release();}await pool.end();}
}
async function main(){try{await initializeDatabase();await child([path.join(root,'node_modules/next/dist/bin/next'),'build']);}catch{console.error('Career Studio build or one-time database initialization stopped. Review the safe plan/status and server configuration. No database credentials or raw diagnostics were printed.');process.exitCode=1;}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
