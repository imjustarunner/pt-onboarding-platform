import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExchangeListing, exchangeSlotMatches, matchesExchangeListing, ageRange, clientAge } from '../clientExchangeMatching.js';
import { compareExchangeFit, exchangeFitScore, groupedExchangeParameters } from '../../../../frontend/src/navigation/clientExchangePolicy.js';
const base = {
  officeCoverage:{known:true,cities:['Colorado Springs'],officeIds:[1]},
  user: { sees_clients: 1, provider_accepting_new_clients: 1, in_office_available: 1 },
  profile: { details: {}, insurances: ['Aetna'] },
  facets: { ageGroups: ['Children (6-10)'], specialties: ['Anxiety'] },
  listing: { demographics: { ageBand: '8-10' }, presentingProblems: ['anxiety'], preferences: { modality: 'in_person', serviceLocation: 'Colorado Springs' } }
};
test('missing optional referral details do not reduce fit or block an otherwise eligible provider',()=>{
 const fit=evaluateExchangeListing({...base,listing:{preferences:{},demographics:{},presentingProblems:[]}});
 assert.equal(fit.matched,true);
 assert.equal(fit.checks.find(c=>c.field==='diagnoses').applicable,false);
 assert.equal(fit.checks.find(c=>c.field==='schedule').applicable,false);
 assert.equal(fit.matchScore,null);
});
test('missing typical availability does not block matching or assignment',()=>{
 const listing={...base.listing,preferences:{schedule:{days:['Tuesday']}}};
 const fit=evaluateExchangeListing({...base,listing});
 assert.equal(fit.canRequest,true);assert.equal(fit.matched,true);assert.equal(fit.canNotify,true);assert.equal(fit.canAssign,true);
 assert.ok(!fit.assignmentBlockers.some(c=>c.code==='schedule'));
});
test('age-three Medicaid referral matches its saved city without diagnosis or gender exclusions', () => {
 const args = { officeCoverage:base.officeCoverage,user: base.user, profile: { ...base.profile, insurances: ['Medicaid'], details: { clinicalFocus: { reviewed: true, excluded: { ageGroups: [] }, top: { ageGroups: ['Teen (14-18)', 'Adults (18+)'] } } } },
  listing: { demographics: { ageBand: '3' }, diagnoses: [], preferences: { modality: 'in_person', insurance: 'Medicaid', serviceLocation: 'Colorado Springs', providerGender: null, schedule: { days: ['Tuesday','Thursday','Friday'], periods: ['afternoon'] } } }, slots: [], availabilityKnown: false };
 const fit = evaluateExchangeListing(args);
 assert.equal(fit.matched, true); assert.equal(fit.canAssign, true); assert.equal(fit.canNotify, true);
 for (const field of ['provider_gender','diagnoses']) assert.equal(fit.checks.find(c=>c.field===field).applicable, false);
 assert.match(fit.checks.find(c=>c.field==='age').reason, /Toddler \(0-5\)/);
 assert.equal(evaluateExchangeListing({ ...args, profile: { ...args.profile, insurances: ['Aetna'] } }).canRequest, false);
 assert.equal(evaluateExchangeListing({ ...args, availabilityKnown: true }).matched, true);
});
test('missing in-person city needs confirmation without blocking a request', () => {
 for (const serviceLocation of ['', 'Not yet decided', 'Other location']) {
  const fit = evaluateExchangeListing({ ...base, listing: { preferences: { serviceLocation, modality: 'in_person' } } });
  assert.equal(fit.matched, false); assert.equal(fit.canRequest, true); assert.equal(fit.canNotify, false);
  assert.equal(fit.checks.find(c=>c.field==='location').applicable, true);
  assert.equal(fit.checks.find(c=>c.field==='location').canWaive, false);
 }
});
test('independent and provisional qualification requirements distinguish candidates and bachelor-level providers',()=>{
 const listing={...base.listing,preferences:{providerQualification:'independent'}};
 for(const credential of ['BA','LPCC','MSW, LSW','PhD','']){
  const fit=evaluateExchangeListing({...base,user:{...base.user,credential},listing});
  assert.equal(fit.canRequest,false,credential);assert.equal(fit.checks.find(c=>c.field==='qualification').canWaive,false);
 }
 for(const credential of ['MA, LPC','MSW, LCSW','LMFT'])assert.equal(evaluateExchangeListing({...base,user:{...base.user,credential},listing}).matched,true);
 for(const credential of ['LPCC','MSW, LSW'])for(const requirement of ['licensed_or_provisional','licensed'])assert.equal(evaluateExchangeListing({...base,user:{...base.user,credential},listing:{...listing,preferences:{providerQualification:requirement}}}).matched,true);
 assert.equal(evaluateExchangeListing({...base,user:{...base.user,credential:'BA'},listing:{...listing,preferences:{providerQualification:'licensed'}}}).canRequest,false);
});
test('insurance failures stay below eligible providers regardless of preference score',()=>{
 const blocked={matched:false,canRequest:false,matchScore:99},eligible={matched:false,canRequest:true,matchScore:20};
 assert.ok(compareExchangeFit(eligible,blocked)<0);
 const score=checks=>exchangeFitScore(checks).matchScore;
 assert.ok(score([{field:'schedule',status:'pass'},{field:'modalities',status:'fail'}])>score([{field:'schedule',status:'fail'},{field:'modalities',status:'pass'}]));
 assert.equal(score([{field:'insurance',status:'pass'},{field:'diagnoses',status:'unknown',applicable:false}]),100);
});
test('the condensed parameter view preserves exclusions and distinguishes missing referral details',()=>{
 const rows=groupedExchangeParameters([{userId:1,name:'Example',checks:[{field:'account',status:'pass'},{field:'insurance',status:'pass'},{field:'insurance_exclusions',status:'fail'},{field:'diagnoses',status:'unknown',applicable:false}]}]);
 assert.equal(rows.some(r=>r.field==='eligibility'),false);
 assert.deepEqual(rows.find(r=>r.field==='insurance').fail.map(p=>p.userId),[1]);
 assert.deepEqual(rows.find(r=>r.field==='diagnoses').unspecified.map(p=>p.userId),[1]);
});
test('no therapist gender preference passes for every provider gender, including unrecorded', () => {
  for (const gender of ['male', 'female', 'nonbinary', null]) for (const preference of [null, '', 'No preference', 'any']) {
    const fit = evaluateExchangeListing({ ...base, profile: { ...base.profile, details: { gender } }, listing: { ...base.listing, preferences: { providerGender: preference } } });
    assert.equal(fit.checks.find(c => c.field === 'provider_gender').status, 'pass');
    assert.equal(fit.review.some(c => c.code === 'provider_gender'), false);
    assert.equal(fit.matched, true);
  }
});
test('an explicit gender preference still reports a mismatch or an unrecorded provider gender', () => {
  const listing = { ...base.listing, preferences: { providerGender: 'female' } };
  assert.equal(evaluateExchangeListing({ ...base, listing }).checks.find(c => c.field === 'provider_gender').status, 'unknown');
  const fit = evaluateExchangeListing({ ...base, listing, profile: { ...base.profile, details: { gender: 'male' } } });
  assert.equal(fit.matched, false); assert.equal(fit.canRequest, true);
});
test('age and virtual-only differences allow requests but require review before assignment', () => {
  const fit = evaluateExchangeListing({ ...base, user: { ...base.user, in_office_available: 0 },
    profile: { ...base.profile, details: { virtualEnabled: true, inPersonEnabled: false } }, facets: { ...base.facets, ageGroups: ['Adults (18+)'] } });
  assert.equal(fit.canRequest, true); assert.equal(fit.canAssign, false); assert.equal(fit.canNotify, false);
  assert.deepEqual(fit.adjustments.map(r => r.code), ['format_availability', 'age']);
  assert.match(fit.adjustments[0].message, /Client requests in-person visits/);
  assert.match(fit.adjustments[0].message, /in person: not offered; virtual: open/);
  assert.match(fit.adjustments[1].message, /8-10.*Adults/);
});
test('format explanations distinguish open, waitlisted, closed and not offered', () => {
  const args = { ...base, listing: { ...base.listing, preferences: { modality: 'virtual' } } };
  for (const [status, expected] of [['waitlist', 'waitlisted'], ['unavailable', 'closed to new clients']]) {
    const fit = evaluateExchangeListing({ ...args, profile: { ...base.profile, agencyAvailability: { seesClients: true, inPerson: true, virtual: true, intakeStatusByFormat: { IN_PERSON: 'accepting', VIRTUAL: status } } } });
    assert.match(fit.adjustments.find(c => c.code === 'format_availability').message, new RegExp(`Client requests virtual visits.*virtual: ${expected}`));
  }
});
test('staff waivers apply per criterion, expire when inputs change, and cannot bypass insurance', () => {
  const args = { ...base, facets: { ...base.facets, ageGroups: ['Adults (18+)'] }, listing: { ...base.listing, preferences: { insurance: 'Aetna' } } };
  const age = evaluateExchangeListing(args).checks.find(c => c.field === 'age');
  const waiver = { id: 5, field: 'age', fingerprint: age.fingerprint, reason: 'Provider confirmed age coverage with support' };
  const fit = evaluateExchangeListing({ ...args, waivers: [waiver] });
  assert.equal(fit.canAssign, true); assert.equal(fit.checks.find(c => c.field === 'age').waiver.id, 5);
  const changed = evaluateExchangeListing({ ...args, waivers: [waiver], listing: { ...args.listing, demographics: { ageBand: '5' } } });
  assert.equal(changed.canAssign, false);
  const otherInsurance = { ...args, listing: { ...args.listing, preferences: { insurance: 'Tricare' } } };
  const insurance = evaluateExchangeListing(otherInsurance).checks.find(c => c.field === 'insurance');
  assert.equal(insurance.canWaive, false);
  assert.equal(evaluateExchangeListing({ ...otherInsurance, waivers: [{ field: 'insurance', fingerprint: insurance.fingerprint }] }).canRequest, false);
});
test('age warnings and waivers use the same fingerprint with chart DOB or hydrated exchange age', () => {
  const listing = { ...base.listing, demographics: { ageBand: '8' } };
  const args = { ...base, listing, facets: { ...base.facets, ageGroups: ['Adults (18+)'] } };
  const chart = evaluateExchangeListing({ ...args, client: { date_of_birth: '2018-01-01' }, now: new Date('2026-10-28') });
  assert.equal(chart.checks.find(c => c.field === 'age').fingerprint, evaluateExchangeListing(args).checks.find(c => c.field === 'age').fingerprint);
});
test('waiving fit differences for a closed provider does not resume automatic notifications', () => {
  const args = { ...base, user: { ...base.user, provider_accepting_new_clients: 0 }, slots:[{format:'IN_PERSON',city:'Colorado Springs',startAt:'2099-01-05T17:00:00Z',endAt:'2099-01-05T18:00:00Z'}],availabilityKnown:true };
  const initial = evaluateExchangeListing(args);
  const waivers = initial.checks.filter(c => c.canWaive && c.status === 'fail').map(c => ({ field: c.field, fingerprint: c.fingerprint, reason: 'Support reviewed this referral' }));
  const fit = evaluateExchangeListing({ ...args, waivers });
  assert.equal(fit.matched, true); assert.equal(fit.canRequest, true); assert.equal(fit.canAssign, true); assert.equal(fit.canNotify, false);
});
test('matches age, normalized specialties and in-person availability', () => {
  assert.equal(matchesExchangeListing(base), true);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, ageGroups: ['Adults (18+)'] } }), false);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, specialties: ['Depression'] } }), false);
});
test('virtual-only providers do not need the Office Available chat toggle', () => {
  const args = { ...base, user: { ...base.user, in_office_available: 0 }, profile: { details: { virtualEnabled: true } }, listing: { ...base.listing, preferences: { modality: 'virtual' } } };
  assert.equal(matchesExchangeListing(args), true);
  assert.equal(matchesExchangeListing({ ...args, listing: base.listing }), false);
});
test('agency-specific closed intake and does-not-see-clients exclude recipients', () => {
  for (const policy of [
    { seesClients: false, acceptingNewClients: true, inPerson: true },
    { seesClients: true, acceptingNewClients: false, inPerson: true },
    { seesClients: true, acceptingNewClients: true, inPerson: false, virtual: false }
  ]) assert.equal(matchesExchangeListing({ ...base, profile: { agencyAvailability: policy } }), false);
  assert.equal(matchesExchangeListing({ ...base, user: { ...base.user, provider_accepting_new_clients: 0 } }), false);
});
test('tenant-specific open virtual intake overrides global closed intake', () => {
  assert.equal(matchesExchangeListing({ ...base, user: { provider_accepting_new_clients: 0 }, profile: { agencyAvailability: { seesClients: true, acceptingNewClients: true, virtual: true } }, listing: { ...base.listing, preferences: { modality: 'either',serviceLocation:'Colorado Springs' } } }), true);
});
test('uses DOB age when a broad listing band is provided, without copying DOB', () => {
  assert.equal(clientAge({ date_of_birth: '2016-10-01' }, new Date('2026-09-29')), 9);
  assert.equal(matchesExchangeListing({ ...base, client: { date_of_birth: '2016-10-01' }, now: new Date('2026-09-29'), listing: { ...base.listing, demographics: { ageBand: 'child' } } }), true);
});
test('broad adult referrals do not match teen-only profiles at the overlapping boundary', () => {
  assert.deepEqual(ageRange('adult'), [18, 120]);
  assert.equal(matchesExchangeListing({ ...base, facets: { ...base.facets, ageGroups: ['Teen (14-18)'] }, listing: { ...base.listing, demographics: { ageBand: 'adult' } } }), false);
});
test('specified insurance requires a supported insurance', () => {
  assert.equal(matchesExchangeListing({ ...base, listing: { ...base.listing, preferences: { insurance: 'aetna' } } }), true);
  assert.equal(matchesExchangeListing({ ...base, listing: { ...base.listing, preferences: { insurance: 'United Healthcare' } } }), false);
});
test('honors an explicitly requested provider gender', () => {
  const listing = { ...base.listing, preferences: { ...base.listing.preferences, providerGender: 'female' } };
  assert.equal(matchesExchangeListing({ ...base, listing, profile: { ...base.profile, details: { gender: 'Woman (she/her)' } } }), true);
  assert.equal(matchesExchangeListing({ ...base, listing, profile: { ...base.profile, details: { gender: 'male' } } }), false);
  assert.equal(matchesExchangeListing({ ...base, listing }), false);
  assert.equal(evaluateExchangeListing({...base,listing}).canRequest,true);
});

