import {canonical,clean,type Job} from './matching';
import type {Source} from './catalog';

export type AtsBoard={provider:'lever'|'ashby';slug:string;company:string;careersUrl:string};
// A finite employer registry, not a search across every employer using these ATSs.
export const atsBoards:AtsBoard[]=[
 {provider:'lever',slug:'rover',company:'Rover',careersUrl:'https://www.rover.com/careers/search/'},
 {provider:'lever',slug:'slate',company:'Slate',careersUrl:'https://jobs.lever.co/slate'},
 {provider:'lever',slug:'palantir',company:'Palantir',careersUrl:'https://www.palantir.com/careers/open-positions/'},
 {provider:'ashby',slug:'ramp',company:'Ramp',careersUrl:'https://ramp.com/careers/'},
 {provider:'ashby',slug:'ashby',company:'Ashby',careersUrl:'https://www.ashbyhq.com/careers'},
 {provider:'ashby',slug:'linear',company:'Linear',careersUrl:'https://linear.app/careers'},
];
function plain(value:unknown){let s=String(value??'');for(let i=0;i<3;i++)s=s.replace(/&amp;/g,'&');return clean(s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&(?:rsquo|lsquo);/g,"'").replace(/&(?:rdquo|ldquo);/g,'"').replace(/&ndash;/g,'–').replace(/&mdash;/g,'—'));}
function unique(values:unknown[]){return [...new Set(values.filter(v=>typeof v==='string'&&v.trim()).map(v=>plain(v)))];}
function row(b:AtsBoard,j:any,values:Partial<Job>):Job{return {id:`${b.provider}:${b.slug}:${j.id}`,source:b.provider,sourceName:b.provider==='lever'?'Lever':'Ashby',company:b.company,title:'',url:'',location:'',description:'',posted:'',remote:false,salary:'',salaryMin:0,employment:'',...values};}
const validDate=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:'';
function remoteUs(locations:string[]){return locations.some(v=>/^(?:remote\s*[-–(]?\s*(?:us|usa|united states)(?:\s+only)?\)?|(?:us|usa|united states)\s*[-–]?\s*remote)$/i.test(v.trim()))?['United States']:[];}

