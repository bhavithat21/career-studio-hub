import type {Source} from './catalog';
import {clean,canonical,type Job} from './matching';
import {publicResponse,collectPages,row,iso} from './portal-adapters';
const decode=(v:string)=>v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&amp;/g,'&');
export function talentJobs(s:Source,data:any):Job[]{
 if(!Array.isArray(data))throw Error('Talent Groups collection schema changed');
 return data.filter(v=>v?.data?.activeStatus===true).map(v=>{const j=v.data;return row(s,j.jobID,{title:clean(j.jobName),url:canonical(j.jobURL),description:clean(j.fullDescription),location:[j.city,j.state,j.country].map(clean).filter(Boolean).join(', '),posted:iso(j.postedDate),validThrough:j.expiryDate||undefined,remote:/^remote$/i.test(j.workModel||''),employment:clean(j.workType),salary:clean(j.salary),salaryMin:/year|annual/i.test(j.salaryType||'')?Number(j.salaryFrom)||0:0});}).filter(j=>j.url&&j.title);
}
export function randstadPage(s:Source,d:any){
 const results=d?.searchResults;if(!Array.isArray(results?.hits)||!Number.isFinite(results.totalSize))throw Error('Randstad search schema changed');
 return {total:results.totalSize,size:30,jobs:results.hits.filter((j:any)=>!j.isDeleted&&!j.isInternal).map((j:any)=>row(s,j.id,{title:clean(j.title),url:canonical(j.detailsUrl),description:clean([j.description,...j.responsibilities||[],...j.qualifications||[]].join('\n')),location:[j.jobLocation?.city,j.jobLocation?.stateAbbreviation||j.jobLocation?.state].filter(Boolean).join(', '),posted:iso(j.createdDate),validThrough:iso(j.expireDate)||undefined,remote:j.isRemote===true,employment:clean(j.type||j.employmentType),salary:j.salary?[j.salary.currency,j.salary.min,j.salary.max,j.salary.type].filter(v=>v!=null).join(' '):'',salaryMin:/year|annual/i.test(j.salary?.type||'')?Number(j.salary.min)||0:0}))};
}
export function insightPage(s:Source,d:any){
 if(!Array.isArray(d?.jobs)||!d.pageMetadata)throw Error('Insight Global search schema changed');
 return {total:Number(d.pageMetadata.totalElements),size:Number(d.pageMetadata.size),jobs:d.jobs.filter((j:any)=>j.jobStatus==='active').map((j:any)=>row(s,j.requisitionId,{title:clean(j.jobTitle),url:'https://insightglobal.com/jobs/'+encodeURIComponent(j.requisitionId),location:[j.workAddress?.locality,j.workAddress?.administrativeArea].filter(Boolean).join(', '),posted:iso(j.postedDate),remote:j.workRemote===true,employment:clean(j.jobType),salary:j.payRate?[j.payRate.currency,j.payRate.min,j.payRate.max,j.payRate.type].filter(v=>v!=null).join(' '):'',salaryMin:/year|annual/i.test(j.payRate?.type||'')?Number(j.payRate.min)||0:0}))};
}
export function addisonJobs(s:Source,xml:string){
 if(!/<feed\b/.test(xml))throw Error('Addison Atom feed unavailable');const jobs:Job[]=[];
 for(const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)){const value=(tag:string)=>decode(entry[1].match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>'))?.[1]||''),html=value('summary'),lines=html.replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi,'\n').split('\n').map(clean).filter(Boolean),location=lines.find(l=>/^location\s*:/i.test(l))?.replace(/^location\s*:\s*/i,'')||'',href=decode(entry[1].match(/<link\b[^>]*href="([^"]+)"/)?.[1]||'');
  jobs.push(row(s,value('id'),{title:clean(value('title')),url:canonical(href),description:clean(html),location,posted:iso(value('published')),remote:/\b(?:remote|telecommute)\b/i.test(location),employment:lines.find(l=>/^(?:job type|assignment type|work type)\s*:/i.test(l))||''}));
 }return jobs.filter(j=>j.url&&j.title);
}
const combined=(results:any[])=>({jobs:[...new Map<string,Job>(results.flatMap(r=>r.jobs).map((j:Job)=>[j.id,j])).values()],status:results.every(r=>r.status==='working')?'working':'partial',message:results.map(r=>r.message).join(' ')});
export async function pullMorePortal(s:Source,fetcher:typeof fetch=fetch){
 if(s.adapter==='talentgroups'){const jobs=talentJobs(s,JSON.parse((await publicResponse('https://shazamme.io/Job-Listing/src/php/actions?dudaSiteID=610e0cf6&action=Get%20Jobs',fetcher)).text));return {jobs,status:'working',message:`${jobs.length} active jobs from the complete public Talent Groups collection.`};}
 if(s.adapter==='addison'){const jobs=addisonJobs(s,(await publicResponse('https://addisongroup.com/jobs/feeds/jobs.atom',fetcher,{headers:{Accept:'application/atom+xml,text/xml'}})).text);return {jobs,status:'partial',message:`${jobs.length} listings from Addison's official Atom feed. Feed is a latest-posting snapshot, not the full website inventory; locations absent from the feed are not guessed.`};}
 if(s.adapter==='randstad'){
  const results=[];for(const remote of [false,true])try{results.push(await collectPages(async page=>{const searchParams={query:'software',page:page+1,...remote?{isRemote:true}:{region:'washington'}};const r=await publicResponse('https://www.randstadusa.com/api/search/search-results',fetcher,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{currentRoute:{routeName:'search',url:'/jobs/',params:{}},currentLanguage:'en',searchParams}})});return randstadPage(s,JSON.parse(r.text));},remote?'Randstad remote software search':'Randstad Washington software search'));}catch(e){results.push({jobs:[],status:'failed',message:e instanceof Error?e.message:'Search failed'});}
  if(results.every(r=>r.status==='failed'))throw Error(results.map(r=>r.message).join('; '));return combined(results);
 }
 if(s.adapter==='insight'){
  const results=[];for(const remote of [false,true])try{results.push(await collectPages(async page=>{const url=new URL('https://insightglobal.com/all/jobs');for(const[k,v]of Object.entries({keyword:'software',page:String(page+1),size:'50','filter.status':'active',sort:'postedDate,desc',...remote?{'filter.includeOnlyRemoteWork':'true'}:{'filter.locations':'Seattle, WA','filter.distance':'50'}}))url.searchParams.set(k,v);return insightPage(s,JSON.parse((await publicResponse(url.href,fetcher)).text));},remote?'Insight remote software search':'Insight Seattle software search'));}catch(e){results.push({jobs:[],status:'failed',message:e instanceof Error?e.message:'Search failed'});}
  if(results.every(r=>r.status==='failed'))throw Error(results.map(r=>r.message).join('; '));const result=combined(results);let failures=0;
  for(let i=0;i<result.jobs.length;i+=4)await Promise.all(result.jobs.slice(i,i+4).map(async job=>{try{const id=job.id.slice(s.id.length+1);const d=JSON.parse((await publicResponse('https://insightglobal.com/all/jobs/'+encodeURIComponent(id)+'/details',fetcher)).text);if(typeof d.description!=='string')throw Error('Missing description');job.description=clean(d.description);}catch{failures++;}}));
  if(failures){result.jobs=result.jobs.filter(j=>j.description);result.status='partial';result.message+=` ${failures} detail requests failed and those incomplete postings were withheld.`;}return result;
 }
 throw Error('Unsupported portal adapter');
}
