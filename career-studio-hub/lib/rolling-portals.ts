import type {Source} from './catalog';
import {clean,canonical,type Job} from './matching';
import {publicResponse,row,iso} from './portal-adapters';

// Parse only a JSON assignment. Never evaluate publisher JavaScript.
export function phenomData(html:string){
 const marker=html.match(/phApp\.ddo\s*=\s*/);if(!marker)throw Error('Public Phenom page data missing');
 const start=marker.index!+marker[0].length;let depth=0,quoted=false,escaped=false;
 for(let i=start;i<html.length;i++){const c=html[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(html.slice(start,i+1));}
 throw Error('Public Phenom page data incomplete');
}
export function nttJob(s:Source,j:any,url:string):Job{
 const location=[...new Set([j.location,...j.multi_location||[]].filter(Boolean))].join(' · ');
 return row(s,j.jobSeqNo||j.jobId,{title:clean(j.title),company:clean(j.companyName||s.name),url:canonical(url),location,description:clean([j.description,j.jobRequirements].filter(Boolean).join('\n')),posted:iso(j.postedDate),validThrough:iso(j.expiryDate)||undefined,remote:/^(?:remote|fully remote)$/i.test(j.remoteType||'')||/^remote\b/i.test(location),employment:clean(j.type)});
}
export function microsoftJob(s:Source,j:any):Job{
 return row(s,j.id,{title:clean(j.name),url:canonical(new URL(j.positionUrl||'/careers/job/'+j.id,'https://apply.careers.microsoft.com').href),location:(j.standardizedLocations||j.locations||[]).map(clean).join(' · '),description:clean(j.jobDescription),posted:typeof j.postedTs==='number'?iso(j.postedTs*1000):'',remote:/^(?:remote|fully remote)$/i.test(j.workLocationOption||''),employment:clean(j.efcustomTextEmploymentType)});
}
export async function pullRolling(s:Source,fetcher:typeof fetch=fetch,cursor=0){
 const start=Number.isSafeInteger(cursor)&&cursor>=0?cursor:0;let next=start,total=0,pages=0,complete=false,problem='';const jobs=new Map<string,Job>(),seen=new Set<string>();
 for(let page=0;page<10;page++)try{
  let records:any[],size:number;
  if(s.adapter==='ntt-public'){
   const html=(await publicResponse('https://careers.nttdata.com/global/en/search-results?keywords=software&from='+next,fetcher,{headers:{Accept:'text/html'}})).text;
   const d=phenomData(html).eagerLoadRefineSearch;if(!Array.isArray(d?.data?.jobs)||!Number.isFinite(d.totalHits))throw Error('NTT search schema changed');records=d.data.jobs;size=10;total=d.totalHits;
  }else{
   const d=JSON.parse((await publicResponse('https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=software&location=Seattle%2C%20WA%2C%20USA&start='+next,fetcher)).text);
   if(!Array.isArray(d?.data?.positions)||!Number.isFinite(d.data.count))throw Error('Microsoft search schema changed');records=d.data.positions;size=10;total=d.data.count;
  }
  const fresh=records.filter(j=>!seen.has(String(j.id||j.jobSeqNo)));for(const j of records)seen.add(String(j.id||j.jobSeqNo));
  if(!fresh.length&&next<total)throw Error('Pagination returned no new records before the advertised total');
  // NTT is worldwide: details are fetched for Washington or explicitly remote listings only.
  for(const j of fresh){
   let job:Job;
   if(s.adapter==='ntt-public'){
    const place=[j.location,...j.multi_location||[],j.remoteType].join(' ');if(!/\b(?:washington|WA|seattle|bellevue|redmond|kirkland|bothell|tacoma|remote)\b/i.test(place)||/washington,?\s*(?:DC|district)/i.test(place))continue;
    const url='https://careers.nttdata.com/global/en/job/'+encodeURIComponent(j.jobSeqNo)+'/'+encodeURIComponent(j.title.replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,''));
    const d=phenomData((await publicResponse(url,fetcher,{headers:{Accept:'text/html'}})).text).jobDetail?.data?.job;
    if(!d?.description)throw Error('NTT full job description missing');job=nttJob(s,{...j,...d},url);
   }else{
    const d=JSON.parse((await publicResponse('https://apply.careers.microsoft.com/api/pcsx/position_details?position_id='+encodeURIComponent(j.id)+'&domain=microsoft.com&hl=en',fetcher)).text);
    if(!d?.data?.jobDescription)throw Error('Microsoft full job description missing');job=microsoftJob(s,{...j,...d.data});
   }
   jobs.set(job.id,job);
  }
  pages++;next+=size;if(next>=total){complete=true;next=0;break;}
 }catch(e){problem=e instanceof Error?e.message:'Source request failed';break;}
 if(!pages&&!jobs.size&&problem)throw Error(problem);
 return {jobs:[...jobs.values()],status:complete&&start===0&&!problem?'working':'partial',cursor:next,message:`${s.name}: scanned ${pages} pages from offset ${start}; ${total} software search records advertised. ${jobs.size} full descriptions retrieved. ${complete?'Reached the end; next refresh starts a new pass.':'Next refresh resumes at offset '+next+'.'} ${s.adapter==='ntt-public'?'Details are scoped to Washington and explicitly remote listings. ':''}${problem?'Stopped: '+problem:''}`};
}
