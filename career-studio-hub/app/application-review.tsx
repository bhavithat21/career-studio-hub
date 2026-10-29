'use client';
import {useState} from 'react';
import {match} from '../lib/matching';
import {ArrowUpRight,CheckCircle2,FileText,ShieldCheck} from 'lucide-react';

const label=(value:string)=>String(value||'pending').replaceAll('_',' ');
export function ApplicationReview({data,perform,busy}:any){
 const [selected,setSelected]=useState(''),[jobId,setJobId]=useState(''),[answers,setAnswers]=useState(''),[confirmed,setConfirmed]=useState(false),[notes,setNotes]=useState(''),[receipt,setReceipt]=useState(''),[submitted,setSubmitted]=useState(false);
 const packets=data.applications||[],packet=packets.find((p:any)=>p.id===selected)||packets[0],payload=packet?.payload;
 const eligible=data.jobs.filter((j:any)=>j.status!=='applied'&&!!match(j,data.profile.filters)&&data.approvals.some((a:any)=>a.jobId===j.id&&a.status==='resume_approved'));
 async function prepare(){
  const parsed=answers.split('\n').filter(line=>line.trim()).map(line=>{const [question,...answer]=line.split('|');return {question:question.trim(),answer:answer.join('|').trim(),confirmed:true};});
  if(await perform({action:'application-plan',id:jobId||eligible[0]?.id,answers:parsed},'Application packet saved for review')){setAnswers('');setConfirmed(false);}
 }
 return <section className="application-section"><div className="section-heading"><div><div className="eyebrow">APPLICATION DETAILS</div><h2>Review what you will send.</h2></div><ShieldCheck size={23}/></div>
 <p>Each packet contains one posting, one resume version, and your confirmed answers. Approving it is separate from approving the resume.</p>
 <div className="rule-layout"><section className="panel"><h3>Prepare a packet</h3>
 {eligible.length?<><label>Role<select aria-label="Application role" value={jobId||eligible[0]?.id} onChange={e=>setJobId(e.target.value)}>{eligible.map((j:any)=><option key={j.id} value={j.id}>{j.company} · {j.title}</option>)}</select></label>
 <label>Confirmed answers · optional<textarea rows={4} value={answers} onChange={e=>{setAnswers(e.target.value);setConfirmed(false);}} placeholder="One per line: Question | Your answer"/></label>
 {answers.trim()&&<label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm these answers are accurate.</label>}
 <button className="primary" disabled={!!busy||!!answers.trim()&&!confirmed} onClick={prepare}><FileText size={15}/>Prepare for review</button><p className="fine">The latest resume needs your approval and a passing independent factual review.</p></>:<p>Approve a saved resume to prepare its application packet.</p>}
 </section><section className="panel"><h3>Saved packets</h3>{packets.length?packets.map((p:any)=><button className={'packet-row '+(packet?.id===p.id?'selected':'')} key={p.id} onClick={()=>{setSelected(p.id);setNotes('');setReceipt('');setSubmitted(false);}}><strong>{p.payload?.job?.company||data.jobs.find((j:any)=>j.id===p.jobId)?.company}</strong><span>{p.payload?.job?.title||'Previous application'}</span><small>{label(p.status)} · resume v{p.payload?.resume?.number||'—'}</small></button>):<p>No application packets yet.</p>}</section></div>
 {packet&&payload&&<section className="panel packet-detail"><div className="section-heading"><div><div className="eyebrow">EXACT PACKET</div><h2>{payload.job.title}</h2><p>{payload.job.company} · {payload.job.location}</p></div><span className="badge">{label(packet.status)}</span></div>
 <div className="packet-facts"><div><span>CANDIDATE</span><strong>{payload.candidate.name}</strong><p>{[payload.candidate.email,payload.candidate.phone].filter(Boolean).join(' · ')}</p></div><div><span>RESUME</span><a href={payload.resume.pdfUrl} target="_blank" rel="noreferrer">Review saved version {payload.resume.number} <ArrowUpRight size={14}/></a></div></div>
 {payload.answers.length>0?<dl className="packet-answers">{payload.answers.map((a:any,i:number)=><div key={i}><dt>{a.question}</dt><dd>{a.answer}</dd></div>)}</dl>:<p>No additional answers saved. Complete any required employer questions on the original portal.</p>}
 <p className="fine">Approval applies to this saved packet. Changes to the posting, resume, or career evidence require a fresh review.</p>
 {packet.status!=='submitted_reported'&&<><label>Application review notes<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="studio-buttons"><button className="primary" disabled={!!busy} onClick={()=>perform({action:'application-review',id:packet.id,decision:'approved',notes},'This application packet is approved')}><CheckCircle2 size={15}/>Approve this packet</button><button disabled={!!busy} onClick={()=>perform({action:'application-review',id:packet.id,decision:'changes_requested',notes},'Application changes requested')}>Request changes</button></div></>}
 {packet.status==='application_approved'&&<div className="submission-record"><h3>Complete on the employer portal</h3><a className="primary" href={payload.job.url} target="_blank" rel="noreferrer">Open original application <ArrowUpRight size={15}/></a><p>Use the approved PDF and confirmed answers, then record the confirmation here.</p><label>Confirmation number or receipt notes<textarea rows={2} value={receipt} onChange={e=>setReceipt(e.target.value)}/></label><label className="check-label"><input type="checkbox" checked={submitted} onChange={e=>setSubmitted(e.target.checked)}/>I completed and submitted this application.</label><button disabled={!!busy||!receipt.trim()||!submitted} onClick={()=>perform({action:'application-submitted',id:packet.id,notes:receipt},'Your submission confirmation was saved')}>Record my submission</button></div>}
 {packet.receipt&&<div className="cloud-note"><CheckCircle2 size={16}/><span>Candidate-reported submission · {new Date(packet.receipt.submittedAt).toLocaleString()}<br/>{packet.receipt.notes||packet.receipt.reference}</span></div>}
 <p className="fine">Automatic submission is unavailable. Career Studio records your confirmation and does not claim an independently verified submission.</p>
 </section>}
 </section>;
}
