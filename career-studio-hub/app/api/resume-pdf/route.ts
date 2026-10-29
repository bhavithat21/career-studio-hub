import {getPdf} from '../../../lib/pdf-storage';
import {read} from '../../../lib/store';
import {withAuthenticatedTenant} from '../../../lib/auth';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(req:Request)=>withAuthenticatedTenant(req,async()=>{const id=new URL(req.url).searchParams.get('id')||'';const version:any=await read('version:'+id,null);if(!version)return new Response('Resume not found',{status:404});const object=await getPdf(version.pdfKey);if(!object)return new Response('PDF not found',{status:404});return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="resume-v'+version.number+'.pdf"','Cache-Control':'private, no-store'}});});
