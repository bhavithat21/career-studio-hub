export type HistoricalApplicationInput={id:string;company:string;title:string;url:string;location:string;submittedAt:string;sourceEvidence:string;pdfBase64:string};
const fields=['id','company','title','url','location','submittedAt','sourceEvidence','pdfBase64'];
const maxPdfBytes=2*1024*1024;

export function validateHistoricalImport(input:unknown,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Historical application must be an object.');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).some(key=>!fields.includes(key))||fields.some(key=>typeof value[key]!=='string'||!(value[key] as string).trim()))throw Error('Historical application needs exactly the supported fields, including evidence and the original PDF.');
 const entry=Object.fromEntries(fields.map(key=>[key,(value[key] as string).trim()])) as HistoricalApplicationInput;
 if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(entry.id))throw Error('Historical application ID must be a stable lowercase identifier.');
 if(entry.company.length>200||entry.title.length>300||entry.location.length>300||entry.sourceEvidence.length>6000||entry.url.length>2000)throw Error('Historical application metadata exceeds its length limit.');
 let url:URL;try{url=new URL(entry.url);}catch{throw Error('Historical application URL must be HTTP or HTTPS.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Historical application URL must be HTTP or HTTPS without credentials.');
 const date=Date.parse(entry.submittedAt);if(!Number.isFinite(date)||date>now+300000)throw Error('Historical submission date must be valid and in the past.');
 if(entry.pdfBase64.length>Math.ceil(maxPdfBytes/3)*4||entry.pdfBase64.length%4!==0||! /^[A-Za-z0-9+/]+={0,2}$/.test(entry.pdfBase64))throw Error('Original PDF must be valid base64 and at most 2 MB.');
 let binary:string;try{binary=atob(entry.pdfBase64);}catch{throw Error('Original PDF must be valid base64.');}
 if(btoa(binary)!==entry.pdfBase64||binary.length>maxPdfBytes||binary.length<8||!binary.startsWith('%PDF-'))throw Error('Original file must be a PDF of at most 2 MB.');
 const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
 return {entry:{...entry,url:url.toString(),submittedAt:/^\d{4}-\d{2}-\d{2}$/.test(entry.submittedAt)?entry.submittedAt:new Date(date).toISOString()},bytes};
}

export async function historyDigest(bytes:Uint8Array){
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
