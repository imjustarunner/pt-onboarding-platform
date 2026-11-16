import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../familyBillingEncryption.service.js', () => ({ encryptFamilyBilling: value => value, decryptFamilyBilling: value => value }));
import { normalizePolicy, selfSubscriberPolicy, writeClientInsurance, readClientInsurance } from '../clientInsurance.service.js';

const patient = { firstName: 'Synthetic', lastName: 'Student', dateOfBirth: '2012-11-19', sex: 'M', addressLine1: '123 Synthetic St', city: 'Example', state: 'CO', postalCode: '80000' };

it.each(['primary', 'secondary'])('forces Medicaid %s to Self and fills claim subscriber identity from the patient', slot => {
  const coverage = { isMedicaid: true, relationshipToSubscriber: 'child', subscriberFirstName: 'Parent', subscriberLastName: 'Identity' };
  expect(normalizePolicy(coverage).relationshipToSubscriber).toBe('self');
  expect(selfSubscriberPolicy(coverage, patient)).toMatchObject({ relationshipToSubscriber: 'self', subscriberName: 'Synthetic Student', subscriberFirstName: 'Synthetic', subscriberLastName: 'Student', subscriberDob: '2012-11-19', subscriberSex: 'M', subscriberAddressLine1: '123 Synthetic St' });
});

it('preserves commercial subscriber relationships and identities', () => {
  const policy = { programType: 'commercial', relationshipToSubscriber: 'child', subscriberFirstName: 'Parent', subscriberLastName: 'Identity' };
  expect(normalizePolicy(policy).relationshipToSubscriber).toBe('child');
  expect(selfSubscriberPolicy(policy, patient)).toEqual(policy);
});

it('uses chart demographics for imported Medicaid coverage when no separate patient payload was supplied', async () => {
  const db = { execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT billing_insurance_payload')) return [[{ billing_insurance_payload: { patient: { firstName: '' } } }]];
    if (sql.startsWith('SELECT full_name')) return [[{ full_name: 'Synthetic Student', date_of_birth: '2012-11-19', gender: 'Masculino', address_street: '123 Synthetic St', address_city: 'Example', address_state: 'CO', address_zip: '80000' }]];
    return [{ affectedRows: 1 }];
  }) };
  const saved = await writeClientInsurance({ clientId: 4, agencyId: 2, primary: { insurerName: 'Commercial', relationshipToSubscriber: 'child', subscriberFirstName: 'Parent' }, secondary: { programType: 'medicaid', relationshipToSubscriber: 'child', memberId: 'F123456' }, queueEligibility: false }, db);
  expect(saved.secondary).toMatchObject({ relationshipToSubscriber: 'self', subscriberFirstName: 'Synthetic', subscriberLastName: 'Student', subscriberDob: '2012-11-19', subscriberSex: 'M' });
  expect(saved.primary).toMatchObject({ relationshipToSubscriber: 'child', subscriberFirstName: 'Parent' });
  expect(db.execute.mock.calls.find(([sql]) => sql.startsWith('SELECT full_name'))[1]).toEqual([4, 2]);
});


it('normalizes legacy Medicaid subscriber identity on reads used by eligibility and claims without changing the stored record',async()=>{
 const stored={primary:{isMedicaid:true,relationshipToSubscriber:'child',subscriberFirstName:'Parent'},patient:{}};
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT billing_insurance_payload')?[[{billing_insurance_payload:stored}]]:[[{full_name:'Synthetic Student',date_of_birth:'2012-11-19',gender:'Male'}]])};
 const value=await readClientInsurance(4,2,db);
 expect(value.primary).toMatchObject({relationshipToSubscriber:'self',subscriberFirstName:'Synthetic',subscriberLastName:'Student',subscriberDob:'2012-11-19'});
 expect(stored.primary).toEqual({isMedicaid:true,relationshipToSubscriber:'child',subscriberFirstName:'Parent'});
 expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