test('unknown age and gender allow review, but specified coverage must be verified', () => {
  assert.equal(matchesExchangeListing({...base, facets:{}, profile:{details:{}}, listing:{preferences:{insurance:'Aetna',providerGender:'female'}, demographics:{ageBand:'9'}}}),false);
  assert.equal(matchesExchangeListing({...base, listing:{preferences:{},presentingProblems:['An unclassified narrative']}}),true);
});
test('per-format waitlist and closed never get alerts; an explicit open format does', () => {
  const profile={agencyAvailability:{seesClients:true,acceptingNewClients:false,inPerson:true,virtual:true,intakeStatusByFormat:{IN_PERSON:'waitlist',VIRTUAL:'accepting'}}};
  assert.equal(matchesExchangeListing({...base,profile}),false);
  assert.equal(matchesExchangeListing({...base,profile,listing:{preferences:{modality:'virtual'}}}),true);
  profile.agencyAvailability.intakeStatusByFormat.VIRTUAL='unavailable';
  assert.equal(matchesExchangeListing({...base,profile,listing:{preferences:{modality:'either'}}}),false);
});
test('known therapy and insurance exclusions reject while unknown preferences pass', () => {
  assert.equal(matchesExchangeListing({...base,facets:{populations:['Individuals']},listing:{serviceType:'couples'}}),false);
  assert.equal(matchesExchangeListing({...base,profile:{...base.profile,excludedInsurances:['Aetna']},listing:{preferences:{insurance:'Aetna'}}}),false);
  assert.equal(matchesExchangeListing({...base,facets:{populations:['Individuals']},listing:{preferences:{matchingPreferences:{populations:['Couples']}}}}),false);
});
test('diagnosis-only referrals match Depression and Mood Disorders, not unrelated specialties',()=>{
 for(const diagnosis of ['Major Depressive Disorder','F33.1',{icd10_code:'F32.9',description:'Major depressive disorder'}]){
  const args={...base,listing:{diagnoses:[diagnosis]},facets:{specialties:['Depression']}};
  assert.equal(matchesExchangeListing(args),true);
  assert.equal(matchesExchangeListing({...args,facets:{specialties:['Mood Disorders']}}),true);
  assert.equal(matchesExchangeListing({...args,facets:{specialties:['Bipolar Disorder']}}),false);
 }
});
test('clinical exclusions override parent-category matches and random highlights never narrow eligibility',()=>{
 const focus={reviewed:true,top:{specialties:[]},waived:{specialties:true},automaticTop:{specialties:['Anxiety']},excluded:{specialties:['Depression']}};
 const args={...base,profile:{...base.profile,details:{clinicalFocus:focus}},listing:{diagnoses:['Major Depressive Disorder']}};
 assert.equal(matchesExchangeListing(args),false);
 focus.excluded.specialties=[];assert.equal(matchesExchangeListing(args),true);
 focus.excluded.specialties=['Mood Disorders'];assert.equal(matchesExchangeListing(args),false);
});
test('client selections use shared profile choices for specialty, age, population and approach',()=>{
 const args={...base,listing:{preferences:{matchingPreferences:{specialties:['Mood Disorders'],ageGroups:['Adults (18+)'],populations:['Veterans'],modalities:['EMDR']}}},facets:{specialties:['Depression'],ageGroups:['Adults (18+)'],populations:['Veterans'],modalities:['EMDR']}};
 assert.equal(matchesExchangeListing(args),true);
 assert.equal(matchesExchangeListing({...args,facets:{...args.facets,modalities:['Play Therapy']}}),false);
 assert.equal(matchesExchangeListing({...args,facets:{...args.facets,populations:['Couples']}}),false);
});
test('a different presenting concern cannot bypass a known diagnosis specialty mismatch',()=>{
 const listing={diagnoses:['Major Depressive Disorder'],presentingProblems:['Anxiety']};
 assert.equal(matchesExchangeListing({...base,listing}),false);
 assert.equal(matchesExchangeListing({...base,listing,facets:{specialties:['Depression','Anxiety']}}),true);
});

