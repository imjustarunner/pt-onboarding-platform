import { describe, it, expect } from 'vitest';
import { pickMasterStaffIntake, isReferralPacketIntake } from '../pickSchoolReferralIntake.js';

describe('pickMasterStaffIntake', () => {
  it('ignores ROI and job forms', () => {
    expect(isReferralPacketIntake({ form_type: 'smart_school_roi' })).toBe(false);
    expect(isReferralPacketIntake({ form_type: 'job_application' })).toBe(false);
    expect(isReferralPacketIntake({ form_type: 'intake' })).toBe(true);
  });

  it('prefers the English inheriting shell over a retired Spanish packet', () => {
    const picked = pickMasterStaffIntake([
      { public_key: 'es-old', title: 'Paquete de Referencia', language_code: 'es', form_type: 'intake' },
      { public_key: 'en-master', title: 'School Referral Packet', language_code: 'en', form_type: 'intake', inherits_school_master: 1 }
    ]);
    expect(picked?.public_key).toBe('en-master');
  });

  it('falls back to English even when inherit flag is missing', () => {
    const picked = pickMasterStaffIntake([
      { public_key: 'es-old', title: 'Paquete de Referencia', language_code: 'es', form_type: 'intake' },
      { public_key: 'en-shell', title: 'School Referral Packet', language_code: 'en', form_type: 'intake' }
    ]);
    expect(picked?.public_key).toBe('en-shell');
  });
});
