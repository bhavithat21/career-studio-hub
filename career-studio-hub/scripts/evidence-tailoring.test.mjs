import test from 'node:test';
import assert from 'node:assert/strict';
import {tailorEvidence,validateEvidenceContent,repairSkillWrapping} from '../lib/evidence-tailoring.ts';
const model={header:['Candidate'],summary:'Built Python services. Operated Java AWS systems. Delivered React interfaces.',skills:'Frontend: React\nBackend: Java, Python\nCloud: AWS',roles:[{id:'r0',header:'Employer 2020 - Present',bullets:['Delivered React interfaces.','Built Java services.','Operated AWS systems.','Automated Python tests.']}],projects:'Original project',education:'Original degree'};
const rules={summary:true,skills:true,responsibilities:true,instructions:'',reference:''};
test('wrapped skill categories stay together and disconnected continuations fail review',()=>{
 const wrapped={...model,skills:'AI: Retrieval, AI-Augmented\nDevelopment (Kiro, Claude)\nLanguages: Java, Python'};
 const edit=tailorEvidence(wrapped,'Java Python languages',rules);
 assert.equal(edit.skills,'Languages: Java, Python\nAI: Retrieval, AI-Augmented\nDevelopment (Kiro, Claude)');
 assert.equal(validateEvidenceContent(wrapped,edit,rules).approved,true);
 const broken='AI: Retrieval, AI-Augmented\nLanguages: Java, Python\nDevelopment (Kiro, Claude)';
 assert.equal(validateEvidenceContent(wrapped,{...edit,skills:broken},rules).approved,false);
 assert.equal(repairSkillWrapping(wrapped.skills,broken),wrapped.skills);
});
test('relevance ranking retains exact source statements and employer association',()=>{
 const result=tailorEvidence(model,'Java AWS backend engineer',rules);assert.equal(result.summary,'Operated Java AWS systems. Built Python services.');assert.equal(result.skills.split('\n')[0],'Backend: Java, Python');assert.deepEqual(result.responsibilities[0].bullets,['Built Java services.','Operated AWS systems.','Delivered React interfaces.']);assert.equal(validateEvidenceContent(model,result,rules).approved,true);
});
test('disabled regions remain exact and overflow fallback only reduces bullet count',()=>{
 const locked=tailorEvidence(model,'Java AWS',{...rules,summary:false,skills:false,responsibilities:false},2);assert.equal(locked.summary,model.summary);assert.equal(locked.skills,model.skills);assert.deepEqual(locked.responsibilities[0].bullets,model.roles[0].bullets);
 const shorter=tailorEvidence(model,'Java AWS',rules,2);assert.deepEqual(shorter.responsibilities[0].bullets,['Built Java services.','Operated AWS systems.']);
});
test('invented wording, transferred responsibilities and locked-field injections fail',()=>{
 const content=tailorEvidence(model,'Java AWS',rules);assert.equal(validateEvidenceContent(model,{...content,summary:'Reduced cost 99%.'},rules).approved,false);assert.equal(validateEvidenceContent(model,{...content,skills:'Kubernetes'},rules).approved,false);assert.equal(validateEvidenceContent(model,{...content,responsibilities:[{id:'r0',bullets:['Built Kubernetes platforms.']}]},rules).approved,false);assert.equal(validateEvidenceContent(model,{...content,education:'Invented degree'},rules).approved,false);assert.equal(validateEvidenceContent(model,content,{...rules,summary:false}).approved,false);
});
test('existing source facts cannot be transferred between employers or erased',()=>{
 const multiple={...model,roles:[...model.roles,{id:'r1',header:'Other Employer 2018 - 2020',bullets:['Built a payment ledger.']}]};const content=tailorEvidence(multiple,'payments',rules);content.responsibilities[0].bullets=['Built a payment ledger.'];assert.equal(validateEvidenceContent(multiple,content,rules).approved,false);
 const normal=tailorEvidence(model,'Java',rules);assert.equal(validateEvidenceContent(model,{...normal,summary:''},rules).approved,false);assert.equal(validateEvidenceContent(model,{...normal,skills:''},rules).approved,false);
});