test('commercial category is unverified coverage, not a literal payer mismatch; credential limits still apply', async()=>{
  const {evaluateExchangeMatch}=await import('../clientExchangeMatching.js');
  const input={user:{sees_clients:1,provider_accepting_new_clients:1},profile:{details:{virtualEnabled:true},insurances:['Aetna'],insuranceCredential:{credential:'LPC'}},listing:{preferences:{modality:'virtual',insurance:'Commercial / Other'}}};
  const result=evaluateExchangeMatch(input);
  assert.equal(result.matched,false);
  assert.equal(result.canRequest,true);
  assert.equal(result.canAssign,false);
  assert.equal(result.checks.find(c=>c.field==='insurance').status,'unknown');
  assert.equal(evaluateExchangeMatch({...input,profile:{...input.profile,insuranceCredential:{credential:'BA'}}}).matched,false);
  assert.equal(evaluateExchangeMatch({...input,listing:{preferences:{modality:'virtual',insurance:'Cigna'}}}).matched,false);
});
test('audits expose multiple reasons and do not treat unknown fields as verified',async()=>{
  const {evaluateExchangeMatch}=await import('../clientExchangeMatching.js');
  const result=evaluateExchangeMatch({user:{sees_clients:0,provider_accepting_new_clients:0},profile:{details:{gender:'male'}},facets:{ageGroups:['Adults (18+)']},listing:{demographics:{ageBand:'9'},preferences:{modality:'virtual',providerGender:'female'}}});
  assert.equal(result.matched,false);
  for(const field of ['accepting','format','age','provider_gender'])assert.equal(result.checks.find(c=>c.field===field).status,'fail');
  assert.equal(result.checks.find(c=>c.field==='schedule').status,'unknown');
});

