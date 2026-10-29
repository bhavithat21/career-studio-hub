import type {Source} from './catalog';
import {clean,canonical,type Job} from './matching';
import {publicResponse,collectPages,row} from './portal-adapters';

export function googlePage(s:Source,html:string){
 const embedded=html.match(/AF_initDataCallback\(\{key: 'ds:1',[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);/);
 if(!embedded)throw Error('Google public results schema changed');
 const data=JSON.parse(embedded[1]);if(!Array.isArray(data[0])||!Number.isFinite(data[2])||!Number.isFinite(data[3]))throw Error('Google pagination metadata missing');
 const links=[...html.matchAll(/href=["']([^"']*jobs\/results\/[^"']+)["']/g)].map(m=>m[1]);
 return {total:data[2],size:data[3],jobs:data[0].map((j:any)=>{
  const href=links.find(link=>link.includes('/'+j[0]+'-'));if(!href)return null;
  const location=(j[9]||[]).map((v:any)=>clean(v[0])).filter(Boolean).join(' · ');
  return row(s,j[0],{title:clean(j[1]),company:clean(j[7]||s.name),url:canonical(new URL(href.replace(/&amp;/g,'&'),'https://www.google.com/about/careers/applications/').href),location,description:clean([10,3,4,15,18].map(i=>j[i]?.[1]).filter(Boolean).join('\n')),remote:/\bremote\b/i.test(location)});
 }).filter((j:Job|null):j is Job=>!!j)};
}

export function motionJobs(s:Source,data:any):Job[]{
 if(!Array.isArray(data?.data)||!Number.isFinite(data.total))throw Error('Motion search schema changed');
 return data.data.filter((j:any)=>j.employmentType?.isGhostPost===false).map((j:any)=>row(s,j.id,{title:clean(j.title),url:canonical(j.url),description:clean(j.description),location:[j.address?.city,j.address?.state,j.address?.country].filter(Boolean).join(', '),remote:['RemoteOnly','RemoteLocal'].includes(j.remote),employment:clean(j.employmentType?.googleEmploymentType||j.employmentType?.name)})).filter((j:Job)=>j.url&&j.title);
}

export async function pullEmployer(s:Source,fetcher:typeof fetch=fetch){
 if(s.adapter==='google-public')return collectPages(async page=>{
  const url=new URL('https://www.google.com/about/careers/applications/jobs/results/');url.searchParams.set('q','software engineer');url.searchParams.set('location','Seattle, WA, USA');url.searchParams.set('page',String(page+1));
  return googlePage(s,(await publicResponse(url.href,fetcher,{headers:{Accept:'text/html'}})).text);
 },'Google Seattle software search (publication dates not provided)',20);
 if(s.adapter==='motion-public'){
  const data=JSON.parse((await publicResponse('https://hrz-api.motionrecruitment.com/agency/jobs/search?count=500&keywords=software',fetcher)).text),jobs=motionJobs(s,data);
  return {jobs,status:data.total<=data.data.length?'working':'partial',message:`${jobs.length} live software postings from ${data.data.length} of ${data.total} search records. Evergreen/ghost postings excluded. Publication dates unavailable in this feed; unknown-date preference applies. Search is limited to 500 records.`};
 }
 throw Error('Unsupported employer adapter');
}
