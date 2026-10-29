import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw Error('Integration checks are restricted to local test workspaces.');
async function post(body,ok=true){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();assert.equal(r.ok,ok,JSON.stringify(j));return j;}
const load=()=>fetch(base+'/api/workspace').then(r=>r.json());
const before=await load();assert.ok(before.jobs.length);assert.equal(before.model.roles.length,2);const job=before.jobs.find(j=>j.company==='Fieldguide')||before.jobs[0];
const v1=await post({action:'baseline',id:job.id});assert.equal(v1.layout.pages,1);assert.ok(v1.layout.passed);const pdf=await fetch(base+'/api/resume-pdf?id='+v1.id);assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);const bytes=new Uint8Array(await pdf.arrayBuffer());assert.ok(bytes.length>1000);fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/integration-resume.pdf',bytes);console.log('PASS PDF saved through object storage and retrieved by version ID');
await post({action:'review-version',versionId:v1.id,decision:'approved'});let state=await load();assert.equal(state.approvals.find(a=>a.jobId===job.id).status,'resume_approved');
const v2=await post({action:'save-version',id:job.id,content:v1.content});assert.equal(v2.number,v1.number+1);state=await load();assert.equal(state.approvals.find(a=>a.jobId===job.id).status,'awaiting_review');console.log('PASS new versions invalidate previous approvals');
await post({action:'review-version',versionId:v1.id,decision:'approved'},false);console.log('PASS stale version approval rejected');
await post({action:'save-version',id:job.id,content:{...v2.content,education:'Changed school'}},false);console.log('PASS locked fields rejected at API boundary');
await post({action:'rules',rules:{...before.rules,summary:false}});
try{await post({action:'save-version',id:job.id,content:{...v2.content,summary:'A changed summary'}},false);console.log('PASS section permission enforced at API boundary');}finally{await post({action:'rules',rules:before.rules});}
await post({action:'review-version',versionId:v2.id,decision:'approved'});
await post({action:'application-plan',id:job.id},false);console.log('PASS application cannot progress without independent factual review');
await post({action:'review-version',versionId:v2.id,decision:'changes_requested',notes:'Local integration test complete; awaiting human review.'});
state=await load();assert.equal(state.versions.find(v=>v.id===v1.id).content.summary,v1.content.summary);console.log('PASS immutable version readback; final test record awaiting review');
