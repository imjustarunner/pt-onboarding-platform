import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../guardianAppointments.service.js', () => ({ guardianReminderPreferences: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), isSmsSuppressed: vi.fn(), recordedReminderConsent: vi.fn(), resolveRegisteredSmsSender: vi.fn() }));
vi.mock('../smsConsentRequest.service.js', () => ({ createSmsConsentRequest: vi.fn() }));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { guardianReminderPreferences } from '../guardianAppointments.service.js';
import { getSmsSender, isSmsSuppressed, recordedReminderConsent, resolveRegisteredSmsSender } from '../smsCompliance.service.js';
import { createSmsConsentRequest } from '../smsConsentRequest.service.js';
import { guardianNotificationSetup, beginGuardianSmsConsent } from '../guardianNotificationSetup.service.js';
const args = { userId: 10, clientId: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  guardianReminderPreferences.mockResolvedValue({ agencyId: 2, isDefault: false, channels: { sms: true } });
  ClientGuardian.listForClient.mockResolvedValue([{ guardian_user_id: 10, phone: '+13035550101', relationship_type: 'guardian' }]);
  resolveRegisteredSmsSender.mockResolvedValue('+13035550100');
  getSmsSender.mockResolvedValue({ id: 4 }); pool.execute.mockResolvedValue([[]]);
});
it('keeps SMS setup pending until consent is recorded, and honors STOP even after consent', async () => {
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: false, smsStatus: 'needs_consent' });
  recordedReminderConsent.mockResolvedValue({ signerVerified: true });
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: true, smsStatus: 'enrolled' });
  isSmsSuppressed.mockResolvedValue(true);
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: false, smsStatus: 'stopped' });
  await expect(beginGuardianSmsConsent(args)).rejects.toMatchObject({ status: 409 });
  expect(createSmsConsentRequest).not.toHaveBeenCalled();
});
it('allows completion with texts declined, but requires preferences to be saved', async () => {
  guardianReminderPreferences.mockResolvedValue({ agencyId: 2, isDefault: false, channels: { sms: false } });
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: true });
  guardianReminderPreferences.mockResolvedValue({ agencyId: 2, isDefault: true, channels: { sms: false } });
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: false });
});
it('creates consent only for the authenticated recipient’s stored phone and agency', async () => {
  await beginGuardianSmsConsent(args);
  expect(createSmsConsentRequest).toHaveBeenCalledWith({ agencyId: 2, numberId: 4, phone: '+13035550101', signerRole: 'guardian', actorUserId: 10 });
});
it('does not read contacts or create consent after authorization fails', async () => {
  guardianReminderPreferences.mockRejectedValue(Object.assign(new Error('Denied'), { status: 403 }));
  await expect(beginGuardianSmsConsent(args)).rejects.toMatchObject({ status: 403 });
  expect(ClientGuardian.listForClient).not.toHaveBeenCalled(); expect(createSmsConsentRequest).not.toHaveBeenCalled();
});
it('shows signed consent awaiting review as pending', async () => {
  pool.execute.mockResolvedValue([[{ id: 3 }]]);
  expect(await guardianNotificationSetup(args)).toMatchObject({ complete: false, smsStatus: 'awaiting_review' });
});
