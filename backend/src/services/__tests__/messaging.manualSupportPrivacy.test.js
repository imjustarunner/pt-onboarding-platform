import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../smsCompliance.service.js', () => ({ resolveRegisteredSmsSender: vi.fn() }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../../utils/publicPortalUrl.js', () => ({ buildPublicPortalBaseUrl: () => 'https://app.itsco.health' }));
import { resolveRegisteredSmsSender } from '../smsCompliance.service.js';
import VonageService from '../vonage.service.js';
import { sendManualSupportAlert } from '../smsManualSupportAlert.service.js';
beforeEach(() => vi.resetAllMocks());
it('uses the agency staff campaign and keeps client details and clinical notes out of the alert', async () => {
  resolveRegisteredSmsSender.mockResolvedValue('+17195550100');
  await sendManualSupportAlert({ agency: { id: 2 }, to: '+17195550200', message: 'Sensitive clinical note', client: { initials: 'AB' } });
  expect(resolveRegisteredSmsSender).toHaveBeenCalledWith({ agencyId: 2, purpose: 'workforce' });
  expect(VonageService.sendSms).toHaveBeenCalledWith({ purpose: 'workforce', agencyId: 2, staffNotificationKind: 'messageAlerts',
    from: '+17195550100', to: '+17195550200', body: 'Urgent: a support request needs your attention. Sign in to review and reply securely: https://app.itsco.health' });
});
it('does not fall back to a clinical or public number when staff messaging is unavailable', async () => {
  resolveRegisteredSmsSender.mockResolvedValue(null);
  await sendManualSupportAlert({ agency: { id: 2, phone_number: '+17195550300' }, to: '+17195550200' });
  expect(VonageService.sendSms).not.toHaveBeenCalled();
});
