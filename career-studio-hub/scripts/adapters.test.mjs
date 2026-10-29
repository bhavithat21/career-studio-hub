import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {loadAdapterModules} from './load-adapters.mjs';
const {detailLinks,amazonJobs,pull,jsonld}=(await loadAdapterModules()).adapters;
const s={id:'test',name:'Test',url:'https://jobs.example.com/jobs/',kind:'portal',adapter:'jsonld',note:'',enabled:true};
test('detail links exclude assets and duplicates and prioritize software Seattle',()=>{
 const html='<link href="/jobs/wp-content/style.css"><a href="/jobs/wp-json/feed">API</a><a href="/jobs/feed/">Feed</a><a href="/jobs/job/a123-analyst/">Analyst</a><a href="/jobs/job/a456-software-engineer-seattle/?job-search=yes">Software engineer</a><a href="/jobs/job/a456-software-engineer-seattle/#apply_now">Apply</a><a href="https://other.example/jobs/12345">Elsewhere</a>';
 assert.deepEqual(detailLinks(html,s.url),['https://jobs.example.com/jobs/job/a456-software-engineer-seattle/','https://jobs.example.com/jobs/job/a123-analyst/']);
});
const item=n=>({id_icims:String(n),title:'Software Development Engineer II',job_path:'/en/jobs/'+n+'/software-development-engineer',location:'US, VA, Arlington',locations:[JSON.stringify({city:'Bellevue',normalizedStateName:'Washington',normalizedCountryName:'United States',type:'ONSITE'})],description:'Build services',basic_qualifications:'3 years',posted_date:'October 27, 2026'});
test('JSON-LD accepts the string address used by Select Group',()=>{const data={'@type':'JobPosting',title:'Software Engineer',jobLocation:{'@type':'Place',address:'Redmond, Washington'},url:s.url+'job/12345'};assert.equal(jsonld(s,'<script type="application/ld+json">'+JSON.stringify(data)+'</script>')[0].location,'Redmond, Washington');});
test('Amazon preserves alternate locations and qualifications without inventing remote eligibility',()=>{const [j]=amazonJobs(s,{jobs:[item(1)]});assert.match(j.location,/Arlington.*Bellevue, Washington/);assert.match(j.description,/3 years/);assert.equal(j.remote,false);assert.equal(j.id,'test:1');});
test('Amazon pagination is bounded and reports truncated coverage',async()=>{
 const calls=[];const fake=async u=>{calls.push(new URL(u));const offset=Number(new URL(u).searchParams.get('offset'));return Response.json({hits:1000,error:null,jobs:Array.from({length:100},(_,i)=>item(offset+i))});};
 const result=await pull('amazon',fake);assert.equal(calls.length,5);assert.equal(result.jobs.length,500);assert.equal(result.status,'partial');assert.equal(calls[0].searchParams.get('normalized_state_name[]'),'Washington');assert.equal(calls[4].searchParams.get('offset'),'400');
});
test('Amazon errors are not zero-results successes',async()=>{await assert.rejects(pull('amazon',async()=>new Response('Blocked',{status:429,headers:{'Retry-After':'60'}})),/HTTP 429; retry after 60/);await assert.rejects(pull('amazon',async()=>Response.json({hits:0})),/jobs array missing/);});
test('Amazon reports partial success when a later page fails',async()=>{let i=0;const result=await pull('amazon',async()=>++i===1?Response.json({hits:200,jobs:Array.from({length:100},(_,n)=>item(n))}):new Response('fail',{status:503}));assert.equal(result.jobs.length,100);assert.equal(result.status,'partial');assert.match(result.message,/Later page failed: HTTP 503/);});

test('Greenhouse preserves explicit posting places, not sibling office eligibility, and never substitutes updated date',async()=>{
 const result=await pull('cloudflare',async()=>Response.json({jobs:[{id:1,title:'Software Engineer',absolute_url:'https://example.com/job/1',location:{name:'Hybrid'},content:'&lt;p&gt;Build &amp; test&lt;/p&gt;',updated_at:'2026-10-27T00:00:00Z',metadata:[{name:'Job Posting Location',value:['Seattle, WA','Austin, US']}],offices:[{name:'Remote Canada'}],departments:[{name:'Engineering'}]}]}));
 const j=result.jobs[0];assert.equal(j.posted,'');assert.equal(j.remote,false);assert.equal(j.location,'Hybrid · Seattle, WA · Austin, US');assert.match(j.description,/Build & test/);assert.match(j.description,/not original publication date/);assert.doesNotMatch(j.location,/Canada/);
});
test('Greenhouse uses original published dates and explicit remote location',async()=>{
 const result=await pull('affirm',async()=>Response.json({jobs:[{id:2,title:'Software Engineer',absolute_url:'https://example.com/job/2',location:{name:'Remote US'},first_published:'2025-01-01T00:00:00Z',updated_at:'2026-10-27T00:00:00Z',metadata:[{name:'Time Type',value:'Full time'}]}]}));
 const j=result.jobs[0];assert.equal(j.posted,'2025-01-01T00:00:00Z');assert.equal(j.remote,true);assert.equal(j.employment,'Full time');assert.equal(j.company,'Affirm');
});
test('Greenhouse rejects API errors, invalid schema, and oversized bodies',async()=>{
 await assert.rejects(pull('stripe',async()=>new Response('',{status:429})),/HTTP 429/);
 await assert.rejects(pull('stripe',async()=>Response.json({error:'unavailable'})),/jobs array missing/);
 await assert.rejects(pull('stripe',async()=>new Response('large',{headers:{'content-length':String(13*1024*1024)}})),/12 MB limit/);
});
test('Greenhouse record count is bounded with truthful coverage',async()=>{
 const jobs=Array.from({length:1001},(_,id)=>({id,title:'Software Engineer',absolute_url:'https://example.com/job/'+id,location:{name:'Seattle'}}));
 const result=await pull('brex',async()=>Response.json({jobs}));assert.equal(result.jobs.length,1000);assert.equal(result.status,'partial');assert.match(result.message,/first 1,000/);
});

test('Greenhouse nested entities are plain text before evidence ranking',async()=>{
 const result=await pull('stripe',async()=>Response.json({jobs:[{id:3,title:'Software Engineer',absolute_url:'https://example.com/job/3',location:{name:'Seattle, WA'},content:'&lt;p&gt;About Stripe&amp;nbsp; Build &amp;amp; test. Everyone&amp;#39;s work.&lt;/p&gt;'}]}));
 assert.equal(result.jobs[0].description,"About Stripe Build & test. Everyone's work.");
});
