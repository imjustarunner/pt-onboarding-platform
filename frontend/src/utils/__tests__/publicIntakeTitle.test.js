import { describe, it, expect } from 'vitest';
import { localizePublicIntakeTitle } from '../publicIntakeTitle.js';

describe('localizePublicIntakeTitle', () => {
  it('maps English school referral titles to Digital Enrollment Packet', () => {
    expect(localizePublicIntakeTitle('Smart School Referral Packet (English)', 'en'))
      .toBe('Digital Enrollment Packet');
  });

  it('uses the Spanish enrollment packet name for school referral titles', () => {
    expect(localizePublicIntakeTitle('Smart School Referral Packet (English)', 'es'))
      .toBe('Paquete digital de inscripción escolar');
    expect(localizePublicIntakeTitle('School Referral Master (ES)', 'es'))
      .toBe('Paquete digital de inscripción escolar');
  });
});
