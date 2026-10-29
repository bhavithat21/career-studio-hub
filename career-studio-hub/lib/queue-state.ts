export function runnableTask(task:any,now=Date.now()){
 return ['queued','setup_required','drafted'].includes(task.stage)&&(task.attempts||0)<3&&(!task.nextAttemptAt||Date.parse(task.nextAttemptAt)<=now);
}
export function retryTask(task:any,now=Date.now()){
 return {...task,stage:task.draft&&task.versionId?'drafted':'queued',attempts:0,nextAttemptAt:null,review:null,retries:(task.retries||0)+1,updatedAt:new Date(now).toISOString(),message:'Retry requested; saved evidence and resume version are preserved.'};
}
export function failedTask(task:any,message:string,now=Date.now()){
 const attempts=(task.attempts||0)+1;
 return {...task,attempts,totalFailures:(task.totalFailures||0)+1,stage:attempts>=3?'failed':task.draft&&task.versionId?'drafted':'queued',nextAttemptAt:attempts>=3?null:new Date(now+30000*2**(attempts-1)).toISOString(),updatedAt:new Date(now).toISOString(),message};
}
