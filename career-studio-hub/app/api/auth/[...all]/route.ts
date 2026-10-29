import {toNextJsHandler} from 'better-auth/next-js';
import {getAuth,getAuthReadiness,accessErrorResponse,BASIC_GOOGLE_SCOPES} from '../../../../lib/auth';
export const dynamic='force-dynamic';
export const runtime='nodejs';
// Tokens stay server-side. Additional Google scopes can start only through /api/gmail/connect.
async function handle(req:Request){
 const path=new URL(req.url).pathname.replace(/^\/api\/auth/,'');
 if(['/get-access-token','/refresh-token','/account-info','/link-social','/unlink-account'].includes(path))return Response.json({error:'Use the account connection controls in your workspace.'},{status:403});
 if(path==='/readiness')return Response.json(getAuthReadiness(),{headers:{'Cache-Control':'no-store'}});
 try{if(req.method==='POST'&&path==='/sign-in/social'){const body=await req.clone().json().catch(()=>null);if(!body||body.provider!=='google'||body.idToken||body.scopes&&(!Array.isArray(body.scopes)||body.scopes.some((scope:unknown)=>typeof scope!=='string'||!BASIC_GOOGLE_SCOPES.includes(scope))))return Response.json({error:'Only basic Google sign-in is available here.'},{status:400});}
  const handler=toNextJsHandler(getAuth());return req.method==='GET'?handler.GET(req):handler.POST(req);
 }catch(error){return accessErrorResponse(error);}
}
export const GET=handle;
export const POST=handle;
