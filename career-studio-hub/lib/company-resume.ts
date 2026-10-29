import type {Editable,ResumeModel} from './resume-model';

type CompanyJob={id:string;company:string;status?:string};
type CompanyVersion={id:string;jobId:string;createdAt?:string;number?:number;model:ResumeModel;content:Editable};
type Approval={versionId?:string;status?:string;updatedAt?:string};
type ApplicationReference={versionId?:string;status?:string;reportedBy?:string;submittedAt?:string};
export type CompanyResumeEvidence<T extends CompanyVersion=CompanyVersion>={version:T;company:string;selection:'submitted'|'applied'|'approved'|'latest'};

// Exact company identity after formatting/legal-suffix cleanup. Do not guess parent/brand aliases.
export function companyIdentity(value:string){
 let name=String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 let previous='';while(name!==previous){previous=name;name=name.replace(/\s+(?:incorporated|inc|llc|ltd|limited|corporation|corp|company|co|plc)$/,'').trim();}
 return /^(?:|unknown|unknown company|not specified|not provided|confidential|confidential company|n a)$/.test(name)?'':name;
}

export function selectCompanyResume<T extends CompanyVersion>(company:string,currentJobId:string,versions:T[],jobs:CompanyJob[],approvals:Approval[]=[],applications:ApplicationReference[]=[]):CompanyResumeEvidence<T>|null{
 const identity=companyIdentity(company);if(!identity)return null;
 const related=new Map(jobs.filter(job=>job.id!==currentJobId&&companyIdentity(job.company)===identity).map(job=>[job.id,job]));
 const submitted=new Set(applications.filter(application=>application.status==='submitted_reported'||application.reportedBy==='candidate'&&!!application.submittedAt).map(application=>application.versionId));
 const decisions=new Map<string,Approval>();for(const approval of [...approvals].sort((a,b)=>(Date.parse(b.updatedAt||'')||0)-(Date.parse(a.updatedAt||'')||0)))if(approval.versionId&&!decisions.has(approval.versionId))decisions.set(approval.versionId,approval);
 const approved=new Set([...decisions.values()].filter(approval=>approval.status==='resume_approved').map(approval=>approval.versionId));
 const priority=(version:T)=>submitted.has(version.id)?0:related.get(version.jobId)?.status==='applied'?1:approved.has(version.id)?2:3;
 const candidates=versions.filter(version=>related.has(version.jobId)).sort((a,b)=>priority(a)-priority(b)||(Date.parse(b.createdAt||'')||0)-(Date.parse(a.createdAt||'')||0)||(b.number||0)-(a.number||0)||b.id.localeCompare(a.id));
 const version=candidates[0];if(!version)return null;
 return {version,company:related.get(version.jobId)!.company,selection:(['submitted','applied','approved','latest'] as const)[priority(version)]};
}
