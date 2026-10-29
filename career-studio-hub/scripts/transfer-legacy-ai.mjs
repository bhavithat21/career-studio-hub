import {generateKeyPairSync,randomBytes,privateDecrypt,constants} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import {Writable} from 'node:stream';
export const SOURCE='appgprj_6ae14ec00dbc8191946347241d9c8dd2',TARGET='prj_M6nlI9M1e8ymlaT0wnpREjUEVokS',TEAM='team_ZgJ4fGY86KMJtQh8UV5Z9vCM';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const ENDPOINT='https://career-studio-wa.bhavitha0621.chatgpt.site/api/operator/ai-transfer';
export function verifyProject(project){if(project.projectId!==TARGET||project.orgId!==TEAM||project.projectName!=='career-studio-hub')throw Error('Linked destination does not match approved project/team');}
export function verifyAbsence(data){if(!Array.isArray(data?.envs)||data.envs.some(e=>typeof e.key!=='string'))throw Error('Environment metadata response invalid');if(data.envs.some(e=>e.key==='ANTHROPIC_API_KEY'))throw Error('Destination already has ANTHROPIC_API_KEY; refusing overwrite');}
export function decryptEnvelope(envelope,nonce,privateKey){if(envelope?.version!==1||envelope.source!==SOURCE||envelope.target!==TARGET||envelope.nonce!==nonce||typeof envelope.ciphertext!=='string'||! /^[A-Za-z0-9+/]{683}=$/.test(envelope.ciphertext))throw Error('Transfer envelope invalid');const label=Buffer.from(JSON.stringify({version:1,source:SOURCE,target:TARGET,nonce}));return privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:label},Buffer.from(envelope.ciphertext,'base64'));}
function cli(args,input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(ROOT,'.deployment-tools/node_modules/vercel/dist/index.js'),...args,'--global-config',path.join(ROOT,'.deployment-tools/config'),'--scope','bhavitha0621-1512'],{cwd:ROOT,stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,NO_COLOR:'1',VERCEL_TELEMETRY_DISABLED:'1',VERCEL_DISABLE_UPDATE_CHECK:'1'}});let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(Error('Vercel CLI timed out'));},90000);child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2e6)child.kill();else output+=chunk;});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('Vercel CLI launch failed'));});child.on('close',code=>{clearTimeout(timer);if(code!==0||size>2e6)reject(Error('Vercel CLI failed; output suppressed to protect credentials'));else resolve(output);});child.stdin.on('error',()=>{});child.stdin.end(input);});}
async function destinationReady(){verifyProject(JSON.parse(await readFile(path.join(ROOT,'.vercel/project.json'),'utf8')));const installed=JSON.parse(await readFile(path.join(ROOT,'.deployment-tools/node_modules/vercel/package.json'),'utf8'));if(installed.version!=='65.5.0')throw Error('Expected reviewed Vercel CLI version 65.5.0');verifyAbsence(JSON.parse(await cli(['env','ls','--environment','production','--project',TARGET,'--json'])));}
function hiddenInput(){return new Promise((resolve,reject)=>{const muted=new Writable({write(_chunk,_encoding,callback){callback();}});const reader=readline.createInterface({input:process.stdin,output:muted,terminal:!!process.stdin.isTTY});const timeout=setTimeout(()=>{reader.close();reject(Error('Transfer session expired'));},50*60*1000);reader.once('line',line=>{clearTimeout(timeout);reader.close();resolve(line);});reader.once('SIGINT',()=>{clearTimeout(timeout);reader.close();reject(Error('Transfer cancelled'));});});}
export async function main(){
 await destinationReady();
 let {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:4096,publicExponent:65537});
 const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
 process.stdout.write(JSON.stringify({HUB_AI_TRANSFER_PUBLIC_JWK:JSON.stringify(publicKey.export({format:'jwk'})),HUB_AI_TRANSFER_EXPIRES_AT:expiresAt})+'\n');
 process.stdout.write('Public configuration ready. Configure only those public values on the owner-private source, then provide one hidden JSON line {"bearer":"..."}. No credentials are printed.\n');
 let bearer='',input='',plaintext;
 try{
  input=await hiddenInput();const parsed=JSON.parse(input);bearer=parsed.bearer;input='';if(typeof bearer!=='string'||bearer.length<20||bearer.length>10000||/[\r\n]/.test(bearer))throw Error('Invalid service authorization input');
  if(Date.now()>=Date.parse(expiresAt))throw Error('Transfer session expired');
  await destinationReady();
  const nonce=randomBytes(32).toString('hex');
  const response=await fetch(ENDPOINT,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+bearer},body:JSON.stringify({target:TARGET,nonce,issuedAt:Date.now()}),signal:AbortSignal.timeout(30000)});bearer='';
  if(!response.ok)throw Error('Source transfer request failed (HTTP '+response.status+')');
  const raw=await response.text();if(raw.length>4096)throw Error('Transfer envelope too large');
  plaintext=decryptEnvelope(JSON.parse(raw),nonce,privateKey);privateKey=null;
  if(plaintext.length>250||!plaintext.toString('utf8').startsWith('sk-ant-')||/[\r\n]/.test(plaintext.toString('utf8')))throw Error('Transferred credential format invalid');
  // No --force: Vercel must refuse a concurrently created credential, never replace one.
  await cli(['env','add','ANTHROPIC_API_KEY','--environment','production','--project',TARGET,'--sensitive','--yes'],plaintext);
  process.stdout.write('ANTHROPIC_API_KEY stored as a production Secret in the approved Hub project. Disable source transfer configuration now; deployment is separate.\n');
 }finally{plaintext?.fill(0);privateKey=null;bearer='';input='';}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Transfer stopped. No credential output was retained. Check source configuration and destination metadata; do not blindly repeat a consumed transfer.\n');process.exitCode=1;});
