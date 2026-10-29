import {read,write,list,claim,unlock} from './store';
import {parseResume} from './resume-model';
import {match,canonical,type Job} from './matching';
import {hasApprovedReview,sameMaster} from './review-validation';
import {applicationJobSnapshot,candidateContact,confirmedAnswers,fingerprint,submissionReport} from './application-packet';

const timestamp=()=>new Date().toISOString();
async function locked<T>(jobId:string,fn:()=>Promise<T>){
 const lock='lock:version:'+jobId;
 if(!await claim(lock))throw Error('This role is being updated. Try again shortly.');
 try{return await fn();}finally{await unlock(lock);}
}

async function prerequisites(jobId:string){
 const p:any=await read('profile',{}),job=await read<Job|null>('job:'+jobId,null);
 if(!job)throw Error('Job not found.');
 if(job.status==='applied'||(await list<Job>('job:')).some(other=>other.id!==jobId&&other.status==='applied'&&canonical(other.url)===canonical(job.url)))throw Error('This posting is already recorded as applied. Choose a different role to avoid a duplicate application.');
 if(job.status==='dismissed'||!p.filters||!match(job,p.filters))throw Error('The role no longer matches your current search or was dismissed. Review the posting before preparing an application.');
 const approval:any=await read('approval:'+jobId,null),latest=await read('latest:'+jobId,'');
 if(approval?.status!=='resume_approved'||latest!==approval.versionId)throw Error('Approve the latest resume version first.');
 const version:any=await read('version:'+latest,null);
 if(!version||!p.resume||!sameMaster(version.model,parseResume(p.resume)))throw Error('Master evidence changed. Rebuild and review the resume.');
 if(version.layout?.passed!==true||version.flags?.length)throw Error('Resolve the resume layout and factual claim warnings first.');
 if(!hasApprovedReview(version.review))throw Error('Independent factual review must pass before an application can be prepared.');
 return {p,job,version};
}

export async function prepareApplication(jobId:string,answersInput:unknown=[]){
 const answers=confirmedAnswers(answersInput);
 return locked(jobId,async()=>{
  const {p,job,version}=await prerequisites(jobId);
  const payload={job:applicationJobSnapshot(job),candidate:candidateContact(version.model),resume:{versionId:version.id,number:version.number,pdfUrl:'/api/resume-pdf?id='+encodeURIComponent(version.id)},answers,masterFingerprint:await fingerprint(parseResume(p.resume)),automation:{available:false,mode:'candidate_completes_on_original_portal'}};
  const payloadFingerprint=await fingerprint(payload),old:any=await read('application:'+jobId,null);
  if(old?.payloadFingerprint===payloadFingerprint&&old.status!=='submitted_reported')return old;
  const id=crypto.randomUUID(),createdAt=timestamp();
  const packet={id,jobId,versionId:version.id,payload,payloadFingerprint,createdAt};
  // Immutable packet and separate decision records bind approval to exactly this payload.
  await write('application-packet:'+id,packet);
  const plan={...packet,status:'awaiting_application_approval',updatedAt:createdAt,message:'Review the exact posting, resume and confirmed answers. Complete the approved application on the original portal; automatic submission is unavailable.'};
  await write('application:'+jobId,plan);
  await write('event:'+crypto.randomUUID(),{type:'application_prepared',jobId,applicationId:id,versionId:version.id,createdAt});
  return plan;
 });
}

async function currentPacket(id:string){
 const packet:any=await read('application-packet:'+id,null);if(!packet)throw Error('Application packet not found.');
 const current:any=await read('application:'+packet.jobId,null);
 if(current?.id!==id)throw Error('This application packet was replaced. Review the latest packet.');
 if(await fingerprint(packet.payload)!==packet.payloadFingerprint)throw Error('Application packet integrity check failed. Prepare a new packet.');
 const {p,job,version}=await prerequisites(packet.jobId);
 if(version.id!==packet.versionId||await fingerprint(parseResume(p.resume))!==packet.payload.masterFingerprint||JSON.stringify(applicationJobSnapshot(job))!==JSON.stringify(packet.payload.job))throw Error('The posting, master evidence, or resume changed. Prepare and approve a new application packet.');
 return {packet,current,job};
}

export async function reviewApplication(id:string,decision:string,notes=''){
 if(!['approved','changes_requested'].includes(decision))throw Error('Invalid application review decision.');
 const found:any=await read('application-packet:'+id,null);if(!found)throw Error('Application packet not found.');
 return locked(found.jobId,async()=>{
  const {packet,current}=await currentPacket(id);
  if(current.status==='submitted_reported')throw Error('This application is already recorded as submitted.');
  const updatedAt=timestamp(),review={applicationId:id,jobId:packet.jobId,payloadFingerprint:packet.payloadFingerprint,decision,notes:String(notes).slice(0,3000),updatedAt};
  await write('application-decision:'+id,review);
  const result={...current,status:decision==='approved'?'application_approved':'application_changes_requested',review,updatedAt,message:decision==='approved'?'This exact packet is approved. Open the original portal and complete the application, then record its receipt.':'Revise the confirmed answers or resume and prepare a new packet.'};
  await write('application:'+packet.jobId,result);await write('event:'+crypto.randomUUID(),{...review,type:'application_review'});return result;
 });
}

export async function recordApplicationSubmission(id:string,input:unknown){
 const report=submissionReport(input),found:any=await read('application-packet:'+id,null);if(!found)throw Error('Application packet not found.');
 return locked(found.jobId,async()=>{
  // A completed receipt remains a historical fact after the job becomes Applied.
  // Do not run preparation prerequisites again or rewrite the original receipt.
  const completed:any=await read('application:'+found.jobId,null);
  if(completed?.id===id&&completed.status==='submitted_reported'){
   const receipt:any=await read('application-receipt:'+id,null);
   if(await fingerprint(found.payload)!==found.payloadFingerprint||receipt?.applicationId!==id||receipt?.versionId!==found.versionId||receipt?.payloadFingerprint!==found.payloadFingerprint)throw Error('The recorded submission receipt does not match this application packet.');
   return completed;
  }
  const {packet,current,job}=await currentPacket(id),review:any=await read('application-decision:'+id,null);
  if(current.status!=='application_approved'||review?.decision!=='approved'||review.payloadFingerprint!==packet.payloadFingerprint)throw Error('Approve this exact application packet before recording submission.');
  const submittedAt=timestamp(),receipt={...report,reportedBy:'candidate',verifiedByWorker:false,submittedAt};
  const result={...current,status:'submitted_reported',receipt,updatedAt:submittedAt,message:'Submission recorded from your confirmation. Career Studio has not independently verified the employer receipt.'};
  await write('application:'+packet.jobId,result);
  await write('application-receipt:'+id,{applicationId:id,jobId:packet.jobId,versionId:packet.versionId,payloadFingerprint:packet.payloadFingerprint,...receipt});
  await write('job:'+packet.jobId,{...job,status:'applied'});
  await write('event:'+crypto.randomUUID(),{type:'application_submission_reported',applicationId:id,jobId:packet.jobId,...receipt});return result;
 });
}
