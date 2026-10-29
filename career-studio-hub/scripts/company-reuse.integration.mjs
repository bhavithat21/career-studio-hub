import assert from 'node:assert/strict';
import {match} from '../lib/matching.ts';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))throw Error('Company reuse checks are restricted to the local test workspace.');
async function post(body){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,value.error);return value;}
const data=await fetch(base+'/api/workspace').then(r=>r.json());
const groups=Object.groupBy(data.jobs.filter(j=>j.status!=='applied'&&match(j,data.profile.filters)),j=>j.company);
const [source,target]=Object.values(groups).find(jobs=>jobs.length>1)||[];assert.ok(source&&target,'Discover two matching roles at one company first.');
try{
 const original=await post({action:'baseline',id:source.id});
 await post({action:'status',id:source.id,status:'applied'});
 const reused=await post({action:'baseline',id:target.id});
 assert.equal(reused.kind,'company_reuse');assert.equal(reused.reusedFromVersionId,original.id);assert.deepEqual(reused.content,original.content);assert.equal(reused.companyContext.reusedExact,true);assert.equal(reused.companyContext.selection,'applied');
 console.log('PASS a different role at the same company reuses the applied resume content exactly');
}finally{await post({action:'status',id:source.id,status:source.status||'pending'});}
