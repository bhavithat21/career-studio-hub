import type {Job} from './matching';
import type {ResumeModel} from './resume-model';

export type ConfirmedAnswer={question:string;answer:string;confirmed:true};
export type SubmissionReport={reference:string;receiptUrl:string;notes:string};
const safeUrl=(value:string)=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.toString():'';}catch{return '';}};

export function confirmedAnswers(input:unknown):ConfirmedAnswer[]{
 if(!Array.isArray(input)||input.length>60)throw Error('Application answers must be a list of at most 60 confirmed answers.');
 const seen=new Set<string>();
 return input.map((item:any)=>{
  if(!item||Object.keys(item).some(k=>!['question','answer','confirmed'].includes(k))||typeof item.question!=='string'||typeof item.answer!=='string'||item.confirmed!==true)throw Error('Every application answer needs a question, answer, and your confirmation.');
  const question=item.question.trim(),answer=item.answer.trim(),key=question.toLowerCase();
  if(!question||!answer||question.length>500||answer.length>5000||seen.has(key))throw Error('Application answers must be complete, unique, and within the length limits.');
  seen.add(key);return {question,answer,confirmed:true};
 });
}

// Contact values come only from the locked master header. Missing data stays missing.
export function candidateContact(model:ResumeModel){
 const header=model.header.join('\n');
 const email=header.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/i)?.[0]||'';
 const phone=header.match(/(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}/)?.[0]||'';
 return {name:model.header[0]||'',email,phone,masterHeader:[...model.header]};
}

export function applicationJobSnapshot(job:Job){
 const url=safeUrl(job.url);if(!url)throw Error('The job needs a valid original posting URL.');
 return {id:job.id,source:job.source,sourceName:job.sourceName,url,title:job.title,company:job.company,location:job.location,remote:job.remote,description:job.description,posted:job.posted,validThrough:job.validThrough||'',employment:job.employment,salary:job.salary};
}

export function submissionReport(input:any):SubmissionReport{
 if(!input||Object.keys(input).some(k=>!['reference','receiptUrl','notes'].includes(k)))throw Error('Provide a receipt reference, URL, or submission note.');
 for(const key of ['reference','receiptUrl','notes'])if(input[key]!==undefined&&typeof input[key]!=='string')throw Error('Submission receipt fields must be text.');
 const reference=(input.reference||'').trim(),notes=(input.notes||'').trim(),rawUrl=(input.receiptUrl||'').trim();
 const receiptUrl=rawUrl?safeUrl(rawUrl):'';
 if(rawUrl&&!receiptUrl)throw Error('Receipt URL must be an HTTP or HTTPS link.');
 if(!reference&&!receiptUrl&&!notes)throw Error('Add a confirmation reference, receipt URL, or a note describing the completed submission.');
 if(reference.length>500||receiptUrl.length>2000||notes.length>3000)throw Error('Submission receipt is too long.');
 return {reference,receiptUrl,notes};
}

export async function fingerprint(value:unknown){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
