import { it, expect, vi } from 'vitest';
import { resolveEnrollmentOpeningPreference as resolve, describeEnrollmentOpening } from '../enrollmentOpeningPreference.service.js';
import { hashHoldToken, expandWeeklyHold } from '../publicProviderHold.service.js';
const preference = { providerId: 9, modality: 'VIRTUAL', startAt: '2030-01-08T16:00:00Z', endAt: '2030-01-08T17:00:00Z', frequency: 'BIWEEKLY', timeZone: 'America/Denver' };
it('carries a selected time into enrollment without creating a hold or trusting claimed reservation status', async () => {
  const db = { execute: vi.fn(async () => [[{ id: 9 }]]) };
  const result = await resolve(db, { agencyId: 2, serviceType: 'counseling', preference: { ...preference, reserved: true, holdWasActiveAtSubmission: true } });
  expect(result).toMatchObject({ ...preference, startAt: '2030-01-08T16:00:00.000Z', endAt: '2030-01-08T17:00:00.000Z', reserved: false, holdWasActiveAtSubmission: false, status: 'PREFERENCE_ONLY_REQUIRES_STAFF_CONFIRMATION' });
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT u.id'), [9, 2]);
});
it('rejects providers outside the enrollment agency', async () => {
  const db = { execute: vi.fn(async () => [[]]) };
  await expect(resolve(db, { agencyId: 3, preference })).rejects.toThrow('not available for this organization');
});
it.each([{ endAt: '2029-01-01' }, { modality: 'OTHER' }, { frequency: 'DAILY' }, { timeZone: 'Invalid/Zone' }, { providerId: -1 }])('rejects malformed time preferences', async override => {
  const db = { execute: vi.fn() };
  await expect(resolve(db, { agencyId: 2, preference: { ...preference, ...override } })).rejects.toThrow();
  expect(db.execute).not.toHaveBeenCalled();
});
it('uses only the canonical held time when a valid reservation token is submitted', async () => {
  const db = { execute: vi.fn(async () => [[{ provider_id: 9, service_type: 'counseling', modality: 'VIRTUAL', start_at: preference.startAt, end_at: preference.endAt, frequency: 'BIWEEKLY', time_zone: 'America/Denver' }]]) };
  const result = await resolve(db, { agencyId: 2, serviceType: 'counseling', preference: { ...preference, providerId: 500 }, holdToken: 'opaque' });
  expect(result).toMatchObject({ providerId: 9, reserved: true, status: 'RESERVED_PENDING_CONFIRMATION', frequency: 'BIWEEKLY' });
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('released_at IS NULL AND client_id IS NULL'), [2, hashHoldToken('opaque')]);
});
it('rejects released, used, unknown, or other-agency reservation tokens', async () => {
  await expect(resolve({ execute: async () => [[]] }, { agencyId: 2, holdToken: 'invalid' })).rejects.toThrow('no longer available');
});
it('does not accept a reservation for a different service', async () => {
  await expect(resolve({ execute: async () => [[{ service_type: 'tutoring' }]] }, { agencyId: 2, serviceType: 'counseling', holdToken: 'opaque' })).rejects.toThrow('no longer available');
});
it('leaves ordinary enrollment alone when no time was selected', async () => {
  const db = { execute: vi.fn() };
  expect(await resolve(db, { agencyId: 2 })).toBeNull();
  expect(db.execute).not.toHaveBeenCalled();
});

it('describes the local appointment time and recurrence without presenting a preference as reserved',()=>{
 const label=describeEnrollmentOpening({...preference,reserved:false});
 expect(label).toContain('Tuesday, Jan 8, 2030');expect(label).toContain('9:00 AM–10:00 AM');expect(label).toContain('Every 2 weeks');expect(label).toContain('Preference only — not reserved');
 expect(describeEnrollmentOpening({...preference,reserved:true})).toContain('Reserved pending staff confirmation');
});

it('preserves monthly reservation cadence across daylight saving time',()=>{
 const rows=expandWeeklyHold({startAt:'2026-10-08T14:00:00Z',endAt:'2026-10-08T15:00:00Z',timeZone:'America/Denver',frequency:'MONTHLY'},'2026-10-01','2026-12-31');
 expect(rows.map(r=>r.start.toISOString())).toEqual(['2026-10-08T14:00:00.000Z','2026-11-12T15:00:00.000Z','2026-12-10T15:00:00.000Z']);
});