test('closed and waitlisted providers see fit and can request if insurance is accepted', () => {
 for (const status of ['unavailable', 'waitlist']) {
  const fit = evaluateExchangeListing({ ...base, profile: { ...base.profile, agencyAvailability: { seesClients: true, acceptingNewClients: false, inPerson: true, intakeStatusByFormat: { IN_PERSON: status } } }, listing: { ...base.listing, preferences: { modality: 'in_person', insurance: 'Aetna' } } });
  assert.equal(fit.canRequest, true); assert.equal(fit.canNotify, false);
  assert.equal(fit.status, 'not_match'); assert.ok(fit.adjustments.length);
 }
});
test('inactive and demo accounts cannot request even with matching coverage', () => {
 for (const change of [{ is_active: 0 }, { is_archived: 1 }, { membership_active: 0 }, { status: 'TERMINATED' }, { status: 'INACTIVE_EMPLOYEE' }, { is_demo: 1 }]) {
  const fit = evaluateExchangeListing({ ...base, user: { ...base.user, ...change } });
  assert.equal(fit.canRequest, false); assert.equal(fit.canNotify, false);
 }
});
test('day/time differences are requestable and a single opening must satisfy all constraints', () => {
 const now = new Date('2026-10-26T00:00:00Z');
 const preferences = { modality: 'in_person', insurance: 'Aetna', serviceLocation: 'Denver', schedule: { days: ['Tuesday'], periods: ['evening'], timezone: 'America/Denver' } };
 const slots = [{ startAt: '2026-10-27T16:00:00Z', endAt: '2026-10-27T17:00:00Z', format: 'IN_PERSON', city: 'Denver' }, { startAt: '2026-10-29T00:00:00Z', endAt: '2026-10-29T01:00:00Z', format: 'IN_PERSON', city: 'Denver' }];
 const args = { ...base, profile:{...base.profile,details:{typicalAvailability:['Monday mornings']}}, officeCoverage:{known:true,cities:['Denver'],officeIds:[6]}, listing: { ...base.listing, preferences }, slots, now };
 const mismatch = evaluateExchangeListing(args);
 assert.equal(mismatch.canRequest, true); assert.equal(mismatch.status, 'not_match');
 assert.equal(mismatch.adjustments[0].code, 'schedule');
 slots.push({ startAt: '2026-10-28T00:00:00Z', endAt: '2026-10-28T01:00:00Z', format: 'IN_PERSON', city: 'Denver' });
 assert.equal(evaluateExchangeListing(args).status, 'match');
 assert.equal(exchangeSlotMatches({ ...slots[2], city: 'Colorado Springs' }, preferences, now), false);
 assert.equal(exchangeSlotMatches({ ...slots[2], format: 'VIRTUAL' }, preferences, now), false);
});
test('clinical exclusions and insurance remain firm blocks alongside schedule differences', () => {
 const fit = evaluateExchangeListing({ ...base, profile: { ...base.profile, details: {typicalAvailability:['Monday mornings'], clinicalFocus: { reviewed: true, excluded: { specialties: ['Anxiety'] } } } }, listing: { ...base.listing, preferences: {modality:'in_person',serviceLocation:'Colorado Springs', insurance: 'Tricare', schedule: { days: ['Tuesday'] } } }, slots: [] });
 assert.equal(fit.canRequest, false);
 assert.ok(fit.blockers.some(r => r.code === 'insurance'));
 assert.ok(fit.blockers.some(r => r.code === 'excluded_specialty'));
 assert.ok(fit.adjustments.some(r => r.code === 'schedule'));
});

