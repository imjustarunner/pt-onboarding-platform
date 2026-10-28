import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absenceDate, providerAbsenceStatement, lookupSupportProviderAbsence, providerAbsenceReply } from '../supportProviderAbsence.service.js';
const context={agencyId:2,original:{body:'I will not be at Rudy tomorrow.',from:'nicole@itsco.health'},latestInbound:{body:'I will not be at Rudy tomorrow.',at:'2026-10-27T15:58:00Z'}};
test('reads the absence date from the absence sentence and original received date in agency timezone',()=>{
 assert.equal(providerAbsenceStatement({...context,latestInbound:{body:'I will not be out tomorrow.'}}),null);
 const statement=providerAbsenceStatement({...context,latestInbound:{body:'I have a travel day today, so I will not be at Rudy tomorrow. Thanks'}});
 assert.equal(absenceDate(statement,'2026-10-27T15:58:00Z','America/Denver'),'2026-10-28');
 assert.equal(absenceDate('I will be out tomorrow','2026-10-28T01:00:00Z','America/Denver'),'2026-10-28');
 assert.equal(absenceDate('I will be out next week','2026-10-27T15:58:00Z','America/Denver'),null);
 assert.equal(providerAbsenceStatement({...context,latestInbound:{body:'Thanks!\nOn Tuesday Nicole wrote:\nI will be out tomorrow.'}}),null);
});
function dependencies(){return {database:{execute:async(sql,args)=>{
 assert.equal(args[0],2);
 if(sql.includes('FROM users'))return [[{id:505,first_name:'Nicole',last_name:'Porter'}]];
 if(sql.includes('FROM agencies'))return [[{id:2,portal_url:'itsco'}]];
 if(sql.includes('FROM provider_school_assignments'))return [[{id:4,name:'Rudy'}]];
 throw Error(sql);
}},resolveAbsenceTimeZone:async()=> 'America/Denver',listAbsenceRoster:async()=>[{client_id:8}],reviewAbsenceContact:async()=>({recipients:[]}),now:()=>new Date('2026-10-28T15:00:00Z')};}
test('verifies provider identity and generates only a sign-in review link',async()=>{
 const result=await lookupSupportProviderAbsence(context,dependencies());
 assert.equal(result.status,'verified_provider');assert.equal(result.assignedClientCount,1);
 assert.equal(result.reviewUrl,'https://app.itsco.health/my-schedule?cancelDay=2026-10-28&providerId=505&agencyId=2');
 const reply=providerAbsenceReply(result);assert.match(reply,/review the recipients and messages, then confirm/);assert.doesNotMatch(reply,/I will check|have been notified/);assert.match(reply,/email address available/);
});
test('does not generate a link for an unverified sender, a past or ambiguous day, or a failed lookup',async()=>{
 const deps=dependencies();deps.database.execute=async()=>[[]];assert.equal((await lookupSupportProviderAbsence(context,deps)).reviewUrl,null);
 const past=dependencies();past.now=()=>new Date('2026-10-30T15:00:00Z');assert.equal((await lookupSupportProviderAbsence(context,past)).reason,'absence_date_has_passed');
 const vague={...context,latestInbound:{...context.latestInbound,from:'nicole@itsco.health',body:'I will be out next week'}};
 assert.equal((await lookupSupportProviderAbsence(vague,dependencies())).reason,'absence_date_needs_confirmation');
 const broken=dependencies();broken.database.execute=async()=>{throw Error('offline')};assert.equal((await lookupSupportProviderAbsence(context,broken)).status,'unavailable');
});
