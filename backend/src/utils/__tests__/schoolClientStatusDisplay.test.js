import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchoolRosterDisplayStatus } from '../schoolClientStatusDisplay.js';

describe('resolveSchoolRosterDisplayStatus', () => {
  it('maps leftover Current with no weekday to confirmation_pending', () => {
    const display = resolveSchoolRosterDisplayStatus({
      client_type: 'school',
      client_status_key: 'current',
      client_status_label: 'Current',
      service_day: null,
      staff_onboarding_completed_at: '2026-04-01'
    });
    assert.equal(display.key, 'confirmation_pending');
    assert.equal(display.label, 'Fall Confirmation Pending');
  });

  it('maps leftover Current with a weekday to ready_to_schedule', () => {
    const display = resolveSchoolRosterDisplayStatus({
      client_type: 'school',
      client_status_key: 'current',
      client_status_label: 'Current',
      service_day: 'Monday',
      staff_onboarding_completed_at: '2026-04-01'
    });
    assert.equal(display.key, 'ready_to_schedule');
    assert.equal(display.label, 'Ready to Schedule');
  });

  it('maps confirmation_pending with a weekday to ready_to_schedule', () => {
    const display = resolveSchoolRosterDisplayStatus({
      client_type: 'school',
      client_status_key: 'confirmation_pending',
      service_day: 'Friday'
    });
    assert.equal(display.key, 'ready_to_schedule');
    assert.equal(display.label, 'Ready to Schedule');
  });

  it('keeps being_seen', () => {
    const display = resolveSchoolRosterDisplayStatus({
      client_type: 'school',
      client_status_key: 'being_seen'
    });
    assert.equal(display.key, 'being_seen');
    assert.equal(display.label, 'Being Seen');
  });
});
