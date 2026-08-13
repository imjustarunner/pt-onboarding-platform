import { describe, it, expect } from 'vitest';
import { localizePublicIntakeTitle } from '../publicIntakeTitle.js';

describe('localizePublicIntakeTitle', () => {
  it('strips English language tags', () => {
    expect(localizePublicIntakeTitle('Smart School Referral Packet (English)', 'en'))
      .toBe('Smart School Referral Packet');
  });

  it('uses the Spanish packet name for school referral titles', () => {
    expect(localizePublicIntakeTitle('Smart School Referral Packet (English)', 'es'))
      .toBe('Paquete digital de referidos escolares');
    expect(localizePublicIntakeTitle('School Referral Master (ES)', 'es'))
      .toBe('Paquete digital de referidos escolares');
  });
});
