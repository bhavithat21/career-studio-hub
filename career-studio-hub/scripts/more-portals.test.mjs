import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAdapterModules} from './load-adapters.mjs';
const modules=await loadAdapterModules();
const {talentJobs,randstadPage,insightPage,addisonJobs}=modules['more-portals'];
const {googlePage,motionJobs}=modules['employer-adapters'];
const {phenomData,nttJob,microsoftJob,pullRolling}=modules['rolling-portals'];
const s={id:'test',name:'Test',url:'https://example.com/',adapter:'test'};
test('Apex bounds each hosted batch and resumes later pages and search scopes',async()=>{
 const {pullApex}=modules['portal-adapters'];const pages=[];
 const fetcher=async url=>{if(url.includes('search-results')){const p=Number(new URL(url).searchParams.get('page'));pages.push(p);return new Response(`<table><tr><td><a href="/job/${p}_usa/software-engineer">Software Engineer</a></td><td>Seattle</td><td>WA</td><td>10/28/2026</td></tr></table><a href="/search-results-usa?page=3" title="Go to last page">Last</a>`);}return new Response('detail');};
 const parse=(s,h,url)=>[{id:url,url,title:'Software Engineer',description:'Full JD',remote:false}];
 const first=await pullApex(s,fetcher,parse);assert.deepEqual(pages,[1,2]);assert.equal(first.cursor,3);assert.equal(first.jobs.length,2);
 const second=await pullApex(s,fetcher,parse,first.cursor);assert.equal(second.cursor,100001);assert.equal(second.jobs.length,1);assert.equal(second.status,'partial');
});
test('staffing APIs retain explicit remote flags, original dates and active records',()=>{
 const talent=talentJobs(s,[{data:{activeStatus:true,jobID:1,jobName:'Engineer',jobURL:'https://example.com/1',fullDescription:'Build services',workModel:'Hybrid',postedDate:'2026-01-01'}},{data:{activeStatus:false}}]);assert.equal(talent.length,1);assert.equal(talent[0].remote,false);assert.equal(talent[0].posted,'2026-01-01T00:00:00.000Z');
 const r=randstadPage(s,{searchResults:{totalSize:2,hits:[{id:1,title:'Engineer',detailsUrl:'https://example.com/1',isRemote:true,createdDate:1793145600000,description:'Build',responsibilities:['Test'],qualifications:['Java']},{isDeleted:true}]}});assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].remote,true);assert.match(r.jobs[0].description,/Build.*Test.*Java/s);
 assert.throws(()=>insightPage(s,{error:'Unavailable'}));const ig=insightPage(s,{pageMetadata:{totalElements:1,size:50},jobs:[{jobStatus:'active',requisitionId:'a',jobTitle:'Engineer',workRemote:false,workAddress:{locality:'Seattle',administrativeArea:'WA'}}]});assert.equal(ig.jobs[0].remote,false);assert.equal(ig.jobs[0].description,'');
});
test('Addison decodes feed content and uses publication date, not update date',()=>{
 const j=addisonJobs(s,'<feed><entry><id>1</id><title>Engineer</title><link href="https://example.com/job/1"/><published>2026-01-01</published><updated>2026-10-28</updated><summary>&lt;p&gt;Location: Seattle, WA&lt;/p&gt;&lt;p&gt;Build APIs &amp; services&lt;/p&gt;</summary></entry></feed>')[0];assert.equal(j.location,'Seattle, WA');assert.equal(j.posted,'2026-01-01T00:00:00.000Z');assert.match(j.description,/Build APIs & services/);
});
test('Google reads JSON only, all locations and full descriptions; no guessed timestamp',()=>{
 const j=[];j[0]='123';j[1]='Software Engineer';j[7]='Google';j[9]=[['Seattle, WA, USA'],['Austin, TX, USA']];j[10]=[null,'<p>About role</p>'];j[3]=[null,'<p>Responsibilities</p>'];j[4]=[null,'Qualifications'];j[12]=[1793145600];
 const html=`<a href="jobs/results/123-software-engineer">Role</a><script>AF_initDataCallback({key: 'ds:1', data:${JSON.stringify([[j],null,1,20])}, sideChannel: {}});</script>`;
 const r=googlePage(s,html);assert.equal(r.jobs.length,1);assert.equal(r.jobs[0].url,'https://www.google.com/about/careers/applications/jobs/results/123-software-engineer');assert.match(r.jobs[0].location,/Seattle.*Austin/);assert.match(r.jobs[0].description,/Responsibilities/);assert.equal(r.jobs[0].posted,'');assert.throws(()=>googlePage(s,'access denied'));
});
test('Motion excludes ghost listings and does not treat hybrid as remote',()=>{
 const base={id:1,title:'Engineer',url:'https://example.com/1',description:'Build',address:{city:'Seattle',state:'Washington'},employmentType:{isGhostPost:false,name:'Full Time'}};
 const jobs=motionJobs(s,{total:3,data:[{...base,remote:'Hybrid'},{...base,id:2,remote:'RemoteOnly'},{...base,id:3,employmentType:{isGhostPost:true}}]});assert.equal(jobs.length,2);assert.equal(jobs[0].remote,false);assert.equal(jobs[1].remote,true);assert.equal(jobs[0].posted,'');
});
test('Phenom JSON parser handles braces in strings and rejects executable expressions',()=>{
 assert.equal(phenomData('phApp.ddo = {"job":{"description":"a } and \\\" quote"}};').job.description,'a } and " quote');assert.throws(()=>phenomData('phApp.ddo = {job:runCode()};'));
 const job=nttJob(s,{jobSeqNo:'a',title:'Engineer',location:'Seattle, WA',description:'Full JD',postedDate:'2026-01-01',remoteType:'Hybrid'},'https://example.com/1');assert.equal(job.remote,false);assert.equal(job.posted,'2026-01-01T00:00:00.000Z');
});
test('Microsoft resumes pagination and stops on 429 without dropping retrieved descriptions',async()=>{
 const starts=[];const fetcher=async url=>{if(url.includes('position_details'))return Response.json({data:{id:1,name:'Software Engineer',jobDescription:'Full description',postedTs:1793145600,standardizedLocations:['Redmond, WA, US'],workLocationOption:'onsite'}});starts.push(Number(new URL(url).searchParams.get('start')));return starts.length===1?Response.json({data:{count:100,positions:[{id:1}]}}):new Response('',{status:429,headers:{'retry-after':'60'}});};
 const r=await pullRolling({...s,adapter:'microsoft-public'},fetcher,20);assert.deepEqual(starts,[20,30]);assert.equal(r.cursor,30);assert.equal(r.status,'partial');assert.equal(r.jobs.length,1);assert.match(r.message,/retry after 60/);assert.equal(r.jobs[0].description,'Full description');assert.equal(microsoftJob(s,{id:1,workLocationOption:'hybrid'}).remote,false);
});
