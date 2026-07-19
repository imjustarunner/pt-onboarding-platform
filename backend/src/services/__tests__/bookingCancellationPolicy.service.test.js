import { describe, it, expect } from 'vitest';
import { pickWinningPolicy } from '../bookingCancellationPolicy.service.js';
import { interpretAppointmentReply } from '../appointmentReply.service.js';

describe('pickWinningPolicy', () => {
  it('prefers service over tenant', () => {
    const winner = pickWinningPolicy([
      { id: 1, scopeLevel: 'tenant', name: 'Tenant' },
      { id: 2, scopeLevel: 'service', name: 'Service' },
      { id: 3, scopeLevel: 'business_type', name: 'BT' }
    ]);
    expect(winner.id).toBe(2);
  });

  it('honors appointment override id', () => {
    const winner = pickWinningPolicy(
      [
        { id: 1, scopeLevel: 'tenant', name: 'Tenant' },
        { id: 9, scopeLevel: 'appointment', name: 'Override' }
      ],
      { appointmentPolicyId: 9 }
    );
    expect(winner.id).toBe(9);
  });
});

describe('interpretAppointmentReply', () => {
  it('maps confirm/cancel/reschedule keywords including Y/N/R', () => {
    expect(interpretAppointmentReply('CONFIRM')).toBe('confirm');
    expect(interpretAppointmentReply('Y')).toBe('confirm');
    expect(interpretAppointmentReply('cancel')).toBe('cancel');
    expect(interpretAppointmentReply('N')).toBe('cancel');
    expect(interpretAppointmentReply('R')).toBe('reschedule');
    expect(interpretAppointmentReply('maybe later')).toBe('unknown');
  });
});
