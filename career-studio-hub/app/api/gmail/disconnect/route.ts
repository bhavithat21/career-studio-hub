import {withAuthenticatedTenant} from '../../../../lib/auth';
import {disconnectGmail} from '../../../../lib/gmail';
export const runtime='nodejs';
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>Response.json(await disconnectGmail(req.headers),{headers:{'Cache-Control':'no-store'}}));
