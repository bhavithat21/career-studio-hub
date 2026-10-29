export type Filters = {titles:string; locations:string; skills:string; excludedCompanies:string; maxAge:number; remote:boolean; local:boolean; excludeSenior:boolean; unknown:boolean; minScore:number; employment:string; minSalary:number; sources:string[];maxRequiredExperienceYears?:number|null};
export const defaults:Filters={titles:'software engineer, software development engineer, software developer, backend, back-end, frontend, front-end, full stack, fullstack, full-stack, SDE',locations:'Seattle, Bellevue, Redmond, Kirkland, Bothell, Everett, Renton, Tacoma, Issaquah, Sammamish, Lynnwood, Shoreline, Kenmore, Woodinville, Mercer Island, SeaTac, Tukwila, Kent, Auburn, Federal Way, Mountlake Terrace, Edmonds, Mukilteo, Mill Creek',skills:'',excludedCompanies:'Amazon, AWS, Amazon Web Services',maxAge:30,remote:true,local:true,excludeSenior:true,unknown:true,minScore:0,employment:'any',minSalary:0,sources:[]};
export type Job = {id:string;source:string;sourceName:string;url:string;title:string;company:string;location:string;description:string;posted:string;remote:boolean;salary:string;salaryMin:number;employment:string;eligibleLocations?:string[];validThrough?:string;status?:string;score?:number;reasons?:string[];flags?:string[];firstSeen?:string;lastSeen?:string;requiredExperienceYears?:number|null};
const titleFamily=(s:string)=>s.toLowerCase().replace(/\bsoftware dev\b/g,'software development').replace(/\bsoftware engineering\b/g,'software engineer').replace(/\bfront[ -]end\b/g,'frontend').replace(/\bback[ -]end\b/g,'backend').replace(/\bfull[ -]stack\b/g,'fullstack');
const parts=(s:string)=>s.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const managementWords=/\b(?:manager|management|director|executive|vice president|vp|head|chief|cto|cio)\b/i;
function titleMatches(title:string,filters:string){
 const normalized=titleFamily(title),primary=normalized.split(/[,|:/()[\]–—]|\s+-\s*/)[0];
 return parts(filters).some(raw=>{const requested=titleFamily(raw),escaped=requested.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Software Engineering is a recognized IC title family; a department mention never changes the primary role.
  if(!new RegExp('(?:^|[^a-z0-9])'+escaped+'(?=$|[^a-z])','i').test(normalized))return false;
  const explicitlyManagement=managementWords.test(requested);if(managementWords.test(primary)&&!explicitlyManagement)return false;
  if(!explicitlyManagement&&/\b(?:software|backend|frontend|fullstack|sde)\b/.test(requested)&&!/\b(?:engineer|developer|programmer|sde)\b/.test(normalized))return false;
  return true;
 });
}
const companyWords=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\b(?:[a-z]\.){2,}[a-z]?\.?/g,m=>m.replaceAll('.','')).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const yearWords:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50};
const yearNumber='(?:\\d{1,3}(?:\\.\\d+)?|twenty(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|thirty|forty|fifty|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one|zero)';
const years=(value:string)=>{const number=Number(value);if(Number.isFinite(number))return number;return value.toLowerCase().split(/[ -]+/).reduce((sum,word)=>sum+(yearWords[word]||0),0);};
/** Extracts minimum experience thresholds, not company age, benefits, or preferred tenure. */
export function requiredExperience(description:string):{minimumYears:number|null;evidence:string[];ambiguous:boolean}{
 const source=String(description||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(?:li|p|div|h[1-6])\s*>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/[–—]/g,'-').replace(/[.;]?\s*\n\s*or\s*\n?\s*/gi,' or ').replace(/[.;]\s+or\s+(?=(?:a |an )?(?:master|bachelor|doctor|ph\.?d|equivalent|\d))/gi,' or ');
 const markers=[...source.matchAll(/\b(preferred(?:\s+(?:qualifications|requirements|skills|experience))?|nice[ -]to[ -]haves?|bonus(?:\s+(?:qualifications|skills))?|desired qualifications|minimum qualifications|basic qualifications|required qualifications|required skills|must[ -]haves?|requirements|qualifications)\b/gi)].map(item=>({index:item.index!,preferred:/^(?:preferred|nice|bonus|desired)/i.test(item[0])}));
 const expression=new RegExp('(?<![a-z0-9])('+yearNumber+')(?:\\s*\\(\\s*'+yearNumber+'\\s*\\))?\\s*(?:(?:[-/]|to|and)\\s*('+yearNumber+')|\\+|or more)?\\s*-?\\s*(?:years?|yrs?\\.?)(?:[\'’])?\\b','gi');
 let minimumYears:number|null=null,ambiguous=false,position=0;const evidence:string[]=[];
 for(const clause of source.split(/(?<=[.!?;])\s+|[\r\n•]+/)){
  const start=source.indexOf(clause,position);position=start+clause.length;const candidates=[...clause.matchAll(expression)],accepted:Array<{value:number;index:number;end:number}>=[];
  for(let index=0;index<candidates.length;index++){
   const candidate=candidates[index],at=candidate.index!,before=clause.slice(Math.max(0,at-130),at),after=clause.slice(at+candidate[0].length,candidates[index+1]?.index??clause.length).slice(0,180);
   const section=markers.filter(marker=>marker.index<=start+at).at(-1),suffix=after.match(/\b(required|preferred|desired)\b(?!\s+(?:qualifications|requirements|skills|experience))/i)?.[1]?.toLowerCase();
   if(/\b(?:not|required neither|never)\s+required\b/i.test(after)||suffix==='preferred'||suffix==='desired'||section?.preferred&&suffix!=='required')continue;
   if(/\b(?:up to|at most|no more than|less than|fewer than|maximum(?: of)?)\s*$/i.test(before)){ambiguous=true;continue;}
   if(/\b(?:ago|old|anniversary|paid leave|vacation|retirement|vesting)\b/i.test(after.slice(0,65))||/^\s*[,:-]?\s*(?:we\b|our\b|the company\b|the organization\b)/i.test(after)||/\b(?:last|past|next|following)\s*$/i.test(before)||/\b(?:founded|established|in business for|operating for|serving for|(?:company|business|organization|firm)\s+(?:has|with)|(?:our team|we)\s+(?:has|have|bring)(?:\s+(?:over|nearly|combined))?|averag(?:e|ing))\b[^.!?;]{0,65}$/i.test(before)||/^\s*(?:of\s+)?combined\b/i.test(after))continue;
   const forward=/\b(?:experience|professional|commercial|industry|software|development|programming|engineering|building|developing|delivering|java(?:script)?|typescript|python|c\+\+|aws|azure|react|kubernetes|backend|frontend|full[ -]?stack)\b/i.test(after.slice(0,140));
   const backward=/\b(?:professional |software |engineering |development |relevant )?experience\s*(?:of|for|:|is|required|minimum|at least|a minimum of)?\s*$/i.test(before);
   if(!forward&&!backward)continue;
   accepted.push({value:years(candidate[1]),index:at,end:at+candidate[0].length});
  }
  if(!accepted.length)continue;
  const paths:number[][]=[[]];for(let index=0;index<accepted.length;index++){
   if(index){const connector=clause.slice(accepted[index-1].end,accepted[index].index);if(/\bor\s+(?:(?:a|an|at least|minimum|of|more than|over)\s+)*$/i.test(connector)||/\bor\b[^;]{0,120}\b(?:master|bachelor|doctor|ph\.?d|equivalent|degree)\b/i.test(connector)||/\/[^;]{0,80}\b(?:master|bachelor|doctor|ph\.?d|degree)\b/i.test(connector)){paths.push([]);ambiguous=true;}}
   paths[paths.length-1].push(accepted[index].value);
  }
  const threshold=Math.min(...paths.map(path=>Math.max(...path)));minimumYears=minimumYears===null?threshold:Math.max(minimumYears,threshold);evidence.push(clause.trim().slice(0,700));
 }
 const noExperience=source.match(/\b(?:no|zero)\s+(?:(?:prior|professional|commercial|industry|work)\s+)*experience\s+(?:is\s+)?(?:required|necessary|needed)\b/i);if(minimumYears===null&&noExperience){minimumYears=0;evidence.push(noExperience[0]);}
 return {minimumYears,evidence:[...new Set(evidence)],ambiguous};
}
export function match(job:Job,f:Filters,now=Date.now()) {
 const title=job.title.toLowerCase(), text=(job.title+' '+job.location+' '+job.description).toLowerCase(),loc=job.location.toLowerCase();
 const reasons:string[]=[],flags:string[]=[];
 // Missing saved preference inherits the exclusion; an explicitly empty list is respected.
 const excludedCompanies=parts(f.excludedCompanies??defaults.excludedCompanies).map(companyWords);
 const employers=[companyWords(job.company||''),...(job.source==='amazon'?['amazon']:[])];
 if(excludedCompanies.some(excluded=>excluded&&employers.some(company=>(' '+company+' ').includes(' '+excluded+' '))))return null;
 if(!titleMatches(title,f.titles))return null;
 if(f.excludeSenior&&/\b(senior|sr\.?|staff|principal|director|manager|lead|architect|intern|internship|new grad|graduate)\b/i.test(title))return null;
 const experience=requiredExperience(job.description),experienceLimit=f.maxRequiredExperienceYears;
 if(typeof experienceLimit==='number'&&Number.isFinite(experienceLimit)&&experienceLimit>=0){
  if(experience.minimumYears===null){if(!f.unknown)return null;flags.push('Required experience threshold unknown');}
  else if(experience.minimumYears>experienceLimit)return null;
  else reasons.push(experience.minimumYears+'+ years required by the posting');
  if(experience.ambiguous)flags.push('Alternative or ambiguous experience requirements; confirm the applicable qualification path');
 }
 if(job.validThrough&&Date.parse(job.validThrough)<now)return null;
 const excluded=/(?:excluding|except|not (?:available|eligible|open|hiring)|cannot (?:hire|employ)|unable to (?:hire|employ))[^.;\n]{0,130}\b(washington|wa)\b/i.test(text);
 if(excluded&&job.remote)return null;
 const local=parts(f.locations).some(l=>l==='washington'?/\bwashington\b(?!\s*,?\s*d\.?c)/.test(loc):new RegExp('(?:^|[^a-z])'+l.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z])','i').test(loc));
 if(job.remote){
  if(!f.remote)return null;
  const stateNames='alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|west virginia|wisconsin|wyoming|district of columbia';
  const otherState=new RegExp('\\b('+stateNames+')\\b','i').test(loc)||/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WV|WI|WY|DC)\b/.test(job.location);
  const wa=/\bwashington\b(?!\s*,?\s*(?:d\.?c|district of columbia))|\bwa\b/i.test(loc)||local;
  const nationwide=(job.eligibleLocations||[]).some(v=>/^(?:us|usa|united states(?: of america)?|worldwide|anywhere)$/i.test(v.trim()))||/\b(?:all\s+50\s+states|nationwide|anywhere in (?:the )?(?:us|usa|united states))\b/i.test(loc);
  if(otherState&&!wa&&!nationwide)return null;
  if(nationwide||wa||/\b(united states|usa|us|u\.s\.|worldwide|anywhere|north america|washington)\b/.test(loc)||local)reasons.push('Remote · Washington eligibility to verify');
  else if(loc&&!/^(remote|not specified|location unknown|global remote)$/i.test(loc.trim()))return null;
  else {if(!f.unknown)return null;flags.push('Remote location eligibility unknown');}
 } else if(!f.local||!local)return null; else reasons.push('Matches your local area');
 if(!job.posted||!Number.isFinite(Date.parse(job.posted))){if(!f.unknown)return null;flags.push('Posting date unknown');}
 else if(f.maxAge&&now-Date.parse(job.posted)>f.maxAge*86400000)return null;
 if(f.employment!=='any'&&!job.employment.toLowerCase().replaceAll('_',' ').includes(f.employment)){if(job.employment||!f.unknown)return null;flags.push('Employment type unknown');}
 if(f.minSalary&&(!job.salaryMin||job.salaryMin<f.minSalary)){if(job.salaryMin||!f.unknown)return null;flags.push('Salary unknown');}
 const skills=parts(f.skills),matched=skills.filter(s=>text.includes(s));
 const score=skills.length?Math.round(matched.length/skills.length*100):0;
 if(skills.length)reasons.push(`${matched.length}/${skills.length} selected skills mentioned`);else flags.push('Add skills to calculate coverage');
 if(score<f.minScore)return null;
 if(!job.salary)flags.push('Salary not listed');
 return {score,reasons,flags,requiredExperienceYears:experience.minimumYears};
}
export function canonical(value:string){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return '';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['ref','source'].includes(k))u.searchParams.delete(k);if(!/^#\/detail\/[^/]+\/?$/.test(u.hash))u.hash='';return u.toString();}catch{return '';}}
export function clean(value:unknown){return String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
