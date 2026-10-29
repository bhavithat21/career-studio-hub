import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {canonical} from '../lib/matching.ts';
const source=(await readFile(new URL('../lib/portal-adapters.ts',import.meta.url),'utf8')).replace("'./catalog'",JSON.stringify(new URL('../lib/catalog.ts',import.meta.url).href)).replace("'./matching'",JSON.stringify(new URL('../lib/matching.ts',import.meta.url).href));
const {equiliemPage,wordpressPage,judgePage,kforcePage,collectPages,pullPortal,apexListing}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const s={id:'test',name:'Test',url:'https://example.com/',adapter:'test'};
test('Apex finds real posting rows and follows advertised last page instead of the first-page limit',()=>{
 const p=apexListing('<table><tr><td><a href="/job/1_usa/software-engineer">Software Engineer</a></td><td>Seattle</td><td>WA</td><td>10/28/2026</td></tr></table><a href="/search-results-usa?query=software&amp;page=9" title="Go to last page">Last</a>');assert.equal(p.pages,9);assert.equal(p.rows[0].location,'Seattle, WA');assert.equal(p.rows[0].url,'https://www.apexsystems.com/job/1_usa/software-engineer');assert.throws(()=>apexListing('Blocked'),/format changed/);
});
test('Equiliem retains original dates, job content and explicit workplace classification',()=>{
 const page=equiliemPage(s,{meta:{found_posts:1,per_page:100},data:[{id:5,title:'Developer',permalink:'https://example.com/job/5',content:'<p>Build services</p>',location:'Seattle, WA, US',date:'2026-10-28 01:00:00',workplace_model:'Hybrid',job_type:'Contract',salary:'60 per hour'}]});assert.equal(page.jobs[0].remote,false);assert.equal(page.jobs[0].posted,'2026-10-28');assert.equal(page.jobs[0].salaryMin,0);assert.equal(page.jobs[0].description,'Build services');
});
test('WordPress excludes filled listings and preserves original dates and explicit location metadata',()=>{
 const j={status:'publish',link:'https://example.com/job/1',title:{rendered:'Developer'},content:{rendered:'Remote support for customers'},date_gmt:'2026-01-01T00:00:00',modified_gmt:'2026-10-28T00:00:00',meta:{_job_location:'Redmond, WA',_remote_position:0},class_list:['job-type-contract']};const p=wordpressPage(s,[j,{...j,meta:{_filled:1}}],2);assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].posted,'2026-01-01T00:00:00.000Z');assert.equal(p.jobs[0].remote,false);assert.equal(p.jobs[0].employment,'contract');
});
test('Judge schema errors never become zero job successes and remote scope is retained',()=>{
 assert.throws(()=>judgePage(s,{error:'Bad Request'},false));const p=judgePage(s,JSON.stringify({total:1,size:20,hits:[{jobOrderId:5,title:'Engineer',location:'United States',opened:1793145600000,description:'Build',type:'Contract'}]}),true);assert.equal(p.jobs[0].remote,true);assert.match(p.jobs[0].url,/details\/5/);
});
test('Kforce hybrid is not fully remote and hourly pay is not annual salary',()=>{
 const p=kforcePage(s,{'@odata.count':1,value:[{Id:'abc',Title:'Developer',Remote:'Partial',City:'Seattle',State:'WA',SalaryMin:'75',SalaryMax:'85',SalaryText:'Hours',PostDate:'2026-10-01T00:00:00Z'}]});assert.equal(p.jobs[0].remote,false);assert.equal(p.jobs[0].salaryMin,0);assert.notEqual(canonical(p.jobs[0].url),canonical(p.jobs[0].url.replace('abc','xyz')));
});
test('pagination deduplicates pages, detects repetition, and reports partial errors',async()=>{
 const j=id=>({id});const full=await collectPages(async p=>({total:3,size:2,jobs:p?[j('c')]:[j('a'),j('b')]}),'test');assert.equal(full.status,'working');assert.equal(full.jobs.length,3);
 const repeated=await collectPages(async()=>({total:8,size:2,jobs:[j('a'),j('b')]}),'test');assert.equal(repeated.status,'partial');assert.match(repeated.message,/no new records/);
 const failed=await collectPages(async p=>{if(p)throw Error('HTTP 503');return {total:3,size:2,jobs:[j('a'),j('b')]};},'test');assert.equal(failed.status,'partial');assert.equal(failed.jobs.length,2);
 const capped=await collectPages(async p=>({total:10,size:1,jobs:[j(String(p))]}),'test',2);assert.equal(capped.status,'partial');assert.equal(capped.jobs.length,2);
});
test('Equiliem adapter requests additional pages with explicit pagination',async()=>{
 const calls=[];const result=await pullPortal({...s,adapter:'equiliem'},async url=>{calls.push(url);const page=new URL(url).searchParams.get('page');return Response.json({meta:{found_posts:2,per_page:1},data:[{id:page,title:'Developer',permalink:'https://example.com/job/'+page}]});});assert.equal(result.jobs.length,2);assert.match(calls[1],/page=2/);
});
