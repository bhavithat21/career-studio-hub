import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview,hasApprovedReview,sameMaster} from '../lib/review-validation.ts';

test('only an explicit boolean approval with no issues passes the independent gate',()=>{
 assert.equal(hasApprovedReview({approved:true,issues:[],feedback:'Supported by source evidence.'}),true);
 for(const value of [null,{},true,{approved:'true',issues:[],feedback:''},{approved:1,issues:[],feedback:''},{approved:false,issues:[],feedback:''},{approved:true,issues:['Unsupported responsibility'],feedback:''},{approved:true,issues:[],feedback:'',override:true}])assert.equal(hasApprovedReview(value),false);
});
test('malformed or contradictory reviews cannot be persisted as approvals',()=>{
 assert.throws(()=>validateReview({approved:true,issues:['Unconfirmed metric'],feedback:'Needs changes'}),/unresolved issues/);
 assert.throws(()=>validateReview({approved:true,issues:[{}],feedback:''}),/invalid review/);
 assert.throws(()=>validateReview({approved:true,issues:[]}),/invalid review/);
 assert.deepEqual(validateReview({approved:false,issues:['  Unconfirmed skill  '],feedback:'  Revise.  '}),{approved:false,issues:['Unconfirmed skill'],feedback:'Revise.'});
});
test('master snapshots require exact evidence identity',()=>{
 const model={header:['Candidate'],summary:'Engineer',skills:'Java',roles:[],projects:'',education:''};
 assert.equal(sameMaster(model,structuredClone(model)),true);
 assert.equal(sameMaster(undefined,model),false);
 assert.equal(sameMaster(model,{...model,skills:'Java, Python'}),false);
 assert.equal(sameMaster(model,{...model,header:['Another candidate']}),false);
});
