#!/usr/bin/env node
// Uses the pinned installed Better Auth migration API and the application's real config.
// Default mode introspects the database and prints a schema summary; only --apply writes.
import {registerHooks} from 'node:module';
import {randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {getMigrations} from 'better-auth/db/migration';

const args=process.argv.slice(2),allowed=new Set(['--apply','--schema-only','--json','--help']);
if(args.some(arg=>!allowed.has(arg))||new Set(args).size!==args.length){console.error('Usage: node scripts/migrate-auth.mjs [--schema-only] [--apply | --help]');process.exitCode=2;}
else if(args.includes('--help'))console.log('Usage: node scripts/migrate-auth.mjs [--schema-only] [--apply]\nDefault: read the configured database schema and report the migration plan.\n--schema-only: derive the actual app schema using process-local dummy OAuth fields and an ephemeral auth secret; only DATABASE_URL is required. No sign-in or provider call runs.\n--apply: apply the validated Better Auth schema plan. No application data is imported.\nEnvironment must already be set securely. This script never prints credentials.');
else{
 let pool,hooks;
 try{
  if(args.includes('--schema-only')){process.env.BETTER_AUTH_URL='https://career-studio-hub.vercel.app';process.env.BETTER_AUTH_SECRET=randomBytes(32).toString('base64url');process.env.GOOGLE_CLIENT_ID='schema-only.apps.googleusercontent.com';process.env.GOOGLE_CLIENT_SECRET='schema-only-placeholder-not-a-provider-credential';}
  const required=['DATABASE_URL','BETTER_AUTH_SECRET','BETTER_AUTH_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'],missing=required.filter(key=>!process.env[key]);
  if(missing.length)throw Error('missing_environment');
  // Node 22.15+ supports synchronous hooks. Resolve only repository TypeScript
  // imports; package imports retain Node's normal installed-package resolution.
  const root=fileURLToPath(new URL('../',import.meta.url)),inside=value=>value.startsWith(root)&&!path.relative(root,value).startsWith('..');
  hooks=registerHooks({
   resolve(specifier,context,nextResolve){try{return nextResolve(specifier,context);}catch(error){if(!specifier.startsWith('.')||!context.parentURL?.startsWith('file:'))throw error;const target=fileURLToPath(new URL(specifier,context.parentURL));if(!inside(target))throw error;for(const candidate of [target+'.ts',path.join(target,'index.ts')])if(inside(candidate)&&existsSync(candidate))return {url:pathToFileURL(candidate).href,shortCircuit:true};throw error;}},
   load(url,context,nextLoad){if(url.startsWith('file:')){const file=fileURLToPath(url);if(inside(file)&&file.endsWith('.ts')&&!file.includes(path.sep+'node_modules'+path.sep))return {format:'module',source:ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};}return nextLoad(url,context);}
  });
  const {getAuth,getAuthPool}=await import('../lib/auth.ts');pool=getAuthPool();
  const plan=await getMigrations(getAuth().options,{throwOnUnsafe:false});
  const summary={mode:args.includes('--apply')?'apply':'plan',schemaOnly:args.includes('--schema-only'),createTables:plan.toBeCreated.map(item=>item.table),addColumns:plan.toBeAdded.map(item=>({table:item.table,columns:Object.keys(item.fields)})),addIndexes:plan.toBeAddedIndexes.map(item=>({table:item.table,name:item.name})),unsafeChanges:plan.unsafeChanges.length,schemaProblems:plan.schemaProblems.length};
  console.log(JSON.stringify(summary,null,2));
  if(plan.unsafeChanges.length||plan.schemaProblems.length){console.error('Migration is blocked by an unsafe change or schema conflict. No changes were applied. Review with the installed Better Auth CLI and a database backup.');process.exitCode=1;}
  else if(args.includes('--apply')){await plan.runMigrations();if(!args.includes('--json'))console.log('Better Auth schema migration completed.');}
  else if(!args.includes('--json'))console.log('Plan only. No schema changes were applied. Run again with --apply after reviewing the plan and backup.');
 }catch{console.error('Auth migration could not complete. Check required server environment, database access, and the installed schema version. No credentials or database diagnostics were printed.');process.exitCode=1;}
 finally{if(pool)try{await pool.end();}catch{}hooks?.deregister();}
}
