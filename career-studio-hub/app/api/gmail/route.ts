import {withAuthenticatedTenant} from '../../../lib/auth';
import {getGmailWorkspace} from '../../../lib/gmail';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(req:Request)=>withAuthenticatedTenant(req,async()=>Response.json(await getGmailWorkspace(),{headers:{'Cache-Control':'no-store'}}));
