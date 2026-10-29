import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as tenant from '../lib/tenant.ts';
import * as gmailModel from '../lib/gmail-model.ts';

async function load(file,dependencies,extra={}){const source=await fs.readFile(new URL(file,import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,module={exports:{}};new Function('require','module','exports',...Object.keys(extra),code)(name=>{assert.ok(Object.hasOwn(dependencies,name),'Unexpected dependency '+name);return dependencies[name];},module,module.exports,...Object.values(extra));return module.exports;}
async function authHarness(){
 const env={DATABASE_URL:'unit-placeholder',BETTER_AUTH_SECRET:'unit-placeholder-secret-of-at-least-32-characters',BETTER_AUTH_URL:'https://app.test',GOOGLE_CLIENT_ID:'unit-id',GOOGLE_CLIENT_SECRET:'unit-placeholder'};
 const auth=await load('../lib/auth.ts',{'better-auth':{betterAuth:()=>({api:{getSession:async({headers})=>{const id=headers.get('cookie');return id?{user:{id,name:id},session:{id:'session-'+id,userId:id}}:null;}}})},'better-auth/next-js':{nextCookies:()=>({})},'../db':{getDb:()=>({})},'./tenant':tenant},{process:{env}});
 return auth;
}
test('PDF route authenticates before storage and cannot use another tenant version ID or query identity',async()=>{
 const auth=await authHarness(),reads=[],downloads=[];const records=new Map([['a:version:private-a',{number:1,pdfKey:'resumes/a.pdf'}],['b:version:private-b',{number:2,pdfKey:'resumes/b.pdf'}]]);
 const route=await load('../app/api/resume-pdf/route.ts',{'../../../lib/auth':auth,'../../../lib/store':{read:async key=>{const id=tenant.requireTenantId();reads.push([id,key]);return records.get(id+':'+key)||null;}},'../../../lib/pdf-storage':{getPdf:async key=>{const id=tenant.requireTenantId();downloads.push([id,key]);return {body:new TextEncoder().encode('%PDF-1.7\n'+id),contentType:'application/pdf'};}}});
 const anonymous=await route.GET(new Request('https://app.test/api/resume-pdf?id=private-a'));assert.equal(anonymous.status,401);assert.equal(reads.length,0);
 const unauthorized=await route.GET(new Request('https://app.test/api/resume-pdf?id=private-a&tenantId=a',{headers:{cookie:'b','x-user-id':'a'}}));assert.equal(unauthorized.status,404);assert.equal(downloads.length,0);assert.deepEqual(reads,[['b','version:private-a']]);
 const own=await route.GET(new Request('https://app.test/api/resume-pdf?id=private-b&tenantId=a',{headers:{cookie:'b'}}));assert.equal(own.status,200);assert.match(own.headers.get('Cache-Control'),/private.*no-store/);assert.equal(await own.text(),'%PDF-1.7\nb');assert.deepEqual(downloads,[['b','resumes/b.pdf']]);assert.throws(()=>tenant.requireTenantId(),/required/);
});

test('Browser auth endpoints cannot return provider credentials or bypass the dedicated Gmail opt-in',async()=>{
 let dispatched=0;const route=await load('../app/api/auth/[...all]/route.ts',{'better-auth/next-js':{toNextJsHandler:()=>({GET:async()=>{dispatched++;return new Response();},POST:async()=>{dispatched++;return new Response();}})},'../../../../lib/auth':{getAuth:()=>({}),getAuthReadiness:()=>({configured:true}),accessErrorResponse:()=>new Response('',{status:500}),BASIC_GOOGLE_SCOPES:['openid','email','profile']}});
 for(const endpoint of ['get-access-token','refresh-token','account-info','link-social','unlink-account'])assert.equal((await route.POST(new Request('https://app.test/api/auth/'+endpoint,{method:'POST'}))).status,403);
 for(const body of [{provider:'google',scopes:gmailModel.GMAIL_SCOPES},{provider:'google',idToken:{token:'unit-placeholder'}},{provider:'unconfigured'}])assert.equal((await route.POST(new Request('https://app.test/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))).status,400);
 assert.equal(dispatched,0);assert.equal((await route.POST(new Request('https://app.test/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google'})}))).status,200);assert.equal(dispatched,1);
});

test('Dedicated Gmail authorization preserves OAuth cookies and requests only the disclosed permissions',async()=>{
 class AccessError extends Error{constructor(message,status=401){super(message);this.status=status;}}
 const records=new Map(),headers=new Headers({cookie:'unit-session'});let linked;
 const store={claim:async()=>true,unlock:async()=>{},read:async(key,fallback)=>records.get(tenant.requireTenantId()+':'+key)||fallback,write:async(key,value)=>records.set(tenant.requireTenantId()+':'+key,value),list:async()=>[],remove:async()=>{},removePrefix:async()=>{}};
 const service=await load('../lib/gmail.ts',{'./tenant':tenant,'./store':store,'./gmail-model':gmailModel,'./auth':{RequestAccessError:AccessError,getAuthPool:()=>({query:async(sql,params)=>{assert.deepEqual(params,['user-a','google']);return {rows:[{id:'own-account',scope:'openid,email,profile',tokensAvailable:true}]};}}),getAuth:()=>({api:{linkSocialAccount:async options=>{linked=options;const cookies=new Headers({'Content-Type':'application/json'});cookies.append('Set-Cookie','oauth_state=unit-a; HttpOnly; Secure');cookies.append('Set-Cookie','oauth_nonce=unit-b; HttpOnly; Secure');return new Response(JSON.stringify({url:'https://accounts.google.com/o/oauth2/v2/auth?state=unit-state'}),{headers:cookies});}}})}});
 const response=await tenant.runWithTenant('user-a',()=>service.beginGmailConnection(headers));assert.equal(response.status,200);assert.equal(response.headers.getSetCookie().length,2);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(linked.body.scopes,gmailModel.GMAIL_SCOPES);assert.equal(linked.headers,headers);assert.equal(linked.asResponse,true);assert.equal(linked.body.callbackURL,'/?gmail=connected');const stored=records.get('user-a:gmail:connection');assert.equal(stored.status,'pending');assert.equal(stored.accountId,'own-account');assert.equal(Object.hasOwn(stored,'accessToken'),false);assert.equal(Object.hasOwn(stored,'refreshToken'),false);
});
