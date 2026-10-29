import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import {Writable} from 'node:stream';
import {verifyProject,TARGET} from './transfer-legacy-ai.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const ALLOWED=['HUB_LEGACY_SOURCE_PROJECT_ID','HUB_LEGACY_SOURCE_ORIGIN','HUB_LEGACY_OWNER_EMAIL','HUB_LEGACY_SITES_SERVICE_TOKEN','HUB_LEGACY_EXPORT_TOKEN','HUB_LEGACY_MIGRATION_ENABLED'];
export const TEMPORARY=['HUB_LEGACY_MIGRATION_ENABLED','HUB_LEGACY_SITES_SERVICE_TOKEN','HUB_LEGACY_EXPORT_TOKEN'];
const SECRET=new Set(['HUB_LEGACY_SITES_SERVICE_TOKEN','HUB_LEGACY_EXPORT_TOKEN']);
export function validateInput(data){if(!data||Array.isArray(data)||Object.keys(data).length!==ALLOWED.length||Object.keys(data).some(key=>!ALLOWED.includes(key))||ALLOWED.some(key=>typeof data[key]!=='string'))throw Error('Exactly six approved fields are required');if(data.HUB_LEGACY_SOURCE_PROJECT_ID!=='appgprj_6ae14ec00dbc8191946347241d9c8dd2'||data.HUB_LEGACY_SOURCE_ORIGIN!=='https://career-studio-wa.bhavitha0621.chatgpt.site'||data.HUB_LEGACY_OWNER_EMAIL!=='bhavitha0621@gmail.com'||data.HUB_LEGACY_MIGRATION_ENABLED!=='1')throw Error('Migration identity does not match approved source and owner');for(const key of SECRET)if(data[key].length<32||data[key].length>10000||/[\r\n\x00]/.test(data[key]))throw Error('Invalid transport token');return data;}
export function validateRotation(data){if(!data||Array.isArray(data)||Object.keys(data).length!==1||Object.keys(data)[0]!=='HUB_LEGACY_EXPORT_TOKEN'||typeof data.HUB_LEGACY_EXPORT_TOKEN!=='string'||! /^[a-f0-9]{64}$/.test(data.HUB_LEGACY_EXPORT_TOKEN))throw Error('Exactly one fresh 64-character lowercase hexadecimal export token is required');return data;}
export function verifyRotationTarget(metadata){if(!metadata||!['sensitive','secret'].includes(metadata.type)&&metadata.visibility!=='secret'||!Array.isArray(metadata.target)||metadata.target.length!==1||metadata.target[0]!=='production'||metadata.gitBranch)throw Error('Expected an existing production-only Secret');}
function cli(args,input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(ROOT,'.deployment-tools/node_modules/vercel/dist/index.js'),...args,'--global-config',path.join(ROOT,'.deployment-tools/config'),'--scope','bhavitha0621-1512'],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1',VERCEL_TELEMETRY_DISABLED:'1',VERCEL_DISABLE_UPDATE_CHECK:'1'}});let text='',bytes=0;const timer=setTimeout(()=>{child.kill();reject(Error('CLI timed out'));},90000);child.stdout.on('data',data=>{bytes+=data.length;if(bytes>2e6)child.kill();else text+=data;});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('CLI failed'));});child.on('close',code=>{clearTimeout(timer);if(code!==0||bytes>2e6)reject(Error('CLI failed; output suppressed'));else resolve(text);});child.stdin.on('error',()=>{});child.stdin.end(input);});}
async function inspect(){verifyProject(JSON.parse(await readFile(path.join(ROOT,'.vercel/project.json'),'utf8')));const version=JSON.parse(await readFile(path.join(ROOT,'.deployment-tools/node_modules/vercel/package.json'),'utf8')).version;if(version!=='65.5.0')throw Error('Expected reviewed CLI65.5.0');const result=JSON.parse(await cli(['env','ls','--environment','production','--project',TARGET,'--json']));if(!Array.isArray(result.envs)||result.envs.some(env=>typeof env.key!=='string'))throw Error('Invalid environment metadata');return new Map(result.envs.map(env=>[env.key,{type:env.type,visibility:env.visibility,target:env.target,gitBranch:env.gitBranch}]));}
function hiddenInput(){return new Promise((resolve,reject)=>{const output=new Writable({write(_data,_encoding,done){done();}}),reader=readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});const timer=setTimeout(()=>{reader.close();reject(Error('Input timeout'));},10*60*1000);reader.once('line',line=>{clearTimeout(timer);reader.close();resolve(line);});reader.once('SIGINT',()=>{clearTimeout(timer);reader.close();reject(Error('Cancelled'));});});}
export async function main(args=process.argv.slice(2)){
 if(args.length>1||args.length===1&&!['--disable','--rotate-export-token'].includes(args[0]))throw Error('Unsupported mode');
 const existing=await inspect();
 if(args[0]==='--disable'){for(const key of TEMPORARY)if(existing.has(key)){await cli(['env','rm',key,'--environment','production','--project',TARGET,'--yes']);process.stdout.write('Removed '+key+' from production.\n');}process.stdout.write('Temporary migration configuration removed. Redeploy Hub to stop access in existing deployments; revoke the source export token separately.\n');return;}
 if(args[0]==='--rotate-export-token'){
  const key='HUB_LEGACY_EXPORT_TOKEN';verifyRotationTarget(existing.get(key));
  process.stdout.write('Ready for one hidden JSON line containing only HUB_LEGACY_EXPORT_TOKEN (64 lowercase hexadecimal characters).\n');
  let data,raw='',value;
  try{raw=await hiddenInput();if(raw.length>256)throw Error('Input too large');data=validateRotation(JSON.parse(raw));raw='';verifyRotationTarget((await inspect()).get(key));value=Buffer.from(data[key]);await cli(['env','update',key,'--environment','production','--project',TARGET,'--sensitive','--yes'],value);process.stdout.write('Rotated HUB_LEGACY_EXPORT_TOKEN as a production Secret. Update the source token and redeploy Hub; existing deployments retain their previous environment.\n');}
  finally{raw='';value?.fill(0);if(data)data[key]='';}return;
 }
 if(ALLOWED.some(key=>existing.has(key)))throw Error('Migration environment already contains one or more allowed fields; refusing overwrite');
 process.stdout.write('Ready for one hidden JSON line containing the six HUB_LEGACY_ fields. Values are never printed.\n');
 let data,raw='';
 try{raw=await hiddenInput();if(raw.length>25000)throw Error('Input too large');data=validateInput(JSON.parse(raw));raw='';
  const current=await inspect();if(ALLOWED.some(key=>current.has(key)))throw Error('Migration environment changed; refusing overwrite');
  // Enable last so partial provisioning cannot activate the transport.
  for(const key of ALLOWED){const value=Buffer.from(data[key]);try{await cli(['env','add',key,'--environment','production','--project',TARGET,SECRET.has(key)?'--sensitive':'--no-sensitive','--yes'],value);}finally{value.fill(0);data[key]='';}process.stdout.write('Configured '+key+' in production.\n');}
  process.stdout.write('Migration environment ready. Deployment is separate.\n');
 }finally{raw='';if(data)for(const key of Object.keys(data))data[key]='';}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Configuration stopped; details suppressed to protect credentials. Partial changes may exist. Only explicit rotation mode can update the existing export token. Inspect names only before retrying.\n');process.exitCode=1;});
