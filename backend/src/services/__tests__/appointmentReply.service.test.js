import { describe, it, expect } from 'vitest';
import {
  interpretAppointmentReply,
  buildReminderMessage,
  REPLY_PROMPT
} from '../appointmentReply.service.js';

describe('interpretAppointmentReply', () => {
  it('maps Y / N / R shortcuts', () => {
    expect(interpretAppointmentReply('Y')).toBe('confirm');
    expect(interpretAppointmentReply('y')).toBe('confirm');
    expect(interpretAppointmentReply('N')).toBe('cancel');
    expect(interpretAppointmentReply('R')).toBe('reschedule');
    expect(interpretAppointmentReply('3')).toBe('reschedule');
  });

  it('maps common words', () => {
    expect(interpretAppointmentReply('confirm')).toBe('confirm');
    expect(interpretAppointmentReply('cancel')).toBe('cancel');
    expect(interpretAppointmentReply('reschedule')).toBe('reschedule');
  });

  it('returns unknown for free text', () => {
    expect(interpretAppointmentReply('maybe later')).toBe('unknown');
  });
});

describe('buildReminderMessage', () => {
  it('includes Y/N/R prompt when asking confirmation', () => {
    const msg = buildReminderMessage({
      title: 'Counseling',
      when: '2026-07-20 10:00:00',
      askConfirmation: true
    });
    expect(msg).toContain(REPLY_PROMPT);
    expect(msg).toMatch(/Y to confirm/);
  });
});
