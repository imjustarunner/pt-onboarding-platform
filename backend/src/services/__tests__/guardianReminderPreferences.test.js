import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listClientsForGuardian: vi.fn(), isNoView: vi.fn() } }));
vi.mock('../sessionNotification.service.js', () => ({ getClientPreferences: vi.fn(), putClientPreferences: vi.fn() }));
vi.mock('../familyBillingEncryption.service.js', () => ({ encryptFamilyBilling: vi.fn(), decryptFamilyBilling: vi.fn() }));
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { getClientPreferences, putClientPreferences } from '../sessionNotification.service.js';
import { guardianReminderPreferences, listGuardianAppointments } from '../guardianAppointments.service.js';
beforeEach(() => {
  vi.resetAllMocks();
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{ client_id: 1, agency_id: 2 }]);
  getClientPreferences.mockResolvedValue({ isDefault: false, channels: { sms: false } });
});
it('lets an authorized recipient review personal choices without requiring appointment disclosure', async () => {
  await guardianReminderPreferences({ userId: 10, clientId: 1 });
  expect(ClientGuardian.listClientsForGuardian).toHaveBeenCalledWith({ guardianUserId: 10, requiredClinicalScope: null });
  expect(getClientPreferences).toHaveBeenCalledWith(2, 1, 10);
});
it('preserves clinical authorization for appointment viewing', async () => {
  ClientGuardian.listClientsForGuardian.mockResolvedValue([]);
  await expect(listGuardianAppointments({ userId: 10, clientId: 1 })).rejects.toMatchObject({ status: 403 });
  expect(ClientGuardian.listClientsForGuardian).toHaveBeenCalledWith({ guardianUserId: 10, requiredClinicalScope: 'session_frequency' });
});
it('ignores client-supplied recipient and agency IDs when saving choices', async () => {
  await guardianReminderPreferences({ userId: 10, clientId: 1, input: { agencyId: 999, guardianUserId: 999, channels: { sms: true, email: false } } });
  expect(putClientPreferences).toHaveBeenCalledWith(2, 1, expect.objectContaining({ channels: { in_app: true, sms: true, email: false, phone: false } }), 10);
});
it('rejects missing relationships and no-view accounts', async () => {
  ClientGuardian.isNoView.mockReturnValue(true);
  await expect(guardianReminderPreferences({ userId: 10, clientId: 1 })).rejects.toMatchObject({ status: 403 });
  expect(getClientPreferences).not.toHaveBeenCalled();
});
