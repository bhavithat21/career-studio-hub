import {PDFDocument,StandardFonts,rgb,type PDFFont} from 'pdf-lib';
import type {ResumeModel,Editable} from './resume-model';
const safe=(v:string)=>v.normalize('NFKD').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\n]/g,'');
type Line={text:string;kind:'name'|'contact'|'heading'|'role'|'body'|'bullet'|'gap';indent?:number};
export async function renderResume(model:ResumeModel,edit:Editable,jobDescription=''){
 const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const width=612,height=792,margin=36,usable=height-margin*2;
 const projects:Line[]=[];for(const raw of model.projects.split('\n').filter(Boolean)){const text=raw.trim();if(text.startsWith('-')||text.includes(' | ')||!projects.length)projects.push({text:text.replace(/^-\s*/,''),kind:text.startsWith('-')?'bullet':'body'});else projects[projects.length-1].text+=' '+text;}
 const source:Line[]=[...model.header.map((text,i)=>({text,kind:i?'contact':'name'} as Line)),{text:'SUMMARY',kind:'heading'},{text:edit.summary,kind:'body'},{text:'SKILLS',kind:'heading'},...edit.skills.split('\n').filter(Boolean).map(text=>({text,kind:'body'} as Line)),{text:'EXPERIENCE',kind:'heading'},...model.roles.flatMap(role=>[{text:role.header,kind:'role'} as Line,...(edit.responsibilities.find(r=>r.id===role.id)?.bullets||[]).map(text=>({text,kind:'bullet'} as Line))]),{text:'PROJECTS',kind:'heading'},...projects,{text:'EDUCATION',kind:'heading'},...model.education.split('\n').filter(Boolean).map(text=>({text,kind:'body'} as Line))];
 function fontFor(line:Line){return ['name','heading','role'].includes(line.kind)?bold:regular;}
 function sizeFor(line:Line,size:number){return line.kind==='name'?18:line.kind==='contact'?8.5:line.kind==='heading'?size+0.3:size;}
 function wrap(text:string,font:PDFFont,size:number,max:number){const words=safe(text).split(/\s+/);const out:string[]=[];let line='';for(const word of words){if(font.widthOfTextAtSize(word,size)>max)throw Error('An unbreakable word exceeds the page width.');const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)>max&&line){out.push(line);line=word;}else line=next;}if(line)out.push(line);return out;}
 function layout(size:number){return source.flatMap(line=>wrap(line.text,bold,sizeFor(line,size),width-margin*2-(line.kind==='bullet'?10:0)).map((text,i)=>({...line,text,first:i===0,size:sizeFor(line,size)})));}
 const space=(line:any)=>line.kind==='name'?24:line.kind==='contact'?13:line.kind==='heading'?(line.first?21:13):line.kind==='role'?(line.first?17:12):line.size*1.24;
 let size=10.5,lines=layout(size);while(lines.reduce((sum,line)=>sum+space(line),0)>usable&&size>9){size=Math.round((size-.25)*100)/100;lines=layout(size);}
 const used=lines.reduce((sum,line)=>sum+space(line),0);if(used>usable)throw Error('Draft exceeds one page at readable size. Shorten Summary or Responsibilities and render again.');
 const extra=Math.min(2,(usable-used)/Math.max(lines.length,1));let y=height-margin;
 const page=doc.addPage([width,height]);
 const technologies=['Java','JavaScript','Python','AWS','Kafka','Docker','SQL','TypeScript','React','distributed systems','Redis','PostgreSQL','MySQL','Spring Boot','Flask','FastAPI','CI/CD','Kubernetes'];
 const highlighted=technologies.filter(term=>!jobDescription||jobDescription.toLowerCase().includes(term.toLowerCase()));
 const escaped=highlighted.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const keywords=new RegExp('\\b('+[...escaped,'\\d+(?:\\.\\d+)?(?:%|\\+|ms|M|K)'].join('|')+')(?![a-zA-Z0-9])','gi');
 for(const line of lines){y-=space(line)+extra;if(line.kind==='heading')page.drawLine({start:{x:margin,y:y-3},end:{x:width-margin,y:y-3},thickness:.45,color:rgb(.75,.78,.78)});
  let x=margin+(line.kind==='bullet'?10:0);if(line.kind==='bullet'&&line.first)page.drawText('-',{x:margin,y,size:line.size,font:regular,color:rgb(.2,.24,.25)});
  if(['body','bullet'].includes(line.kind)){let end=0;for(const m of line.text.matchAll(keywords)){const before=line.text.slice(end,m.index);page.drawText(before,{x,y,size:line.size,font:regular});x+=regular.widthOfTextAtSize(before,line.size);page.drawText(m[0],{x,y,size:line.size,font:bold});x+=bold.widthOfTextAtSize(m[0],line.size);end=m.index!+m[0].length;}page.drawText(line.text.slice(end),{x,y,size:line.size,font:regular});}
  else page.drawText(line.text,{x,y,size:line.size,font:fontFor(line),color:line.kind==='heading'?rgb(.1,.27,.24):rgb(.08,.12,.14)});
 }
 doc.setTitle(model.header[0]+' - Resume');doc.setAuthor(model.header[0]);
 return {bytes:await doc.save(),layout:{pages:1,fontSize:size,bottomMargin:Math.round(y),passed:y>=margin-3,fillPercent:Math.round((height-margin-y)/usable*100)}};
}
