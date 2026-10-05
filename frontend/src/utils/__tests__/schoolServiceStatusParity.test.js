import { describe, expect, it } from 'vitest';
import { displaySchoolClientStatusLabel } from '../schoolClientStatusDisplay.js';
import { resolveSchoolRosterDisplayStatus } from '../../navigation/schoolLifecycle/schoolClientStatusDisplay.js';
const now = new Date('2026-10-05T12:00:00Z');
describe('shared school status policy', () => {
  for (const key of ['current','ready_to_schedule','scheduled','needs_day_assignment']) {
    it(`agrees on confirmed ${key} without a weekday`, () => {
      const client={client_type:'school',client_status_key:key,services_started_at:'2026-09-15',created_at:'2025-01-01'};
      expect(displaySchoolClientStatusLabel(client,now)).toBe('Being Seen');
      expect(displaySchoolClientStatusLabel(client,now)).toBe(resolveSchoolRosterDisplayStatus(client,now).label);
    });
  }
  it('retains server-resolved school status with redacted service dates', () => {
    expect(displaySchoolClientStatusLabel({client_type:'school',client_status_key:'being_seen',client_status_label:'Being Seen',school_status_resolved:true,submission_date:'2025-01-01'},now)).toBe('Being Seen');
  });
});