test('a location-only referral uses assigned offices rather than missing openings', () => {
 const args = { ...base, now: new Date('2026-10-26'), listing: { ...base.listing, preferences: { modality: 'in_person', serviceLocation: 'Colorado Springs', insurance: 'Aetna' } },
  slots: [{ startAt: '2026-10-28T00:00:00Z', endAt: '2026-10-28T01:00:00Z', format: 'IN_PERSON', city: 'Denver' }] };
 const fit = evaluateExchangeListing(args);
 assert.equal(fit.status, 'match'); assert.equal(fit.canRequest, true); assert.equal(fit.adjustments.length, 0);
 args.slots[0].city = 'Colorado Springs'; assert.equal(evaluateExchangeListing(args).status, 'match');
});

test('a Denver office never matches a Colorado Springs in-person referral even with no published calendar',()=>{
 const args={...base,officeCoverage:{known:true,cities:['Denver'],officeIds:[6]},slots:[],availabilityKnown:false};
 const fit=evaluateExchangeListing(args);assert.equal(fit.matched,false);assert.equal(fit.canNotify,false);assert.equal(fit.canAssign,false);assert.equal(fit.canRequest,true);
 const check=fit.checks.find(c=>c.field==='office_location');assert.equal(check.status,'fail');assert.equal(check.canWaive,false);assert.match(check.reason,/Colorado Springs.*Denver/);
 assert.equal(evaluateExchangeListing({...args,waivers:[{field:check.field,fingerprint:check.fingerprint}]}).matched,false);
 assert.equal(evaluateExchangeListing({...args,officeCoverage:{known:true,cities:['Colorado Springs'],officeIds:[1]},listing:{...base.listing,preferences:{modality:'in_person',serviceLocation:'Denver'}}}).matched,false);
});
test('either-city office assignments match either city; virtual visits do not require a local office',()=>{
 assert.equal(evaluateExchangeListing({...base,officeCoverage:{known:true,cities:['Denver','Colorado Springs'],officeIds:[1,6]}}).matched,true);
 assert.equal(evaluateExchangeListing({...base,officeCoverage:{known:true,cities:['Denver'],officeIds:[6]},profile:{details:{virtualEnabled:true}},listing:{preferences:{modality:'virtual',serviceLocation:'Colorado Springs'}}}).matched,true);
 const unknown=evaluateExchangeListing({...base,officeCoverage:{known:true,cities:[],officeIds:[]}});assert.equal(unknown.matched,false);assert.equal(unknown.canRequest,true);assert.equal(unknown.checks.find(c=>c.field==='office_location').status,'unknown');
});

