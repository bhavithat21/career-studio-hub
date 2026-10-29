import assert from 'node:assert/strict';

// Mutates only a loopback development workspace. No provider calls or resume output.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
const origin=new URL(base);
if(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname)||!origin.port||origin.username||origin.password)throw Error('Version checks are restricted to a local test workspace.');
async function send(body){const response=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {ok:response.ok,result:await response.json()};}
async function post(body){const response=await send(body);assert.equal(response.ok,true,response.result.error||'Local request failed');return response.result;}
async function load(){const response=await fetch(base+'/api/workspace');assert.equal(response.ok,true);return response.json();}
const before=await load();assert.ok(before.jobs.length,'Populate local discovery records first.');assert.ok(before.profile.resume&&before.model,'Save a local test master resume first.');
const job=before.jobs.find(job=>job.status!=='applied')||before.jobs[0];
const originalResume={action:'resume',resume:before.profile.resume,writerModel:before.profile.writerModel,reviewerModel:before.profile.reviewerModel,autoPrepare:before.profile.autoPrepare};
let changedMaster=false;
try{
 const baseline=await post({action:'baseline',id:job.id});
 await post({action:'review-version',versionId:baseline.id,decision:'approved',notes:'Local version safety check.'});
 const modified=before.profile.resume.replace('PROFESSIONAL SUMMARY','PROFESSIONAL SUMMARY\nLocal evidence revision for integration testing.');
 assert.notEqual(modified,before.profile.resume,'Structured master heading is required.');
 await post({...originalResume,resume:modified,autoPrepare:false});changedMaster=true;
 const approval=await send({action:'review-version',versionId:baseline.id,decision:'approved'});
 assert.equal(approval.ok,false);assert.match(approval.result.error,/Master resume changed/i);
 const application=await send({action:'application-plan',id:job.id});
 assert.equal(application.ok,false);assert.match(application.result.error,/Master evidence changed/i);
 console.log('PASS master changes invalidate both resume approval and application preparation');
 await post(originalResume);changedMaster=false;

 const actions=await Promise.all([
  send({action:'save-version',id:job.id,content:baseline.content}),
  send({action:'review-version',versionId:baseline.id,decision:'approved',notes:'Concurrent local approval check.'})
 ]);
 assert.ok(actions.some(action=>action.ok),'At least one serialized version action must complete.');
 for(const action of actions.filter(action=>!action.ok))assert.match(action.result.error,/already running|Only the latest version|being updated/i);
 const after=await load(),versions=after.versions.filter(version=>version.jobId===job.id).sort((a,b)=>b.number-a.number);
 const currentApproval=after.approvals.find(approval=>approval.jobId===job.id);
 assert.equal(currentApproval.versionId,versions[0].id,'An old approval must not overwrite the latest version gate.');
 if(versions[0].id!==baseline.id)assert.equal(currentApproval.status,'awaiting_review');
 assert.deepEqual(after.versions.find(version=>version.id===baseline.id).content,baseline.content,'Prior resume content must remain immutable.');
 console.log('PASS concurrent save/approval preserves the latest-version gate and immutable content');
 await post({action:'review-version',versionId:versions[0].id,decision:'changes_requested',notes:'Local safety verification complete; candidate review required.'});
}finally{
 if(changedMaster)await post(originalResume);
}
