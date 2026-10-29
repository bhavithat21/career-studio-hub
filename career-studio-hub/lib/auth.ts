import {betterAuth} from 'better-auth';
import {nextCookies} from 'better-auth/next-js';
import {getDb} from '../db';
import {runWithTenant} from './tenant';

export const BASIC_GOOGLE_SCOPES=['openid','email','profile'];
export class RequestAccessError extends Error{status:number;constructor(message:string,status=401){super(message);this.status=status;}}
export function getAuthReadiness(){const missing=['DATABASE_URL','BETTER_AUTH_SECRET','BETTER_AUTH_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'].filter(key=>!process.env[key]);if(process.env.BETTER_AUTH_SECRET&&process.env.BETTER_AUTH_SECRET.length<32)missing.push('BETTER_AUTH_SECRET (minimum 32 characters)');return {configured:missing.length===0,missing,google:true,gmailOptIn:true};}
export function getAuthPool(){if(!process.env.DATABASE_URL)throw new RequestAccessError('Database setup is required.',503);return getDb();}
function createAuth(){
 const readiness=getAuthReadiness();if(!readiness.configured)throw new RequestAccessError('Google sign-in setup is incomplete. Configure the server environment.',503);
 return betterAuth({appName:'Career Studio Hub',baseURL:process.env.BETTER_AUTH_URL,secret:process.env.BETTER_AUTH_SECRET,database:getAuthPool(),emailAndPassword:{enabled:false},socialProviders:{google:{clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,disableDefaultScope:true,scope:BASIC_GOOGLE_SCOPES,disableIdTokenSignIn:true,prompt:'select_account'}},account:{encryptOAuthTokens:true,storeStateStrategy:'database',storeAccountCookie:false,accountLinking:{enabled:true,allowDifferentEmails:false,disableImplicitLinking:true}},session:{expiresIn:60*60*24*7,cookieCache:{enabled:false}},rateLimit:{enabled:true,storage:'database',window:60,max:60},logger:{disabled:true},plugins:[nextCookies()]});
}
let instance:ReturnType<typeof createAuth>|undefined;
export function getAuth(){return instance??=createAuth();}
export type HubSession={user:{id:string;name:string;email:string;image?:string|null};session:{id:string;userId:string;expiresAt:Date}};
const requestHeaders=(input:Request|Headers)=>input instanceof Headers?input:input.headers;
export async function getSession(input:Request|Headers):Promise<HubSession|null>{if(!getAuthReadiness().configured)return null;return await getAuth().api.getSession({headers:requestHeaders(input)}) as HubSession|null;}
export async function requireSession(input:Request|Headers):Promise<HubSession>{if(!getAuthReadiness().configured)throw new RequestAccessError('Google sign-in setup is incomplete.',503);const session=await getSession(input);if(!session?.user?.id||session.session.userId!==session.user.id)throw new RequestAccessError('Sign in with Google to access your workspace.',401);return session;}
export function assertSameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new RequestAccessError('Origin mismatch.',403);const fetchSite=req.headers.get('sec-fetch-site');if(fetchSite==='cross-site')throw new RequestAccessError('Cross-site requests are not allowed.',403);}
export function accessErrorResponse(error:unknown){if(error instanceof RequestAccessError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});return Response.json({error:'The service could not complete this request. Please retry.'},{status:500,headers:{'Cache-Control':'no-store'}});}
export async function withAuthenticatedTenant(req:Request,fn:(session:HubSession)=>Promise<Response>){try{const session=await requireSession(req);if(!['GET','HEAD','OPTIONS'].includes(req.method))assertSameOrigin(req);return await runWithTenant(session.user.id,()=>fn(session));}catch(error){return accessErrorResponse(error);}}
