import type {Source} from './catalog';
import {clean,canonical,type Job} from './matching';

type Page={jobs:Job[];total:number;size:number};
const headers={'User-Agent':'CareerStudio/1.0 (personal job discovery)',Accept:'application/json'};
export async function publicResponse(url:string,fetcher:typeof fetch,init:RequestInit={}){
 const r=await fetcher(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error(`HTTP ${r.status}${r.status===429&&r.headers.get('retry-after')?'; retry after '+r.headers.get('retry-after'):''}`);
 const reader=r.body?.getReader();if(!reader)throw Error('Empty portal response');
 const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();throw Error('Portal response exceeds 12 MB');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return {text:new TextDecoder().decode(bytes),headers:r.headers};
}
export function row(s:Source,id:unknown,v:Partial<Job>):Job{return {id:s.id+':'+String(id),source:s.id,sourceName:s.name,url:'',title:'',company:s.name,location:'',description:'',posted:'',remote:false,salary:'',salaryMin:0,employment:'',...v};}
export const iso=(v:unknown)=>v&&Number.isFinite(new Date(v as any).getTime())?new Date(v as any).toISOString():'';
const valid=(jobs:Job[])=>jobs.filter(j=>j.url&&j.title);
export async function collectPages(load:(page:number)=>Promise<Page>,label:string,maxPages=20){
 const jobs=new Map<string,Job>();let total=0,pages=0,finished=false,problem='';
 for(let page=0;page<maxPages;page++)try{
  const next=await load(page);if(!Number.isFinite(next.total)||next.total<0||!Number.isFinite(next.size)||next.size<=0)throw Error('Invalid pagination metadata');
  total=Math.max(total,next.total);pages++;let added=0;for(const job of next.jobs)if(!jobs.has(job.id)){jobs.set(job.id,job);added++;}
  if((page+1)*next.size>=next.total){finished=true;break;}
  if(!added){problem='Pagination returned no new records before the advertised total.';break;}
 }catch(e){if(!pages)throw e;problem='Later page failed: '+(e instanceof Error?e.message:'unknown error');break;}
 return {jobs:[...jobs.values()],status:finished&&!problem?'working':'partial',message:`${label}: ${jobs.size} postings retrieved across ${pages} pages; ${total} advertised records. ${finished?'All advertised pages retrieved.':`Coverage capped at ${maxPages} pages per refresh.`}${problem?' '+problem:''}`};
}
export function equiliemPage(s:Source,d:any):Page{
 if(!Array.isArray(d?.data)||!d.meta)throw Error('Equiliem jobs schema changed');
 return {total:Number(d.meta.found_posts),size:Number(d.meta.per_page),jobs:valid(d.data.map((j:any)=>row(s,j.id,{title:clean(j.title),url:canonical(j.permalink),description:clean(j.content||j.excerpt),location:clean(j.location),posted:typeof j.date==='string'?j.date.split(' ')[0]:'',remote:/^(remote|fully remote)$/i.test(j.workplace_model||''),employment:clean(j.job_type),salary:clean(j.salary)})))};
}
export function wordpressPage(s:Source,d:any,total:number):Page{
 if(!Array.isArray(d))throw Error('WordPress jobs schema changed');
 return {total,size:100,jobs:valid(d.filter((j:any)=>j.status==='publish'&&![true,1,'1'].includes(j.meta?._filled)).map((j:any)=>row(s,j.link,{title:clean(j.title?.rendered),url:canonical(j.link),description:clean(j.content?.rendered),location:clean(j.meta?._job_location),company:clean(j.meta?._company_name||s.name),posted:j.date_gmt?iso(j.date_gmt+'Z'):'',remote:j.meta?._remote_position===true||j.meta?._remote_position===1||j.meta?._remote_position==='1',salary:clean([j.meta?._job_salary,j.meta?._job_salary_currency,j.meta?._job_salary_unit].filter(Boolean).join(' ')),salaryMin:/year/i.test(j.meta?._job_salary_unit||'')?Number(j.meta?._job_salary)||0:0,employment:(j.class_list||[]).filter((v:string)=>v.startsWith('job-type-')).map((v:string)=>v.slice(9).replaceAll('-',' ')).join(', ')})))};
}
export function judgePage(s:Source,d:any,remote:boolean):Page{
 if(typeof d==='string')d=JSON.parse(d);if(!Array.isArray(d?.hits)||d.error)throw Error('Judge search schema changed or search failed');
 return {total:Number(d.total),size:Number(d.size),jobs:valid(d.hits.map((j:any)=>row(s,j.jobOrderId,{title:clean(j.title),url:`https://www.judge.com/jobs/details/${encodeURIComponent(j.jobOrderId)}/`,description:clean(j.description),location:clean(j.location),posted:iso(j.opened),remote:remote||/\bremote\b/i.test(j.location||'')||/^remote$/i.test(j.type||''),salary:clean(j.salary),employment:clean(j.type)})))};
}
export function kforcePage(s:Source,d:any):Page{
 if(!Array.isArray(d?.value))throw Error('Kforce search schema changed');
 return {total:Number(d['@odata.count']),size:100,jobs:valid(d.value.map((j:any)=>row(s,j.Id,{title:clean(j.Title),url:`https://www.kforce.com/find-work/search-jobs/#/detail/${encodeURIComponent(j.Id)}`,description:clean(j.Responsibilities)+'\n'+clean(j.Skills),location:[j.City,j.State].filter(Boolean).join(', '),posted:iso(j.PostDate),remote:/^(full|fully remote|remote|yes)$/i.test(j.Remote||''),salary:[j.SalaryMin,j.SalaryMax].filter(Boolean).join(' – ')+(j.SalaryText?' / '+clean(j.SalaryText):''),salaryMin:/year/i.test(j.SalaryText||'')?Number(j.SalaryMin)||0:0,employment:clean(j.TypeCode)})))};
}
export function apexListing(html:string){
 const rows:Array<{url:string;location:string;title:string}>=[];
 for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1]),href=cells[0]?.match(/href="(\/job\/[^"]+)"/)?.[1];if(href&&cells.length>=4)rows.push({url:new URL(href,'https://www.apexsystems.com').href,title:clean(cells[0]),location:clean(cells[1])+', '+clean(cells[2])});}
 const last=html.match(/href="([^"]+)"[^>]*title="Go to last page"/i)?.[1];const pages=last?Number(new URL(last.replaceAll('&amp;','&'),'https://www.apexsystems.com').searchParams.get('page')):1;
 if(!rows.length&&!/no (?:jobs|results)|0 jobs|no matching/i.test(html))throw Error('Apex listing format changed or response contained no job table');
 return {rows,pages};
}
export async function pullApex(s:Source,fetcher:typeof fetch,parse:(s:Source,html:string,url:string)=>Job[],cursor=0){
 const scopes=[{query:'software',remote:false},{query:'software',remote:true},{query:'developer',remote:false},{query:'developer',remote:true}];
 const scopeIndex=Number.isSafeInteger(cursor)&&cursor>=0?Math.floor(cursor/100000)%4:0,scope=scopes[scopeIndex];let page=cursor%100000||1,next=scopeIndex*100000+page,listingPages=0,totalListed=0,failures=0;const jobs=new Map<string,Job>();let problem='';
 // Small batches fit the hosted request budget; the persisted cursor covers later pages on scheduled refreshes.
 for(let batch=0;batch<2;batch++)try{
  const url=new URL('https://www.apexsystems.com/search-results-usa');for(const [k,v]of Object.entries({catalogcode:'USA',address:'',radius:'50',page:String(page),rows:'25',query:scope.query,remote:scope.remote?'true':''}))url.searchParams.set(k,v);
  const d=apexListing((await publicResponse(url.href,fetcher,{headers:{Accept:'text/html'}})).text);listingPages++;totalListed+=d.rows.length;
  const selected=d.rows.filter(item=>scope.remote||/\b(WA|Washington)\b/i.test(item.location));
  for(let start=0;start<selected.length;start+=4){const results=await Promise.allSettled(selected.slice(start,start+4).map(async item=>{const html=(await publicResponse(item.url,fetcher,{headers:{Accept:'text/html'}})).text;const job=parse(s,html,item.url)[0];if(!job)throw Error('Apex posting lacks JobPosting data');job.remote=job.remote||scope.remote;if(!job.location)job.location=item.location;
   if(/(?:United States|USA|U\.S\.)\s*\(Remote\)|Remote\s*[-–:]\s*(?:United States|USA)/i.test(job.description.slice(0,700)))job.eligibleLocations=['United States'];return job;}));for(const result of results)if(result.status==='fulfilled')jobs.set(result.value.id,result.value);else failures++;}
  page++;if(page>d.pages){next=((scopeIndex+1)%4)*100000+1;break;}next=scopeIndex*100000+page;
 }catch(e){problem=e instanceof Error?e.message:'Listing request failed';break;}
 if(!listingPages)throw Error('Apex search unavailable: '+problem);
 return {jobs:[...jobs.values()],status:'partial',cursor:next,message:'Apex '+scope.query+' '+(scope.remote?'remote':'Washington candidates')+': '+listingPages+' listing pages scanned ('+totalListed+' rows); '+jobs.size+' full descriptions retrieved. Next refresh resumes the saved search/page cursor. Four software/developer scopes rotate across refreshes. '+(failures?failures+' details unavailable. ':'')+problem};
}
export async function pullPortal(s:Source,fetcher:typeof fetch=fetch){
 if(s.adapter==='equiliem')return collectPages(async p=>equiliemPage(s,JSON.parse((await publicResponse(`https://equiliem.com/wp-json/thjb/v1/jobs?per_page=100&page=${p+1}`,fetcher)).text)),'Equiliem public job API');
 if(s.adapter==='wordpress-jobs')return collectPages(async p=>{const r=await publicResponse((s.apiUrl||s.url+'wp-json/wp/v2/job-listings')+`?per_page=100&page=${p+1}`,fetcher);return wordpressPage(s,JSON.parse(r.text),r.headers.has('x-wp-total')?Number(r.headers.get('x-wp-total')):NaN);},s.name+' public job board');
 if(s.adapter==='judge'){
  const results=[];for(const remote of [false,true])try{results.push(await collectPages(async page=>{const payload={categories:[],countries:'USA',geo:[{distance:'25',latLong:[0],location:''}],query:'',states:remote?'':'WA',type:['Any'],page,remote};const r=await publicResponse('https://www.judge.com/wp-admin/admin-ajax.php?action=jdg_get_jobs',fetcher,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload})});return judgePage(s,JSON.parse(r.text),remote);},remote?'Judge US remote search':'Judge Washington search'));}catch(e){results.push({jobs:[],status:'failed',message:e instanceof Error?e.message:'Search failed'});}
  if(results.every(r=>r.status==='failed'))throw Error(results.map(r=>r.message).join('; '));
  return {jobs:[...new Map(results.flatMap(r=>r.jobs).map(j=>[j.id,j])).values()],status:results.every(r=>r.status==='working')?'working':'partial',message:results.map(r=>r.message).join(' ')};
 }
 if(s.adapter==='kforce'){
  const html=(await publicResponse(s.url,fetcher,{headers:{Accept:'text/html'}})).text,asset=html.match(/https:\/\/kforcewebeast\.azureedge\.net\/scripts\/dist\/js\/app\.min\.js[^"'\s<]*/)?.[0];if(!asset)throw Error('Kforce public search bundle not found');
  const script=(await publicResponse(asset.replaceAll('&amp;','&'),fetcher,{headers:{Accept:'*/*'}})).text;
  // Public, read-only search key published by Kforce's own search UI; never persisted or logged.
  const config=script.match(/url:"(https:\/\/kforcewebeast\.search\.windows\.net)",key:"([^"]+)"/);if(!config)throw Error('Kforce public search configuration changed');
  return collectPages(async page=>{const r=await publicResponse(config[1]+'/indexes/kforcewebjobentity/docs/search?api-version=2016-09-01-Preview',fetcher,{method:'POST',headers:{'api-key':config[2],'Content-Type':'application/json'},body:JSON.stringify({search:'*',count:true,top:100,skip:page*100,orderby:'PostDate desc, Id asc'})});return kforcePage(s,JSON.parse(r.text));},'Kforce public search');
 }
 throw Error('Unsupported dedicated portal adapter');
}
