import {handleCallback} from '@vercel/queue';
import {consumeDiscoveryMessage,discoveryQueueRetry,authenticateDiscoveryRequest} from '../../../../lib/discovery-queue';
export const runtime='nodejs';
export const maxDuration=300;
// Managed trigger delivery is private. Next.js also exposes this route, so authenticate before SDK broker calls.
const callback=handleCallback(consumeDiscoveryMessage,{visibilityTimeoutSeconds:300,retry:discoveryQueueRetry});
export const POST=async(req:Request)=>{let authenticated:Request;try{authenticated=await authenticateDiscoveryRequest(req);}catch{return Response.json({error:'Authenticated inline queue delivery required.'},{status:403});}return callback(authenticated);};
