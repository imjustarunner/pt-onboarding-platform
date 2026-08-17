import { describe, expect, it } from 'vitest';
import { assignedDayDisplay, displaySchoolClientStatusLabel } from '../schoolClientStatusDisplay.js';

describe('displaySchoolClientStatusLabel', () => {
  it('maps leftover Current with no weekday to Fall Confirmation Pending', () => {
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'current',
        client_status_label: 'Current',
        organization_id: 10,
        service_day: null,
        staff_onboarding_completed_at: '2026-04-01'
      })
    ).toBe('Fall Confirmation Pending');
  });

  it('maps leftover Current with a weekday to Ready to Schedule', () => {
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'current',
        client_status_label: 'Current',
        organization_id: 10,
        service_day: 'Monday',
        staff_onboarding_completed_at: '2026-04-01'
      })
    ).toBe('Ready to Schedule');
  });

  it('maps confirmation_pending with a weekday to Ready to Schedule', () => {
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'confirmation_pending',
        organization_id: 10,
        service_day: 'Wednesday'
      })
    ).toBe('Ready to Schedule');
  });

  it('does not remap new-client pending without returning signals', () => {
    const now = new Date('2026-08-13T12:00:00');
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'pending',
        client_status_label: 'Pending',
        organization_id: 10,
        submission_date: '2026-08-01'
      }, now)
    ).toBe('Pending');
  });

  it('keeps Being Seen', () => {
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'being_seen',
        organization_id: 10
      })
    ).toBe('Being Seen');
  });

  it('maps leftover last-year Being Seen to Scheduled until this year is confirmed', () => {
    const now = new Date('2026-08-17T12:00:00');
    expect(
      displaySchoolClientStatusLabel({
        client_type: 'school',
        client_status_key: 'being_seen',
        organization_id: 10,
        staff_onboarding_completed_at: '2026-04-01',
        services_started_at: '2026-02-10',
        first_service_at: '2026-02-10',
        service_day: 'Tuesday'
      }, now)
    ).toBe('Scheduled');
  });
});

describe('assignedDayDisplay', () => {
  it('shows Not assigned for blank or Unknown', () => {
    expect(assignedDayDisplay({ service_day: null })).toBe('Not assigned');
    expect(assignedDayDisplay({ service_day: 'Unknown' })).toBe('Not assigned');
  });

  it('keeps a real weekday', () => {
    expect(assignedDayDisplay({ service_day: 'Tuesday' })).toBe('Tuesday');
  });
});
