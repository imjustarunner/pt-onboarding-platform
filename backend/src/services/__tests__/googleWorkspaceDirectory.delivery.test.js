import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../googleWorkspaceAuth.service.js', () => ({ buildImpersonatedJwtClient: vi.fn(), logGoogleUnauthorizedHint: vi.fn(), parseGoogleWorkspaceServiceAccountFromEnv: vi.fn(), GOOGLE_WORKSPACE_DIRECTORY_SCOPES: [], GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE: '' }));
import Directory from '../googleWorkspaceDirectory.service.js';
const get = vi.fn();
const update = vi.fn();
const patch = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Directory, 'getClient').mockResolvedValue({ members: { get, update, patch } });
  get.mockReset();
});
it('uses update, preserves role, and reads back actual delivery', async () => {
  get.mockResolvedValueOnce({ data: { role: 'MANAGER', delivery_settings: 'NONE' } }).mockResolvedValueOnce({ data: { role: 'MANAGER', delivery_settings: 'ALL_MAIL' } });
  const result = await Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings: 'ALL_MAIL' });
  expect(update).toHaveBeenCalledWith({ groupKey: 'school@example.org', memberKey: 'staff@example.org', requestBody: { email: 'staff@example.org', role: 'MANAGER', delivery_settings: 'ALL_MAIL' } });
  expect(patch).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.delivery_settings).toBe('ALL_MAIL');
});
it('rejects a successful API call that did not change delivery', async () => {
  get.mockResolvedValue({ data: { role: 'MEMBER', delivery_settings: 'NONE' } });
  await expect(Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings: 'ALL_MAIL' })).rejects.toThrow('could not be verified');
});
it.each([undefined, '', 'bad'])('does not silently mute when delivery is %s', async deliverySettings => {
  await expect(Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings })).rejects.toThrow('explicit valid');
  expect(update).not.toHaveBeenCalled();
});
