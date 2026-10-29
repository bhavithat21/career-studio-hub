import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as model from '../lib/resume-model.ts';
import * as validation from '../lib/review-validation.ts';

const source=await fs.readFile(new URL('../lib/versions.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const master='Candidate\nPROFESSIONAL SUMMARY\nBuilt Java services.\nTECHNICAL SKILLS\nJava, SQL\nPROFESSIONAL EXPERIENCE\nExample Company | Engineer | 2020 - Present\n- Built Java services.\nTECHNICAL PROJECTS\nA service project.\nEDUCATION\nExample University | 2016 - 2020';
function harness(){
 const records=new Map([['profile',{resume:master}],['job:job',{id:'job',title:'Software Engineer',description:'Java services',company:'Employer'}]]),locks=new Set(),uploads=[];
 const dependencies={
  'cloudflare:workers':{env:{BUCKET:{put:async(...args)=>uploads.push(args)}}},
  './store':{read:async(k,fallback)=>structuredClone(records.has(k)?records.get(k):fallback),write:async(k,v)=>records.set(k,structuredClone(v)),list:async p=>[...records].filter(([k])=>k.startsWith(p)).map(([,v])=>structuredClone(v)),claim:async k=>{if(locks.has(k))return false;locks.add(k);return true;},unlock:async k=>locks.delete(k)},
  './resume-model':model,'./review-validation':validation,
  './resume-pdf':{renderResume:async()=>({bytes:new Uint8Array([1]),layout:{passed:true,pages:1,fontSize:10}})},
  './company-resume':{selectCompanyResume:()=>null}
 };
 const module={exports:{}};
 new Function('require','module','exports',compiled)(name=>dependencies[name],module,module.exports);
 return {...module.exports,records,locks,uploads};
}
test('Stale optimization context before or during rendering leaves no saved PDF, version or approval',async()=>{
 for(const failAt of [1,2]){
  const h=harness();let calls=0;
  await assert.rejects(h.saveVersion('job',undefined,'claude_optimization',undefined,undefined,undefined,async()=>{if(++calls===failAt)throw Error('Context changed');}),/Context changed/);
  assert.equal(h.uploads.length,0);assert.equal([...h.records.keys()].some(k=>k.startsWith('version:')||k.startsWith('approval:')),false);assert.equal(h.locks.size,0);
 }
});
test('A guarded draft preserves lineage and resets approval after saving online',async()=>{
 const h=harness();let calls=0;
 const version=await h.saveVersion('job',undefined,'claude_optimization',{approved:true,issues:[],feedback:'Source supported.'},undefined,{reviewMethod:'claude_independent_review',preparationMode:'claude_optimization',sourceVersionId:'original',optimizationScoreId:'score'},async()=>{calls++;});
 assert.equal(calls,2);assert.equal(h.uploads.length,1);assert.equal(version.sourceVersionId,'original');assert.equal(version.optimizationScoreId,'score');assert.equal(h.records.get('approval:job').status,'awaiting_review');assert.equal(h.records.get('task:job').versionId,version.id);assert.equal(h.records.get('task:job').stage,'ready_for_review');assert.equal(h.locks.size,0);
});
