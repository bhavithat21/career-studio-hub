import test from 'node:test';
import assert from 'node:assert/strict';
import {match,defaults,canonical,requiredExperience} from '../lib/matching.ts';
const base={id:'1',source:'test',sourceName:'Test',url:'https://example.com/jobs/1',title:'Software Engineer II',company:'Example',location:'Seattle, WA',description:'Java and Python backend services',posted:'2026-10-27',remote:false,salary:'',salaryMin:0,employment:'Full time'};
const now=Date.parse('2026-10-28');
test('Seattle hybrid engineering role matches',()=>assert.ok(match(base,defaults,now)));
test('Nearby metro cities match without admitting all of Washington',()=>{for(const location of ['Bellevue, WA','Renton, Washington','Issaquah, WA','Tacoma, WA'])assert.ok(match({...base,location},defaults,now));for(const location of ['Spokane, WA','Vancouver, WA','Pullman, Washington','England','Kentucky, USA'])assert.equal(match({...base,location},defaults,now),null);});
test('Software development engineer is included',()=>assert.ok(match({...base,title:'Software Development Engineer II'},defaults,now)));
test('Equivalent software title spellings match without admitting unrelated engineering',()=>{for(const title of ['Software Dev Engineer','Engineer 1 Front End React','Back End Engineer'])assert.ok(match({...base,title},defaults,now));assert.equal(match({...base,title:'Electrical Design Engineer'},defaults,now),null);});
test('Amazon and AWS employer legal names are excluded across sources',()=>{for(const company of ['Amazon','Amazon.com Services LLC','Amazon Development Center U.S., Inc.','AWS Inc.','A.W.S. Inc.','Amazon Web Services, Inc.'])assert.equal(match({...base,company,source:'jobicy'},defaults,now),null);assert.equal(match({...base,company:'Project Kuiper',source:'amazon'},defaults,now),null);});
test('Company exclusion does not confuse skills or partial company names',()=>{for(const company of ['Awesome Software','Drawstring Labs','Amazona Systems'])assert.ok(match({...base,company,description:'Build services on Amazon Web Services and AWS'},defaults,now));});
test('Legacy filters inherit Amazon exclusion while explicit empty list enables company',()=>{const legacy={...defaults};delete legacy.excludedCompanies;assert.equal(match({...base,company:'Amazon'},legacy,now),null);assert.ok(match({...base,company:'Amazon'},{...defaults,excludedCompanies:''},now));});
test('Custom company exclusions use normalized whole phrase boundaries',()=>{assert.equal(match({...base,company:'Example-Consulting LLC'},{...defaults,excludedCompanies:'Example Consulting'},now),null);assert.ok(match({...base,company:'ExampleConsulting LLC'},{...defaults,excludedCompanies:'Example Consulting'},now));});
test('Washington exclusion rejects a US remote role',()=>assert.equal(match({...base,remote:true,location:'USA',description:'Remote except Washington'},defaults,now),null));
test('Explicit foreign-only remote location is rejected',()=>{for(const location of ['Portugal','Poland','Argentina, Brazil, Mexico','Hong Kong, Singapore'])assert.equal(match({...base,remote:true,location},defaults,now),null);});
test('US and worldwide remote remain reviewable',()=>{for(const location of ['USA','Canada, USA','Anywhere'])assert.ok(match({...base,remote:true,location},defaults,now));});
test('Unknown remote location depends on unknown preference',()=>{assert.ok(match({...base,remote:true,location:''},defaults,now));assert.equal(match({...base,remote:true,location:''},{...defaults,unknown:false},now),null);});
test('Expired and stale jobs do not match',()=>{assert.equal(match({...base,validThrough:'2026-10-01'},defaults,now),null);assert.equal(match({...base,posted:'2026-01-01'},defaults,now),null);});
test('Senior and unrelated roles are excluded',()=>{for(const title of ['Senior Software Engineer','Frontend Architect','Account Executive','Software Engineer Intern'])assert.equal(match({...base,title},defaults,now),null);});
test('Salary and skill coverage filters apply',()=>{assert.equal(match(base,{...defaults,skills:'Java, Python, Kubernetes',minScore:80},now),null);assert.equal(match({...base,salaryMin:90000},{...defaults,minSalary:120000},now),null);});
test('Canonical URLs strip tracking and reject script URLs',()=>{assert.equal(canonical('https://example.com/jobs/1?utm_source=x&req=3#apply'),'https://example.com/jobs/1?req=3');assert.equal(canonical('javascript:alert(1)'),'');});

