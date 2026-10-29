import {putPdf} from './pdf-storage';
import {PDFDocument} from 'pdf-lib';
import {read,write,claim,unlock} from './store';
import {parseResume,baseEditable,assemble} from './resume-model';
import {fingerprint} from './application-packet';
import {validateHistoricalImport,historyDigest} from './history-input';

export async function importHistoricalApplication(input:unknown){
 const {entry,bytes}=validateHistoricalImport(input),pdfSha256=await historyDigest(bytes);
 const {pdfBase64,...metadata}=entry;
 const inputFingerprint=await fingerprint({...metadata,pdfSha256}),jobId='history:'+entry.id;
 const lock='lock:version:'+jobId;if(!await claim(lock))throw Error('This historical application is being updated. Try again shortly.');
 try{
  const previous:any=await read('history-import:'+entry.id,null);
  if(previous){if(previous.inputFingerprint!==inputFingerprint)throw Error('This historical ID already identifies different evidence or a different PDF. Use a new ID rather than overwriting application history.');return {...previous,idempotent:true};}
  const p:any=await read('profile',{});if(!p.resume)throw Error('Save the master resume before importing historical applications.');
  let original:PDFDocument;try{original=await PDFDocument.load(bytes,{updateMetadata:false});}catch{throw Error('The original PDF could not be read or is encrypted.');}
  const pages=original.getPageCount();if(!pages)throw Error('The original PDF contains no pages.');
  const model=parseResume(p.resume),content=baseEditable(model),versionId='history:'+entry.id+':resume',applicationId='history:'+entry.id+':application',pdfKey='resumes/history/'+entry.id+'.pdf',importedAt=new Date().toISOString();
  const version:any=await read('version:'+versionId,null);
  if(version&&version.historyImportFingerprint!==inputFingerprint)throw Error('Historical resume identity conflicts with a different imported artifact.');
  await putPdf(pdfKey,bytes,{historyId:entry.id,pdfSha256});
  const provenance={type:'existing_tracker',sourceEvidence:entry.sourceEvidence,submittedAt:entry.submittedAt,submissionDatePrecision:/^\d{4}-\d{2}-\d{2}$/.test(entry.submittedAt)?'day':'timestamp',importedAt,pdfSha256,candidateReported:true,verifiedByCurrentWorker:false};
  if(!version)await write('version:'+versionId,{id:versionId,jobId,number:1,kind:'imported_history',model,content,text:assemble(model,content),pdfKey,createdAt:entry.submittedAt,importedAt,layout:{pages,fontSize:null,bottomMargin:null,fillPercent:null,passed:false,imported:true,assessed:false},flags:['Historical original PDF imported without a fresh layout or factual approval. Editable text is a current-master snapshot, not text extracted from this artifact.'],review:null,approval:'historical_submission',historyImportFingerprint:inputFingerprint,provenance,modelSource:'current_master_snapshot_not_pdf_extraction'});
  const job:any=await read('job:'+jobId,null);
  if(!job)await write('job:'+jobId,{id:jobId,source:'historical',sourceName:'Confirmed application history',url:entry.url,title:entry.title,company:entry.company,location:entry.location,description:'Previously submitted application imported from the existing job-search tracker. '+entry.sourceEvidence,posted:'',remote:false,salary:'',salaryMin:0,employment:'',status:'applied',firstSeen:entry.submittedAt,lastSeen:importedAt,submittedAt:entry.submittedAt,provenance});
  if(!await read('latest:'+jobId,null))await write('latest:'+jobId,versionId);
  if(!await read('approval:'+jobId,null))await write('approval:'+jobId,{jobId,versionId,status:'historical_submission',updatedAt:importedAt,message:'Existing tracker records this past submission. This is historical evidence, not a new candidate or AI approval.',sourceEvidence:entry.sourceEvidence});
  const receipt={id:applicationId,applicationId,jobId,versionId,status:'historical_submission',reportedBy:'candidate',candidateReported:true,source:'existing_tracker',verifiedByWorker:false,submittedAt:entry.submittedAt,createdAt:entry.submittedAt,importedAt,updatedAt:importedAt,sourceEvidence:entry.sourceEvidence,originalPostingUrl:entry.url,pdfSha256,message:'Past submission imported from confirmed tracker evidence with the original supplied PDF. No new application was submitted.'};
  if(!await read('application:'+jobId,null))await write('application:'+jobId,receipt);
  if(!await read('application-receipt:'+applicationId,null))await write('application-receipt:'+applicationId,receipt);
  const result={historyId:entry.id,jobId,versionId,applicationId,inputFingerprint,pdfSha256,pages,submittedAt:entry.submittedAt,importedAt,sourceEvidence:entry.sourceEvidence,status:'historical_submission'};
  await write('event:history:'+entry.id,{...result,type:'historical_application_imported',candidateReported:true,verifiedByWorker:false});
  await write('history-import:'+entry.id,result);return result;
 }finally{await unlock(lock);}
}
