import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesExchangeListing, ageRange, clientAge } from '../clientExchangeMatching.js';
const base = {
  user: { sees_clients: 1, provider_accepting_new_clients: 1, in_office_available: 1 },
  profile: { details: {}, insurances: ['Aetna'] },
  facets: { ageGroups: ['Children (6-10)'], specialties: ['Anxiety'] },
  listing: { demographics: { ageBand: '8-10' }, presentingProblems: ['anxiety'], preferences: { modality: 'in_person' } }
};
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
  assert.equal(matchesExchangeListing({ ...base, user: { provider_accepting_new_clients: 0 }, profile: { agencyAvailability: { seesClients: true, acceptingNewClients: true, virtual: true } }, listing: { ...base.listing, preferences: { modality: 'either' } } }), true);
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
  assert.equal(matchesExchangeListing({ ...base, listing }), true);
});

test('unknown age, coverage and gender remain possible matches', () => {
  assert.equal(matchesExchangeListing({...base, facets:{}, profile:{details:{}}, listing:{preferences:{insurance:'Aetna',providerGender:'female'}, demographics:{ageBand:'9'}}}),true);
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
  assert.equal(result.matched,true);
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
