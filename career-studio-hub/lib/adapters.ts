import {sources,type Source} from './catalog';
import {clean,canonical,type Job} from './matching';
import {pullPortal,pullApex} from './portal-adapters';
import {pullMorePortal} from './more-portals';
import {pullEmployer} from './employer-adapters';
import {pullRolling} from './rolling-portals';
import {pullAts} from './ats-adapters';
import {pullLinkedin} from './linkedin-adapter';
async function get(url:string,fetcher:typeof fetch=fetch){const r=await fetcher(url,{headers:{'User-Agent':'CareerStudio/1.0 (personal job discovery)','Accept':'application/json,text/html'},signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error(`HTTP ${r.status}${r.status===429&&r.headers.get('retry-after')?`; retry after ${r.headers.get('retry-after')}`:''}`);return r.text();}
function row(s:Source,v:Partial<Job>,key:unknown):Job{return {id:s.id+':'+String(key),source:s.id,sourceName:s.name,url:'',title:'',company:'',location:'',description:'',posted:'',remote:false,salary:'',salaryMin:0,employment:'',...v};}
export function greenhouseJobs(s:Source,data:any):Job[]{
 if(!Array.isArray(data?.jobs))throw Error('Greenhouse returned an unexpected response; jobs array missing');
 return data.jobs.slice(0,1000).map((j:any)=>{
  const metadata=Array.isArray(j.metadata)?j.metadata:[],primary=clean(j.location?.name);
  const places=metadata.filter((m:any)=>/^job posting location$/i.test(m.name||'')).flatMap((m:any)=>[m.value].flat()).filter((v:any)=>typeof v==='string');
  // Offices can belong to sibling postings in other countries, so do not use them as eligibility evidence.
  const offices=(Array.isArray(j.offices)?j.offices:[]).map((o:any)=>clean(o.name)).filter(Boolean);
  const departments=(Array.isArray(j.departments)?j.departments:[]).map((d:any)=>clean(d.name)).filter(Boolean);
  const location=[...new Set([primary,...places].filter(Boolean))].join(' · ');
  const published=typeof j.first_published==='string'&&Number.isFinite(Date.parse(j.first_published))?j.first_published:'';
  // Greenhouse can nest entity escaping: decode wrappers before stripping HTML.
  let content=String(j.content||'');for(let depth=0;depth<3;depth++)content=content.replace(/&amp;/g,'&');
  content=content.replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const employment=metadata.find((m:any)=>/^(employment type|time type)$/i.test(m.name||''))?.value;
  return row(s,{url:canonical(j.absolute_url),title:clean(j.title),company:clean(j.company_name||s.name),location,remote:/\bremote\b/i.test(primary),posted:published,employment:typeof employment==='string'?clean(employment):'',description:clean(content)+[departments.length?'Departments: '+departments.join(', '):'',offices.length?'Organizational offices (not confirmed posting locations): '+offices.join(', '):'',j.updated_at?'Board record updated: '+clean(j.updated_at)+' (not original publication date)':''].filter(Boolean).map(v=>'\n'+v).join('')},j.id);
 }).filter((j:Job)=>j.url&&j.title);
}
async function pullGreenhouse(s:Source,fetcher:typeof fetch){
 const r=await fetcher(s.url,{headers:{Accept:'application/json','User-Agent':'CareerStudio/1.0 (personal job discovery)'},signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error(`HTTP ${r.status}`);
 const limit=12*1024*1024;if(Number(r.headers.get('content-length'))>limit)throw Error('Greenhouse response exceeds 12 MB limit');
 const reader=r.body?.getReader();if(!reader)throw Error('Greenhouse response body missing');
 const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Greenhouse response exceeds 12 MB limit');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes)),jobs=greenhouseJobs(s,data),truncated=data.jobs.length>1000;
 return {jobs,status:truncated?'partial':'working',message:`${jobs.length} structured postings retrieved from official public board${truncated?'; limited to first 1,000 records':''}. Original first_published dates used when provided; updated timestamps do not reset posting age. Location and user filters apply after retrieval.`};
}
export function jsonld(s:Source,html:string,pageUrl=s.url):Job[]{
 const jobs:Job[]=[];
 function walk(v:any){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}
  if([v['@type']].flat().includes('JobPosting')){
   const locations=[v.jobLocation].flat().filter(Boolean).map((l:any)=>typeof l.address==='string'?clean(l.address):[l.address?.addressLocality,l.address?.addressRegion,typeof l.address?.addressCountry==='object'?l.address.addressCountry.name:l.address?.addressCountry].filter(Boolean).join(', '));
   const eligible=[v.applicantLocationRequirements].flat().filter(Boolean).map((l:any)=>l.name).filter(Boolean);
   const salary=v.baseSalary?.value;const amount=Number(salary?.minValue||salary?.value||0);const unit=salary?.unitText||'';
   jobs.push(row(s,{title:clean(v.title),company:clean(v.hiringOrganization?.name||s.name),url:canonical(v.url||pageUrl),description:clean(v.description),location:[...locations,...eligible].join(' · '),eligibleLocations:eligible,remote:String(v.jobLocationType).includes('TELECOMMUTE'),posted:v.datePosted||'',validThrough:v.validThrough,salary:amount?`${v.baseSalary.currency||'USD'} ${amount}${salary.maxValue?' – '+salary.maxValue:''} / ${unit}`:'',salaryMin:unit.toUpperCase()==='YEAR'?amount:0,employment:clean([v.employmentType].flat().join(', '))},v.identifier?.value||v.url||pageUrl));
  }else Object.values(v).forEach(walk);
 }
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 return jobs;
}
export function detailLinks(html:string,pageUrl:string):string[]{
 const candidates=new Map<string,number>(),origin=new URL(pageUrl).origin;
 for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))try{
  const u=new URL(m[1].replace(/&(?:amp|#0*38);/g,'&'),pageUrl),path=u.pathname;
  if(u.origin!==origin||!/^https?:$/.test(u.protocol)||!/(?:\/job\/|\/(?:jobs|position|positions)\/)[^/]{4,}/i.test(path))continue;
  if(/\/(?:wp-content|wp-includes|wp-json|feed|comments|search|search-results|category|categories|locations|departments|assets)(?:\/|$)|\.(?:css|js|json|xml|svg|png|jpe?g|gif|webp|woff2?|pdf)$/i.test(path))continue;
  u.hash='';u.searchParams.delete('job-search');const url=canonical(u.toString()),text=clean(m[2])+' '+decodeURIComponent(path);
  const score=(/software|developer|backend|frontend|full.?stack|\bsde\b/i.test(text)?20:0)+(/seattle|bellevue|redmond|kirkland|bothell|tacoma|everett|remote/i.test(text)?10:0);
  candidates.set(url,Math.max(score,candidates.get(url)??-1));
 }catch{}
 return [...candidates].sort((a,b)=>b[1]-a[1]).map(([url])=>url);
}
export function amazonJobs(s:Source,data:any):Job[]{
 if(!Array.isArray(data?.jobs))throw Error('Amazon returned an unexpected response; jobs array missing');
 return data.jobs.map((j:any)=>{
  const places=(Array.isArray(j.locations)?j.locations:[]).map((v:any)=>{if(typeof v==='object')return v;try{return JSON.parse(v);}catch{return null;}}).filter(Boolean);
  const location=[...new Set([j.location,...places.map((p:any)=>[p.city||p.normalizedCityName,p.normalizedStateName||p.region,p.normalizedCountryName||p.countryIso2a].filter(Boolean).join(', '))].filter(Boolean))].join(' · ');
  const remote=places.length>0&&places.every((p:any)=>/^(REMOTE|VIRTUAL)$/i.test(p.type||''));
  let url='';try{if(j.job_path)url=canonical(new URL(j.job_path,'https://www.amazon.jobs').toString());}catch{}
  return row(s,{url,title:clean(j.title),company:clean(j.company_name||'Amazon'),location,description:clean([j.description,j.basic_qualifications,j.preferred_qualifications].filter(Boolean).join('\n')),posted:j.posted_date||'',remote,employment:clean(j.job_schedule_type)},j.id_icims||j.id||url);
 }).filter((j:Job)=>j.url&&j.title);
}
async function pullAmazon(s:Source,fetcher:typeof fetch){
 const jobs:Job[]=[],seen=new Set<string>();let pages=0,total=0,complete=false,failure='';
 for(let page=0;page<5;page++){
  const u=new URL('https://www.amazon.jobs/en/search.json');u.searchParams.set('base_query','software');u.searchParams.append('normalized_country_code[]','USA');u.searchParams.append('normalized_state_name[]','Washington');u.searchParams.set('offset',String(page*100));u.searchParams.set('result_limit','100');u.searchParams.set('sort','recent');
  try{const data=JSON.parse(await get(u.toString(),fetcher));if(data.error)throw Error('Amazon search reported an error');const batch=amazonJobs(s,data);pages++;total=Number(data.hits)||0;
   let newCount=0;for(const j of batch)if(!seen.has(j.id)){seen.add(j.id);jobs.push(j);newCount++;}
   if(data.jobs.length<100||(total>0&&page*100+data.jobs.length>=total)){complete=true;break;}
   if(!newCount){failure='Pagination repeated a page; stopped.';break;}
  }catch(e){if(!pages)throw e;failure=`Later page failed: ${e instanceof Error?e.message:'unknown error'}`;break;}
 }
 return {jobs,status:complete&&!failure?'working':'partial',message:`${jobs.length} structured records from ${pages} pages; ${total} Washington-associated search hits. Seattle-area filters apply after retrieval. ${complete?'Available search pages retrieved.':'Coverage limited to the latest 500 records per pull.'}${failure?' '+failure:''}`};
}
export async function pull(sourceId:string,fetcher:typeof fetch=fetch,cursor=0):Promise<{jobs:Job[];status:string;message:string;cursor?:number}>{
 const s=sources.find(s=>s.id===sourceId);if(!s)throw Error('Unknown source');
 if(['lever','ashby'].includes(s.adapter))return pullAts(s,fetcher);
 if(s.adapter==='linkedin-public')return pullLinkedin(s,fetcher,cursor);
 if(s.adapter==='access-required')return {jobs:[],status:'needs_access',message:`${s.name} denied anonymous automated access in the verified public probe. No jobs imported. An approved feed or partner integration is required; this source does not use login cookies, proxy rotation, or challenge bypass.`};
 if(s.adapter==='greenhouse')return pullGreenhouse(s,fetcher);
 if(['ntt-public','microsoft-public'].includes(s.adapter))return pullRolling(s,fetcher,cursor);
 if(['google-public','motion-public'].includes(s.adapter))return pullEmployer(s,fetcher);
 if(s.adapter==='apex-paged')return pullApex(s,fetcher,jsonld,cursor);
 if(['insight','talentgroups','addison','randstad'].includes(s.adapter))return pullMorePortal(s,fetcher);
 if(['equiliem','wordpress-jobs','judge','kforce'].includes(s.adapter))return pullPortal(s,fetcher);
 if(s.adapter==='amazon')return pullAmazon(s,fetcher);
 const raw=await get(s.url,fetcher);
 if(s.kind==='feed'){
  const data=JSON.parse(raw);let jobs:Job[]=[];
  if(s.adapter==='remotive')jobs=data.jobs.map((j:any)=>row(s,{url:canonical(j.url),title:clean(j.title),company:clean(j.company_name),location:clean(j.candidate_required_location),description:clean(j.description),posted:j.publication_date,remote:true,salary:clean(j.salary),employment:clean(j.job_type)},j.id));
  if(s.adapter==='jobicy')jobs=data.jobs.map((j:any)=>row(s,{url:canonical(j.url),title:clean(j.jobTitle),company:clean(j.companyName),location:clean(j.jobGeo),description:clean(j.jobDescription),posted:j.pubDate,remote:true,salary:j.salaryMin?`${j.salaryCurrency} ${j.salaryMin} – ${j.salaryMax} / ${j.salaryPeriod}`:'',salaryMin:j.salaryPeriod==='year'?Number(j.salaryMin):0,employment:clean((j.jobType||[]).join(', '))},j.id));
  if(s.adapter==='remoteok')jobs=data.filter((j:any)=>j.id&&j.position).map((j:any)=>row(s,{url:canonical(j.url),title:clean(j.position),company:clean(j.company),location:clean(j.location),description:clean(j.description),posted:j.date,remote:true,salary:j.salary_min?`USD ${j.salary_min} – ${j.salary_max}`:'',salaryMin:Number(j.salary_min)||0,employment:''},j.id));
  return {jobs:jobs.filter(j=>j.url&&j.title),status:'working',message:`${jobs.length} feed records retrieved. Feed coverage is limited; not every opening is included.`};
 }
 let jobs=jsonld(s,raw),failed=0;
 const links=detailLinks(raw,s.url),detail=links.slice(0,12);
 for(let i=0;i<detail.length;i+=3){const results=await Promise.allSettled(detail.slice(i,i+3).map(async u=>jsonld(s,await get(u,fetcher),u)));for(const r of results)if(r.status==='fulfilled')jobs.push(...r.value);else failed++;}
 jobs=[...new Map(jobs.filter(j=>j.url&&j.title).map(j=>[j.id,j])).values()];
 if(!jobs.length&&failed===detail.length&&failed)return {jobs,status:'failed',message:`All ${failed} posting pages failed. No inventory conclusion can be drawn.`};
 return {jobs,status:jobs.length?'partial':'needs_adapter',message:jobs.length?`${jobs.length} structured postings from ${detail.length+1} pages; ${links.length} detail links found. First listing page only, up to 12 relevant detail pages${failed?`; ${failed} pages failed`:''}.`:'No machine-readable JobPosting records found. A dedicated adapter or browser worker is required; this is not a zero-jobs result.'};
}
