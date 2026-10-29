import {withAuthenticatedTenant,RequestAccessError} from '../../../../lib/auth';
import {sendReviewedFollowUp} from '../../../../lib/gmail';
export const runtime='nodejs';
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>{const input=await req.json().catch(()=>null);if(!input||typeof input!=='object')throw new RequestAccessError('Invalid reviewed follow-up.',400);return Response.json(await sendReviewedFollowUp(input,req.headers),{headers:{'Cache-Control':'no-store'}});});
