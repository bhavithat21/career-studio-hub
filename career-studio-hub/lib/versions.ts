import {putPdf} from './pdf-storage';
import {read,write,list,claim,unlock} from './store';
import {parseResume,baseEditable,validateEdits,metricFlags,assemble,defaultRules,type Editable,type ResumeRules,type ResumeModel} from './resume-model';
import {sameMaster,validateReview} from './review-validation';
import {renderResume} from './resume-pdf';
import {selectCompanyResume} from './company-resume';
export async function rules(){return read<ResumeRules>('resume-rules',defaultRules);}
async function withVersionLock<T>(jobId:string,run:()=>Promise<T>):Promise<T>{
 const lock='lock:version:'+jobId;if(!await claim(lock))throw Error('A resume action is already running for this role. Try again shortly.');
 try{return await run();}finally{await unlock(lock);}
}
async function currentMaster(){const p:any=await read('profile',{});if(!p.resume)throw Error('Save a master resume first');return parseResume(p.resume);}
export async function companyResumeEvidence(jobId:string){
 const job:any=await read('job:'+jobId,null);if(!job)throw Error('Job not found');
 const [versions,jobs,approvals,applications,receipts,events]=await Promise.all([list<any>('version:'),list<any>('job:'),list<any>('approval:'),list<any>('application:'),list<any>('application-receipt:'),list<any>('event:')]);
 return selectCompanyResume(job.company,jobId,versions,jobs,[...approvals,...events.filter(event=>event.type==='resume_review')],[...applications,...receipts]);
}
export async function saveVersion(jobId:string,edits?:Editable,kind='manual',review?:unknown,expectedModel?:ResumeModel,metadata?:{reviewMethod?:'source_comparison'|'claude_independent_review';preparationMode?:'evidence'|'claude_optimization';reusedExact?:boolean;sourceVersionId?:string;optimizationScoreId?:string},guard?:()=>Promise<void>){
 return withVersionLock(jobId,async()=>{
 await guard?.();
 const model=await currentMaster(),policy=await rules();if(expectedModel&&!sameMaster(expectedModel,model))throw Error('Master resume changed while this draft was being prepared. Generate a new draft from the current evidence.');let baseline=baseEditable(model);
 const prior=await companyResumeEvidence(jobId),compatible=!!prior&&sameMaster(prior.version.model,model);
 if(!edits&&prior&&!compatible&&['submitted','applied'].includes(prior.selection))throw Error('The previous '+prior.company+' application used different master evidence. Review that saved resume and reconcile the current master before reusing it. You can save a manually reviewed version from the current evidence.');
 if(!edits&&compatible)baseline=structuredClone(prior!.version.content);
 else if(!edits){if(policy.summary)baseline.summary=baseline.summary.split(/(?<=\.)\s+/).slice(0,2).join(' ');if(policy.responsibilities)baseline.responsibilities=baseline.responsibilities.map(r=>({...r,bullets:r.bullets.slice(0,3)}));}
 const content=validateEdits(model,edits||baseline,policy),factualReview=review==null?null:validateReview(review);
 const job:any=await read('job:'+jobId,null);if(!job)throw Error('Job not found');
 const rendered=await renderResume(model,content,job.title+' '+job.description);if(!sameMaster(model,await currentMaster()))throw Error('Master resume changed while the PDF was being prepared. Save a new version from the current evidence.');await guard?.();const id=crypto.randomUUID();const key='resumes/'+id+'.pdf';
 await putPdf(key,rendered.bytes);
 const existing:any[]=await list('version:');const number=existing.filter(v=>v.jobId===jobId).length+1;
 const v={id,jobId,number,kind:!edits&&compatible?'company_reuse':kind,model,content,text:assemble(model,content),pdfKey:key,createdAt:new Date().toISOString(),layout:rendered.layout,flags:metricFlags(model,content),review:factualReview,approval:'pending',...(metadata?.reviewMethod?{reviewMethod:metadata.reviewMethod,preparationMode:metadata.preparationMode}:{}),...(metadata?.sourceVersionId?{sourceVersionId:metadata.sourceVersionId,optimizationScoreId:metadata.optimizationScoreId}:{}),...(compatible?{reusedFromVersionId:prior!.version.id,companyContext:{company:prior!.company,sourceJobId:prior!.version.jobId,sourceVersionId:prior!.version.id,selection:prior!.selection,reusedExact:metadata?.reusedExact??!edits}}:{})};
 await write('version:'+id,v);await write('latest:'+jobId,id);
 await write('approval:'+jobId,{jobId,versionId:id,status:'awaiting_review',updatedAt:new Date().toISOString(),message:'New version saved; prior approvals do not carry forward.'});
 if(metadata?.preparationMode==='claude_optimization'){
  const task:any=await read('task:'+jobId,null);
  await write('task:'+jobId,{jobId,versionId:id,draft:v.text,masterModel:model,review:factualReview,reviewMethod:metadata.reviewMethod,preparationMode:metadata.preparationMode,stage:'ready_for_review',attempts:0,totalFailures:task?.totalFailures||0,nextAttemptAt:null,createdAt:task?.createdAt||v.createdAt,updatedAt:v.createdAt,message:'Supported master evidence selected; separate Claude factual review passed. Review and approve this new PDF.'});
 }
 const application:any=await read('application:'+jobId,null);if(application)await write('application:'+jobId,{...application,status:'stale_resume',updatedAt:new Date().toISOString(),message:'A newer resume version needs review before application preparation can continue.'});
 return v;
 });
}
export async function approveVersion(id:string,decision:string,notes:string){
 const existing:any=await read('version:'+id,null);if(!existing)throw Error('Resume version not found');
 return withVersionLock(existing.jobId,async()=>{
 const version:any=await read('version:'+id,null);const latest=await read('latest:'+version.jobId,'');if(latest!==id)throw Error('Only the latest version can be approved.');
 if(!sameMaster(version.model,await currentMaster()))throw Error('Master resume changed. Generate a new version from the current evidence before approving.');
 if(!['approved','changes_requested'].includes(decision))throw Error('Invalid decision');
 const status=decision==='approved'?'resume_approved':'changes_requested';const approval={jobId:version.jobId,versionId:id,status,notes:notes.slice(0,3000),updatedAt:new Date().toISOString(),message:decision==='approved'?'Resume approved by candidate. Application details still need approval.':'Candidate requested changes.'};
 if(decision==='approved'&&(!version.layout?.passed||!Array.isArray(version.flags)||version.flags.length))throw Error('Resolve layout and numeric claim warnings before approving.');
 await write('approval:'+version.jobId,approval);await write('event:'+crypto.randomUUID(),{...approval,type:'resume_review'});return approval;
 });
}
export async function requestApplication(jobId:string){
 return (await import('./applications')).prepareApplication(jobId);
}
