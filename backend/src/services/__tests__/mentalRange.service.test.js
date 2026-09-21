import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleRangeTenant,rangeUrl,providerDto,rangeProviderEligible} from '../mentalRange.service.js';
import {createMentalRangeHandlers} from '../mentalRangeHandlers.service.js';
function response(){return {code:200,body:null,status(c){this.code=c;return this;},json(b){this.body=b;return this;},set(){},sendStatus(c){this.code=c;}};}
function harness(results=[], detail){const calls=[];return {calls,...createMentalRangeHandlers({pool:{execute:async(sql,args)=>{calls.push({sql,args});return [results.shift()||[]];}},publicUploadsUrlFromStoredPath:x=>x,listClinicalFacetsForUsers:async()=>new Map(),readPublicProviderSchedule:detail||(()=>{throw Error('Unexpected scheduling lookup');})})};}
const tenant={id:3,name:'Actual agency',slug:'actual',organization_type:'agency'};
test('membership excludes demos, Burning Sage, schools, programs, and affiliated clubs',()=>{for(const organization_type of ['school','program','clinical','learning','affiliation'])assert.equal(eligibleRangeTenant({...tenant,organization_type}),false);for(const name of ['Demo ITSCO','Burning Sage','Burning-Sage','burning_sage'])assert.equal(eligibleRangeTenant({...tenant,name}),false);assert.equal(eligibleRangeTenant(tenant),true);assert.equal(eligibleRangeTenant({...tenant,organization_type:'life_coach'}),true);});
test('public URL validation rejects script, protocol-relative, HTTP and credential-bearing URLs',()=>{for(const url of ['javascript:alert(1)','//evil.test','/\\evil.test','https://name:pass@host.test','http://test.test','https://test.test/\nfoo'])assert.equal(rangeUrl(url),'');assert.equal(rangeUrl('/p/rise'),'/p/rise');});
test('provider projection never returns billing, internal notes, credentials or email',()=>{const p=providerDto({id:4,agency_id:3,agency_slug:'real',service_type:'consulting',first_name:'Test',email:'private',password:'private',notes:'private',insurances_json:'["Private insurer"]'});assert.equal(p.email,undefined);assert.equal(p.notes,undefined);assert.equal(p.password,undefined);assert.deepEqual(p.insurances,[]);});
test('all admin reads and writes fail before touching the database for non-superadmins',async()=>{for(const role of [undefined,'admin','support','provider']){const h=harness();for(const fn of [h.getRangeMembership,h.saveRangeMembership]){const res=response();await fn({user:{role},params:{agencyId:3}},res,e=>{throw e;});assert.equal(res.code,403);assert.equal(h.calls.length,0);}}});
test('unpublished collective denies directory and partner reads',async()=>{for(const method of ['rangePartners','rangeProviders','rangeAvailability']){const h=harness([[]]);const res=response();await h[method]({},res,e=>{throw e;});assert.equal(res.code,404);assert.equal(h.calls.length,1);}});
test('excluded organizations cannot be enabled by forged membership requests',async()=>{const h=harness([[{...tenant,organization_type:'school'}]]);const res=response();await h.saveRangeMembership({params:{agencyId:3},user:{id:1,role:'super_admin'},body:{included:true,services:[]}},res,e=>{throw e;});assert.equal(res.code,400);assert.equal(h.calls.length,1);});
test('invalid destinations do not mutate membership',async()=>{const h=harness([[tenant]]);const res=response();await h.saveRangeMembership({params:{agencyId:3},user:{id:1,role:'super_admin'},body:{included:true,services:[],website_url:'javascript:alert(1)'}},res,e=>{throw e;});assert.equal(res.code,400);assert.equal(h.calls.length,1);});
test('availability denies consulting and revoked/unpublished affiliations',async()=>{const h=harness([[{id:1}],[]]);let res=response();await h.rangeAvailability({params:{agencyId:3,providerId:4},query:{service:'consulting'}},res,e=>{throw e;});assert.equal(res.code,400);const h2=harness([[{id:1}],[]]);res=response();await h2.rangeAvailability({params:{agencyId:3,providerId:4},query:{service:'counseling'}},res,e=>{throw e;});assert.equal(res.code,404);});
test('network availability uses the public schedule even without online booking and strips private fields',async()=>{
 let selection;
 const h=harness([[{id:1}],[{id:4,agency_id:3,agency_slug:'actual',service_type:'counseling',role:'provider',online_enrolled:0,provider_accepting_new_clients:1}]],async(pid,aid)=>{
 selection={pid,aid};return {slots:[{startAt:'2001-01-01T12:00:00Z'},{startAt:'2099-01-01T12:00:00Z',endAt:'2099-01-01T13:00:00Z',format:'VIRTUAL',clientId:19,notes:'never'}],inPerson:{status:'unavailable'},virtual:{status:'accepting'},schools:[],locations:[]};
 });
 const res=response();await h.rangeAvailability({params:{agencyId:3,providerId:4},query:{service:'counseling',bookingMode:'CURRENT_CLIENT',format:'VIRTUAL'}},res,e=>{throw e;});
 assert.deepEqual(selection,{pid:4,aid:3});assert.equal(res.body.slots.length,1);assert.equal(res.body.slots[0].clientId,undefined);assert.equal(res.body.slots[0].notes,undefined);assert.equal(res.body.hasPublishedOpenings,true);
});
test('non-participation in one agency denies its availability without checking any private calendars',async()=>{
 const h=harness([[{id:1}],[{id:4,agency_id:3,service_type:'counseling',role:'provider',online_enrolled:1,sees_clients:1,public_details_json:{availabilityByAgency:{3:{seesClients:false}}}}]]);
 const res=response();await h.rangeAvailability({params:{agencyId:3,providerId:4},query:{service:'counseling'}},res,e=>{throw e;});assert.equal(res.code,404);
});
test('public affiliations retain their agency identity and effective status',()=>{
 const base={id:9,first_name:'Alex',agency_id:1,agency_name:'ITSCO',agency_slug:'itsco',service_type:'counseling',provider_accepting_new_clients:1,public_details_json:{availabilityByAgency:{1:{seesClients:true,acceptingNewClients:false,inPerson:true,virtual:false,waitlistEnabled:true},2:{seesClients:true,acceptingNewClients:true,inPerson:false,virtual:true}}}};
 const a=providerDto(base),b=providerDto({...base,agency_id:2,agency_name:'Next Level Up',service_type:'tutoring'});
 assert.equal(a.agencyName,'ITSCO');assert.equal(a.accepting,false);assert.equal(a.waitlistEnabled,true);assert.equal(a.virtual,false);assert.equal(b.agencyName,'Next Level Up');assert.equal(b.accepting,true);assert.equal(b.virtual,true);assert.equal(a.public_details_json,undefined);
});
test('an assigned clinician remains discoverable when their staff role is clinical practice assistant',()=>{
 const row={id:465,agency_id:2,role:'clinical_practice_assistant',sees_clients:1,has_school_assignment:1,service_type:'counseling'};
 assert.equal(rangeProviderEligible(row),true);
 assert.equal(rangeProviderEligible({...row,has_school_assignment:0}),false);
});
