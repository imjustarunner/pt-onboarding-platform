import test from 'node:test';
import assert from 'node:assert/strict';
import {providerAvailabilityPreferences,missingAvailabilityFormats,publicFormatEnabled} from '../providerAvailabilityReminders.js';
import {officeBookingNeedsSession} from '../officeBookingSessionLink.js';
const now=Date.parse('2026-09-17T16:00:00Z');
const opening={startAt:'2026-09-18T16:00:00Z',endAt:'2026-09-18T17:00:00Z'};
test('reminders follow separate intentions and only count future complete openings',()=>{
 const p={acceptingNewClients:true,inPerson:true,virtual:true};
 assert.deepEqual(missingAvailabilityFormats(p,{inPersonSlots:[opening],virtualSlots:[]},now),['VIRTUAL']);
 assert.deepEqual(missingAvailabilityFormats(p,{inPersonSlots:[{...opening,startAt:'2026-09-16T16:00:00Z'}],virtualSlots:[{...opening,endAt:opening.startAt}]},now),['IN_PERSON','VIRTUAL']);
 assert.deepEqual(missingAvailabilityFormats({...p,acceptingNewClients:false},{},now),[]);
 assert.deepEqual(missingAvailabilityFormats({...p,inPerson:false},{virtualSlots:[opening]},now),[]);
});
test('explicit choices override legacy format strings, absent profiles remain safe',()=>{
 assert.deepEqual(providerAvailabilityPreferences({provider_accepting_new_clients:0,in_office_available:1},null),{seesClients:true,waitlistEnabled:false,acceptingNewClients:false,inPerson:true,virtual:false});
 assert.equal(providerAvailabilityPreferences({in_office_available:1},{details:{inPersonEnabled:false,virtualEnabled:true}}).inPerson,false);
 assert.equal(publicFormatEnabled({details:{virtualEnabled:false}},'VIRTUAL'),true);
 assert.equal(publicFormatEnabled({details:{virtualEnabled:false}},'VIRTUAL','CURRENT_CLIENT'),true);
 assert.equal(publicFormatEnabled(null,'IN_PERSON'),true);
 assert.equal(publicFormatEnabled({acceptingNewClientsOverride:false},'IN_PERSON'),true);
});
test('only booked reservations without clinical or learning sessions are flagged',()=>{
 assert.equal(officeBookingNeedsSession({state:'assigned_booked'}),true);
 for(const slot of [{state:'open'},{state:'assigned_available'},{state:'company_hold'},{state:'assigned_booked',clinicalSessionId:12},{state:'assigned_booked',learningSessionId:25},{state:'assigned_booked',learningLinked:true}])assert.equal(officeBookingNeedsSession(slot),false);
});

test('a supervisor who does not see clients has no opening reminders; global closed overrides stale profile overrides',()=>{
 const p=providerAvailabilityPreferences({sees_clients:0,provider_accepting_new_clients:1},{details:{inPersonEnabled:true,virtualEnabled:true}});
 assert.deepEqual(missingAvailabilityFormats(p,{},now),[]);
 assert.equal(providerAvailabilityPreferences({provider_accepting_new_clients:0},{acceptingNewClientsOverride:true}).acceptingNewClients,false);
});
