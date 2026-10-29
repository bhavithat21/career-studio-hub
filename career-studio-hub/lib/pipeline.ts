import {env} from './runtime';
import {requireTenantId} from './tenant';
import {sources} from './catalog';
import {defaults,match,canonical,type Job,type Filters} from './matching';
import {pull} from './adapters';
import {read,write,list,claim,unlock} from './store';
import {parseResume,validateEdits,assemble,metricFlags} from './resume-model';
import {rules,saveVersion,companyResumeEvidence} from './versions';
import {sameMaster,validateReview} from './review-validation';
import {runnableTask,retryTask,failedTask} from './queue-state';
import {prepareEvidenceVersion,reviewEvidenceVersion} from './evidence-preparation';
import {aiPreparationConfiguration,requestAiJson,DEFAULT_CLAUDE_MODEL} from './ai-provider';
import {resumeSourceCatalog,resolveResumeProposal,resumeWriterPrompt,resumeFactualReviewPrompt,resumeFactualReviewInput} from './ai-resume-model';
export type Profile={id:string;name:string;filters:Filters;resume:string;writerModel:string;reviewerModel:string;autoPrepare:boolean;preparationMode:'evidence'|'ai'};
export const initialProfile:Profile={id:'',name:'',filters:{...defaults,sources:sources.filter(s=>s.enabled).map(s=>s.id)},resume:'',writerModel:'gpt-4.1',reviewerModel:DEFAULT_CLAUDE_MODEL,autoPrepare:false,preparationMode:'evidence'};
export async function profile(){const fallback=structuredClone(initialProfile);return {...fallback,...await read('profile',fallback),id:requireTenantId()};}
async function serviceEvidenceQueue(p:Profile){if(p.autoPrepare&&p.preparationMode==='evidence'){for(let step=0;step<2;step++){try{await tick();}catch{break;}}}}
export function discoveryFilterKey(filters:Filters){
 // Failed-to-match jobs are not stored, so a changed filter must bypass the source TTL.
 const effective={...defaults,...filters};
 return JSON.stringify(Object.keys(effective).filter(key=>key!=='sources').sort().map(key=>[key,effective[key as keyof Filters]]));
}
export async function discover(id:string,budgetMs=210000){
 const key='lock:source:'+id;if(!await claim(key,270000))return {status:'busy',message:'This source is already running.'};
 const p=await profile(),now=new Date().toISOString(),filterKey=discoveryFilterKey(p.filters);
 try{
  const previous:any=await read('health:'+id,null);
  if(previous?.filterKey===filterKey&&previous?.adapter===sources.find(s=>s.id===id)?.adapter&&previous?.successAt&&Date.now()-Date.parse(previous.successAt)<3600000){await serviceEvidenceQueue(p);return {...previous,cached:true};}
  const deadline=AbortSignal.timeout(Math.max(1000,Math.min(210000,budgetMs))),boundedFetch:typeof fetch=(input,options)=>fetch(input,{...options,signal:options?.signal?AbortSignal.any([deadline,options.signal]):deadline});
  const result=await pull(id,boundedFetch,previous?.cursor||0);let matched=0,added=0;const existing=await list<Job>('job:');const byUrl=new Map(existing.filter(j=>j.source===id).map(j=>[canonical(j.url),j]));
  for(const raw of result.jobs){const known=byUrl.get(canonical(raw.url));if(known)raw.id=known.id;const fit=match(raw,p.filters);if(!fit)continue;matched++;const k='job:'+raw.id;const old=await read<Job|null>(k,null);if(!old)added++;
   await write(k,{...raw,...fit,status:old?.status||'pending',firstSeen:old?.firstSeen||now,lastSeen:now});
   if(p.autoPrepare&&!old)await enqueue(raw.id);
  }
  const health={id,adapter:sources.find(s=>s.id===id)?.adapter,filterKey,cursor:result.cursor,status:result.status,message:result.message,fetched:result.jobs.length,matched,added,checkedAt:now,successAt:now};await write('health:'+id,health);await serviceEvidenceQueue(p);return health;
 }catch(e){const previous:any=await read('health:'+id,null);const health={id,cursor:previous?.cursor,status:'failed',message:e instanceof Error?e.message:'Source failed',fetched:0,matched:0,added:0,checkedAt:now};await write('health:'+id,health);return health;}
 finally{await unlock(key);}
}
export async function enqueue(jobId:string){const old=await read<any>('task:'+jobId,null);if(old&&!['failed','needs_revision','skipped'].includes(old.stage))return old;if(old?.versionId)return enqueueVersionReview(jobId,await read('latest:'+jobId,old.versionId));const task=old?retryTask(old):{jobId,stage:'queued',attempts:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),message:'Waiting for writer'};await write('task:'+jobId,task);return task;}
export async function enqueueVersionReview(jobId:string,versionId:string){
 const lock='lock:version:'+jobId;if(!await claim(lock))throw Error('This role is being updated. Try again shortly.');
 try{const version:any=await read('version:'+versionId,null),p=await profile();if(!version||version.jobId!==jobId||await read('latest:'+jobId,'')!==versionId)throw Error('Queue the latest saved resume version for review.');if(!sameMaster(version.model,parseResume(p.resume)))throw Error('Master evidence changed. Save a new version before review.');const old:any=await read('task:'+jobId,null),source=old?.versionId===versionId?old:{},now=new Date().toISOString();const task={jobId,stage:'drafted',versionId,draft:version.text,masterModel:version.model,selectedSourceEvidence:version.selectedSourceEvidence??source.selectedSourceEvidence??null,groundingMode:version.groundingMode??source.groundingMode??'candidate_edit',writerProvider:version.writerProvider??source.writerProvider??null,writerModel:version.writerModel??source.writerModel??null,writerTransport:version.writerTransport??source.writerTransport??null,reviewIndependence:version.reviewIndependence??source.reviewIndependence??'separate_request',attempts:0,totalFailures:old?.totalFailures||0,createdAt:old?.createdAt||now,updatedAt:now,nextAttemptAt:null,message:'Same saved version queued for a separate factual review; no resume rewrite was requested'};await write('task:'+jobId,task);return task;}finally{await unlock(lock);}
}
export function readiness(preferences:Partial<Profile>={}){const e=env as any;return {openai:!!e.OPENAI_API_KEY,anthropic:!!e.ANTHROPIC_API_KEY,evidence:true,browserWorker:false,...aiPreparationConfiguration(preferences)};}
export async function tick(jobId?:string){
 if(jobId!==undefined&&(typeof jobId!=='string'||!jobId||jobId.length>1000||!await read<Job|null>('job:'+jobId,null)))throw Error('Selected job was not found in your workspace.');
 if(!await claim('lock:pipeline',180000))return {message:'Pipeline already processing'};
 try{const selected:any=jobId?await read('task:'+jobId,null):null;if(selected&&selected.jobId!==jobId)throw Error('The saved task does not belong to the selected role.');const tasks:any[]=jobId?(selected?[selected]:[]):await list('task:');let task=tasks.reverse().find(t=>runnableTask(t));if(!task)return {message:jobId?'No runnable resume step for this role. Queue it or wait for its retry window.':'No pending resume tasks'};
 const p=await profile(),ready=readiness(p);
 if(!p.resume||p.preparationMode==='ai'&&!ready.aiReady){task.stage='setup_required';task.message=[!p.resume?'Master resume missing':'',p.preparationMode==='ai'&&!ready.writerReady?'A configured resume writer is missing':'',p.preparationMode==='ai'&&!ready.reviewerReady?'Anthropic key is required for the separate factual review':''].filter(Boolean).join(' · ');await write('task:'+task.jobId,task);return task;}
 const job=await read<Job|null>('job:'+task.jobId,null);if(!job)throw Error('Job not found');
 if(!match(job,p.filters)||['dismissed','applied'].includes(job.status||'')){task.stage='skipped';task.message='Role no longer matches current filters, was dismissed, or is already applied';await write('task:'+task.jobId,task);return task;}
 try{
  if(p.preparationMode==='evidence'){const version=task.draft&&task.versionId?await reviewEvidenceVersion(job.id,task.versionId):await prepareEvidenceVersion(job.id);task={...task,versionId:version.id,draft:version.text,masterModel:version.model,review:version.review,reviewMethod:'source_comparison',preparationMode:'evidence',stage:version.review?.approved?'ready_for_review':'needs_revision',message:version.review?.approved?'Verbatim source comparison passed. Review the PDF and approve this version.':'Source comparison found unsupported wording. Edit using original master statements before retrying.'};}
  else if(!task.draft){const model=parseResume(p.resume),prior=await companyResumeEvidence(job.id),policy=await rules(),latestBefore=await read('latest:'+job.id,'');
   const guard=async()=>{const current=await profile(),currentJob=await read<Job|null>('job:'+job.id,null);if(!sameMaster(model,parseResume(current.resume))||await read('latest:'+job.id,'')!==latestBefore||JSON.stringify(await rules())!==JSON.stringify(policy)||!currentJob||['applied','dismissed'].includes(currentJob.status||'')||!match(currentJob,current.filters)||currentJob.description!==job.description||current.preparationMode!=='ai')throw Error('Master, role, rules, latest version or preparation settings changed. No AI draft was saved.');};
   let version:any;if(prior){if(!sameMaster(prior.version.model,model))throw Error('The previous company resume uses different master evidence. Review and reconcile that saved version before creating another company resume.');version=await saveVersion(job.id,undefined,'company_reuse',undefined,model,undefined,guard);task.groundingMode='company_reuse';task.message='Previous company resume copied exactly; awaiting a separate Claude factual review';}
   else{const proposal=await requestAiJson(ready.writerProvider!,ready.writerModel,resumeWriterPrompt,{masterResume:p.resume,sourceCatalog:resumeSourceCatalog(model),permissions:policy,job,objective:'Clarify confirmed relevant evidence without adding qualifications or targeting numeric scores.'},5000),resolved=resolveResumeProposal(proposal,model,policy);version=await saveVersion(job.id,resolved.edits,'ai_writer',undefined,model,undefined,guard);task.selectedSourceEvidence=resolved.selectedSourceEvidence;task.groundingMode=resolved.groundingMode;task.message='Role-specific PDF saved from selected master evidence; separate Claude factual review is pending';}
   task.versionId=version.id;task.draft=version.text;task.masterModel=version.model;task.writerProvider=prior?'company_reuse':ready.writerProvider;task.writerTransport=prior?null:ready.writerTransport;task.writerModel=prior?null:ready.writerModel;task.reviewIndependence=ready.reviewIndependence;task.stage='drafted';}
  else{const version:any=await read('version:'+task.versionId,null),policy=await rules();if(!version||await read('latest:'+job.id,'')!==version.id||!sameMaster(version.model,parseResume(p.resume)))throw Error('Resume version or master evidence changed. Queue the latest saved version for review.');validateEdits(version.model,version.content,policy);if(metricFlags(version.model,version.content).length||version.text!==assemble(version.model,version.content))throw Error('Saved resume content has unsupported metrics or inconsistent assembled history.');
   const review=validateReview(await requestAiJson('anthropic',ready.reviewerModel,resumeFactualReviewPrompt,{...resumeFactualReviewInput(version.model,version.content,policy,task.selectedSourceEvidence||null),job},2500));
   const lock='lock:version:'+job.id;if(!await claim(lock))throw Error('This role is being updated. Review will retry.');try{const current=await profile(),currentJob=await read<Job|null>('job:'+job.id,null),currentVersion:any=await read('version:'+version.id,null);if(await read('latest:'+job.id,'')!==version.id||!sameMaster(version.model,parseResume(current.resume))||JSON.stringify(await rules())!==JSON.stringify(policy)||!currentJob||['applied','dismissed'].includes(currentJob.status||'')||!match(currentJob,current.filters)||currentJob.description!==job.description||current.preparationMode!=='ai'||JSON.stringify(currentVersion?.content)!==JSON.stringify(version.content)||currentVersion?.text!==version.text)throw Error('Resume, master, role or rules changed during review. Queue the latest saved version.');await write('version:'+version.id,{...version,review,reviewMethod:'claude_independent_review',preparationMode:'ai',writerProvider:task.writerProvider||null,writerTransport:task.writerTransport||null,writerModel:task.writerModel||null,reviewerProvider:'anthropic',reviewerModel:ready.reviewerModel,groundingMode:task.groundingMode||'candidate_edit',selectedSourceEvidence:task.selectedSourceEvidence||null,reviewIndependence:task.reviewIndependence||'separate_request'});task.review=review;task.reviewMethod='claude_independent_review';task.stage=review.approved?'ready_for_review':'needs_revision';task.message=review.approved?'Separate Claude factual review passed. Review the saved PDF and approve this exact version.':'Claude flagged factual issues; edit supported content and request another review.';}finally{await unlock(lock);}}
 }catch(e){task=failedTask(task,e instanceof Error?e.message:'Pipeline failed');}
 const currentTask:any=await read('task:'+task.jobId,null);if(currentTask?.versionId&&currentTask.versionId!==task.versionId)return currentTask;
 task.updatedAt=new Date().toISOString();await write('task:'+task.jobId,task);return task;
 }finally{await unlock('lock:pipeline');}
}
