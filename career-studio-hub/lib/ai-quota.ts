import {read,write,claim,unlock} from './store';
import {RequestAccessError} from './auth';
export async function reserveAiCall(action:string){
 if(!process.env.ANTHROPIC_API_KEY&&!process.env.OPENAI_API_KEY)return;
 const configured=Number(process.env.AI_DAILY_LIMIT??5),limit=Number.isFinite(configured)?Math.max(0,Math.min(50,Math.floor(configured))):5,day=new Date().toISOString().slice(0,10);
 for(let slot=0;slot<limit;slot++){
  const key='quota:ai:'+day+':'+slot;if(await read(key,false))continue;const lock='lock:'+key;if(!await claim(lock,120000))continue;
  try{if(await read(key,false))continue;await write(key,{action,reservedAt:new Date().toISOString()});return;}finally{await unlock(lock);}
 }
 throw new RequestAccessError('Your daily AI request limit has been reached. Evidence-based preparation remains available; AI requests reset at midnight UTC.',429);
}
