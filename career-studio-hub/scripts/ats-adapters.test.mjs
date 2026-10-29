import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {match,defaults} from '../lib/matching.ts';
const source=(await readFile(new URL('../lib/ats-adapters.ts',import.meta.url),'utf8')).replace("'./matching'",JSON.stringify(new URL('../lib/matching.ts',import.meta.url).href));
const {leverJobs,ashbyJobs,pullAts}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const lever={provider:'lever',slug:'demo',company:'Demo',careersUrl:'https://example.com/careers'},ashby={...lever,provider:'ashby'};
const listing=id=>({id,text:'Software Engineer',hostedUrl:'https://jobs.lever.co/demo/'+id,categories:{location:'Seattle',allLocations:['Seattle','Bellevue'],commitment:'Full-time'},createdAt:Date.now(),descriptionPlain:'Build services',lists:[{text:'Required',content:'<p>Python &amp; SQL</p>'}],workplaceType:'hybrid'});
test('Lever keeps all locations and full list requirements; creation is not publication',()=>{
 const [j]=leverJobs(lever,[listing('one')]);assert.equal(j.id,'lever:demo:one');assert.equal(j.posted,'');assert.equal(j.remote,false);assert.match(j.location,/Seattle.*Bellevue/);assert.match(j.description,/Required Python & SQL/);assert.match(j.description,/original publication date unknown/);
});
test('Ashby mixed local and nationwide remote options preserve eligibility and dates',()=>{
 const [j]=ashbyJobs(ashby,{jobs:[{id:'1',title:'Software Engineer',jobUrl:'https://jobs.ashbyhq.com/demo/1',location:'New York, NY',secondaryLocations:[{location:'Remote (US)',address:{postalAddress:{addressCountry:'United States'}}}],isRemote:true,workplaceType:'Hybrid',publishedAt:'2026-10-27',employmentType:'FullTime',descriptionPlain:'Python systems'}]});
 assert.deepEqual(j.eligibleLocations,['United States']);assert.equal(j.posted,'2026-10-27');assert.equal(j.employment,'Full Time');assert.ok(match(j,defaults,Date.parse('2026-10-28')));
});
test('Ashby restricted remote state never becomes nationwide from country address',()=>{
 const [j]=ashbyJobs(ashby,{jobs:[{id:'1',title:'Software Engineer',jobUrl:'https://jobs.ashbyhq.com/demo/1',location:'Remote - California',address:{postalAddress:{addressCountry:'USA',addressRegion:'California'}},isRemote:true}]});assert.deepEqual(j.eligibleLocations,[]);assert.equal(match(j,defaults),null);
});
test('Invalid provider schemas fail, unlisted jobs and unsafe URLs excluded',()=>{
 assert.throws(()=>leverJobs(lever,{error:'no'}),/postings array/);assert.throws(()=>ashbyJobs(ashby,{}),/jobs array/);
 assert.equal(ashbyJobs(ashby,{jobs:[{id:'x',title:'Hidden',isListed:false,jobUrl:'https://example.com'},{id:'y',title:'Unsafe',jobUrl:'javascript:alert(1)'}]}).length,0);
});
test('Lever pagination uses skip/limit, deduplicates, and stops repeated pages',async()=>{
 const calls=[];const result=await pullAts({adapter:'lever',name:'Lever'},async url=>{calls.push(url);return Response.json(Array.from({length:100},(_,i)=>listing(String(i))));});assert.equal(calls.length,6);assert.equal(result.jobs.length,300);assert.equal(result.status,'partial');assert.match(calls[1],/skip=100&limit=100/);assert.match(result.message,/repeated page/);
});
test('One board failure retains another board and reports partial coverage',async()=>{
 const result=await pullAts({adapter:'lever',name:'Lever'},async url=>url.includes('/rover?')?Response.json([listing('a')]):new Response('wait',{status:429,headers:{'retry-after':'60'}}));assert.equal(result.jobs.length,1);assert.equal(result.status,'partial');assert.match(result.message,/retry after 60/);assert.match(result.message,/not all Lever customers/);
});
test('Ashby hard body limit and total API failure do not masquerade as zero openings',async()=>{
 const result=await pullAts({adapter:'ashby',name:'Ashby'},async()=>new Response('x',{headers:{'content-length':String(13*1024*1024)}}));assert.equal(result.status,'failed');assert.match(result.message,/12 MB/);
});
test('Ashby record truncation reports partial and skips hidden jobs',async()=>{
 const jobs=Array.from({length:1001},(_,id)=>({id:String(id),title:'Engineer',jobUrl:'https://example.com/'+id}));const result=await pullAts({adapter:'ashby',name:'Ashby'},async()=>Response.json({jobs}));assert.equal(result.jobs.length,3000);assert.equal(result.status,'partial');assert.match(result.message,/capped at 1,000/);
});


test('Slate Supporting Cast department retains the actual employer without relabeling editorial jobs',()=>{
 const board={...lever,slug:'slate',company:'Slate'};
 const [supporting,editorial]=leverJobs(board,[{...listing('1'),categories:{department:'Supporting Cast',location:'Remote - US ONLY'}},{...listing('2'),categories:{department:'Editorial',location:'Brooklyn'}}]);
 assert.equal(supporting.company,'Supporting Cast');assert.equal(editorial.company,'Slate');
});
test('Hybrid Ashby roles without a remote option remain local',()=>{
 const [j]=ashbyJobs(ashby,{jobs:[{id:'hybrid',title:'Software Engineer',jobUrl:'https://example.com/hybrid',location:'New York, NY',isRemote:false,workplaceType:'Hybrid'}]});assert.equal(j.remote,false);assert.equal(match(j,defaults),null);
});
