import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
import { buildClaimMdJsonClaim } from '../claimMd.service.js';

const patient = { firstName:'Demo', lastName:'Patient', dateOfBirth:'1980-01-01', sex:'F', addressLine1:'99 Patient Road', city:'Patient City', state:'CO', postalCode:'80000' };
const insurance = { verifiedForClaims:true, acceptAssignment:true, patient, primary:{ payerId:'COCHA', memberId:'SYNTHETIC', subscriberFirstName:'Demo', subscriberLastName:'Patient', subscriberDob:patient.dateOfBirth, subscriberSex:'F', subscriberAddressLine1:patient.addressLine1, subscriberCity:patient.city, subscriberState:'CO', subscriberPostalCode:patient.postalCode, relationshipToSubscriber:'self' } };
const claim = { id:12, agency_id:2, billing_npi:'1215615711', rendering_npi:'1234567893', diagnosis_codes_json:['R69'], place_of_service:'10', date_of_service:'2026-11-02' };
const lines = [{ procedure_code:'H0002', units:1, charge_cents:3000, modifiers_json:['U9'] }];
const practice = { name:'Demo Practice LLC', claim_facility_name:'Demo Facility', tax_id:'123456789', phone_number:'3035550100', street_address:'10 Office Street', city:'Denver', state:'CO', postal_code:'802021234' };
const build = (changes = {}, payerId = 'COCHA') => buildClaimMdJsonClaim(claim, lines, { insurance:{...insurance,primary:{...insurance.primary,payerId}}, practice:{...practice,...changes} });

describe('complete Claim.MD facility identity', () => {
  it('automatically formats full patient and subscriber state names for the clearinghouse without changing source records',()=>{
    const input={...insurance,patient:{...patient,state:'Colorado'},primary:{...insurance.primary,subscriberState:'colorado'}};
    expect(buildClaimMdJsonClaim(claim,lines,{insurance:input,practice})).toMatchObject({pat_state:'CO',ins_state:'CO'});
    expect(input.patient.state).toBe('Colorado');expect(input.primary.subscriberState).toBe('colorado');
    expect(()=>buildClaimMdJsonClaim(claim,lines,{insurance:{...input,patient:{...input.patient,state:'Unrecognized state'}},practice})).toThrow('pat_state');
  });
  it('sends the selected office address with the effective billing NPI, never the patient address', () => {
    const payload = build();
    expect(payload).toMatchObject({ facility_name:'Demo Facility', facility_npi:claim.billing_npi, facility_addr_1:'10 Office Street', facility_addr_2:'', facility_city:'Denver', facility_state:'CO', facility_zip:'802021234', bill_npi:claim.billing_npi, prov_npi:claim.rendering_npi, pat_addr_1:patient.addressLine1 });
    expect(payload.charge).toEqual([expect.objectContaining({proc_code:'H0002',mod1:'U9',units:'1',charge:'30.00',place_of_service:'10'})]);
    expect(practice).not.toHaveProperty('facility_addr_1');
  });
  it('retains suites and ZIP+4 and normalizes only whitespace, state case and the ZIP separator', () => {
    expect(build({street_address:' 10 Office Street ',street_address_2:' Suite 200 ',state:'co',postal_code:'80202-1234'})).toMatchObject({facility_addr_1:'10 Office Street',facility_addr_2:'Suite 200',facility_state:'CO',facility_zip:'802021234'});
    expect(build({postal_code:'80202'}).facility_zip).toBe('80202');
  });
  it.each(['street_address','city','state','postal_code'])('blocks a missing %s before any transmission', field => {
    expect(() => build({[field]:' '})).toThrow('Claim is incomplete');
  });
  it.each([{state:'C'}, {postal_code:'8020'}, {postal_code:'80202-ABCD'}, {postal_code:'8020212345'}])('blocks malformed address values %j', fields => {
    expect(() => build(fields)).toThrow('Billing settings');
  });
  it.each([['street_address',65,'facility_addr_1'], ['street_address_2',65,'facility_addr_2']])('rejects %s that exceeds the facility field limit', (field,size,payloadField) => {
    expect(() => build({[field]:'X'.repeat(size)})).toThrow(payloadField);
    expect(build({[field]:'X'.repeat(size-1)})[payloadField]).toHaveLength(size-1);
  });
  it('does not add an unsolicited facility block to other payer claims', () => {
    expect(Object.keys(build({},'OTHER')).filter(key=>key.startsWith('facility_'))).toEqual([]);
  });
  it('changes the review payload when the selected billing office address changes', () => {
    const first=build(), second=build({street_address:'20 New Office Road',city:'Boulder',postal_code:'80301'});
    expect(second).toMatchObject({facility_addr_1:'20 New Office Road',facility_city:'Boulder',facility_zip:'80301'});
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  });
});

it('uses the stable claim number as the outgoing PCN while retaining an attempt-specific response identifier',()=>{
 const payload=buildClaimMdJsonClaim({...claim,id:13,claim_reference:'002-2026-11-009',patient_control_number:'002-2026-11-009'},lines,{insurance,practice});
 expect(payload).toMatchObject({pcn:'002-2026-11-009',remote_claimid:'PT-2-13'});
 const legacy=buildClaimMdJsonClaim({...claim,id:14,claim_reference:'002-2026-11-009',patient_control_number:'13'},lines,{insurance,practice});
 expect(legacy.pcn).toBe('13');expect(legacy.remote_claimid).toBe('PT-2-14');
});
