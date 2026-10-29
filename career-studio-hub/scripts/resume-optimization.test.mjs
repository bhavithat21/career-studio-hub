import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as resumeModel from '../lib/resume-model.ts';
import * as reviewValidation from '../lib/review-validation.ts';
import * as evidenceTailoring from '../lib/evidence-tailoring.ts';
import * as applicationPacket from '../lib/application-packet.ts';
import * as matching from '../lib/matching.ts';

const source=await fs.readFile(new URL('../lib/resume-optimization.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const master=`Test Candidate
candidate@example.test
PROFESSIONAL SUMMARY
Built Java services. Operated AWS systems.
TECHNICAL SKILLS
Languages: Java, SQL
Cloud: AWS
PROFESSIONAL EXPERIENCE
Example Company | Software Engineer | January 2020 - Present
- Built Java services.
- Operated AWS systems.
Earlier Company | Developer | January 2017 - December 2019
- Maintained SQL data pipelines.
- Automated Java tests.
TECHNICAL PROJECTS
Original project evidence.
EDUCATION
Example University | Computer Science | 2013 - 2017`;
const jobId='test-job',versionId='approved-version';
const clone=value=>value===undefined?undefined:structuredClone(value);
const selection=()=>({summaryIds:['S2','S1'],skillCategoryIds:['K2','K1'],responsibilities:[{id:'role-0',bulletIds:['role-0:B2','role-0:B1']},{id:'role-1',bulletIds:['role-1:B2','role-1:B1']}]});
const unchanged=()=>({summaryIds:['S1','S2'],skillCategoryIds:['K1','K2'],responsibilities:[{id:'role-0',bulletIds:['role-0:B1','role-0:B2']},{id:'role-1',bulletIds:['role-1:B1','role-1:B2']}]});
const positiveReview={approved:true,issues:[],feedback:'All retained statements match the supplied source; no real-world career verification was performed.'};

// Only infrastructure boundaries are mocked. Resume parsing, source grounding,
// role association, section locks, metrics checks, and fingerprints are real.
function harness({hasKey=true,proposal=selection(),review=positiveReview,prior=null,scoreStatus='current',duringFetch,duringRender,httpStatus=200}={}){
 const model=resumeModel.parseResume(master),content=resumeModel.baseEditable(model),records=new Map(Object.entries({
  profile:{id:'test-candidate',resume:master,reviewerModel:'test-claude-model',filters:clone(matching.defaults)},
  ['job:'+jobId]:{id:jobId,source:'test',sourceName:'Test',title:'Software Engineer',company:'Example Employer',url:'https://example.test/jobs/1',location:'Seattle, WA',description:'Build Java services and operate AWS systems.',remote:false,posted:new Date().toISOString(),salary:'',salaryMin:0,employment:'Full time',status:'pending'},
  ['version:'+versionId]:{id:versionId,jobId,number:1,model,content,text:resumeModel.assemble(model,content),layout:{pages:1,passed:true,fontSize:10},flags:[]},
  ['latest:'+jobId]:versionId,
  ['approval:'+jobId]:{jobId,versionId,status:'resume_approved'},
  'resume-rules':clone(resumeModel.defaultRules)
 }));
 const assessment={status:scoreStatus,score:{id:'current-score',snapshot:{source:'unchanged-test-source'},ats:{score:83},interview:{readiness:'moderate',probability:null},missingRequirements:[],suggestions:[{section:'Responsibilities',suggestion:'Prioritize the existing AWS evidence.'}],learningSuggestions:[]}};
 const locks=new Set(),calls=[],saves=[];let committed=0,guardCalls=0;
 const store={read:async(key,fallback)=>clone(records.has(key)?records.get(key):fallback),write:async(key,value)=>{records.set(key,clone(value));},claim:async key=>{if(locks.has(key))return false;locks.add(key);return true;},unlock:async key=>{locks.delete(key);}};
 const versions={rules:async()=>clone(records.get('resume-rules')),companyResumeEvidence:async()=>clone(prior),saveVersion:async(id,edits,kind,factualReview,expectedModel,metadata,guard)=>{
  saves.push({id,edits:clone(edits),kind,review:clone(factualReview),expectedModel:clone(expectedModel),metadata:clone(metadata)});
  assert.equal(typeof guard,'function');const lock='lock:version:'+id;assert.equal(await store.claim(lock),true);
  try{guardCalls++;await guard();if(duringRender)await duringRender({records,assessment});guardCalls++;await guard();
   const version={...clone(records.get('version:'+versionId)),id:'new-optimized-version',number:2,kind,content:clone(edits),text:resumeModel.assemble(expectedModel,edits),review:clone(factualReview),...clone(metadata)};
   records.set('version:'+version.id,version);records.set('latest:'+id,version.id);records.set('approval:'+id,{jobId:id,versionId:version.id,status:'awaiting_review'});committed++;return clone(version);
  }finally{await store.unlock(lock);}
 }};
 const http=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});assert.equal(url,'https://api.anthropic.com/v1/messages');if(duringFetch)await duringFetch({call:calls.length,records,assessment});if(httpStatus!==200)return new Response('private-provider-response-not-for-clients',{status:httpStatus});return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(calls.length===1?proposal:review)}]});};
 const dependencies={'./ai-provider':{claudeInferenceOptions:()=>({})},'./runtime':{env:hasKey?{ANTHROPIC_API_KEY:'unit-test-placeholder-not-a-real-key'}:{}},'./store':store,'./resume-model':resumeModel,'./review-validation':reviewValidation,'./evidence-tailoring':evidenceTailoring,'./versions':versions,'./resume-scoring':{getResumeScore:async()=>clone(assessment)},'./application-packet':applicationPacket,'./matching':matching};
 const module={exports:{}};new Function('require','module','exports','fetch',compiled)(name=>{assert.ok(Object.hasOwn(dependencies,name),'Unexpected infrastructure dependency: '+name);return dependencies[name];},module,module.exports,http);
 return {service:module.exports,records,assessment,locks,calls,saves,get:key=>clone(records.get(key)),set:(key,value)=>records.set(key,clone(value)),get committed(){return committed;},get guardCalls(){return guardCalls;}};
}

test('Optimizer requires a latest approved current-scored matching resume before provider access',async()=>{
 for(const [mutate,expected] of [
  [h=>h.set('approval:'+jobId,{versionId,status:'awaiting_review'}),/Approve the latest/],
  [h=>h.set('latest:'+jobId,'newer-version'),/Approve the latest/],
  [h=>h.assessment.status='stale',/current Claude assessment/],
  [h=>h.set('profile',{...h.get('profile'),resume:master.replace('Built Java services.','Built changed Java services.')}),/Master evidence changed/],
  [h=>h.set('job:'+jobId,{...h.get('job:'+jobId),status:'applied'}),/applied resume history/]
 ]){const h=harness();mutate(h);await assert.rejects(h.service.optimizeApprovedResume(versionId),expected);assert.equal(h.calls.length,0);assert.equal(h.committed,0);}
});

test('Missing Claude key and fully locked sections produce no provider calls or versions',async()=>{
 const missing=harness({hasKey:false});assert.equal((await missing.service.optimizeApprovedResume(versionId)).status,'setup_required');assert.equal(missing.calls.length,0);assert.equal(missing.committed,0);
 const locked=harness();locked.set('resume-rules',{...locked.get('resume-rules'),summary:false,skills:false,responsibilities:false});const result=await locked.service.optimizeApprovedResume(versionId);assert.equal(result.status,'no_changes');assert.equal(locked.calls.length,0);assert.equal(locked.committed,0);
});

test('Previously submitted or applied same-company evidence cannot be rewritten by optimization',async()=>{
 for(const priorSelection of ['submitted','applied']){const h=harness({prior:{selection:priorSelection,company:'Example Employer',version:{id:'past-company-version',model:{},content:{}}}});await assert.rejects(h.service.optimizeApprovedResume(versionId),/previous application at this company/);assert.equal(h.calls.length,0);assert.equal(h.committed,0);}
});

test('Source-ID selection rejects invented, cross-employer, duplicate, and removed-role evidence before review',async()=>{
 const variants=[];
 let proposal=selection();proposal.responsibilities[0].bulletIds=['role-1:B1'];variants.push(proposal);
 proposal=selection();proposal.summaryIds=['invented-summary'];variants.push(proposal);
 proposal=selection();proposal.skillCategoryIds=['K1','K1'];variants.push(proposal);
 proposal=selection();proposal.responsibilities.pop();variants.push(proposal);
 proposal={...selection(),education:'Invented degree'};variants.push(proposal);
 for(const proposal of variants){const h=harness({proposal});await assert.rejects(h.service.optimizeApprovedResume(versionId));assert.equal(h.calls.length,1);assert.equal(h.committed,0);assert.equal(h.locks.size,0);}
});

test('Disabled regions cannot be selected by the writer even with valid source IDs',async()=>{
 const h=harness();h.set('resume-rules',{...h.get('resume-rules'),summary:false});await assert.rejects(h.service.optimizeApprovedResume(versionId),/locked section/);assert.equal(h.calls.length,1);assert.equal(h.committed,0);
});

test('One changed source-grounded selection gets separate factual review and a new unapproved version',async()=>{
 const h=harness(),original=h.get('version:'+versionId),result=await h.service.optimizeApprovedResume(versionId);
 assert.equal(result.status,'created');assert.equal(h.calls.length,2);assert.equal(h.committed,1);assert.equal(h.guardCalls,2);assert.equal(result.sourceVersionId,versionId);assert.equal(result.version.kind,'claude_optimization');assert.equal(result.version.sourceVersionId,versionId);assert.equal(h.get('approval:'+jobId).status,'awaiting_review');assert.deepEqual(h.get('version:'+versionId),original);assert.equal(h.locks.size,0);
 const firstInput=JSON.parse(h.calls[0].body.messages[0].content),reviewInput=JSON.parse(h.calls[1].body.messages[0].content);
 assert.deepEqual(Object.keys(firstInput.qualitativeFeedback).sort(),['learningSuggestions','missingRequirements','suggestions']);assert.equal(Object.hasOwn(firstInput,'ats'),false);assert.equal(Object.hasOwn(firstInput,'interview'),false);assert.equal(Object.hasOwn(reviewInput,'qualitativeFeedback'),false);assert.equal(Object.hasOwn(reviewInput,'currentContent'),false);assert.equal(reviewInput.proposedContent.responsibilities[0].bullets[0],'Operated AWS systems.');assert.equal(result.version.review.approved,true);
 assert.equal(h.saves[0].metadata.reviewMethod,'claude_independent_review');assert.equal([...h.records.keys()].filter(key=>key.startsWith('optimization:')).length,1);
});

test('Factual review receives only selected source claims and locked fields, not omitted optional evidence or strategy inputs',async()=>{
 const proposal={summaryIds:['S1'],skillCategoryIds:['K2'],responsibilities:[{id:'role-0',bulletIds:['role-0:B1']},{id:'role-1',bulletIds:['role-1:B1']}]};
 const h=harness({proposal}),result=await h.service.optimizeApprovedResume(versionId);assert.equal(result.status,'created');
 const input=JSON.parse(h.calls[1].body.messages[0].content),prompt=h.calls[1].body.system;
 for(const key of ['masterResume','masterModel','job','qualitativeFeedback','currentContent'])assert.equal(Object.hasOwn(input,key),false);
 assert.deepEqual(input.selectedSourceEvidence.summary,[{id:'S1',text:'Built Java services.'}]);assert.deepEqual(input.selectedSourceEvidence.skills,[{id:'K2',text:'Cloud: AWS'}]);assert.deepEqual(input.selectedSourceEvidence.roles[0].bullets,[{id:'role-0:B1',text:'Built Java services.'}]);
 assert.equal(JSON.stringify(input).includes('Operated AWS systems.'),false);assert.equal(JSON.stringify(input).includes('Automated Java tests.'),false);
 assert.deepEqual(input.lockedSource.header,h.get('version:'+versionId).model.header);assert.equal(input.lockedSource.roles.length,2);assert.equal(input.lockedSource.education,h.get('version:'+versionId).model.education);assert.equal(input.lockedSource.projects,h.get('version:'+versionId).model.projects);
 assert.match(prompt,/not a resume strategist or completeness reviewer/);assert.match(prompt,/Do not reject because an enabled summary/);assert.match(prompt,/only specific actual checklist violations/);
});

test('Reviewer still receives the complete original source of disabled sections',async()=>{
 const proposal={summaryIds:[],skillCategoryIds:[],responsibilities:[{id:'role-0',bulletIds:['role-0:B1']},{id:'role-1',bulletIds:['role-1:B1']}]},h=harness({proposal});
 h.set('resume-rules',{...h.get('resume-rules'),summary:false,skills:false});const result=await h.service.optimizeApprovedResume(versionId);assert.equal(result.status,'created');
 const input=JSON.parse(h.calls[1].body.messages[0].content),model=h.get('version:'+versionId).model;assert.equal(input.lockedSource.disabledSections.summary,model.summary);assert.equal(input.lockedSource.disabledSections.skills,model.skills);assert.equal(input.proposedContent.summary,model.summary);assert.equal(input.proposedContent.skills,model.skills);assert.equal(input.selectedSourceEvidence.summary.length,2);assert.equal(input.selectedSourceEvidence.skills.length,2);
});

test('Unchanged content stops after one writer call without a duplicate PDF or reviewer call',async()=>{
 const h=harness({proposal:unchanged()}),result=await h.service.optimizeApprovedResume(versionId);assert.equal(result.status,'no_changes');assert.equal(h.calls.length,1);assert.equal(h.saves.length,0);assert.equal(h.committed,0);assert.equal(h.get('approval:'+jobId).status,'resume_approved');
});

test('A reviewer rejection or contradictory approval blocks the new version',async()=>{
 const rejected=harness({review:{approved:false,issues:['Insufficient source support.'],feedback:'Do not save this draft.'}}),result=await rejected.service.optimizeApprovedResume(versionId);assert.equal(result.status,'no_changes');assert.equal(result.reason,'factual_review_rejected');assert.equal(rejected.calls.length,2);assert.equal(rejected.committed,0);
 const contradictory=harness({review:{approved:true,issues:['Unsupported claim.'],feedback:'An issue remains.'}});await assert.rejects(contradictory.service.optimizeApprovedResume(versionId),/unresolved issues/);assert.equal(contradictory.committed,0);assert.equal(contradictory.locks.size,0);
});

test('Changed source state during calls or PDF rendering discards work before saving',async()=>{
 const duringWriter=harness({duringFetch:async({call,records})=>{if(call===1){const job=records.get('job:'+jobId);records.set('job:'+jobId,{...job,description:job.description+' Added requirement.'});}}});await assert.rejects(duringWriter.service.optimizeApprovedResume(versionId),/changed during optimization/);assert.equal(duringWriter.calls.length,1);assert.equal(duringWriter.committed,0);
 const duringReview=harness({duringFetch:async({call,records})=>{if(call===2)records.set('approval:'+jobId,{versionId,status:'changes_requested'});}});await assert.rejects(duringReview.service.optimizeApprovedResume(versionId),/Approve the latest/);assert.equal(duringReview.calls.length,2);assert.equal(duringReview.committed,0);
 const duringPdf=harness({duringRender:async({records})=>{const job=records.get('job:'+jobId);records.set('job:'+jobId,{...job,description:job.description+' Changed during rendering.'});}});await assert.rejects(duringPdf.service.optimizeApprovedResume(versionId),/changed during optimization/);assert.equal(duringPdf.guardCalls,2);assert.equal(duringPdf.committed,0);assert.equal(duringPdf.locks.size,0);
});

test('Concurrent optimization is bounded and provider error text is never returned',async()=>{
 const busy=harness();busy.locks.add('lock:optimization:'+jobId);assert.equal((await busy.service.optimizeApprovedResume(versionId)).status,'busy');assert.equal(busy.calls.length,0);
 const failed=harness({httpStatus:401});await assert.rejects(failed.service.optimizeApprovedResume(versionId),error=>/HTTP 401/.test(error.message)&&!error.message.includes('private-provider-response'));assert.equal(failed.calls.length,1);assert.equal(failed.committed,0);assert.equal(failed.locks.size,0);
});
