import type {ResumeModel} from './resume-model';

export type FactualReview = {approved:boolean;issues:string[];feedback:string};

/** Review output is data. A truthy value or a contradictory verdict never grants approval. */
export function validateReview(value:unknown):FactualReview {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Independent reviewer returned an invalid review.');
 const input=value as Record<string,unknown>;
 if(Object.keys(input).some(key=>!['approved','issues','feedback'].includes(key))||typeof input.approved!=='boolean'||!Array.isArray(input.issues)||input.issues.length>100||input.issues.some(issue=>typeof issue!=='string'||issue.length>2000)||typeof input.feedback!=='string'||input.feedback.length>6000)throw Error('Independent reviewer returned an invalid review.');
 const review={approved:input.approved,issues:(input.issues as string[]).map(issue=>issue.trim()).filter(Boolean),feedback:input.feedback.trim()};
 if(review.approved&&review.issues.length)throw Error('Independent reviewer reported unresolved issues.');
 return review;
}

export function hasApprovedReview(value:unknown){
 try{return validateReview(value).approved===true;}catch{return false;}
}

export function sameMaster(saved:ResumeModel|undefined,current:ResumeModel){
 return !!saved&&JSON.stringify(saved)===JSON.stringify(current);
}
