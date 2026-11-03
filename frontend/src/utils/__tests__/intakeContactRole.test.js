import { describe, it, expect } from 'vitest';
import { intakeContactIsSelf } from '../intakeContactRole.js';

describe('self enrollment contact identity', () => {
  const adult = { guardian_intake_profile: { firstName: 'Adult', email: 'adult@example.com' } };
  it('recognizes explicit self enrollment and legacy self portal links', () => {
    expect(intakeContactIsSelf({ guardian_intake_profile: { relationship: 'Self' } })).toBe(true);
    expect(intakeContactIsSelf(adult, [{ relationship_type: 'self', email: 'ADULT@example.com' }])).toBe(true);
    expect(intakeContactIsSelf({ ...adult, adaptive_intake_meta_json: JSON.stringify({ whoFor: 'myself', respondent: { email: 'adult@example.com' } }) })).toBe(true);
  });
  it('does not convert a real guardian based on age, a shared name, or an unrelated self link', () => {
    expect(intakeContactIsSelf({ ...adult, age: 36, full_name: 'Adult' })).toBe(false);
    expect(intakeContactIsSelf(adult, [{ relationship_type: 'self', email: 'other@example.com' }])).toBe(false);
    expect(intakeContactIsSelf({ ...adult, guardian_intake_profile: { ...adult.guardian_intake_profile, relationship: 'Mother' },
      adaptive_intake_meta_json: { whoFor: 'myself', respondent: { email: 'adult@example.com' } } })).toBe(false);
  });
  it.each(['Mother', 'Father', 'Legal guardian'])('preserves %s when the client self link shares their email', relationship => {
    expect(intakeContactIsSelf({ ...adult, guardian_intake_profile: { ...adult.guardian_intake_profile, relationship } },
      [{ relationship_type: 'self', email: 'ADULT@example.com' }])).toBe(false);
  });
  it('repairs a legacy generic Guardian label only with a matching self link', () => {
    const legacy = { ...adult, guardian_intake_profile: { ...adult.guardian_intake_profile, relationship: 'Guardian' } };
    expect(intakeContactIsSelf(legacy, [{ relationship_type: 'self', email: 'adult@example.com' }])).toBe(true);
    expect(intakeContactIsSelf(legacy, [{ relationship_type: 'guardian', email: 'adult@example.com' }])).toBe(false);
  });
  it('reads a self enrollment stored as Guardian when the intake says it is for myself', () => {
    const enrolled = { ...adult, guardian_intake_profile: { ...adult.guardian_intake_profile, relationship: 'Guardian' },
      adaptive_intake_meta_json: { whoFor: 'myself', respondent: { email: 'adult@example.com' } } };
    expect(intakeContactIsSelf(enrolled, [{ relationship_type: 'guardian', email: 'adult@example.com', relationship_title: 'Guardian' }])).toBe(true);
  });
  it('treats a generic Guardian contact as the client only when the name and a second identifier match', () => {
    const profile = { fullName: 'Demo Adult', relationship: 'Guardian', dateOfBirth: '1990-04-04', email: 'adult@example.com' };
    expect(intakeContactIsSelf({ full_name: 'DEMO  Adult', date_of_birth: '1990-04-04T00:00:00Z', guardian_intake_profile: profile })).toBe(true);
    expect(intakeContactIsSelf({ full_name: 'Demo Adult', email: 'ADULT@example.com', guardian_intake_profile: { ...profile, dateOfBirth: null } })).toBe(true);
    expect(intakeContactIsSelf({ full_name: 'Demo Adult', date_of_birth: '2001-01-01', guardian_intake_profile: { ...profile, email: null } })).toBe(false);
    expect(intakeContactIsSelf({ full_name: 'Demo Adult', date_of_birth: '1990-04-04', guardian_intake_profile: { ...profile, relationship: 'Mother' } })).toBe(false);
  });
});
