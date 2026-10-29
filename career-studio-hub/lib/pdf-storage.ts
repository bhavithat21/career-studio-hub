import {put,get} from '@vercel/blob';
import {requireTenantId} from './tenant';
import {env} from './runtime';
function pathname(key:string){const tenantId=requireTenantId();if(typeof key!=='string'||!key.startsWith('resumes/')||!key.endsWith('.pdf')||key.length>1024||key.includes('\\')||key.includes('%')||key.includes('?')||key.includes('#')||key.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Invalid resume PDF path.');return 'tenants/'+Buffer.from(tenantId,'utf8').toString('base64url')+'/'+key;}
function configured(){if(!env.BLOB_STORE_ID&&!env.BLOB_READ_WRITE_TOKEN)throw Error('Private online PDF storage is not configured.');}
const digest=async(bytes:Uint8Array)=>Buffer.from(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)).toString('hex');
/** Logical keys stay unchanged; physical paths and every read are tenant scoped. */
export async function putPdf(key:string,bytes:Uint8Array,_metadata?:Record<string,string>){
 const path=pathname(key);configured();if(!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>10*1024*1024||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('A valid PDF of at most 10 MB is required.');const sha256=await digest(bytes);
 try{const object=await put(path,Buffer.from(bytes),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/pdf'});return {pathname:object.pathname,byteLength:bytes.length,sha256};}
 catch{try{const existing=await get(path,{access:'private'});if(existing?.statusCode===200){const prior=new Uint8Array(await new Response(existing.stream).arrayBuffer());if(prior.length===bytes.length&&await digest(prior)===sha256)return {pathname:path,byteLength:bytes.length,sha256};}}catch{}throw Error('Private PDF storage failed or this path already contains different content.');}
}
export async function getPdf(key:string){const path=pathname(key);configured();try{const object=await get(path,{access:'private'});if(!object)return null;if(object.statusCode!==200)throw Error('Unexpected private PDF response.');return {body:object.stream,contentType:'application/pdf'};}catch{throw Error('Private PDF could not be read.');}}
