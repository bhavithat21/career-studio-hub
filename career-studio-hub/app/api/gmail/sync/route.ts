import {withAuthenticatedTenant} from '../../../../lib/auth';
import {syncGmail} from '../../../../lib/gmail';
export const runtime='nodejs';
export const POST=(req:Request)=>withAuthenticatedTenant(req,async()=>Response.json(await syncGmail(req.headers),{headers:{'Cache-Control':'no-store'}}));
