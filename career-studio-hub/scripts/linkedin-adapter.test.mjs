import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedinListings,linkedinJob,pullLinkedin} from '../lib/linkedin-adapter.ts';
const source={id:'linkedin',name:'LinkedIn',url:'https://www.linkedin.com/jobs/'};
const card=(id=1,title='Software Engineer',company='Example',location='Seattle, WA')=>`<li><div data-entity-urn="urn:li:jobPosting:${id}"><h3 class="base-search-card__title">${title}</h3><h4 class="base-search-card__subtitle"><a>${company}</a></h4><span class="job-search-card__location">${location}</span><time datetime="2026-10-03"></time></div></li>`;
const details=(description='Build services for remote customers.')=>`<div class="show-more-less-html__markup"><p>${description}</p><div>Nested full description.</div><p>Final responsibilities.</p></div><li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Employment type</h3><span class="description__job-criteria-text">Full-time</span></li>`;
test('public cards retain original dates and full nested descriptions without inventing remote eligibility',()=>{
 const [listing]=linkedinListings(card());const job=linkedinJob(source,listing,details());assert.equal(job.posted,'2026-10-03');assert.equal(job.remote,false);assert.equal(job.employment,'Full-time');assert.match(job.description,/Nested full description\. Final responsibilities\./);assert.equal(job.url,'https://www.linkedin.com/jobs/view/1');assert.throws(()=>linkedinJob(source,listing,'<p>No public description</p>'),/unavailable/);
});
test('remote requires explicit posting language, title/location, or matching JobPosting metadata',()=>{
 const listing=linkedinListings(card())[0];assert.equal(linkedinJob(source,listing,details('This position is fully remote.')).remote,true);assert.equal(linkedinJob(source,listing,details('Support remote staff from our hybrid office.')).remote,false);assert.equal(linkedinJob(source,{...listing,location:'United States (Remote)'},details()).remote,true);assert.equal(linkedinJob(source,listing,details()+'<script type="application/ld+json">{"@type":"JobPosting","url":"https://www.linkedin.com/jobs/view/1","jobLocationType":"TELECOMMUTE","applicantLocationRequirements":{"name":"United States"}}</script>').eligibleLocations[0],'United States');
});
test('refresh is bounded to two pages, retrieves full descriptions, then rotates scope and preserves offsets',async()=>{
 const calls=[];const fetcher=async input=>{const url=new URL(input);calls.push(url);return new Response(url.pathname.includes('seeMore')?Array.from({length:10},(_,i)=>card(Number(url.searchParams.get('start'))+i+1)).join(''):details());};
 const first=await pullLinkedin(source,fetcher);assert.equal(first.jobs.length,20);assert.equal(calls.filter(url=>url.pathname.includes('seeMore')).length,2);assert.equal(first.cursor,41);
 calls.length=0;const second=await pullLinkedin(source,fetcher,first.cursor);assert.equal(calls[0].searchParams.get('location'),'United States');assert.equal(calls[0].searchParams.get('keywords'),'software engineer remote');assert.equal(calls[0].searchParams.has('f_WT'),false);assert.equal(second.cursor,400040);
});
test('403 or 429 on detail stops subsequent requests and preserves the failed listing page cursor',async()=>{
 for(const status of [403,429]){const calls=[];const result=await pullLinkedin(source,async input=>{const url=new URL(input);calls.push(url);return url.pathname.includes('seeMore')?new Response(Array.from({length:10},(_,i)=>card(i+1)).join('')):new Response('Blocked',{status,headers:{'retry-after':'600'}});});assert.equal(result.status,'blocked');assert.equal(result.cursor,0);assert.equal(result.jobs.length,0);assert.equal(calls.length,3);assert.match(result.message,/No bypass/);}
});
test('listing failure preserves its page cursor and redirects never become empty success',async()=>{
 const failed=await pullLinkedin(source,async()=>new Response('Denied',{status:403}),40);assert.equal(failed.cursor,40);assert.equal(failed.status,'blocked');
 const response=new Response('<p>Sign in</p>');Object.defineProperty(response,'url',{value:'https://www.linkedin.com/authwall'});const redirected=await pullLinkedin(source,async()=>response);assert.equal(redirected.status,'blocked');assert.equal(redirected.jobs.length,0);assert.throws(()=>linkedinListings('<h1>Unexpected error</h1>'),/format changed/);assert.deepEqual(linkedinListings('<!DOCTYPE html>\n<!---->'),[]);
});
test('a later listing block retains the failed page and current scope after earlier success',async()=>{
 const result=await pullLinkedin(source,async input=>{const url=new URL(input);if(!url.pathname.includes('seeMore'))return new Response(details());if(url.searchParams.get('start')==='10')return new Response('Limited',{status:429});return new Response(Array.from({length:10},(_,i)=>card(i+1)).join(''));});assert.equal(result.jobs.length,10);assert.equal(result.cursor,20);assert.equal(result.status,'blocked');
});
