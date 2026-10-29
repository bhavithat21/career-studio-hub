import {read,write,claim,unlock} from './store';
import {parseResume} from './resume-model';
import {sameMaster} from './review-validation';
import {tailorEvidence,validateEvidenceContent,repairSkillWrapping} from './evidence-tailoring';
import {rules,saveVersion,companyResumeEvidence} from './versions';
import {match} from './matching';

export async function prepareEvidenceVersion(jobId:string){
 const p:any=await read('profile',{}),job:any=await read('job:'+jobId,null);if(!p.resume)throw Error('Save a master resume first.');if(!job)throw Error('Job not found.');if(job.status==='applied')throw Error('This role is already marked applied. Its saved resume history is preserved. Prepare a new role to reuse company history.');if(job.status==='dismissed'||!p.filters||!match(job,p.filters))throw Error('This role no longer matches the current search. Review its posting and filters before preparing a resume.');
 const model=parseResume(p.resume),policy=await rules(),prior=await companyResumeEvidence(jobId);
 if(prior&&!sameMaster(prior.version.model,model))throw Error('The previous company resume uses different master evidence. Reconcile that saved resume before reusing it.');
 const save=async(limit:number)=>{const content=prior?structuredClone(prior.version.content):tailorEvidence(model,job.title+' '+job.description,policy,limit);if(prior?.version.reviewMethod==='source_comparison'&&policy.skills)content.skills=repairSkillWrapping(model.skills,content.skills);const review=validateEvidenceContent(model,content,policy);if(!review.approved)throw Error(review.issues.join(' '));const version=await saveVersion(jobId,content,prior?'company_reuse':'evidence_selection',review,model,{reviewMethod:'source_comparison',preparationMode:'evidence',reusedExact:!!prior&&JSON.stringify(content)===JSON.stringify(prior.version.content)});const lock='lock:version:'+jobId;if(!await claim(lock))throw Error('Resume saved. This role is being updated; refresh to review the latest version.');try{if(await read('latest:'+jobId,'')!==version.id)throw Error('A newer resume version was saved. Review the latest version.');const old:any=await read('task:'+jobId,null),now=new Date().toISOString();await write('task:'+jobId,{jobId,versionId:version.id,draft:version.text,masterModel:version.model,review:version.review,reviewMethod:'source_comparison',preparationMode:'evidence',stage:'ready_for_review',attempts:0,createdAt:old?.createdAt||now,updatedAt:now,nextAttemptAt:null,message:'Verbatim master evidence selected for this role; source comparison passed. Candidate approval is required.'});}finally{await unlock(lock);}return version;};
 try{return await save(3);}catch(error){if(!prior&&policy.responsibilities&&error instanceof Error&&/exceeds one page/.test(error.message))return save(2);throw error;}
}

export async function reviewEvidenceVersion(jobId:string,versionId:string){
 const lock='lock:version:'+jobId;if(!await claim(lock))throw Error('This role is being updated. Try again shortly.');
 try{const version:any=await read('version:'+versionId,null),p:any=await read('profile',{});if(!version||version.jobId!==jobId||await read('latest:'+jobId,'')!==versionId)throw Error('Review the latest resume version.');if(!sameMaster(version.model,parseResume(p.resume)))throw Error('Master evidence changed. Save a new version first.');const review=validateEvidenceContent(version.model,version.content,await rules());const updated={...version,review,reviewMethod:'source_comparison',preparationMode:'evidence'};await write('version:'+version.id,updated);return updated;}finally{await unlock(lock);}
}
