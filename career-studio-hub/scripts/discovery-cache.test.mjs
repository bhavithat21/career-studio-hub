import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const pipeline=stripTypeScriptTypes((await readFile(new URL('../lib/pipeline.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''));
let instance=0;
async function harness(){
 const stub=`import {defaults,match,canonical} from ${JSON.stringify(new URL('../lib/matching.ts',import.meta.url).href)};
 const DEFAULT_CLAUDE_MODEL='unit-default',requireTenantId=()=> 'test-tenant';
 const env={},sources=[{id:'test',adapter:'test'}],db=new Map(),calls=[],locks=new Set();let fail=false;
 const read=async(k,v)=>db.has(k)?db.get(k):v,write=async(k,v)=>db.set(k,v),list=async()=>[],claim=async k=>{locks.add(k);return true},unlock=async k=>locks.delete(k);
 const pull=async(id,fetcher,cursor)=>{calls.push(cursor);if(fail)throw Error('network failure');return {jobs:[],status:'working',message:'ok',cursor:cursor+1}};
 export const harness={db,calls,locks,setFail:v=>fail=v};`;
 return import('data:text/javascript;base64,'+Buffer.from(stub+'\n'+pipeline+'\n//'+instance++).toString('base64'));
}
test('unchanged filters use TTL; broadened filters repull and preserve pagination',async()=>{
 const m=await harness();await m.discover('test');const health=m.harness.db.get('health:test');assert.ok(health.filterKey);assert.ok(health.successAt);
 assert.equal((await m.discover('test')).cached,true);assert.deepEqual(m.harness.calls,[0]);
 const p=await m.profile();m.harness.db.set('profile',{...p,filters:{...p.filters,maxAge:0,excludeSenior:false,maxRequiredExperienceYears:6}});
 const result=await m.discover('test');assert.equal(result.cached,undefined);assert.deepEqual(m.harness.calls,[0,1]);assert.equal(result.cursor,2);assert.equal(m.harness.locks.size,0);
});
test('changing only the required experience ceiling invalidates discovery cache',async()=>{
 const m=await harness(),p=await m.profile();
 m.harness.db.set('profile',{...p,filters:{...p.filters,maxAge:0,excludeSenior:false,maxRequiredExperienceYears:4}});
 await m.discover('test');assert.equal((await m.discover('test')).cached,true);
 const before=await m.profile();m.harness.db.set('profile',{...before,filters:{...before.filters,maxRequiredExperienceYears:6}});
 const result=await m.discover('test');assert.equal(result.cached,undefined);assert.deepEqual(m.harness.calls,[0,1]);
 assert.equal((await m.discover('test')).cached,true);assert.deepEqual(m.harness.calls,[0,1]);
});
test('legacy health without filter key cannot suppress newly broadened discovery',async()=>{
 const m=await harness();m.harness.db.set('health:test',{adapter:'test',successAt:new Date().toISOString(),cursor:40});await m.discover('test');assert.deepEqual(m.harness.calls,[40]);
});
test('failure retains cursor and does not become a successful cache entry',async()=>{
 const m=await harness();m.harness.db.set('health:test',{cursor:9});m.harness.setFail(true);const result=await m.discover('test');assert.equal(result.status,'failed');assert.equal(result.cursor,9);assert.equal(result.successAt,undefined);assert.equal(m.harness.locks.size,0);
 m.harness.setFail(false);await m.discover('test');assert.deepEqual(m.harness.calls,[9,9]);
});
test('filter key is independent of property order and source selections',async()=>{
 const m=await harness(),p=await m.profile();const shuffled=Object.fromEntries(Object.entries(p.filters).reverse());assert.equal(m.discoveryFilterKey(p.filters),m.discoveryFilterKey({...shuffled,sources:['other']}));assert.notEqual(m.discoveryFilterKey(p.filters),m.discoveryFilterKey({...p.filters,excludedCompanies:''}));
});
