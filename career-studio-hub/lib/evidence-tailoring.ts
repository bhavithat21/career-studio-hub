import type {Editable,ResumeModel,ResumeRules} from './resume-model';

const summarySentences=(value:string)=>value.match(/\S[\s\S]*?(?:[.!?](?=\s|$)|$)/g)?.map(sentence=>sentence.trim()).filter(Boolean)||[];
const skillLines=(value:string)=>value.split('\n').map(line=>line.trim()).filter(Boolean);
function skillGroups(value:string){const groups:string[]=[];for(const line of skillLines(value)){if(line.includes(':')||!groups.length)groups.push(line);else groups[groups.length-1]+='\n'+line;}return groups;}
export function repairSkillWrapping(source:string,candidate:string){
 const original=skillLines(source),retained=skillLines(candidate);
 if(JSON.stringify([...original].sort())!==JSON.stringify([...retained].sort()))return candidate;
 return skillGroups(source).sort((a,b)=>retained.indexOf(a.split('\n')[0])-retained.indexOf(b.split('\n')[0])).join('\n');
}
const ignored=new Set(['the','and','with','for','you','your','our','are','will','this','that','from','have','work','role','team','job','experience','skills']);
export function jobTerms(description:string){return new Set((description.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g)||[]).filter(term=>!ignored.has(term)));}
export function evidenceScore(value:string,terms:Set<string>){return [...new Set(value.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}/g)||[])].filter(term=>terms.has(term)).length;}
function ranked(values:string[],terms:Set<string>){return values.map((value,index)=>({value,index,score:evidenceScore(value,terms)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.value);}
export function tailorEvidence(model:ResumeModel,description:string,rules:ResumeRules,bulletLimit=3):Editable{
 const terms=jobTerms(description);
 return {summary:rules.summary?ranked(summarySentences(model.summary),terms).slice(0,2).join(' '):model.summary,skills:rules.skills?ranked(skillGroups(model.skills),terms).join('\n'):model.skills,responsibilities:model.roles.map(role=>({id:role.id,bullets:rules.responsibilities?ranked(role.bullets,terms).slice(0,bulletLimit):[...role.bullets]}))};
}
/** This checks literal retention against source, not career truth or external AI review. */
export function validateEvidenceContent(model:ResumeModel,input:unknown,rules:ResumeRules){
 const issues:string[]=[];const edit=input as Editable;
 if(!edit||Object.keys(edit).some(key=>!['summary','skills','responsibilities'].includes(key))||typeof edit.summary!=='string'||typeof edit.skills!=='string'||!Array.isArray(edit.responsibilities))return {approved:false,issues:['Invalid editable-section content.'],feedback:'Verbatim source comparison failed. No external AI reviewer was used.'};
 const sourceSummary=new Set(summarySentences(model.summary)),retainedSummary=summarySentences(edit.summary);if(sourceSummary.size&&!retainedSummary.length)issues.push('Summary contains no retained source evidence.');for(const sentence of retainedSummary)if(!sourceSummary.has(sentence))issues.push('Summary contains wording absent from the master resume.');
 const sourceSkills=new Set(skillGroups(model.skills)),retainedSkills=skillGroups(edit.skills);if(sourceSkills.size&&!retainedSkills.length)issues.push('Skills contain no retained source evidence.');for(const line of retainedSkills)if(!sourceSkills.has(line))issues.push('Skills contain an incomplete category or wording absent from the master resume.');
 if(edit.responsibilities.length!==model.roles.length)issues.push('Original employment entries were changed.');
 for(const role of model.roles){const retained=edit.responsibilities.find(item=>item?.id===role.id);if(!retained||Object.keys(retained).some(key=>!['id','bullets'].includes(key))||!Array.isArray(retained.bullets)||!retained.bullets.length){issues.push('An employment entry has no retained source responsibilities.');continue;}for(const bullet of retained.bullets)if(typeof bullet!=='string'||!role.bullets.includes(bullet))issues.push('A responsibility is absent from its original employer source.');}
 if(new Set(edit.responsibilities.map(role=>role?.id)).size!==model.roles.length)issues.push('Employment entry identities were changed.');
 if(!rules.summary&&edit.summary!==model.summary)issues.push('Summary is locked.');
 if(!rules.skills&&edit.skills!==model.skills)issues.push('Skills are locked.');
 if(!rules.responsibilities&&JSON.stringify(edit.responsibilities)!==JSON.stringify(model.roles.map(role=>({id:role.id,bullets:role.bullets}))))issues.push('Responsibilities are locked.');
 return {approved:issues.length===0,issues:[...new Set(issues)],feedback:issues.length?'Verbatim source comparison found unsupported wording or changed locked sections. No external AI reviewer was used.':'Every retained statement matches its original master-resume section verbatim. This is a source comparison check, not an independent AI review or verification of career facts.'};
}
