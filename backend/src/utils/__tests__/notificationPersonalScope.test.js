import { describe, expect, it } from 'vitest';
import {
  INBOX_AGENCY_BROADCAST_TYPES,
  MANAGED_AGENCY_EVENT_TYPES,
  isStrictlyPersonalNotificationType,
  viewerMaySeeNotification
} from '../notificationPersonalScope.js';

describe('notificationPersonalScope', () => {
  it('treats payroll claim outcomes as strictly personal', () => {
    expect(isStrictlyPersonalNotificationType('mileage_claim_rejected')).toBe(true);
    expect(isStrictlyPersonalNotificationType('medcancel_claim_approved')).toBe(true);
  });

  it('treats agency operational events as non-personal', () => {
    expect(isStrictlyPersonalNotificationType('new_job_application_submitted')).toBe(false);
    expect(isStrictlyPersonalNotificationType('office_schedule_coverage_flag')).toBe(false);
    expect(INBOX_AGENCY_BROADCAST_TYPES.has('provider_year_update_completed')).toBe(true);
    expect(MANAGED_AGENCY_EVENT_TYPES.has('provider_year_update_completed')).toBe(true);
  });

  it('blocks cross-user personal notifications outside managed scope', () => {
    const row = { type: 'mileage_claim_rejected', user_id: 42 };
    expect(viewerMaySeeNotification(row, 7)).toBe(false);
    expect(viewerMaySeeNotification(row, 42)).toBe(true);
  });

  it('allows managed agency events cross-user in managed scope', () => {
    const row = { type: 'new_packet_uploaded', user_id: null };
    expect(viewerMaySeeNotification(row, 7, { allowManagedAgencyEvents: true })).toBe(true);
    const personal = { type: 'payroll_missing_notes_reminder', user_id: 42 };
    expect(viewerMaySeeNotification(personal, 7, { allowManagedAgencyEvents: true })).toBe(false);
  });

  it('rejects mis-keyed personal notifications with null user_id in inbox', () => {
    const row = { type: 'mileage_claim_rejected', user_id: null };
    expect(viewerMaySeeNotification(row, 7)).toBe(false);
  });
});
