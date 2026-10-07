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

describe('Vonage number provisioning',()=>{
 it('searches with the installed SDK filter signature and the exact country/area prefix',async()=>{
  const getAvailableNumbers=vi.fn().mockResolvedValue({numbers:[
   {msisdn:'17197163661',cost:'0.93',initialPrice:'0.93',features:['SMS','MMS','VOICE']},
   {msisdn:'12182408224',features:['SMS','VOICE']}
  ]});
  vi.spyOn(VonageService,'getClient').mockReturnValue({numbers:{getAvailableNumbers}});
  const result=await VonageService.searchAvailableLocalNumbers({areaCode:'719',limit:10});
  expect(getAvailableNumbers).toHaveBeenCalledWith({country:'US',features:['SMS','VOICE'],type:'mobile-lvn',size:10,pattern:'1719',searchPattern:0});
  expect(result).toEqual([{phoneNumber:'+17197163661',friendlyName:'17197163661',monthlyCostEUR:'0.93',initialPriceEUR:'0.93',capabilities:{sms:true,mms:true,voice:true}}]);
 });
 it.each(['71','1719','719 OR 1=1'])('rejects invalid area code %s before a carrier call',async areaCode=>{const getClient=vi.spyOn(VonageService,'getClient');await expect(VonageService.searchAvailableLocalNumbers({areaCode})).rejects.toMatchObject({status:400});expect(getClient).not.toHaveBeenCalled();});
 it('does not claim a successful purchase after a provider-level rejection in HTTP 200',async()=>{
  const updateNumber=vi.fn();vi.spyOn(VonageService,'getClient').mockReturnValue({numbers:{buyNumber:vi.fn().mockResolvedValue({errorCode:'420',errorCodeLabel:'number unavailable'}),updateNumber}});
  await expect(VonageService.purchaseNumber({phoneNumber:'+17195550123',smsUrl:'https://example.test/sms'})).rejects.toThrow('purchase failed');expect(updateNumber).not.toHaveBeenCalled();
 });
 it('accepts the documented success code for a completed purchase',async()=>{
  vi.spyOn(VonageService,'getClient').mockReturnValue({numbers:{buyNumber:vi.fn().mockResolvedValue({errorCode:'200'})}});
  expect(await VonageService.purchaseNumber({phoneNumber:'+17195550123'})).toMatchObject({phoneNumber:'+17195550123',sid:'17195550123'});
 });
});
