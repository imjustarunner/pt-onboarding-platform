import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), set: vi.fn(), configured: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: async () => null } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: m.configured, setGroupMemberDeliverySettings: m.set } }));
import { applySchoolGroupSubscription } from '../schoolGroupSubscription.service.js';
const args = { schoolOrganizationId: 440, email: 'staff@example.org', subscription: 'all_mail', notify: false };
beforeEach(() => {
  vi.clearAllMocks();
  m.configured.mockReturnValue(true);
  m.execute.mockImplementation(async sql => sql.includes('SELECT email_delivery_preference') ? [[{ email_delivery_preference: 'none' }]] : sql.includes('SELECT itsco_email') ? [[{ itsco_email: 'school@example.org' }]] : [{ affectedRows: 1 }]);
  m.set.mockResolvedValue({ delivery_settings: 'ALL_MAIL' });
});
it('saves the preference only after Google has verified it', async () => {
  const result = await applySchoolGroupSubscription(args);
  const write = m.execute.mock.calls.findIndex(([sql]) => sql.startsWith('UPDATE'));
  expect(write).toBeGreaterThan(-1);
  expect(m.set.mock.invocationCallOrder[0]).toBeLessThan(m.execute.mock.invocationCallOrder[write]);
  expect(result).toMatchObject({ ok: true, previousSubscription: 'none', subscription: 'all_mail', google: { ok: true } });
});
it('does not persist a false success after Google fails', async () => {
  m.set.mockRejectedValue(new Error('Google unavailable'));
  await expect(applySchoolGroupSubscription(args)).rejects.toMatchObject({ status: 502 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('does not claim success when Workspace is unconfigured', async () => {
  m.configured.mockReturnValue(false);
  await expect(applySchoolGroupSubscription(args)).rejects.toMatchObject({ status: 502 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('surfaces database persistence failures for retry', async () => {
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('UPDATE')) throw new Error('database unavailable');
    return sql.includes('SELECT itsco_email') ? [[{ itsco_email: 'school@example.org' }]] : [[{ email_delivery_preference: 'none' }]];
  });
  await expect(applySchoolGroupSubscription(args)).rejects.toThrow('database unavailable');
});

it('reads actual Google settings, including when the saved preference differs', async () => {
  const { default: Directory } = await import('../googleWorkspaceDirectory.service.js');
  Directory.getClient = vi.fn(async () => ({ members: { get: vi.fn(async ({ memberKey }) => ({ data: { delivery_settings: { 'a@example.org': 'NONE', 'b@example.org': 'DIGEST', 'c@example.org': 'DAILY', 'd@example.org': 'ALL_MAIL' }[memberKey] } })) } }));
  const { readSchoolGroupSubscriptions } = await import('../schoolGroupSubscription.service.js');
  const result = await readSchoolGroupSubscriptions({ groupEmail: 'school@example.org', emails: ['a@example.org', 'b@example.org', 'c@example.org', 'd@example.org'] });
  expect([...result.values()]).toEqual(['none', 'digest', 'daily', 'all_mail']);
});
it('shows unknown rather than Each email when Google omits delivery or fails', async () => {
  const { default: Directory } = await import('../googleWorkspaceDirectory.service.js');
  Directory.getClient = vi.fn(async () => ({ members: { get: vi.fn(async ({ memberKey }) => { if (memberKey === 'a@example.org') throw new Error('unavailable'); return { data: {} }; }) } }));
  const { readSchoolGroupSubscriptions } = await import('../schoolGroupSubscription.service.js');
  const result = await readSchoolGroupSubscriptions({ groupEmail: 'school@example.org', emails: ['a@example.org', 'b@example.org'] });
  expect([...result.values()]).toEqual([null, null]);
});
