import { describe, expect, it } from 'vitest';
import { childDetailKind, schoolStepRepeatsForChild, validChildDob, syncSiblingAddresses, migrateLegacySchoolAnswers } from '../schoolIntakeChildren.js';
describe('legacy school child fields', () => {
  it('repeats unmarked school question pages while keeping family consent shared', () => {
    expect(schoolStepRepeatsForChild({ type: 'questions' })).toBe(true);
    expect(schoolStepRepeatsForChild({ type: 'clinical_questions' })).toBe(true);
    expect(schoolStepRepeatsForChild({ type: 'questions', audience: 'guardian' })).toBe(false);
    for (const type of ['school_roi', 'communications', 'guardian_waiver', 'packet_hipaa_notice', 'insurance_info']) expect(schoolStepRepeatsForChild({ type })).toBe(false);
  });
  it('recognizes saved builder keys and generated keys without moving parent fields into child details', () => {
    expect(childDetailKind({ key: 'q_123', label: "Client's Date of Birth" })).toBe('dob');
    expect(childDetailKind({ key: 'q_124', label: "Client's Current Grade" })).toBe('grade');
    expect(childDetailKind({ key: 'q_125', label: "Client's Sex" })).toBe('sex');
    expect(childDetailKind({ key: 'q_126', documentKey: 'client_street' })).toBe('address_street');
    expect(childDetailKind({ key: 'guardian_dob', label: 'Guardian date of birth' })).toBe('');
    expect(childDetailKind({ key: 'family_street', scope: 'guardian' })).toBe('');
  });
  it('rejects impossible or future dates without treating sibling one as a fallback', () => {
    expect(validChildDob('2024-02-29')).toBe(true);
    expect(validChildDob('2023-02-29')).toBe(false);
    expect(validChildDob('2099-01-01')).toBe(false);
    expect(validChildDob('')).toBe(false);
  });
  it('copies only an explicitly shared address, including removing an old apartment', () => {
    const children = [{}, { sameAddressAsFirst: true }, { sameAddressAsFirst: false }];
    const answers = [{ client_street: '1 Test St', client_apt: '', psc_1: 'Often' }, { client_apt: 'old', psc_1: 'Never' }, { client_street: '2 Own St' }];
    syncSiblingAddresses(children, answers, [{ key: 'client_street' }, { key: 'client_apt' }, { key: 'psc_1' }]);
    expect(answers[1]).toEqual({ client_street: '1 Test St', client_apt: '', psc_1: 'Never' });
    expect(answers[2].client_street).toBe('2 Own St');
  });
  it('does not overwrite separately saved sibling answers during legacy migration', () => {
    const responses = { clients: [{ psc_1: 'Never' }, { psc_1: 'Sometimes' }], submission: { clinicalResponses: { psc_1: 'Often' } } };
    migrateLegacySchoolAnswers(responses, [{ type: 'clinical_questions', fields: [{ key: 'psc_1' }] }], [{}, {}]);
    expect(responses.clients.map(c => c.psc_1)).toEqual(['Never', 'Sometimes']);
    expect(responses.submission.clinicalResponses).toEqual({});
  });
});
