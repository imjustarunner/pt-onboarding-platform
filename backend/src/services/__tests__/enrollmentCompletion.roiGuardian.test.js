import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { existingIssuedRoiGuardian } from '../issuedRoiGuardian.service.js';
const issued = { id: 1, client_id: 7, last_email_sent_to: 'invited@example.com' };
const link = { guardian_user_id: 12, email: 'invited@example.com', access_enabled: 1, permissions_json: {} };
beforeEach(() => { vi.clearAllMocks(); ClientGuardian.listForClient.mockResolvedValue([link]); });
it('associates only the staff-issued recipient with an existing permitted guardian relationship', async () => {
  expect(await existingIssuedRoiGuardian(issued, 7)).toBe(12);
});
it.each([{ access_enabled: 0 }, { permissions_json: { canViewDocs: false } }, { permissions_json: { noView: true } }, { permissions_json: { noViewOtherGuardian: true } }, { email: 'someone-else@example.com' }])('does not create or broaden access %j', async changes => {
  ClientGuardian.listForClient.mockResolvedValue([{ ...link, ...changes }]);
  expect(await existingIssuedRoiGuardian(issued, 7)).toBeNull();
});
it('rejects unrelated clients, unissued links, missing recipients and ambiguous matches', async () => {
  expect(await existingIssuedRoiGuardian(issued, 8)).toBeNull();
  expect(await existingIssuedRoiGuardian(null, 7)).toBeNull();
  expect(await existingIssuedRoiGuardian({ ...issued, last_email_sent_to: null }, 7)).toBeNull();
  expect(ClientGuardian.listForClient).not.toHaveBeenCalled();
  ClientGuardian.listForClient.mockResolvedValue([link, { ...link, guardian_user_id: 13 }]);
  expect(await existingIssuedRoiGuardian(issued, 7)).toBeNull();
});
