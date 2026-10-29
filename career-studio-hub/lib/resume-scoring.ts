import {env} from './runtime';
import {read,write,list,claim,unlock} from './store';
import {parseResume,validateEdits,assemble} from './resume-model';
import {sameMaster,hasApprovedReview} from './review-validation';
import {rules} from './versions';
import {fingerprint} from './application-packet';
import {validateClaudeScore,validateOutcomeInput,summarizeOutcomes,scoringAvailability,scoringSystemPrompt,scoringInput} from './scoring-model';
import {claudeInferenceOptions} from './ai-provider';

const timestamp=()=>new Date().toISOString();
const fallbackModel='claude-sonnet-5-5';
const jobSnapshot=(job:any)=>({id:job.id,company:job.company,title:job.title,url:job.url,location:job.location,description:job.description,remote:job.remote,employment:job.employment});

export async function outcomeLearning(){
 const outcomes:any[]=await list('outcome:');
 const summary=summarizeOutcomes(outcomes),suggestions:string[]=[];
 if(summary.resolved<30)suggestions.push('Collect more explicit outcomes before interpreting patterns; this sample cannot calibrate interview probability.');
 if(summary.counts.no_response||summary.counts.pending)suggestions.push('Keep unanswered applications unresolved. Record a rejection only when you receive or explicitly report one.');
 if(summary.counts.rejected)suggestions.push('Compare posting requirements and submitted resume versions. Rejections alone do not establish a reason or show that the resume caused the result.');
 if(summary.positiveOutcomes)suggestions.push('Review which evidence and role requirements appear in interview or offer outcomes; treat similarities as prompts for review, not proof of causation.');
 if(!outcomes.length)suggestions.push('Record rejection, interview, offer, or no-response outcomes to make future review suggestions more relevant.');
 return {summary,suggestions,outcomes,automaticEdits:false,reasonVerification:'Candidate reported; employer-message attribution does not mean independent verification.'};
}

export async function recordOutcome(input:unknown){
 const value=validateOutcomeInput(input),job:any=await read('job:'+value.jobId,null);if(!job)throw Error('Job not found.');
 const lock='lock:outcome:'+value.jobId;if(!await claim(lock))throw Error('This outcome is being updated. Try again shortly.');
 try{
  const previous:any=await read('outcome:'+value.jobId,null),application:any=await read('application:'+value.jobId,null),now=timestamp();
  if(job.status!=='applied'&&!application?.receipt?.submittedAt&&!application?.submittedAt)throw Error('Record the application as submitted or applied externally before tracking its outcome.');
  const submittedVersionId=application?.receipt?.submittedAt||application?.submittedAt?application.versionId:null;
  const everReachedInterview=previous?.everReachedInterview===true||['interview','offer'].includes(previous?.status)||['interview','offer'].includes(value.status);
  const record={id:previous?.id||crypto.randomUUID(),...value,everReachedInterview,company:job.company,title:job.title,versionId:submittedVersionId||null,resumeAttribution:submittedVersionId?'recorded_application':'unknown',reportedBy:'candidate',verifiedBySystem:false,createdAt:previous?.createdAt||now,updatedAt:now};
  await write('outcome:'+value.jobId,record);await write('outcome-event:'+crypto.randomUUID(),record);
  return {outcome:record,learning:await outcomeLearning()};
 }finally{await unlock(lock);}
}

async function context(versionId:string){
 const version:any=await read('version:'+versionId,null);if(!version)throw Error('Resume version not found.');
 const [p,job,approval,latest,policy,learning]=await Promise.all([read<any>('profile',{}),read<any>('job:'+version.jobId,null),read<any>('approval:'+version.jobId,null),read<string>('latest:'+version.jobId,''),rules(),outcomeLearning()]);
 if(!job)throw Error('The original job record is missing.');
 const staleReasons:string[]=[];if(latest!==versionId)staleReasons.push('A newer resume version is saved.');
 if(approval?.status!=='resume_approved'||approval.versionId!==versionId)staleReasons.push('This exact version no longer has final candidate approval.');
 let master;try{master=parseResume(p.resume||'');}catch{staleReasons.push('Current master resume cannot be read.');}
 if(!master||!sameMaster(version.model,master))staleReasons.push('Master evidence changed.');
 if(version.layout?.passed!==true||!Array.isArray(version.flags)||version.flags.length)staleReasons.push('Resolve the version layout or factual-claim warnings.');
 if(!hasApprovedReview(version.review))staleReasons.push('This exact version needs a passing factual review before final scoring.');
 try{validateEdits(version.model,version.content,policy);if(version.text!==assemble(version.model,version.content))staleReasons.push('Saved text does not match its assembled locked history.');}catch{staleReasons.push('Resume content violates the current section rules.');}
 const reviewedParaphrases=version.reviewMethod==='claude_independent_review'&&version.groundingMode==='grounded_rewrite'&&hasApprovedReview(version.review);
 const model=String(p.reviewerModel||fallbackModel),outcomeSnapshot=learning.outcomes.map((outcome:any)=>({jobId:outcome.jobId,status:outcome.status,everReachedInterview:outcome.everReachedInterview===true,reason:outcome.reason,reasonSource:outcome.reasonSource,evidence:outcome.evidence,versionId:outcome.versionId,updatedAt:outcome.updatedAt})).sort((a:any,b:any)=>a.jobId.localeCompare(b.jobId));
 const snapshot={versionId,versionFingerprint:await fingerprint({id:version.id,model:version.model,content:version.content,text:version.text,layout:version.layout,review:version.review,reviewMethod:version.reviewMethod,reviewedParaphrases}),masterFingerprint:await fingerprint(master||null),jobFingerprint:await fingerprint(jobSnapshot(job)),learningFingerprint:await fingerprint(outcomeSnapshot),rulesFingerprint:await fingerprint(policy),scoringPolicyFingerprint:await fingerprint(scoringSystemPrompt()),model};
 return {version,p,job,policy,learning,snapshot,staleReasons,model,reviewedParaphrases};
}

