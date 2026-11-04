import { describe, expect, it } from 'vitest';
import { selectSchoolEnrollmentLink } from '../schoolEnrollmentLink';

const packet = (id, overrides = {}) => ({ id, public_key: `packet-${id}`, form_type: 'intake', language_code: 'en', is_active: 1, ...overrides });

describe('school digital enrollment packet', () => {
  it('uses the API-selected packet when several English packets are active', () => {
    const canonical = packet(2);
    expect(selectSchoolEnrollmentLink({ link: canonical, links: [packet(3), canonical, packet(1)] })).toBe(canonical);
  });

  it('prefers the inherited English packet for older or demo responses', () => {
    const canonical = packet(2, { inherits_school_master: 1 });
    expect(selectSchoolEnrollmentLink({ links: [packet(3), packet(4, { language_code: 'es' }), canonical] })).toBe(canonical);
  });

  it('excludes ROI, inactive, and missing-key links from enrollment', () => {
    const canonical = packet(1);
    expect(selectSchoolEnrollmentLink({ link: packet(8, { form_type: 'smart_school_roi' }), links: [packet(3, { is_active: 0 }), packet(4, { public_key: '' }), canonical] })).toBe(canonical);
    expect(selectSchoolEnrollmentLink({ links: [packet(8, { form_type: 'smart_school_roi' })] })).toBeNull();
  });

  it('supports a Spanish primary packet when no English packet exists', () => {
    const spanish = packet(2, { language_code: 'es' });
    expect(selectSchoolEnrollmentLink({ links: [spanish] })).toBe(spanish);
    expect(selectSchoolEnrollmentLink()).toBeNull();
  });
});
