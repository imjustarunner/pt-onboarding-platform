import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import { resolveClinicalDraftSessionContext } from '../clinicalDraftSessionContext.service.js';
const scope = { agencyId: 450, clientId: 2277, providerUserId: 1433, dateOfService: '2026-10-19', serviceCode: '90837' };
const canonical = { id: 140, agency_id: 450, client_id: 2277, provider_user_id: 1433, appointment_id: 84,
  service_code: '90837', scheduled_start_at: '2026-10-19 15:00:00', source_timezone: 'America/Denver' };
let database, sessions;
beforeEach(() => {
  database = { execute: vi.fn(async () => [[canonical]]) };
  sessions = { findById: vi.fn(async () => canonical), findByOfficeEventAndClient: vi.fn(async () => canonical) };
});
const resolve = input => resolveClinicalDraftSessionContext({ ...scope, ...input }, { database, sessions });

it('reuses the single backed appointment for chart-initiated notes instead of creating an orphan', async () => {
  const result = await resolve({});
  expect(result).toEqual(canonical);
  expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('s.appointment_id IS NOT NULL'),
    [450, 2277, 1433, '2026-10-18 00:00:00', '2026-10-21 00:00:00', '90837']);
  expect(database.execute.mock.calls[0][0]).toContain('s.provider_user_id = ?');
  expect(database.execute.mock.calls[0][0]).toContain('UPPER(TRIM(s.service_code)) = ?');
});
it('uses source-local DOS rather than the UTC calendar date across midnight and DST', async () => {
  database.execute.mockResolvedValue([[{ ...canonical, scheduled_start_at: '2026-11-02 06:30:00' }]]);
  expect(await resolve({ dateOfService: '2026-11-01' })).toMatchObject({ id: 140 });
  expect(await resolve({ dateOfService: '2026-11-02' })).toBeNull();
});
it('requires the precise appointment when multiple same-day sessions match', async () => {
  database.execute.mockResolvedValue([[canonical, { ...canonical, id: 141, appointment_id: 85 }]]);
  await expect(resolve({})).rejects.toMatchObject({ status: 409, message: expect.stringContaining('More than one appointment') });
  expect(await resolve({ clinicalSessionId: 140 })).toEqual(canonical);
  expect(database.execute).toHaveBeenCalledTimes(1);
});
it('accepts explicit matching context without looking up another same-day appointment', async () => {
  sessions.findByOfficeEventAndClient.mockResolvedValue({ ...canonical, office_event_id: 42 });
  expect(await resolve({ officeEventId: 42 })).toMatchObject({ id: 140, office_event_id: 42 });
  expect(database.execute).not.toHaveBeenCalled();
});
it.each([{ agency_id: 9 }, { client_id: 9 }, { provider_user_id: 9 }])('rejects foreign explicit context: %j', async foreign => {
  sessions.findById.mockResolvedValue({ ...canonical, ...foreign });
  await expect(resolve({ clinicalSessionId: 140 })).rejects.toMatchObject({ status: 403 });
  expect(database.execute).not.toHaveBeenCalled();
});
it.each([{ officeEventId: 42 }, { serviceCode: '90791' }, { dateOfService: '2026-10-20' }])('rejects conflicting explicit context: %j', async conflict => {
  await expect(resolve({ clinicalSessionId: 140, ...conflict })).rejects.toMatchObject({ status: 409 });
});
it('does not fabricate context when the explicit session is missing or database lookup fails', async () => {
  sessions.findById.mockResolvedValue(null);
  await expect(resolve({ clinicalSessionId: 999 })).rejects.toMatchObject({ status: 404 });
  database.execute.mockRejectedValue(new Error('Unavailable'));
  await expect(resolve({})).rejects.toThrow('Unavailable');
});
it('keeps independent drafts possible when no canonical appointment exists and never changes notes or attendance', async () => {
  database.execute.mockResolvedValue([[]]);
  expect(await resolve({})).toBeNull();
  expect(await resolve({ serviceCode: null })).toBeNull();
  expect(database.execute).toHaveBeenCalledTimes(1);
  expect(database.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
