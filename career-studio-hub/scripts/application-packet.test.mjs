import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedAnswers,candidateContact,submissionReport,fingerprint} from '../lib/application-packet.ts';

test('Application answers require explicit confirmation and reject duplicate questions',()=>{
 assert.throws(()=>confirmedAnswers([{question:'Work authorization',answer:'Yes'}]),/confirmation/);
 assert.throws(()=>confirmedAnswers([{question:'Sponsorship',answer:'No',confirmed:true},{question:'sponsorship',answer:'Yes',confirmed:true}]),/unique/);
 assert.deepEqual(confirmedAnswers([{question:'Location',answer:'Seattle',confirmed:true}]),[{question:'Location',answer:'Seattle',confirmed:true}]);
});
test('Contact extraction uses only locked header and leaves missing fields empty',()=>{
 assert.deepEqual(candidateContact({header:['Candidate Name','Seattle, WA']}),{name:'Candidate Name',email:'',phone:'',masterHeader:['Candidate Name','Seattle, WA']});
 const contact=candidateContact({header:['Candidate Name','candidate@example.com | +1 206-555-1234']});
 assert.equal(contact.email,'candidate@example.com');assert.equal(contact.phone,'+1 206-555-1234');
});
test('A submission report requires evidence text and rejects script receipt links',()=>{
 assert.throws(()=>submissionReport({}),/confirmation/);
 assert.throws(()=>submissionReport({receiptUrl:'javascript:alert(1)'}),/HTTP/);
 assert.deepEqual(submissionReport({reference:'REQ-123'}),{reference:'REQ-123',receiptUrl:'',notes:''});
});
test('Exact-payload fingerprint changes when an answer or resume version changes',async()=>{
 const a={resume:'v1',answer:'Seattle'},b={resume:'v2',answer:'Seattle'},c={resume:'v1',answer:'Bellevue'};
 assert.equal(await fingerprint(a),await fingerprint({...a}));assert.notEqual(await fingerprint(a),await fingerprint(b));assert.notEqual(await fingerprint(a),await fingerprint(c));
});
