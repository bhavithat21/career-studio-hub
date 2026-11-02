'use client';

import {useEffect,useState} from 'react';
import {CheckCircle2,FileText,LockKeyhole,Plus,Save,Upload} from 'lucide-react';
import type {ResumeModel} from '../lib/resume-model';
import {masterResumeEditor,masterResumeText,newRoleHeader} from '../lib/master-resume';

type Draft={base:string;text:string;model:ResumeModel|null;structuredChanged:boolean;mode:'structured'|'text'};
type Props={resume:string;busy:string;perform:(body:unknown,message:string)=>Promise<unknown>;onWritingRules:()=>void};
const emptyModel=():ResumeModel=>({header:[''],summary:'',skills:'',roles:[],projects:'',education:''});
function openDraft(text:string):Draft {
 let model:ResumeModel|null=null;
 try{model=text?masterResumeEditor(text):emptyModel();}catch{}
 return {base:text,text,model,structuredChanged:false,mode:model?'structured':'text'};
}
function draftText(draft:Draft){return draft.mode==='structured'&&draft.structuredChanged&&draft.model?masterResumeText(draft.model):draft.text;}
const lines=(text:string)=>text.split('\n').filter(line=>line.trim()).length;

export function MasterResumePanel({resume,busy,perform,onWritingRules}:Props){
 const [draft,setDraft]=useState(()=>openDraft(resume));
 const [error,setError]=useState('');
 const [feedback,setFeedback]=useState('');
 const [addition,setAddition]=useState({company:'',title:'',years:''});
 let text=draft.text,validation='',inventory:ResumeModel|null=null;
 try{text=draftText(draft);inventory=masterResumeEditor(text);}catch(e){validation=(e as Error).message;}
 const dirty=draft.structuredChanged||draft.text!==draft.base;
 const conflict=resume!==draft.base;
 useEffect(()=>{
  setDraft(current=>{
   if(current.base===resume)return current;
   if(current.structuredChanged||current.text!==current.base)return current;
   return openDraft(resume);
  });
 },[resume]);
 const model=draft.model;
 function edit(update:(model:ResumeModel)=>ResumeModel){
  setDraft(current=>({...current,model:update(current.model||emptyModel()),structuredChanged:true}));setFeedback('');setError('');
 }
 function changeMode(mode:Draft['mode']){
  try{
   const current=draftText(draft);
   setDraft({...draft,text:current,model:mode==='structured'?masterResumeEditor(current):draft.model,structuredChanged:false,mode});
   setError('');
  }catch(e){setError((e as Error).message);}
 }
 function addRole(){
  try{
   const header=newRoleHeader(addition.company,addition.title,addition.years);
   edit(current=>({...current,roles:[...current.roles,{id:'role-'+current.roles.length,header,bullets:['']}]}));
   setAddition({company:'',title:'',years:''});
  }catch(e){setError((e as Error).message);}
 }
 async function save(){
  try{
   const confirmed=draftText(draft);masterResumeEditor(confirmed);
   const saved=await perform({action:'master-resume',resume:confirmed,expectedResume:draft.base},'Master resume saved online. Existing versions remain in history; new drafts use this evidence.');
   if(saved){setDraft(openDraft(confirmed));setFeedback('Saved online');setError('');}
  }catch(e){setError((e as Error).message);}
 }
 return <section className="master-resume-panel panel" aria-labelledby="master-resume-heading">
  <div className="section-heading"><div><div className="eyebrow">YOUR SOURCE OF TRUTH</div><h2 id="master-resume-heading">Master resume & evidence library</h2></div><FileText size={23}/></div>
  <fieldset className="editor-fieldset" disabled={!!busy}>
  <p>Keep your complete, confirmed experience here. Each role resume draws from this library. You maintain the master; AI customizes only the sections allowed in Resume rules.</p>
  <button className="master-writing-link" onClick={onWritingRules}><FileText size={14}/>Set example format & writing prompt</button>
  <div className="master-guide"><LockKeyhole size={18}/><div><strong>Fixed in generated resumes</strong><span>Name, contact details, companies, titles, years, education and projects stay tied to this source. Edit them here when your actual history changes.</span></div></div>
  <div className="master-source-counts" aria-label="Master source inventory"><span><strong>{inventory?.roles.length||0}</strong> employment entries</span><span><strong>{inventory?lines(inventory.skills):0}</strong> skill categories</span><span><strong>{inventory?.roles.reduce((total,role)=>total+role.bullets.filter(b=>b.trim()).length,0)||0}</strong> responsibility bullets</span><span className={validation?'source-needs-review':'source-valid'}><CheckCircle2 size={14}/>{validation?'Structure needs attention':'Structure checked'}</span></div>
  <div className="document-tabs" aria-label="Master editor view"><button className={draft.mode==='structured'?'selected':''} onClick={()=>changeMode('structured')}>Structured editor</button><button className={draft.mode==='text'?'selected':''} onClick={()=>changeMode('text')}><Upload size={13}/>Import / edit text</button></div>
  {conflict&&<div className="warning-box">The saved master changed in another action. Your draft is still here. <button disabled={!!busy} onClick={()=>{setDraft(openDraft(resume));setError('');setFeedback('Loaded current saved master');}}>Discard draft and load saved master</button></div>}
  {draft.mode==='text'?<div className="master-section"><h3>Import your full master resume</h3><p>Use the headings PROFESSIONAL SUMMARY, TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE, TECHNICAL PROJECTS and EDUCATION. Put each employer, title and years on one line, followed by responsibilities beginning with a hyphen.</p><label>Master resume text<textarea rows={22} value={draft.text} onChange={e=>{setDraft({...draft,text:e.target.value,structuredChanged:false});setFeedback('');setError('');}} placeholder="Name and contact details\n\nPROFESSIONAL SUMMARY\nYour confirmed summary\n\nTECHNICAL SKILLS\nLanguages: your confirmed skills\n\nPROFESSIONAL EXPERIENCE\nCompany | Role title | 2022 – Present\n- Your confirmed responsibility\n\nTECHNICAL PROJECTS\nYour projects\n\nEDUCATION\nDegree, school and years"/></label><button disabled={!draft.text.trim()} onClick={()=>changeMode('structured')}>Check structure & open editor</button></div>:model&&<>
   <section className="master-section"><div className="master-section-title"><span className="master-step">01</span><div><h3>Identity & fixed headings</h3><p>Keep the complete lines as they should appear in your resume.</p></div><span className="locked-source-label"><LockKeyhole size={12}/>AI locked</span></div><label>Name, contact details and links · one line per item<textarea rows={4} value={model.header.join('\n')} onChange={e=>edit(current=>({...current,header:e.target.value.split('\n')}))}/></label></section>
   <section className="master-section"><div className="master-section-title"><span className="master-step">02</span><div><h3>Master summary & skills</h3><p>Store the full evidence library. A role resume can emphasize relevant items.</p></div></div><label>Confirmed professional summary<textarea rows={5} value={model.summary} onChange={e=>edit(current=>({...current,summary:e.target.value}))}/></label><label>Master skill categories · one category per line<textarea rows={7} value={model.skills} onChange={e=>edit(current=>({...current,skills:e.target.value}))} placeholder="Languages: …\nFrameworks: …\nCloud & infrastructure: …\nDatabases: …"/></label><p className="fine">Include only skills you can discuss and support. Keep category labels with their skills.</p></section>
   <section className="master-section"><div className="master-section-title"><span className="master-step">03</span><div><h3>Employment & master responsibilities</h3><p>Keep achievements under the employer where you did the work.</p></div></div>{model.roles.map((role,index)=><article className="master-role" key={role.id}><div className="section-heading"><h3>Employment {index+1}</h3><span className="locked-source-label"><LockKeyhole size={12}/>Heading fixed for AI</span></div><label>Company · title · years — complete original heading<input value={role.header} onChange={e=>edit(current=>({...current,roles:current.roles.map(item=>item.id===role.id?{...item,header:e.target.value}:item)}))}/></label><label>Master responsibilities & achievements · one bullet per line<textarea rows={Math.min(12,Math.max(5,role.bullets.length+1))} value={role.bullets.join('\n')} onChange={e=>edit(current=>({...current,roles:current.roles.map(item=>item.id===role.id?{...item,bullets:e.target.value.split('\n')}:item)}))}/></label></article>)}<details className="master-add-role"><summary><Plus size={14}/>Add an employment entry</summary><div className="master-add-fields"><label>Company<input value={addition.company} onChange={e=>setAddition({...addition,company:e.target.value})}/></label><label>Role title<input value={addition.title} onChange={e=>setAddition({...addition,title:e.target.value})}/></label><label>Employment years<input value={addition.years} placeholder="2022 – Present" onChange={e=>setAddition({...addition,years:e.target.value})}/></label></div><button disabled={!addition.company.trim()||!addition.title.trim()||!addition.years.trim()} onClick={addRole}><Plus size={14}/>Add to master draft</button></details></section>
   <section className="master-section"><div className="master-section-title"><span className="master-step">04</span><div><h3>Education & projects</h3><p>These records stay fixed in generated versions.</p></div><span className="locked-source-label"><LockKeyhole size={12}/>AI locked</span></div><label>Education · schools, degrees and years<textarea rows={4} value={model.education} onChange={e=>edit(current=>({...current,education:e.target.value}))}/></label><label>Technical projects<textarea rows={5} value={model.projects} onChange={e=>edit(current=>({...current,projects:e.target.value}))}/></label></section>
  </>}
  {(error||validation)&&<div className="warning-box" role="status">{error||validation}</div>}
  <div className="master-save-bar"><div><strong>{dirty?'Unsaved master changes':feedback||(resume?'Saved master source':'Set up your master source')}</strong><small>{dirty?'Save this evidence before preparing another role.':'Your complete source is separate from role-specific resume versions.'}</small></div><button className="primary" disabled={!!busy||!dirty||!!validation||conflict} onClick={save}><Save size={15}/>Save master resume</button></div>
  </fieldset>
 </section>;
}
