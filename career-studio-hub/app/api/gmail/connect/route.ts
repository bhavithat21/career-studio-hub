import {withAuthenticatedTenant,RequestAccessError} from '../../../../lib/auth';
import {beginGmailConnection} from '../../../../lib/gmail';
export const runtime='nodejs';
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>{const input=await req.json().catch(()=>null);if(input?.consent!==true)throw new RequestAccessError('Confirm Gmail read and send permission to connect. Basic Google sign-in remains available without Gmail.',400);return beginGmailConnection(req.headers);});
