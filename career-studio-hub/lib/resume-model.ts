export type Editable = { summary:string; skills:string; responsibilities:{id:string;bullets:string[]}[] };
export type ResumeModel = { header:string[]; summary:string; skills:string; roles:{id:string;header:string;bullets:string[]}[]; projects:string; education:string };
export type ResumeRules={summary:boolean;skills:boolean;responsibilities:boolean;instructions:string;reference:string};
export const defaultRules:ResumeRules={summary:true,skills:true,responsibilities:true,instructions:'One US Letter page. Highlight relevant technologies and evidenced outcomes. Use concise action-led bullets. Keep readable type, balanced spacing, and consistent headings. Preserve every company, role title, employment date, school, degree, and education date. Use only supported experience and metrics.',reference:''};
export function parseResume(text:string):ResumeModel{
 const t=text.replaceAll('\r','');
 const headings=['PROFESSIONAL SUMMARY','TECHNICAL SKILLS','PROFESSIONAL EXPERIENCE','TECHNICAL PROJECTS','EDUCATION'];
 const blocks:Record<string,string>={};
 for(let i=0;i<headings.length;i++){const start=t.indexOf(headings[i]);if(start<0)continue;const end=headings.slice(i+1).map(h=>t.indexOf(h,start+headings[i].length)).find(n=>n>=0)??t.length;blocks[headings[i]]=t.slice(start+headings[i].length,end).trim();}
 const experience=blocks['PROFESSIONAL EXPERIENCE']||'';const roles:ResumeModel['roles']=[];
 for(const raw of experience.split('\n')){const line=raw.trim();if(!line)continue;
  if(!line.startsWith('-')&&/\b(?:19|20)\d{2}\b/.test(line)&&!/^\s*(?:records|transactions)/i.test(line))roles.push({id:'role-'+roles.length,header:line,bullets:[]});
  else if(roles.length){const current=roles[roles.length-1];if(line.startsWith('-'))current.bullets.push(line.replace(/^-\s*/,''));else if(current.bullets.length)current.bullets[current.bullets.length-1]+=' '+line;}
 }
 if(!roles.length)throw Error('Employment headers could not be parsed. Confirm the structured master resume before generating variants.');
 return {header:t.slice(0,t.indexOf('PROFESSIONAL SUMMARY')).trim().split('\n').filter(Boolean),summary:(blocks['PROFESSIONAL SUMMARY']||'').replace(/\n/g,' '),skills:blocks['TECHNICAL SKILLS']||'',roles,projects:blocks['TECHNICAL PROJECTS']||'',education:blocks['EDUCATION']||''};
}
export function baseEditable(model:ResumeModel):Editable{return {summary:model.summary,skills:model.skills,responsibilities:model.roles.map(r=>({id:r.id,bullets:r.bullets}))};}
const normalized=(v:string)=>v.replace(/\s+/g,' ').trim();
export function validateEdits(model:ResumeModel,input:any,rules:ResumeRules):Editable{
 if(!input||Object.keys(input).some(k=>!['summary','skills','responsibilities'].includes(k)))throw Error('Only Summary, Skills, and Responsibilities can be edited. Locked fields were rejected.');
 if(typeof input.summary!=='string'||typeof input.skills!=='string'||!Array.isArray(input.responsibilities))throw Error('Invalid resume content');
 if(input.summary.length>1800||input.skills.length>2000)throw Error('Summary or skills exceeds the one-page content budget.');
 if(input.responsibilities.length!==model.roles.length)throw Error('Every original employment entry must be preserved.');
 const responsibilities=model.roles.map(role=>{const r=input.responsibilities.find((r:any)=>r.id===role.id);if(!r||Object.keys(r).some(k=>!['id','bullets'].includes(k))||!Array.isArray(r.bullets)||r.bullets.length<1||r.bullets.length>8||r.bullets.some((b:any)=>typeof b!=='string'||b.length>550))throw Error('Responsibilities must contain one to eight concise bullets for each original role.');return {id:role.id,bullets:r.bullets.map((b:string)=>b.trim())};});
 const edit={summary:input.summary.trim(),skills:input.skills.trim(),responsibilities};
 const base=baseEditable(model);
 if(!rules.summary&&normalized(edit.summary)!==normalized(base.summary))throw Error('Summary is locked by your rules.');
 if(!rules.skills&&normalized(edit.skills)!==normalized(base.skills))throw Error('Skills are locked by your rules.');
 if(!rules.responsibilities&&JSON.stringify(edit.responsibilities)!==JSON.stringify(base.responsibilities))throw Error('Responsibilities are locked by your rules.');
 return edit;
}
export function metricFlags(model:ResumeModel,edit:Editable){const original=JSON.stringify(model),draft=JSON.stringify(edit);const known=new Set(original.match(/\d+(?:[.,]\d+)?(?:%|\+|ms|M|K)?/g)||[]);return [...new Set(draft.match(/\d+(?:[.,]\d+)?(?:%|\+|ms|M|K)?/g)||[])].filter(v=>!known.has(v)).map(v=>'Unconfirmed numeric claim: '+v);}
export function assemble(model:ResumeModel,edit:Editable){return [...model.header,'','PROFESSIONAL SUMMARY',edit.summary,'','TECHNICAL SKILLS',edit.skills,'','PROFESSIONAL EXPERIENCE',...model.roles.flatMap(r=>[r.header,...(edit.responsibilities.find(x=>x.id===r.id)?.bullets||[]).map(b=>'- '+b)]),'','TECHNICAL PROJECTS',model.projects,'','EDUCATION',model.education].join('\n');}
