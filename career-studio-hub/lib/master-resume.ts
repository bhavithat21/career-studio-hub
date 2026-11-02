import {assemble,baseEditable,parseResume,type ResumeModel} from './resume-model';

const headings=['PROFESSIONAL SUMMARY','TECHNICAL SKILLS','PROFESSIONAL EXPERIENCE','TECHNICAL PROJECTS','EDUCATION'];
function text(value:unknown,label:string,max:number,singleLine=false,allowEmpty=false):string{
 if(typeof value!=='string'||value.length>max||value.includes('\0'))throw Error(label+' is invalid or too long.');
 const result=value.replaceAll('\r','').trim();
 if(!allowEmpty&&!result)throw Error(label+' is required.');
 if(singleLine&&result.includes('\n'))throw Error(label+' must stay on one line.');
 if(headings.some(heading=>result.split('\n').some(line=>line.trim()===heading)))throw Error(label+' contains a reserved section heading.');
 return result;
}
function exactKeys(value:unknown,keys:string[],label:string):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw Error(label+' has an unsupported structure.');
}
function checkedEditor(input:unknown):ResumeModel{
 exactKeys(input,['header','summary','skills','roles','projects','education'],'Master resume');
 if(!Array.isArray(input.header)||!input.header.length||input.header.length>20)throw Error('Add your name and contact/header lines.');
 if(!Array.isArray(input.roles)||!input.roles.length||input.roles.length>50)throw Error('Add at least one employment entry.');
 const roles=input.roles.map((entry:unknown,index:number)=>{
  exactKeys(entry,['id','header','bullets'],'Employment entry');
  if(entry.id!=='role-'+index)throw Error('Employment entries must keep their original order and IDs.');
  const header=text(entry.header,'Company, title and employment years',800,true);
  if(header.startsWith('-')||!/\b(?:19|20)\d{2}\b/.test(header))throw Error('Each employment heading needs its original company, title and a four-digit employment year.');
  if(!Array.isArray(entry.bullets)||!entry.bullets.length||entry.bullets.length>100)throw Error('Add at least one master responsibility to each employment entry.');
  return {id:entry.id,header,bullets:entry.bullets.map(value=>text(value,'Master responsibility',3000,true))};
 });
 return {header:input.header.map(value=>text(value,'Header line',800,true)),summary:text(input.summary,'Professional summary',8000).replace(/\n/g,' '),skills:text(input.skills,'Master skills',10000),roles,projects:text(input.projects,'Projects',15000,false,true),education:text(input.education,'Education',10000,false,true)};
}
/** The editor is the existing ResumeModel, not a second persisted source of career facts. */
export function masterResumeEditor(source:string):ResumeModel{
 if(typeof source!=='string'||!source.trim())throw Error('Add a master resume first.');
 if(source.length>60000||source.includes('\0'))throw Error('Master resume must be at most 60,000 characters.');
 const normalized=source.replaceAll('\r','');let previous=-1;
 for(const heading of headings){const positions=[...normalized.matchAll(new RegExp('^'+heading+'[ \\t]*$','gm'))].map(match=>match.index!);if(positions.length!==1||positions[0]<=previous||normalized.indexOf(heading)!==positions[0])throw Error('Use each standard resume section heading once, in its original order.');previous=positions[0];}
 const experience=normalized.slice(normalized.indexOf('PROFESSIONAL EXPERIENCE')+'PROFESSIONAL EXPERIENCE'.length,normalized.indexOf('TECHNICAL PROJECTS'));
 let hasRole=false,hasBullet=false;
 for(const raw of experience.split('\n')){const line=raw.trim();if(!line)continue;if(!line.startsWith('-')&&/\b(?:19|20)\d{2}\b/.test(line)&&!/^\s*(?:records|transactions)/i.test(line)){hasRole=true;hasBullet=false;}else if(line.startsWith('-')&&hasRole)hasBullet=true;else if(!hasRole||!hasBullet)throw Error('Employment content would be lost. Keep company, title and years together on one heading line, and start each responsibility with a dash.');}
 const model=checkedEditor(parseResume(normalized));
 // A round trip catches unsupported heading/bullet syntax rather than silently dropping facts.
 const roundTrip=parseResume(assemble(model,baseEditable(model)));
 if(JSON.stringify(roundTrip)!==JSON.stringify(model))throw Error('This master format cannot be preserved. Keep each employment heading on one line and begin responsibilities with a dash.');
 return model;
}
export function masterResumeText(editor:ResumeModel):string{
 const model=checkedEditor(editor),result=assemble(model,baseEditable(model));
 const parsed=masterResumeEditor(result);if(JSON.stringify(parsed)!==JSON.stringify(model))throw Error('The edited master cannot be preserved without losing content.');
 return result;
}
/** Used only when the candidate explicitly adds a role; existing headers are never split or guessed. */
export function newRoleHeader(company:string,title:string,years:string){
 const header=[text(company,'Company',250,true),text(title,'Employment title',250,true),text(years,'Employment years',150,true)].join(' | ');
 if(!/\b(?:19|20)\d{2}\b/.test(years))throw Error('Employment years need a four-digit start year.');
 return header;
}