export async function getResumeScore(versionId:string){
 const id=await read<string>('resume-score-latest:'+versionId,'');if(!id)return {status:'missing',versionId,score:null,staleReasons:[]};
 const score:any=await read('resume-score:'+id,null);if(!score)return {status:'missing',versionId,score:null,staleReasons:[]};
 try{const current=await context(versionId),reasons=[...current.staleReasons];for(const [key,label] of [['versionFingerprint','Resume content or layout changed.'],['masterFingerprint','Master evidence changed.'],['jobFingerprint','Job description or posting details changed.'],['learningFingerprint','Recorded outcomes changed; refresh learning suggestions.'],['rulesFingerprint','Resume section rules changed.'],['scoringPolicyFingerprint','Claude assessment instructions changed.'],['model','Claude scoring model changed.']] as const)if(score.snapshot?.[key]!==current.snapshot[key])reasons.push(label);return {status:reasons.length?'stale':'current',versionId,score,staleReasons:[...new Set(reasons)]};}catch{return {status:'stale',versionId,score,staleReasons:['Source records are missing or cannot be read.']};}
}

export async function scoreApprovedResume(versionId:string){
 const first=await context(versionId);if(first.staleReasons.length)throw Error(first.staleReasons.join(' '));
 const readiness=scoringAvailability(!!(env as any).ANTHROPIC_API_KEY,first.model);if(readiness.status==='setup_required')return {...readiness,versionId,score:null,learning:first.learning.summary};
 const lock='lock:resume-score:'+versionId;if(!await claim(lock,180000))return {status:'busy',versionId,message:'Claude scoring is already running for this version.'};
 try{
  const currentScore=await getResumeScore(versionId);if(currentScore.status==='current')return currentScore;
  const input=scoringInput({resumeText:first.version.text,masterResume:first.p.resume,reviewedParaphrases:first.reviewedParaphrases,job:jobSnapshot(first.job),layout:first.version.layout,rules:first.policy,learning:first.learning.summary,outcomes:first.learning.outcomes.slice(0,30).map((outcome:any)=>({company:outcome.company,title:outcome.title,status:outcome.status,everReachedInterview:outcome.everReachedInterview===true,reason:outcome.reason,reasonSource:outcome.reasonSource,evidence:String(outcome.evidence||'').slice(0,1800),resumeAttribution:outcome.resumeAttribution,reportedBy:'candidate',verifiedBySystem:false}))});
  const headers:Record<string,string>={'Content-Type':'application/json','x-api-key':(env as any).ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'};if((env as any).ANTHROPIC_WORKSPACE_ID)headers['anthropic-workspace-id']=(env as any).ANTHROPIC_WORKSPACE_ID;
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers,body:JSON.stringify({model:first.model,max_tokens:5000,...claudeInferenceOptions(first.model),system:scoringSystemPrompt(),messages:[{role:'user',content:input}]}),signal:AbortSignal.timeout(55000)});
  if(!response.ok)throw Error('Claude scoring returned HTTP '+response.status+'. No score was saved.');
  const result:any=await response.json();if(result.stop_reason!=='end_turn')throw Error('Claude scoring response was incomplete or truncated. No score was saved.');
  const raw=result.content?.filter((part:any)=>part.type==='text').map((part:any)=>part.text).join('')||'';let decoded;try{decoded=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('Claude returned invalid scoring JSON. No score was saved.');}
  const assessment=validateClaudeScore(decoded,{resumeText:first.version.text,jobText:first.job.title+' '+first.job.description,masterResume:first.p.resume,reviewedParaphrases:first.reviewedParaphrases,permissions:first.policy});
  const versionLock='lock:version:'+first.version.jobId;if(!await claim(versionLock))throw Error('The resume is being updated. No score was saved; refresh and try again.');
  try{
   const after=await context(versionId);if(after.staleReasons.length||JSON.stringify(after.snapshot)!==JSON.stringify(first.snapshot))throw Error('Resume, posting, approval, or learning data changed during scoring. Score was not saved; refresh and try again.');
   const id=crypto.randomUUID(),score={id,jobId:first.version.jobId,versionId,createdAt:timestamp(),provider:'anthropic',model:first.model,snapshot:first.snapshot,...assessment,labels:{ats:'ATS heuristic — not an employer ATS result',interview:'Qualitative role readiness — hiring probability unavailable'},calibration:'not_measured',confidence:'not_applicable',learning:first.learning.summary,automaticEdits:false};
   await write('resume-score:'+id,score);await write('resume-score-latest:'+versionId,id);
   return {status:'current',versionId,score,staleReasons:[]};
  }finally{await unlock(versionLock);}
 }finally{await unlock(lock);}
}
