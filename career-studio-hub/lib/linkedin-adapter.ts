import type {Source} from './catalog';
import type {Job} from './matching';

// Public guest endpoint/selectors verified against speedyapply/JobSpy and live anonymous responses.
// No session cookies, browser impersonation, proxy rotation, or challenge handling.
type Listing={id:string;title:string;company:string;location:string;posted:string};
const headers={'User-Agent':'CareerStudio/1.0 (personal job discovery)',Accept:'text/html'};
const text=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{if(entity[0]==='#'){const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[entity.toLowerCase()]||'';}).replace(/\s+/g,' ').trim();
function element(html:string,tag:string,className:string){const opening=new RegExp('<'+tag+'\\b[^>]*class=["\'][^"\']*\\b'+className+'\\b[^"\']*["\'][^>]*>','i').exec(html);if(!opening)return '';const start=opening.index+opening[0].length,token=new RegExp('<'+tag+'\\b[^>]*>|</'+tag+'\\s*>','gi');token.lastIndex=start;let depth=1,match;while((match=token.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(!depth)return html.slice(start,match.index);}return '';}
export function linkedinListings(html:string):Listing[]{
 const records=new Map<string,Listing>();
 for(const match of html.matchAll(/data-entity-urn=["']urn:li:jobPosting:(\d+)["']([\s\S]*?)(?=data-entity-urn=["']urn:li:jobPosting:|$)/g)){
  const card=match[2],title=text(element(card,'h3','base-search-card__title')),company=text(element(card,'h4','base-search-card__subtitle')),location=text(element(card,'span','job-search-card__location')),date=card.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]||'';
  if(title&&company)records.set(match[1],{id:match[1],title,company,location,posted:Number.isFinite(Date.parse(date))?date:''});
 }
 if(!records.size&&!/^\s*(?:<!doctype html>)?\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html))throw Error('LinkedIn public listing format changed or access was interrupted.');
 return [...records.values()];
}
export function linkedinJob(s:Source,listing:Listing,html:string):Job{
 const description=text(element(html,'div','show-more-less-html__markup'));if(!description)throw Error('LinkedIn public description unavailable; incomplete posting was not imported.');
 let employment='';for(const item of html.matchAll(/<li\b[^>]*class=["'][^"']*description__job-criteria-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)){if(/^employment type$/i.test(text(element(item[1],'h3','description__job-criteria-subheader'))))employment=text(element(item[1],'span','description__job-criteria-text'));}
 const salary=text(element(html,'div','compensation__salary')),annual=/(?:\/yr\b|per year|annually)/i.test(salary),salaryMin=annual?Number(salary.match(/[\d,]+(?:\.\d+)?/)?.[0]?.replaceAll(',',''))||0:0;
 let remote=/\bremote\b/i.test(listing.title+' '+listing.location)||/\b(?:workplace(?: type)?|work model|work arrangement)\s*[:\-]\s*(?:fully\s+)?remote\b|\b(?:this (?:role|position) is|position is|role is)\s+(?:a\s+)?(?:fully\s+|100%\s*)?remote\b|\b(?:fully|100%) remote\b/i.test(description);
 const eligibleLocations:string[]=[];
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{const data=JSON.parse(match[1]);const nodes=Array.isArray(data)?data:[data,...(Array.isArray(data?.['@graph'])?data['@graph']:[])];for(const node of nodes)if([node?.['@type']].flat().includes('JobPosting')&&(!node.url||String(node.url).includes(listing.id))){if(String(node.jobLocationType).includes('TELECOMMUTE'))remote=true;for(const region of [node.applicantLocationRequirements].flat())if(typeof region?.name==='string')eligibleLocations.push(region.name);}}catch{}
 return {id:s.id+':'+listing.id,source:s.id,sourceName:s.name,url:'https://www.linkedin.com/jobs/view/'+listing.id,title:listing.title,company:listing.company,location:listing.location,description,posted:listing.posted,remote,salary,salaryMin,employment,...(eligibleLocations.length?{eligibleLocations}: {})};
}
class AccessError extends Error{status:number;constructor(message:string,status=0){super(message);this.status=status;}}
async function publicHtml(url:string,fetcher:typeof fetch){
 const response=await fetcher(url,{headers,signal:AbortSignal.timeout(12000)});if(!response.ok)throw new AccessError('HTTP '+response.status+(response.status===429&&response.headers.get('retry-after')?'; retry after '+response.headers.get('retry-after'):''),response.status);
 if(response.url&&(/\/(?:login|authwall|checkpoint|uas\/login)(?:[/?]|$)/i.test(new URL(response.url).pathname)||!/(^|\.)linkedin\.com$/i.test(new URL(response.url).hostname)))throw new AccessError('LinkedIn redirected to sign-in or verification; public collection stopped.',403);
 const reader=response.body?.getReader();if(!reader)throw Error('Empty LinkedIn response');const chunks:Uint8Array[]=[];let size=0;for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2*1024*1024){await reader.cancel();throw Error('LinkedIn response exceeds 2 MB limit');}chunks.push(next.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const html=new TextDecoder().decode(bytes);if(/<title[^>]*>\s*(?:security|security check|verify|captcha|sign in)[^<]*<\/title>/i.test(html))throw new AccessError('LinkedIn public access requires verification; collection stopped.',403);return html;
}
// One integer retains independent offsets for both scopes and which scope runs next.
const decode=(cursor:number)=>{const n=Number.isSafeInteger(cursor)&&cursor>=0?cursor:0,packed=Math.floor(n/2);return {scope:n%2,local:packed%10000,remote:Math.floor(packed/10000)%10000};};
const encode=(state:{scope:number;local:number;remote:number})=>(state.remote*10000+state.local)*2+state.scope;
export async function pullLinkedin(s:Source,fetcher:typeof fetch=fetch,cursor=0){
 const state=decode(cursor),isRemoteScope=state.scope===1,scope=isRemoteScope?'US remote keyword candidates':'Seattle area',jobs=new Map<string,Job>(),seen=new Set<string>();let offset=isRemoteScope?state.remote:state.local,pages=0,failures=0,problem='',blocked=false;
 const advance=(next:number,switchScope=true)=>{if(isRemoteScope)state.remote=next;else state.local=next;state.scope=switchScope?(isRemoteScope?0:1):(isRemoteScope?1:0);};
 for(let batch=0;batch<2;batch++){
  const url=new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');for(const [key,value]of Object.entries({keywords:isRemoteScope?'software engineer remote':'software engineer',location:isRemoteScope?'United States':'Seattle, WA',distance:'50',f_TPR:'r2592000',start:String(offset)}))url.searchParams.set(key,value);
  let listings:Listing[];try{listings=linkedinListings(await publicHtml(url.href,fetcher));pages++;}catch(error){problem=error instanceof Error?error.message:'Listing request failed';blocked=error instanceof AccessError&&[403,429].includes(error.status);advance(offset,false);break;}
  let interrupted=false;const candidates=listings.slice(0,10).filter(listing=>{if(seen.has(listing.id))return false;seen.add(listing.id);return true;});
  // At most two requests are in flight; a block stops all further batches and pages.
  for(let index=0;index<candidates.length;index+=2){const results=await Promise.allSettled(candidates.slice(index,index+2).map(async listing=>linkedinJob(s,listing,await publicHtml('https://www.linkedin.com/jobs/view/'+listing.id,fetcher))));for(const result of results)if(result.status==='fulfilled')jobs.set(result.value.id,result.value);else{failures++;if(result.reason instanceof AccessError&&[403,429].includes(result.reason.status)){problem=result.reason.message;blocked=true;interrupted=true;}}
   if(interrupted)break;
  }
  if(interrupted){advance(offset,false);break;}
  if(listings.length<10||!candidates.length||offset+10>=1000){advance(0);break;}
  offset+=10;advance(offset);
 }
 return {jobs:[...jobs.values()],status:blocked?'blocked':'partial',cursor:encode(state),message:'LinkedIn '+scope+': '+pages+' public listing pages scanned; '+jobs.size+' full public descriptions retrieved. Original listing dates retained. Seattle and US remote-keyword scopes rotate with saved offsets; remote classification requires explicit posting evidence. '+(failures?failures+' details unavailable. ':'')+(problem?problem+' No bypass or automatic retry was attempted.':'Coverage is a bounded batch, not the entire board.')};
}