test('Monday versus Tuesday typical hours is not a match but remains requestable',()=>{
 const args={...base,profile:{...base.profile,details:{typicalAvailability:['Tuesday afternoons']}},listing:{...base.listing,preferences:{...base.listing.preferences,schedule:{days:['Monday'],periods:['afternoon']}}}};
 const fit=evaluateExchangeListing(args);assert.equal(fit.matched,false);assert.equal(fit.canRequest,true);assert.equal(fit.canNotify,false);assert.equal(fit.canAssign,false);
 assert.match(fit.adjustments.find(c=>c.code==='schedule').message,/Monday.*Tuesday afternoons.*may request/);
 for(const typicalAvailability of [[],['Monday afternoons'],['Weekdays','Afternoons'],['By arrangement']]){
  const result=evaluateExchangeListing({...args,profile:{...base.profile,details:{typicalAvailability}}});assert.equal(result.matched,true,JSON.stringify(typicalAvailability));assert.equal(result.canAssign,true);assert.equal(result.matchScore,100);
 }
});
test('typical day/time pairs stay together and office hours never exclude virtual care',()=>{
 const args={...base,profile:{...base.profile,details:{typicalAvailability:['Monday mornings','Tuesday afternoons'],virtualEnabled:true}},listing:{...base.listing,preferences:{...base.listing.preferences,schedule:{days:['Monday'],periods:['afternoon']}}}};
 assert.equal(evaluateExchangeListing(args).matched,false);
 assert.equal(evaluateExchangeListing({...args,listing:{...args.listing,preferences:{...args.listing.preferences,modality:'virtual'}}}).matched,true);
});
