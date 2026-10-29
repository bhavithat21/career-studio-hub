import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as tenant from '../lib/tenant.ts';
import * as matching from '../lib/matching.ts';

async function load(file,dependencies){const source=await fs.readFile(new URL(file,import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,module={exports:{}};new Function('require','module','exports',compiled)(name=>{assert.ok(Object.hasOwn(dependencies,name),'Unexpected dependency '+name);return dependencies[name];},module,module.exports);return module.exports;}
const result=rows=>({rows,rowCount:rows.length});
const key=(id,name)=>id+'\0'+name;
async function harness({configured=true}={}){
 const records=new Map(),queries=[],objects=new Map(),blobCalls=[];
 const db={query:async(sql,params)=>{queries.push({sql,params});const [id,name,value,updated,cutoff]=params,k=key(id,name),row=records.get(k);
  assert.ok(sql.includes('tenant_id'),'Every business-data query must bind tenant_id.');
  if(sql.startsWith('SELECT value'))return result([...records].filter(([storageKey,item])=>item.tenant_id===id&&(sql.includes('left(key')?item.key.startsWith(name):storageKey===k)).sort((a,b)=>b[1].updated.localeCompare(a[1].updated)).map(([,item])=>({value:item.value})));
  if(sql.startsWith('INSERT INTO records')){if(sql.includes('RETURNING key')){if(row&&row.updated>=cutoff)return result([]);records.set(k,{tenant_id:id,key:name,value,updated});return result([{key:name}]);}records.set(k,{tenant_id:id,key:name,value,updated});return result([]);}
  if(sql.startsWith('DELETE FROM records')){for(const [storageKey,item] of records)if(item.tenant_id===id&&(sql.includes('left(key')?item.key.startsWith(name):storageKey===k)&&(!sql.includes('AND value=$3')||item.value===value))records.delete(storageKey);return result([]);}
  throw Error('Unexpected query in test.');
 }};
 const store=await load('../lib/store.ts',{'../db':{getDb:()=>db},'./tenant':tenant});
 const blob={put:async(path,bytes,options)=>{blobCalls.push({action:'put',path,options});assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);assert.equal(options.allowOverwrite,false);if(objects.has(path))throw Error('Existing immutable object.');objects.set(path,new Uint8Array(bytes));return {pathname:path};},get:async(path,options)=>{blobCalls.push({action:'get',path,options});assert.equal(options.access,'private');const bytes=objects.get(path);return bytes?{statusCode:200,stream:new Blob([bytes]).stream()}:null;}};
 const pdf=await load('../lib/pdf-storage.ts',{'@vercel/blob':blob,'./tenant':tenant,'./runtime':{env:configured?{BLOB_STORE_ID:'unit-test-store'}:{}}});
 return {store,pdf,records,queries,objects,blobCalls};
}
const pdfBytes=text=>new TextEncoder().encode('%PDF-1.7\n'+text);
const bodyText=async object=>new Response(object.body).text();

test('Every record and PDF operation fails before infrastructure access without authenticated tenant context',async()=>{
 const h=await harness();for(const operation of [()=>h.store.read('profile',{}),()=>h.store.write('profile',{}),()=>h.store.list(''),()=>h.store.claim('lock:work'),()=>h.store.unlock('lock:work'),()=>h.store.remove('profile'),()=>h.store.removePrefix('gmail:'),()=>h.pdf.putPdf('resumes/test.pdf',pdfBytes('test')),()=>h.pdf.getPdf('resumes/test.pdf')])await assert.rejects(operation,/tenant context/);
 assert.equal(h.queries.length,0);assert.equal(h.blobCalls.length,0);assert.throws(()=>tenant.requireTenantId(),/tenant context/);
 for(const id of ['', ' user', 'user\nother'])assert.throws(()=>tenant.runWithTenant(id,()=>{}),/valid authenticated/);
});

test('Concurrent tenants can use identical record keys without seeing or changing each other',async()=>{
 const h=await harness();await Promise.all(['user-a','user-b'].map(id=>tenant.runWithTenant(id,async()=>{await h.store.write('profile',{owner:id});await Promise.resolve();assert.equal(tenant.requireTenantId(),id);assert.deepEqual(await h.store.read('profile',null),{owner:id});})));
 await tenant.runWithTenant('user-a',async()=>{await h.store.write('job:1',{company:'A'});assert.deepEqual(await h.store.list('job:'),[{company:'A'}]);});
 await tenant.runWithTenant('user-b',async()=>{assert.equal(await h.store.read('job:1',null),null);assert.deepEqual(await h.store.list('job:'),[]);});
 assert.equal(h.records.size,3);assert.ok(h.queries.every(query=>query.params[0]==='user-a'||query.params[0]==='user-b'));
});

test('TEXT JSON retains property order, fallbacks are cloned, and literal prefixes cannot widen tenant scope',async()=>{
 const h=await harness(),value={z:{second:2,first:1},a:'retained order'};
 await tenant.runWithTenant('a',async()=>{await h.store.write('version:1',value);assert.equal(JSON.stringify(await h.store.read('version:1',null)),JSON.stringify(value));const fallback={nested:{value:'original'}};(await h.store.read('missing',fallback)).nested.value='modified';assert.equal(fallback.nested.value,'original');await h.store.write('gmail:%literal',{id:1});await h.store.write('gmail:ordinary',{id:2});assert.deepEqual(await h.store.list('gmail:%'),[{id:1}]);});
 await tenant.runWithTenant('b',()=>h.store.write('gmail:%literal',{id:3}));
 await tenant.runWithTenant('a',()=>h.store.removePrefix('gmail:%'));
 await tenant.runWithTenant('a',async()=>{assert.equal(await h.store.read('gmail:%literal',null),null);assert.deepEqual(await h.store.read('gmail:ordinary',null),{id:2});});
 await tenant.runWithTenant('b',async()=>assert.deepEqual(await h.store.read('gmail:%literal',null),{id:3}));
});

test('Lock acquisition uses one atomic scoped upsert and one tenant cannot block another tenant',async()=>{
 const h=await harness(),results=await Promise.all([tenant.runWithTenant('a',()=>h.store.claim('lock:work')),tenant.runWithTenant('a',()=>h.store.claim('lock:work'))]);assert.deepEqual(results,[true,false]);
 assert.equal(await tenant.runWithTenant('b',()=>h.store.claim('lock:work')),true);
 assert.ok(h.queries.every(query=>query.sql.includes('ON CONFLICT(tenant_id,key)')&&query.sql.includes('WHERE records.updated < $5 RETURNING key')));
});

test('An expired worker cannot unlock a newer worker lease',async()=>{
 const h=await harness();let releaseOld,releaseNew;const oldGate=new Promise(resolve=>releaseOld=resolve),newGate=new Promise(resolve=>releaseNew=resolve);let oldClaimed,newClaimed;const oldReady=new Promise(resolve=>oldClaimed=resolve),newReady=new Promise(resolve=>newClaimed=resolve);
 const old=tenant.runWithTenant('same-user',async()=>{assert.equal(await h.store.claim('lock:work'),true);oldClaimed();await oldGate;await h.store.unlock('lock:work');});await oldReady;
 h.records.get(key('same-user','lock:work')).updated='2000-01-01T00:00:00.000Z';
 const newer=tenant.runWithTenant('same-user',async()=>{assert.equal(await h.store.claim('lock:work'),true);newClaimed();await newGate;await h.store.unlock('lock:work');});await newReady;
 const replacement=h.records.get(key('same-user','lock:work')).value;releaseOld();await old;assert.equal(h.records.get(key('same-user','lock:work')).value,replacement);releaseNew();await newer;assert.equal(h.records.has(key('same-user','lock:work')),false);
});

test('Private PDF paths and reads are tenant-prefixed even when logical keys are identical',async()=>{
 const h=await harness(),a=pdfBytes('tenant A'),b=pdfBytes('tenant B');
 const one=await tenant.runWithTenant('user/a',()=>h.pdf.putPdf('resumes/same.pdf',a)),two=await tenant.runWithTenant('user/b',()=>h.pdf.putPdf('resumes/same.pdf',b));assert.notEqual(one.pathname,two.pathname);assert.ok(one.pathname.startsWith('tenants/'));assert.equal(h.objects.size,2);
 assert.equal(await tenant.runWithTenant('user/a',async()=>bodyText(await h.pdf.getPdf('resumes/same.pdf'))),new TextDecoder().decode(a));
 assert.equal(await tenant.runWithTenant('user/b',async()=>bodyText(await h.pdf.getPdf('resumes/same.pdf'))),new TextDecoder().decode(b));
 assert.equal(await tenant.runWithTenant('unknown-user',()=>h.pdf.getPdf('resumes/same.pdf')),null);
});

test('PDF retries accept identical immutable bytes but reject replacement content and traversal paths',async()=>{
 const h=await harness();await tenant.runWithTenant('a',async()=>{const original=await h.pdf.putPdf('resumes/history/same.pdf',pdfBytes('original')),repeated=await h.pdf.putPdf('resumes/history/same.pdf',pdfBytes('original'));assert.deepEqual(repeated,original);await assert.rejects(h.pdf.putPdf('resumes/history/same.pdf',pdfBytes('different')),/different content/);for(const path of ['../other.pdf','resumes/../other.pdf','resumes/%2e%2e/other.pdf','https://other.example/resumes/a.pdf','resumes/file.pdf?other=1'])await assert.rejects(h.pdf.getPdf(path),/Invalid resume PDF path/);});
 const missing=await harness({configured:false});await tenant.runWithTenant('a',async()=>assert.rejects(missing.pdf.getPdf('resumes/a.pdf'),/not configured/));assert.equal(missing.blobCalls.length,0);
});

test('New users receive empty profiles and do not inherit another tenant or mutable fallback data',async()=>{
 const h=await harness(),pipeline=await load('../lib/pipeline.ts',{'./runtime':{env:{}},'./tenant':tenant,'./catalog':{sources:[{id:'test',enabled:true}]},'./matching':matching,'./adapters':{},'./store':h.store,'./resume-model':{},'./versions':{},'./review-validation':{},'./queue-state':{},'./evidence-preparation':{},'./ai-provider':{DEFAULT_CLAUDE_MODEL:'unit-default'},'./ai-resume-model':{}});
 assert.equal(pipeline.initialProfile.name,'');assert.equal(pipeline.initialProfile.resume,'');
 await tenant.runWithTenant('owner',async()=>{await h.store.write('profile',{name:'Existing owner',resume:'Private source text'});assert.equal((await pipeline.profile()).name,'Existing owner');});
 await tenant.runWithTenant('new-user',async()=>{const profile=await pipeline.profile();assert.equal(profile.id,'new-user');assert.equal(profile.name,'');assert.equal(profile.resume,'');profile.filters.titles='mutated in one caller';assert.notEqual((await pipeline.profile()).filters.titles,'mutated in one caller');});
});
