import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as resumeModel from '../lib/resume-model.ts';
import * as reviewValidation from '../lib/review-validation.ts';
import * as applicationPacket from '../lib/application-packet.ts';
import * as scoringModel from '../lib/scoring-model.ts';

// Execute the actual service with in-memory infrastructure boundaries. No network,
// Cloudflare resources, production records, or provider credentials are involved.
const source=await fs.readFile(new URL('../lib/resume-scoring.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const master=`Test Candidate
candidate@example.test
PROFESSIONAL SUMMARY
Backend engineer building reliable cloud services.
TECHNICAL SKILLS
Java, SQL, AWS
PROFESSIONAL EXPERIENCE
Example Company | Software Engineer | January 2020 - Present
- Built Java services.
- Maintained SQL data pipelines.
TECHNICAL PROJECTS
Example service project.
EDUCATION
Example University | Computer Science | 2015 - 2019`;
const jobId='test-job',versionId='test-version';
const clone=value=>value===undefined?undefined:structuredClone(value);
const validScore=()=>({ats:{score:82,keywordCoverage:75,structure:90,requirementsFit:78},interview:{readiness:'moderate',probability:null,rationale:'Demonstrated role evidence with unknown employer screening preferences.'},matchedRequirements:[{jobQuote:'Build Java services',resumeQuote:'Built Java services.'}],missingRequirements:[{jobQuote:'Kubernetes experience',gap:'Kubernetes experience is not evidenced in the supplied resume.'}],suggestions:[{section:'Summary',suggestion:'Emphasize the existing Java services evidence.'}],learningSuggestions:['Record explicit outcomes rather than treating missing replies as rejections.'],summary:'Relevant Java evidence with one unevidenced requirement.'});

function harness({hasKey=true,reply=validScore(),duringFetch}={}){
 const model=resumeModel.parseResume(master),content=resumeModel.baseEditable(model);
 const records=new Map(Object.entries({
  profile:{id:'test-candidate',resume:master,reviewerModel:'test-claude-model'},
  ['job:'+jobId]:{id:jobId,company:'Example Employer',title:'Software Engineer',url:'https://example.test/jobs/1',location:'Seattle, WA',description:'Build Java services. Kubernetes experience.',remote:false,employment:'Full time',status:'pending'},
  ['version:'+versionId]:{id:versionId,jobId,number:1,model,content,text:resumeModel.assemble(model,content),layout:{pages:1,passed:true,fontSize:10},flags:[],review:{approved:true,issues:[],feedback:'Source-supported retained statements.'},reviewMethod:'source_comparison'},
  ['latest:'+jobId]:versionId,
  ['approval:'+jobId]:{jobId,versionId,status:'resume_approved'}
 }));
 const locks=new Set(),calls=[],environment=hasKey?{ANTHROPIC_API_KEY:'unit-test-placeholder-not-a-real-key'}:{};
 const store={read:async(key,fallback)=>clone(records.has(key)?records.get(key):fallback),write:async(key,value)=>{records.set(key,clone(value));},list:async prefix=>[...records].filter(([key])=>key.startsWith(prefix)).map(([,value])=>clone(value)),claim:async key=>{if(locks.has(key))return false;locks.add(key);return true;},unlock:async key=>{locks.delete(key);}};
 const http=async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  assert.equal(url,'https://api.anthropic.com/v1/messages','The service must use only its configured Claude provider.');
  if(duringFetch)await duringFetch({records,store});
  return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(reply)}]});
 };
 const dependencies={'./ai-provider':{claudeInferenceOptions:()=>({})},'./runtime':{env:environment},'./store':store,'./resume-model':resumeModel,'./review-validation':reviewValidation,'./versions':{rules:async()=>clone(records.get('resume-rules')||resumeModel.defaultRules)},'./application-packet':applicationPacket,'./scoring-model':scoringModel};
 const module={exports:{}};
 new Function('require','module','exports','fetch',compiled)(name=>{assert.ok(Object.hasOwn(dependencies,name),'Unexpected infrastructure dependency: '+name);return dependencies[name];},module,module.exports,http);
 return {service:module.exports,records,locks,calls,get:key=>clone(records.get(key)),set:(key,value)=>records.set(key,clone(value))};
}

test('Scoring requires final approval of the latest exact version before any provider request',async()=>{
 for(const [mutate,expected] of [
  [h=>h.set('approval:'+jobId,{versionId,status:'awaiting_review'}),/candidate approval/],
  [h=>h.set('approval:'+jobId,{versionId:'older-version',status:'resume_approved'}),/candidate approval/],
  [h=>h.set('latest:'+jobId,'newer-version'),/newer resume/],
  [h=>h.set('profile',{...h.get('profile'),resume:master.replace('Built Java services.','Built different Java services.')}),/Master evidence changed/],
  [h=>h.set('version:'+versionId,{...h.get('version:'+versionId),layout:{passed:false}}),/layout/]
 ]){const h=harness();mutate(h);await assert.rejects(h.service.scoreApprovedResume(versionId),expected);assert.equal(h.calls.length,0);}
});

test('A missing Claude key returns setup_required, saves no score, and makes no fetch',async()=>{
 const h=harness({hasKey:false}),result=await h.service.scoreApprovedResume(versionId);
 assert.equal(result.status,'setup_required');assert.equal(result.provider,'anthropic');assert.equal(result.score,null);assert.equal(h.calls.length,0);assert.equal([...h.records.keys()].some(key=>key.startsWith('resume-score:')),false);
});

test('Provider evidence IDs resolve to source excerpts before the saved score reaches the UI',async()=>{
 const reply=validScore(),h=harness({reply}),version=h.get('version:'+versionId),job=h.get('job:'+jobId);
 const catalog=scoringModel.buildEvidenceCatalog({resumeText:version.text,masterResume:master,jobText:job.title+' '+job.description});
 const requirement=catalog.job.find(item=>item.text.includes('Build Java services'));
 const evidence=catalog.resume.find(item=>item.text==='Built Java services.');
 const missing=catalog.job.find(item=>item.text==='Kubernetes experience.');
 reply.matchedRequirements=[{jobEvidenceId:requirement.id,resumeEvidenceId:evidence.id}];
 reply.missingRequirements=[{jobEvidenceId:missing.id,gap:'Not evidenced in the supplied resume.'}];
 const result=await h.service.scoreApprovedResume(versionId);
 assert.equal(result.status,'current');
 assert.deepEqual(result.score.matchedRequirements,[{jobQuote:requirement.text,resumeQuote:evidence.text}]);
 assert.equal(result.score.missingRequirements[0].jobQuote,missing.text);
 const sent=JSON.parse(h.calls[0].body.messages[0].content);
 assert.deepEqual(sent.evidenceCatalog,catalog);
 assert.deepEqual(h.get('resume-score:'+result.score.id).matchedRequirements,result.score.matchedRequirements);
});

test('An assessment created under different scoring instructions is marked stale',async()=>{
 const h=harness(),result=await h.service.scoreApprovedResume(versionId);
 const record=h.get('resume-score:'+result.score.id);
 record.snapshot.scoringPolicyFingerprint='previous-instructions';
 h.set('resume-score:'+record.id,record);
 const current=await h.service.getResumeScore(versionId);
 assert.equal(current.status,'stale');
 assert.ok(current.staleReasons.includes('Claude assessment instructions changed.'));
});

test('Outcome tracking requires an actual submitted/applied application, not a draft packet',async()=>{
 const h=harness();h.set('application:'+jobId,{id:'draft-packet',versionId,status:'application_approved'});
 await assert.rejects(h.service.recordOutcome({jobId,status:'no_response'}),/submitted or applied externally/);
 assert.equal(h.get('outcome:'+jobId),undefined);assert.equal(h.calls.length,0);
});

test('Outcome attribution uses the actual receipt version and preserves an interview followed by rejection',async()=>{
 const h=harness();h.set('job:'+jobId,{...h.get('job:'+jobId),status:'applied'});
 h.set('application:'+jobId,{id:'unsubmitted-packet',versionId:'draft-version',status:'application_approved'});
 let result=await h.service.recordOutcome({jobId,status:'pending'});assert.equal(result.outcome.versionId,null);assert.equal(result.outcome.resumeAttribution,'unknown');
 h.set('application:'+jobId,{id:'submitted-packet',versionId:'actually-submitted-version',status:'submitted_reported',receipt:{submittedAt:'2026-01-01T00:00:00Z'}});
 result=await h.service.recordOutcome({jobId,status:'interview',reason:'Candidate reported an interview invitation.'});assert.equal(result.outcome.versionId,'actually-submitted-version');assert.equal(result.outcome.everReachedInterview,true);
 result=await h.service.recordOutcome({jobId,status:'rejected',reason:'Candidate reported a rejection after the interview.'});assert.equal(result.outcome.versionId,'actually-submitted-version');assert.equal(result.outcome.verifiedBySystem,false);assert.equal(result.outcome.everReachedInterview,true);assert.equal(result.learning.summary.positiveOutcomes,1);assert.equal(result.learning.summary.rejectedAfterInterview,1);assert.equal(result.learning.summary.resolved,1);assert.equal(h.calls.length,0);
});

test('A strict source-grounded Claude response produces a persisted current score and reuses its snapshot',async()=>{
 const h=harness(),result=await h.service.scoreApprovedResume(versionId);
 assert.equal(result.status,'current');assert.equal(result.score.versionId,versionId);assert.equal(result.score.calibration,'not_measured');assert.equal(result.score.confidence,'not_applicable');assert.equal(result.score.automaticEdits,false);assert.equal(result.score.ats.score,82);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].body.model,'test-claude-model');assert.match(h.calls[0].body.system,/untrusted evidence/);
 const readback=await h.service.getResumeScore(versionId);assert.equal(readback.status,'current');assert.equal(readback.score.id,result.score.id);
 const repeated=await h.service.scoreApprovedResume(versionId);assert.equal(repeated.score.id,result.score.id);assert.equal(h.calls.length,1);assert.equal(h.locks.size,0);
});

test('Changed job descriptions and recorded outcomes make stored scores stale without rewriting them',async()=>{
 const h=harness(),initial=await h.service.scoreApprovedResume(versionId),immutable=clone(h.get('resume-score:'+initial.score.id));
 const job=h.get('job:'+jobId);h.set('job:'+jobId,{...job,description:job.description+' Required Go experience.'});
 let readback=await h.service.getResumeScore(versionId);assert.equal(readback.status,'stale');assert.ok(readback.staleReasons.some(reason=>/Job description/.test(reason)));
 h.set('job:'+jobId,{...job,status:'applied'});await h.service.recordOutcome({jobId,status:'rejected'});
 readback=await h.service.getResumeScore(versionId);assert.equal(readback.status,'stale');assert.ok(readback.staleReasons.some(reason=>/Recorded outcomes/.test(reason)));assert.deepEqual(h.get('resume-score:'+initial.score.id),immutable);assert.equal(h.calls.length,1);
});

test('Unsupported Claude evidence is rejected instead of being persisted as a final score',async()=>{
 const reply=validScore();reply.matchedRequirements[0].resumeQuote='Led an invented Kubernetes migration.';
 const h=harness({reply});await assert.rejects(h.service.scoreApprovedResume(versionId),/not present/);
 assert.equal(h.calls.length,1);assert.equal([...h.records.keys()].some(key=>key.startsWith('resume-score:')),false);assert.equal(h.locks.size,0);
});

test('An in-flight source change discards the result and releases both service locks',async()=>{
 const h=harness({duringFetch:async({records})=>{const job=records.get('job:'+jobId);records.set('job:'+jobId,{...job,description:job.description+' Changed while scoring.'});}});
 await assert.rejects(h.service.scoreApprovedResume(versionId),/changed during scoring/);assert.equal(h.calls.length,1);assert.equal([...h.records.keys()].some(key=>key.startsWith('resume-score:')),false);assert.equal(h.locks.size,0);
});
