import {sources} from '../../../lib/catalog';
import {profile,discover,enqueue,enqueueVersionReview,tick,readiness} from '../../../lib/pipeline';
import {read,write,list} from '../../../lib/store';
import {defaults,type Job} from '../../../lib/matching';
import {rules,saveVersion,approveVersion} from '../../../lib/versions';
import {defaultRules,parseResume} from '../../../lib/resume-model';
import {prepareApplication,reviewApplication,recordApplicationSubmission} from '../../../lib/applications';
import {importHistoricalApplication} from '../../../lib/history';
import {prepareEvidenceVersion} from '../../../lib/evidence-preparation';
import {getResumeScore,scoreApprovedResume,recordOutcome,outcomeLearning} from '../../../lib/resume-scoring';
import {optimizeApprovedResume} from '../../../lib/resume-optimization';
import {withAuthenticatedTenant} from '../../../lib/auth';
import {reserveAiCall} from '../../../lib/ai-quota';
import {getDiscoveryRun,startDiscoveryRun} from '../../../lib/discovery-run';
import {publishDiscoveryRun} from '../../../lib/discovery-queue';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function workspaceGet(session:{user:{name:string}}){let p=await profile();if(!p.name&&session.user.name){p={...p,name:session.user.name.slice(0,150)};await write('profile',p);}const [policy,health,jobs,tasks,versions,approvals,applications,events,discoveryRun]=await Promise.all([rules(),list('health:'),list('job:'),list('task:'),list('version:'),list('approval:'),list('application:'),list('event:'),getDiscoveryRun()]);let model=null;try{model=parseResume(p.resume);}catch{}return json({profile:p,model,rules:policy,sources,health,jobs,tasks,versions,approvals,applications,events,discoveryRun,learning:await outcomeLearning(),readiness:readiness(p),storage:{database:'Postgres',files:'Private object storage',online:true}});}
async function workspacePost(req:Request){
 try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Origin mismatch'},403);
 const body:any=await req.json();
  if(body.action==='discovery-start'||body.action==='discovery-resume'){const run=body.action==='discovery-start'?await startDiscoveryRun(body.sources):await getDiscoveryRun();if(!run)return json({error:'No discovery run is waiting.'},404);const accepted=await publishDiscoveryRun(run.id);return json({run:await getDiscoveryRun(),accepted,backgroundContinuation:'vercel-queue'});}
 if(body.action==='resume-score')return json(await getResumeScore(String(body.versionId)));
 if(body.action==='score-resume'){const current=await getResumeScore(String(body.versionId));if(current.status==='current')return json(current);await reserveAiCall('score-resume');return json(await scoreApprovedResume(String(body.versionId)));}
 if(body.action==='optimize-resume'){await reserveAiCall('optimize-resume');return json(await optimizeApprovedResume(String(body.versionId)));}
 if(body.action==='outcome')return json(await recordOutcome({jobId:body.jobId,status:body.status,reason:body.reason,reasonSource:body.reasonSource,evidence:body.evidence}));
 if(body.action==='import-history')return json(await importHistoricalApplication(body.entry));
 if(body.action==='prepare-evidence')return json(await prepareEvidenceVersion(String(body.id)));
 if(body.action==='engine-settings'){const p=await profile();await write('profile',{...p,writerModel:body.writerModel===undefined?p.writerModel:String(body.writerModel).slice(0,100),reviewerModel:body.reviewerModel===undefined?p.reviewerModel:String(body.reviewerModel).slice(0,100),preparationMode:body.preparationMode==='ai'?'ai':'evidence',autoPrepare:!!body.autoPrepare});return json({ok:true});}
 if(body.action==='discover'){if(!sources.some(s=>s.id===body.source))return json({error:'Unknown source'},400);if(!(await profile()).filters.sources.includes(body.source))return json({error:'Source is disabled in your search filters'},400);return json(await discover(body.source));}
 if(body.action==='tick'){if(body.id!==undefined&&(typeof body.id!=='string'||!body.id||body.id.length>1000))return json({error:'Select a valid role to process.'},400);if(body.id!==undefined&&!await read('job:'+body.id,null))return json({error:'Selected job was not found in your workspace.'},404);if((await profile()).preparationMode==='ai')await reserveAiCall('prepare-resume');return json(await tick(body.id));}
 if(body.action==='rules'){const r=body.rules||{};await write('resume-rules',{...defaultRules,summary:r.summary!==false,skills:r.skills!==false,responsibilities:r.responsibilities!==false,instructions:String(r.instructions||defaultRules.instructions).slice(0,6000),reference:String(r.reference||'').slice(0,30000)});return json({ok:true});}
 if(body.action==='baseline'){const v=await saveVersion(String(body.id),undefined,'master_baseline');await enqueueVersionReview(v.jobId,v.id);return json(v);}
 if(body.action==='save-version'){const v=await saveVersion(String(body.id),body.content,'candidate_edit');await enqueueVersionReview(v.jobId,v.id);return json(v);}
 if(body.action==='review-version')return json(await approveVersion(String(body.versionId),String(body.decision),String(body.notes||'')));
 if(body.action==='application-plan')return json(await prepareApplication(String(body.id),body.answers));
 if(body.action==='application-review')return json(await reviewApplication(String(body.id),String(body.decision),String(body.notes||'')));
 if(body.action==='application-submitted')return json(await recordApplicationSubmission(String(body.id),{reference:body.reference,receiptUrl:body.receiptUrl,notes:body.notes}));
 if(body.action==='profile'){const p=await profile();const f={...defaults,...body.filters};f.maxAge=Math.max(0,Math.min(365,Number(f.maxAge)||0));f.minScore=Math.max(0,Math.min(100,Number(f.minScore)||0));f.minSalary=Math.max(0,Number(f.minSalary)||0);const experienceLimit=body.filters?.maxRequiredExperienceYears;if(experienceLimit===undefined||experienceLimit===null||experienceLimit==='')delete f.maxRequiredExperienceYears;else{const years=Number(experienceLimit);if(!Number.isFinite(years)||years<0||years>50)return json({error:'Required-experience limit must be between 0 and 50 years.'},400);f.maxRequiredExperienceYears=years;}f.sources=(f.sources||[]).filter((id:string)=>sources.some(s=>s.id===id));for(const key of ['titles','locations','skills','excludedCompanies'])f[key]=String(f[key]||'').slice(0,3000);await write('profile',{...p,filters:f});return json({ok:true});}
 if(body.action==='resume'){const p=await profile();await write('profile',{...p,resume:String(body.resume||'').slice(0,60000),writerModel:String(body.writerModel||p.writerModel).slice(0,100),reviewerModel:String(body.reviewerModel||p.reviewerModel).slice(0,100),preparationMode:body.preparationMode==='ai'?'ai':body.preparationMode==='evidence'?'evidence':p.preparationMode||'evidence',autoPrepare:!!body.autoPrepare});return json({ok:true});}
 if(body.action==='status'){const j=await read<Job|null>('job:'+body.id,null);if(!j||!['pending','shortlisted','dismissed','applied'].includes(body.status))return json({error:'Invalid job or status'},400);await write('job:'+body.id,{...j,status:body.status});return json({ok:true});}
 if(body.action==='prepare'){if(!await read('job:'+body.id,null))return json({error:'Job not found'},404);return json(await enqueue(body.id));}
 return json({error:'Unknown action'},400);
 }catch(e){if(e instanceof Error&&'status'in e&&e.status===429)return json({error:e.message},429);return json({error:e instanceof Error?e.message:'Request failed'},500);}
}
export const GET=(req:Request)=>withAuthenticatedTenant(req,workspaceGet);
export const POST=(req:Request)=>withAuthenticatedTenant(req,()=>workspacePost(req));
