import test from 'node:test';
import assert from 'node:assert/strict';
import {companyIdentity,selectCompanyResume} from '../lib/company-resume.ts';
const jobs=[{id:'current',company:'Example, Inc.'},{id:'old',company:'Example LLC'},{id:'other',company:'Different Example'}];
const content={summary:'Evidence. Second sentence. Third sentence.',skills:'Java',responsibilities:[{id:'role-0',bullets:['First','Second','Third','Fourth']}]};
const version=(id,jobId,day)=>({id,jobId,createdAt:'2026-10-'+day+'T10:00:00Z',number:Number(day),model:{},content});
test('company identity handles formatting without guessing related brands',()=>{
 assert.equal(companyIdentity('Example, Inc.'),companyIdentity('EXAMPLE LLC'));
 assert.notEqual(companyIdentity('Amazon'),companyIdentity('Amazon Web Services'));
 assert.notEqual(companyIdentity('Example'),companyIdentity('Different Example'));
 assert.equal(companyIdentity('Confidential'), '');
});
test('an exact submitted resume wins over a newer draft and applied-role variant',()=>{
 const versions=[version('submitted','old','01'),version('newer','old','20'),version('unrelated','other','25')];
 const result=selectCompanyResume('Example Inc','current',versions,jobs.map(job=>job.id==='old'?{...job,status:'applied'}:job),[],[{versionId:'submitted',reportedBy:'candidate',submittedAt:'2026-10-02'}]);
 assert.equal(result.version.id,'submitted');assert.equal(result.selection,'submitted');assert.equal(result.version.content,content);
 assert.equal(result.version.content.responsibilities[0].bullets.length,4);
});
test('applied history wins, then candidate-approved, then latest',()=>{
 const versions=[version('oldest','old','01'),version('newest','old','20')];
 assert.equal(selectCompanyResume('Example','current',versions,jobs, [{versionId:'oldest',status:'resume_approved'}]).version.id,'oldest');
 assert.equal(selectCompanyResume('Example','current',versions,jobs).version.id,'newest');
 const allJobs=[...jobs,{id:'applied',company:'Example',status:'applied'}];
 assert.equal(selectCompanyResume('Example','current',[...versions,version('applied-resume','applied','02')],allJobs,[{versionId:'newest',status:'resume_approved'}]).selection,'applied');
});
test('no company history is invented from unrelated or unknown employers',()=>{
 assert.equal(selectCompanyResume('Missing Company','current',[version('x','other','01')],jobs),null);
 assert.equal(selectCompanyResume('Unknown','current',[version('x','other','01')],jobs),null);
 assert.equal(selectCompanyResume('Example','current',[version('x','current','01')],jobs),null);
});
test('historical candidate approval survives newer drafts but a later rejection revokes its priority',()=>{
 const versions=[version('approved-old','old','01'),version('draft-new','old','20')];
 const approved={versionId:'approved-old',status:'resume_approved',updatedAt:'2026-10-02T10:00:00Z'};
 assert.equal(selectCompanyResume('Example','current',versions,jobs,[approved]).version.id,'approved-old');
 const rejected={...approved,status:'changes_requested',updatedAt:'2026-10-03T10:00:00Z'};
 assert.equal(selectCompanyResume('Example','current',versions,jobs,[approved,rejected]).version.id,'draft-new');
});
