import { describe, it, expect } from 'vitest';
import { trainingRegistrationClosesAt, invitationSnoozedUntil } from '../trainingRegistrationPolicy.js';
describe('training RSVP deadline and snoozing', () => {
  const event = {start_at:'2026-10-28 18:00:00',meeting_settings_json:{registrationClosesAt:'2026-10-27T18:00:00Z'}};
  it('uses the configured deadline or the start for existing training without a deadline', () => {
    expect(trainingRegistrationClosesAt(event)).toBe('2026-10-27T18:00:00.000Z');
    expect(trainingRegistrationClosesAt({...event,meeting_settings_json:null})).toBe('2026-10-28T18:00:00.000Z');
  });
  it('never permits a deadline after the start', () => {
    expect(trainingRegistrationClosesAt({...event,meeting_settings_json:{registrationClosesAt:'2026-10-29T18:00:00Z'}})).toBe('2026-10-28T18:00:00.000Z');
  });
  it('snoozes for twelve hours, caps at the cutoff, and refuses at or after it', () => {
    const prompt = {registrationClosesAt:trainingRegistrationClosesAt(event)};
    expect(invitationSnoozedUntil(prompt,new Date('2026-10-25T18:00:00Z')).toISOString()).toBe('2026-10-26T06:00:00.000Z');
    expect(invitationSnoozedUntil(prompt,new Date('2026-10-27T04:00:00Z')).toISOString()).toBe('2026-10-27T06:00:00.000Z');
    expect(invitationSnoozedUntil(prompt,new Date('2026-10-27T06:00:00Z'))).toBeNull();
    expect(invitationSnoozedUntil(prompt,new Date('2026-10-27T18:00:00Z'))).toBeNull();
  });
});
