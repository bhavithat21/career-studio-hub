import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {match,canonical} from '../lib/matching.ts';

function loopbackOrigin(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Application acceptance checks are restricted to an explicit local test workspace URL.');
 return url.origin;
}

// No employer is contacted. The receipt explicitly describes a local test fixture.
// The caller must run against a disposable local database, never production.
export async function runApplicationFlow(options={}){
 const base=loopbackOrigin(options.base||process.env.TEST_BASE_URL||'http://127.0.0.1:8787');
 const load=async()=>{const response=await fetch(base+'/api/workspace');assert.ok(response.ok,'Local workspace must be running');return response.json();};
 const post=async(body,expected=true)=>{const response=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.ok,expected,value.error||'Unexpected local API result');return value;};
 const before=await load();
 const jobId=options.jobId||process.env.TEST_JOB_ID;
 const applied=before.jobs.filter(job=>job.status==='applied').map(job=>canonical(job.url));
 const available=before.jobs.filter(job=>job.status!=='applied'&&job.status!=='dismissed'&&match(job,before.profile.filters)&&!applied.includes(canonical(job.url))&&!before.applications.some(application=>application.jobId===job.id));
 const job=jobId?before.jobs.find(job=>job.id===jobId):available[0];
 assert.ok(job,'Discover a matching local test role without an existing application first.');
 assert.ok(job.status!=='applied'&&job.status!=='dismissed'&&match(job,before.profile.filters),'The test role must be active and match current filters.');
 assert.ok(!before.applications.some(application=>application.jobId===job.id),'Choose a local test role without an existing application so this test does not overwrite its history.');
 try{
  const version=options.versionId?before.versions.find(version=>version.id===options.versionId):await post({action:options.prepareAction||'prepare-evidence',id:job.id});
  assert.ok(version&&version.jobId===job.id,'Preparation must return the selected role resume version.');
  assert.equal(version.reviewMethod,'source_comparison','Use the real source-comparison preparation path, never a seeded AI verdict.');
  assert.equal(version.review?.approved,true);assert.deepEqual(version.review?.issues,[]);assert.equal(version.layout?.passed,true);
  const pdf=await fetch(base+'/api/resume-pdf?id='+encodeURIComponent(version.id));assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);
  await post({action:'review-version',versionId:version.id,decision:'approved',notes:'Local acceptance test: reviewed the actual source-compared PDF; no employer submission.'});
  console.log('PASS source-compared PDF is stored and candidate approval attaches to its exact version');

  const answers=[{question:'Acceptance test context',answer:'Local test only. No application was sent to an employer.',confirmed:true}];
  const packet=await post({action:'application-plan',id:job.id,answers});
  assert.equal(packet.versionId,version.id);assert.equal(packet.status,'awaiting_application_approval');assert.deepEqual(packet.payload.answers,answers);assert.equal(packet.payload.automation.available,false);
  const samePacket=await post({action:'application-plan',id:job.id,answers});assert.equal(samePacket.id,packet.id);
  await post({action:'application-submitted',id:packet.id,notes:'Local test only; should be rejected before packet approval.'},false);
  const approved=await post({action:'application-review',id:packet.id,decision:'approved',notes:'Approved this exact local test packet.'});assert.equal(approved.status,'application_approved');assert.equal(approved.payloadFingerprint,packet.payloadFingerprint);
  console.log('PASS immutable application packet is idempotent and requires separate exact-payload approval');

  const report={action:'application-submitted',id:packet.id,reference:'LOCAL-QA-NO-EMPLOYER-SUBMISSION',notes:'Local integration test fixture only. No employer application was sent. This record tests candidate-reported receipt storage.'};
  const submitted=await post(report);assert.equal(submitted.status,'submitted_reported');assert.equal(submitted.receipt.verifiedByWorker,false);assert.equal(submitted.receipt.reportedBy,'candidate');
  let after=await load();assert.equal(after.jobs.find(row=>row.id===job.id).status,'applied');
  await post({action:'application-plan',id:job.id,answers},false);
  const repeated=await post({...report,notes:'Duplicate transport retry must retain the first receipt.'});assert.equal(repeated.id,submitted.id);assert.deepEqual(repeated.receipt,submitted.receipt);assert.equal(repeated.updatedAt,submitted.updatedAt);
  after=await load();assert.equal(after.applications.filter(application=>application.jobId===job.id).length,1);assert.equal(after.events.filter(event=>event.type==='application_submission_reported'&&event.applicationId===packet.id).length,1);
  console.log('PASS candidate-reported receipt updates Applied, duplicate preparation is blocked, and receipt retries preserve the original report');
  return {jobId:job.id,versionId:version.id,applicationId:packet.id,status:submitted.status};
 }finally{
  await post({action:'status',id:job.id,status:job.status||'pending'});
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runApplicationFlow();
