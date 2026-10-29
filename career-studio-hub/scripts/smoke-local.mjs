import fs from 'node:fs';
const base='http://127.0.0.1:8787';
async function post(b){const r=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw Error(await r.text());return r.json();}
const workspace=await fetch(base+'/api/workspace').then(r=>r.json());console.log('Workspace:',workspace.sources.length,'sources');
await post({action:'resume',resume:fs.readFileSync('.sites-runtime/master-resume.txt','utf8'),autoPrepare:true});
for(const source of ['remotive','jobicy','remoteok','select','brooksource','doordash','mindset'])console.log(source,await post({action:'discover',source}));
const after=await fetch(base+'/api/workspace').then(r=>r.json());console.log('Persisted jobs:',after.jobs.length,'Tasks:',after.tasks.length);
console.log('Pipeline readiness:',await post({action:'tick'}));
