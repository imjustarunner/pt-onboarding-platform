import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchoolRosterDisplayStatus } from '../schoolClientStatusDisplay.js';
const now = new Date('2026-10-05T12:00:00Z');
for (const key of ['current','ready_to_schedule','scheduled','needs_day_assignment']) {
  test(`${key}: confirmed service is Being Seen without a weekday`, () => {
    const client={client_type:'school',client_status_key:key,services_started_at:'2026-09-15',created_at:'2025-01-01'};
    assert.equal(resolveSchoolRosterDisplayStatus(client,now).key,'being_seen');
  });
}
test('current-year onboarding does not make a new client returning',()=>{
  const client={client_type:'school',client_status_key:'being_seen',created_at:'2026-09-01',staff_onboarding_completed_at:'2026-09-02',first_service_at:'2026-09-15'};
  assert.equal(resolveSchoolRosterDisplayStatus(client,now).label,'Being Seen');
});
test('old and future service dates do not confirm services',()=>{
  for(const date of ['2026-02-01','2026-11-01'])assert.equal(resolveSchoolRosterDisplayStatus({client_type:'school',client_status_key:'ready_to_schedule',services_started_at:date},now).key,'ready_to_schedule');
});
test('closed and waitlisted clients remain closed or waitlisted',()=>{
  for(const key of ['waitlist','terminated','archived','not_returning'])assert.equal(resolveSchoolRosterDisplayStatus({client_type:'school',client_status_key:key,services_started_at:'2026-09-01'},now).key,key);
});
