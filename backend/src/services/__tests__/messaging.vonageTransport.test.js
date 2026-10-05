import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../smsCompliance.service.js', () => ({ prepareSmsDelivery: vi.fn() }));
import { prepareSmsDelivery } from '../smsCompliance.service.js';
import VonageService from '../vonage.service.js';

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('Vonage transport', () => {
  it('never calls Vonage after a compliance rejection', async () => {
    prepareSmsDelivery.mockRejectedValue(new Error('Recipient opted out'));
    const getClient = vi.spyOn(VonageService, 'getClient');
    await expect(VonageService.sendSms({})).rejects.toThrow('Recipient opted out');
    expect(getClient).not.toHaveBeenCalled();
  });
  it('sends the normalized, branded result of the gate', async () => {
    prepareSmsDelivery.mockResolvedValue({ to: '+13035550101', from: '+13035550100', body: 'ITSCO: Hello. Reply STOP to opt out.' });
    const send = vi.fn().mockResolvedValue({ messages: [{ status: '0', 'message-id': 'id1' }] });
    vi.spyOn(VonageService, 'getClient').mockReturnValue({ sms: { send } });
    await expect(VonageService.sendSms({ body: 'Hello' })).resolves.toMatchObject({ sid: 'id1' });
    expect(send).toHaveBeenCalledWith({ to: '+13035550101', from: '+13035550100', text: 'ITSCO: Hello. Reply STOP to opt out.' });
  });
  it('verifies an SMS API signature with the installed SDK argument order', () => {
    vi.stubEnv('VONAGE_API_KEY', 'test'); vi.stubEnv('VONAGE_API_SECRET', 'test');
    vi.stubEnv('VONAGE_SIGNATURE_SECRET', 'test-signature-secret'); vi.stubEnv('VONAGE_SIGNATURE_ALGORITHM', 'MD5HASH');
    const params = { msisdn: '13035550101', text: 'STOP', to: '13035550100' };
    const signature = createHash('md5').update('&msisdn=13035550101&text=STOP&to=13035550100test-signature-secret').digest('hex');
    try {
      expect(VonageService.validateWebhook({ params, signature })).toBe(true);
      expect(VonageService.validateWebhook({ params: { ...params, text: 'START' }, signature })).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
});
