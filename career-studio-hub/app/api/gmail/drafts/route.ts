import {withAuthenticatedTenant,RequestAccessError} from '../../../../lib/auth';
import {saveFollowUpDraft} from '../../../../lib/gmail';
export const runtime='nodejs';
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>{const input=await req.json().catch(()=>null);if(!input||typeof input!=='object')throw new RequestAccessError('Invalid follow-up draft.',400);return Response.json(await saveFollowUpDraft(input,req.headers),{headers:{'Cache-Control':'no-store'}});});
export const PUT=POST;
