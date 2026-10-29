import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClaudeScore,validateOutcomeInput,summarizeOutcomes,scoringAvailability,scoringSystemPrompt,buildEvidenceCatalog,scoringInput} from '../lib/scoring-model.ts';
const score=()=>({ats:{score:81,keywordCoverage:75,structure:90,requirementsFit:78},interview:{readiness:'moderate',probability:null,rationale:'Supported experience with uncertain employer screening preferences.'},matchedRequirements:[{jobQuote:'Build Java services',resumeQuote:'Built Java services'}],missingRequirements:[{jobQuote:'Kubernetes experience',gap:'Kubernetes is not evidenced in the supplied resume.'}],suggestions:[{section:'Summary',suggestion:'Emphasize the supplied Java services evidence.'}],learningSuggestions:[],summary:'Relevant experience with one unevidenced requirement.'});
const context={jobText:'Build Java services. Kubernetes experience.',resumeText:'Built Java services for cloud workloads.',masterResume:'Built Java services for cloud workloads.'};
test('Scores enforce finite ranges and reject unsupported calibration fields or precise guarantees',()=>{
 assert.equal(validateClaudeScore(score(),context).ats.score,81);
 for(const value of [-1,101,NaN,Infinity,'90']){const input=score();input.ats.score=value;assert.throws(()=>validateClaudeScore(input),/percentages/);}
 for(const probability of [0,40,100]){const input=score();input.interview.probability=probability;assert.throws(()=>validateClaudeScore(input),/no measured hiring probability/);}
 const precise=score();precise.interview.estimatePercent=100;assert.throws(()=>validateClaudeScore(precise),/unsupported/);
 assert.throws(()=>validateClaudeScore({...score(),calibrated:true}),/unsupported/);
});
test('Quoted evidence must occur in posting, approved resume and master',()=>{
 const input=score();input.matchedRequirements[0].resumeQuote='Led Kubernetes migration';assert.throws(()=>validateClaudeScore(input,context),/not present/);
 assert.throws(()=>validateClaudeScore(score(),{...context,masterResume:'No supplied Java evidence.'}),/not present/);
 const locked=score();locked.suggestions[0].section='Education';assert.throws(()=>validateClaudeScore(locked),/allowed resume sections/);
 assert.throws(()=>validateClaudeScore(score(),{...context,permissions:{summary:false,skills:true,responsibilities:true}}),/locked resume section/);
});
test('Missing Claude key reports setup required without manufacturing a score or fallback',()=>{
 const readiness=scoringAvailability(false,'configured-model');assert.equal(readiness.status,'setup_required');assert.equal(readiness.provider,'anthropic');assert.equal(Object.hasOwn(readiness,'score'),false);assert.match(readiness.message,/No score was generated/);
 assert.match(scoringSystemPrompt(),/unanswered applications as rejections/);
});
test('Outcome validation keeps reasons self-reported and rejects fabricated employer verification',()=>{
 assert.deepEqual(validateOutcomeInput({jobId:'job:1',status:'no_response'}),{jobId:'job:1',status:'no_response',reason:'',reasonSource:'self_reported',evidence:''});
 assert.throws(()=>validateOutcomeInput({jobId:'job:1',status:'rejected',verifiedByEmployer:true}),/unsupported/);
 assert.throws(()=>validateOutcomeInput({jobId:'job:1',status:'rejected',reasonSource:'employer_message'}),/employer message/);
 assert.throws(()=>validateOutcomeInput({jobId:'job:1',status:'probably_rejected'}),/explicit/);
});
test('Learning excludes missing replies and unknown outcomes, and counts the latest state per job',()=>{
 const summary=summarizeOutcomes([{jobId:'a',status:'rejected',updatedAt:'2026-01-01'},{jobId:'a',status:'interview',updatedAt:'2026-02-01'},{jobId:'b',status:'no_response'},{jobId:'c',status:'pending'},{jobId:'d',status:'offer'},{jobId:'e',status:'unknown'},null]);
 assert.equal(summary.resolved,2);assert.equal(summary.positiveOutcomes,2);assert.equal(summary.counts.rejected,0);assert.equal(summary.unresolved,2);assert.equal(summary.unknownExcluded,2);assert.equal(summary.observedInterviewOrOfferRate,null);assert.equal(summary.calibrated,false);
 const enough=summarizeOutcomes(Array.from({length:30},(_,i)=>({jobId:String(i),status:i<10?'interview':'rejected'})));assert.equal(enough.observedInterviewOrOfferRate,33.3);assert.equal(enough.sufficientForPatternReview,true);assert.equal(enough.calibrated,false);
});
test('A rejection after an interview keeps the interview signal in subsequent learning',()=>{
 const summary=summarizeOutcomes([{jobId:'a',status:'interview',updatedAt:'2026-01-01'},{jobId:'a',status:'rejected',updatedAt:'2026-02-01'},{jobId:'b',status:'rejected',everReachedInterview:true}]);
 assert.equal(summary.resolved,2);assert.equal(summary.positiveOutcomes,2);assert.equal(summary.rejectedAfterInterview,2);assert.equal(summary.counts.rejected,2);
 const reversed=summarizeOutcomes([{jobId:'a',status:'rejected',updatedAt:'2026-02-01'},{jobId:'a',status:'interview',updatedAt:'2026-01-01'}]);assert.equal(reversed.positiveOutcomes,1);assert.equal(reversed.counts.rejected,1);
});
test('Numbered citations resolve to exact locally verified excerpts without model transcription',()=>{
 const input=score(),catalog=buildEvidenceCatalog(context),jobRef=catalog.job.find(item=>item.text.includes('Build Java services')),resumeRef=catalog.resume.find(item=>item.text.includes('Built Java services'));
 input.matchedRequirements=[{jobEvidenceId:jobRef.id,resumeEvidenceId:resumeRef.id}];input.missingRequirements=[{jobEvidenceId:catalog.job.find(item=>item.text.includes('Kubernetes experience')).id,gap:'Not evidenced in this resume.'}];
 const parsed=validateClaudeScore(input,context);assert.equal(parsed.matchedRequirements[0].jobQuote,jobRef.text);assert.equal(parsed.matchedRequirements[0].resumeQuote,resumeRef.text);
 const body=JSON.parse(scoringInput({...context,job:{title:'',description:context.jobText},layout:{},rules:{},learning:{},outcomes:[]}));assert.deepEqual(body.evidenceCatalog,catalog);assert.match(scoringSystemPrompt(),/without transcribing, paraphrasing/);
 const job={title:'Software Engineer',description:context.jobText},withTitle=JSON.parse(scoringInput({...context,job,layout:{},rules:{},learning:{},outcomes:[]}));assert.deepEqual(withTitle.evidenceCatalog,buildEvidenceCatalog({...context,jobText:job.title+' '+job.description}));assert.match(scoringSystemPrompt(),/at most 6 matchedRequirements, 6 missingRequirements/);
});
test('Unknown evidence IDs and ungrounded final-resume statements remain rejected',()=>{
 const changed={...context,resumeText:context.resumeText+'\nLed an invented Kubernetes migration.'},catalog=buildEvidenceCatalog(changed);assert.ok(!catalog.resume.some(item=>item.text.includes('invented Kubernetes')));
 const input=score();input.matchedRequirements=[{jobEvidenceId:'J001',resumeEvidenceId:'R999'}];assert.throws(()=>validateClaudeScore(input,changed),/unknown source evidence reference/);
 input.matchedRequirements=[{jobEvidenceId:'J999',resumeEvidenceId:'R001'}];assert.throws(()=>validateClaudeScore(input,changed),/unknown source evidence reference/);
 input.matchedRequirements=[{jobEvidenceId:'J001',resumeEvidenceId:'R001',resumeQuote:'invented'}];assert.throws(()=>validateClaudeScore(input,changed),/unsupported/);
});