test('State-specific remote labels do not imply nationwide eligibility',()=>{
 for(const location of ['California, USA, Remote; New York, USA, Remote','US-Remote-CA','Remote - TX','Washington, District of Columbia, USA; Virginia, USA, Remote'])assert.equal(match({...base,remote:true,location},defaults),null,location);
 for(const location of ['California, USA, Remote; Washington, USA, Remote','US-Remote-WA','Seattle, WA; Remote US','Remote nationwide; New York office'])assert.ok(match({...base,remote:true,location},defaults),location);
 assert.ok(match({...base,remote:true,location:'Remote California, USA',eligibleLocations:['United States']},defaults));
});

const capped={...defaults,maxRequiredExperienceYears:6,excludeSenior:false};
test('Experience cap uses explicit required minimums, ranges, plus signs and written numbers',()=>{
 for(const [description,expected] of [['Required: 5-7 years of professional software engineering experience.',5],['Minimum five (5) or more years of Java experience.',5],['Between 5 and 7 years of software development experience.',5],['Minimum qualifications: 6+ years of experience building services.',6],['No prior professional experience required.',0]]){const result=match({...base,description},capped,now);assert.ok(result,description);assert.equal(result.requiredExperienceYears,expected);}
 for(const description of ['Minimum qualifications: 7+ years of software engineering experience.','At least seven years of professional experience.','Required: 8 years of Java development.','Required: 20 years of programming experience.'])assert.equal(match({...base,description},capped,now),null,description);
});
test('Preferred years do not exclude roles, including compressed single-line portal descriptions',()=>{
 for(const description of ['Minimum qualifications: 3+ years of software experience. Preferred qualifications: 7+ years of Java experience.','Requirements 3+ years of software experience Preferred Qualifications 10+ years of Java experience','5 years of professional software experience; 7 years of Kubernetes experience preferred.']){const result=match({...base,description},capped,now);assert.ok(result,description);assert.ok(result.requiredExperienceYears<=5);}
 const preferredOnly=match({...base,description:'Preferred qualifications: 10+ years of Java experience.'},capped,now);assert.ok(preferredOnly);assert.equal(preferredOnly.requiredExperienceYears,null);assert.ok(preferredOnly.flags.includes('Required experience threshold unknown'));
});
test('Company age, benefits, education duration and dates do not become candidate experience',()=>{
 for(const description of ['Benefits include retirement vesting after 7 years. Bachelor degree takes 4 years. Updated October 2026.','Our company has 25 years of experience building software.','Over the past 7 years we have delivered software.','For 7 years, we have been building software.','We are 7 years old and build cloud software.','A 4-year degree in computer science is required.'])assert.equal(requiredExperience(description).minimumYears,null,description);
 assert.equal(requiredExperience('Our company has 25 years of experience building software. Requirements: 3 years of professional development experience.').minimumYears,3);
});
test('Degree alternatives use the minimum stated route and flag applicability for review',()=>{
 for(const description of ["Bachelor degree and 7 years of software experience or Master degree and 5 years of software experience.","Bachelor degree and 7 years of software experience.\nOR\nMaster degree and 5 years of software experience."]){const parsed=requiredExperience(description);assert.equal(parsed.minimumYears,5);assert.equal(parsed.ambiguous,true);const result=match({...base,description},capped,now);assert.ok(result);assert.equal(result.requiredExperienceYears,5);assert.ok(result.flags.some(flag=>flag.includes('applicable qualification path')));}
});
test('Conjunctive requirements retain the strongest minimum and skill alternatives do not reduce it',()=>{
 for(const description of ['Minimum 7 years of software development experience including 3 years of Java experience.','5 years experience with Java or Python and 7 years of professional software experience.']){assert.equal(requiredExperience(description).minimumYears,7);assert.equal(match({...base,description},capped,now),null);}
 assert.equal(requiredExperience('7 years of Java experience or 5 years of Python experience.').minimumYears,5);
});
test('Unknown experience follows the unknown preference and legacy filters have no new limit',()=>{
 const result=match(base,capped,now);assert.ok(result);assert.equal(result.requiredExperienceYears,null);assert.ok(result.flags.includes('Required experience threshold unknown'));assert.equal(match(base,{...capped,unknown:false},now),null);
 assert.ok(match({...base,description:'Minimum 12 years of software experience.'},defaults,now));
 const ambiguous=match({...base,description:'Up to 7 years of software engineering experience.'},capped,now);assert.ok(ambiguous);assert.equal(ambiguous.requiredExperienceYears,null);assert.ok(ambiguous.flags.some(flag=>flag.includes('ambiguous')));
});
test('Senior titles can match an under-seven threshold when the separate title exclusion is disabled',()=>{
 const job={...base,title:'Senior Software Engineer',description:'Required: 5+ years of software development experience.'};assert.ok(match(job,capped,now));assert.equal(match(job,{...capped,excludeSenior:true},now),null);
 assert.equal(match({...job,description:'7+ years of software development experience required.'},capped,now),null);
});
test('Software IC search excludes management and non-software departments with senior exclusion disabled',()=>{
 for(const title of ['Technical Program Manager III, Software Engineering, Geo','Executive Director, Software Engineering','Director of Front End RCM','Engineering Manager, Backend Platform','Manager, Software Engineer','Software Engineer Manager','Frontend RCM Specialist'])assert.equal(match({...base,title,description:'Required: 5 years of software experience.'},capped,now),null,title);
});
test('Senior staff principal IC and mission-domain titles remain software engineering matches',()=>{
 for(const title of ['Senior Software Engineer','Staff Software Engineer, Backend','Principal Software Engineer','Software Engineer - Mission Manager','Software Engineer / Mission Manager','Senior Front End Developer','Engineer 1 Front End React','SDE II'])assert.ok(match({...base,title,description:'Required: 5 years of software experience.'},capped,now),title);
});
test('Management roles are included only when a matching management title is explicitly requested',()=>{
 for(const [title,titles] of [['Technical Program Manager III, Software Engineering, Geo','software engineer, technical program manager'],['Executive Director, Software Engineering','executive director'],['Director of Front End RCM','director'],['Engineering Manager, Backend Platform','engineering manager']])assert.ok(match({...base,title},{...capped,titles},now),title);
 assert.equal(match({...base,title:'Executive Director, Software Engineering'},{...capped,titles:'software engineer, engineering manager'},now),null);
});
test('Software Engineering title variants remain eligible without admitting primary management roles',()=>{
 for(const title of ['Software Engineering, Android (All Teams)','Software Engineering Intern, PhD, Summer 2027','Senior Engineer, Software Engineering','Engineer, Software Engineering'])assert.ok(match({...base,title,description:'Required: 3 years of software development experience.'},capped,now),title);
 for(const title of ['Technical Program Manager III, Software Engineering, Geo','Executive Director, Software Engineering','Engineering Manager, Software Engineering'])assert.equal(match({...base,title},capped,now),null,title);
 assert.equal(match({...base,title:'Software Engineering Intern, PhD, Summer 2027'},defaults,now),null);
});