export function leverJobs(board:AtsBoard,data:unknown):Job[]{
 if(!Array.isArray(data))throw Error('Lever response must be a postings array');
 return data.filter(j=>j&&j.id&&typeof j.text==='string'&&canonical(j.hostedUrl)).map(j=>{
  const c=j.categories||{},locations=unique([c.location,...(Array.isArray(c.allLocations)?c.allLocations:[])]),range=j.salaryRange;
  const description=unique([j.openingPlain||j.opening,j.descriptionBodyPlain||j.descriptionPlain||j.descriptionBody||j.description,...(Array.isArray(j.lists)?j.lists:[]).map((l:any)=>plain(l.text)+' '+plain(l.content)),j.additionalPlain||j.additional,j.salaryDescriptionPlain||j.salaryDescription]).join('\n');
  const created=typeof j.createdAt==='number'&&Number.isFinite(j.createdAt)&&Math.abs(j.createdAt)<=8640000000000000?new Date(j.createdAt).toISOString():'';
  return row(board,j,{company:board.slug==='slate'&&c.department==='Supporting Cast'?'Supporting Cast':board.company,title:plain(j.text),url:canonical(j.hostedUrl),location:[...locations,plain(j.country)].filter(Boolean).join(' · '),remote:String(j.workplaceType).toLowerCase()==='remote',eligibleLocations:remoteUs(locations),employment:plain(c.commitment),description:description+(created?'\nBoard record created: '+created+' (original publication date unknown)':''),salary:range?plain(`${range.currency||''} ${range.min??''} – ${range.max??''} / ${range.interval||''}`):'',salaryMin:range?.currency==='USD'&&/^(year|yearly|annual)$/i.test(range.interval||'')?Number(range.min)||0:0});
 });
}
function address(value:any){const a=value?.postalAddress||value||{};return unique([a.addressLocality,a.addressRegion,a.addressCountry]).join(', ');}
export function ashbyJobs(board:AtsBoard,data:any):Job[]{
 if(!Array.isArray(data?.jobs))throw Error('Ashby response must contain a jobs array');
 return data.jobs.filter((j:any)=>j&&j.isListed!==false&&j.id&&typeof j.title==='string'&&canonical(j.jobUrl)).slice(0,1000).map((j:any)=>{
  const secondary=Array.isArray(j.secondaryLocations)?j.secondaryLocations:[],labels=unique([j.location,...secondary.map((l:any)=>l.location)]);
  const locations=unique([...labels,address(j.address),...secondary.map((l:any)=>address(l.address))]);
  const salary=j.compensation?.scrapeableCompensationSalarySummary||j.compensation?.compensationTierSummary||'';
  return row(board,j,{title:plain(j.title),url:canonical(j.jobUrl),location:locations.join(' · '),remote:j.isRemote===true||String(j.workplaceType).toLowerCase()==='remote',eligibleLocations:remoteUs(labels),posted:validDate(j.publishedAt),employment:plain(j.employmentType).replace(/([a-z])([A-Z])/g,'$1 $2'),description:plain(j.descriptionPlain||j.descriptionHtml)+(j.workplaceType?'\nPublished workplace type: '+plain(j.workplaceType):''),salary:plain(salary)});
 });
}
async function json(url:string,fetcher:typeof fetch){
 const r=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error(`HTTP ${r.status}${r.status===429&&r.headers.get('retry-after')?'; retry after '+r.headers.get('retry-after'):''}`);
 const limit=12*1024*1024;if(Number(r.headers.get('content-length'))>limit)throw Error('Response exceeds 12 MB limit');
 const reader=r.body?.getReader();if(!reader)throw Error('Empty response body');const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Response exceeds 12 MB limit');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function pullAts(source:Source,fetcher:typeof fetch=fetch):Promise<{jobs:Job[];status:string;message:string}>{
 const provider=source.adapter;if(provider!=='lever'&&provider!=='ashby')throw Error('Unsupported ATS provider');
 const boards=atsBoards.filter(b=>b.provider===provider),jobs=new Map<string,Job>(),notes:string[]=[];let complete=0,partial=false;
 for(const board of boards){let count=0;
  try{
   if(provider==='ashby'){
    const data=await json(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`,fetcher);for(const j of ashbyJobs(board,data)){jobs.set(j.id,j);count++;}if(data.jobs.length>1000){partial=true;notes.push(`${board.company}: capped at 1,000 postings`);}else complete++;
   }else{
    const seen=new Set<string>();for(let page=0;page<5;page++){
     const data=await json(`https://api.lever.co/v0/postings/${board.slug}?mode=json&skip=${page*100}&limit=100`,fetcher);const parsed=leverJobs(board,data);let added=0;
     for(const j of parsed)if(!seen.has(j.id)){seen.add(j.id);jobs.set(j.id,j);count++;added++;}
     if(data.length<100){complete++;break;}if(!added){partial=true;notes.push(`${board.company}: repeated page; stopped`);break;}if(page===4){partial=true;notes.push(`${board.company}: capped at 500 postings`);}
    }
   }
   notes.push(`${board.company}: ${count} postings`);
  }catch(error){partial=true;notes.push(`${board.company}: ${count} retained; ${error instanceof Error?error.message:'request failed'}`);}
 }
 return {jobs:[...jobs.values()],status:partial?(jobs.size||complete?'partial':'failed'):'working',message:`Scoped employer boards only (${boards.map(b=>b.company).join(', ')}), not all ${source.name} customers. ${notes.join('; ')}. ${provider==='lever'?'Original publication dates unavailable; creation dates are not treated as fresh postings.':'Provider publishedAt dates retained.'} User filters apply after retrieval.`};
}
