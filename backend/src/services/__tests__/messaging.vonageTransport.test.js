import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../smsCompliance.service.js', () => ({ prepareSmsDelivery: vi.fn() }));
vi.mock('../vonage10dlc.service.js', () => ({ verifyCarrierSmsDelivery: vi.fn() }));
import { prepareSmsDelivery } from '../smsCompliance.service.js';
import { verifyCarrierSmsDelivery } from '../vonage10dlc.service.js';
import VonageService from '../vonage.service.js';

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); verifyCarrierSmsDelivery.mockResolvedValue(undefined); });
describe('Vonage transport', () => {
  it('never calls Vonage after a compliance rejection', async () => {
    prepareSmsDelivery.mockRejectedValue(new Error('Recipient opted out'));
    const getClient = vi.spyOn(VonageService, 'getClient');
    await expect(VonageService.sendSms({})).rejects.toThrow('Recipient opted out');
    expect(getClient).not.toHaveBeenCalled();
    expect(verifyCarrierSmsDelivery).not.toHaveBeenCalled();
  });
  it('does not send or switch numbers when the carrier rejects readiness', async () => {
    prepareSmsDelivery.mockResolvedValue({ from: '+13035550100' });
    verifyCarrierSmsDelivery.mockRejectedValue(new Error('Campaign suspended'));
    const getClient = vi.spyOn(VonageService, 'getClient');
    await expect(VonageService.sendSms({})).rejects.toThrow('Campaign suspended');
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
  it('checks every selected type before sending one combined confirmation', async () => {
    prepareSmsDelivery.mockImplementation(async options => options);
    const send=vi.fn().mockResolvedValue({messages:[{status:'0','message-id':'combined'}]});
    vi.spyOn(VonageService,'getClient').mockReturnValue({sms:{send}});
    await VonageService.sendSms({to:'+13035550101',from:'+13035550100',body:'Selected staff texts',purpose:'workforce',confirmationPurposes:['workforce','polling']});
    expect(verifyCarrierSmsDelivery.mock.calls.map(([delivery])=>delivery.purpose)).toEqual(['workforce','polling']);
    expect(send).toHaveBeenCalledOnce();
  });
  it.each(['consent','carrier'])('does not send a combined confirmation if polling fails its %s check',async gate=>{
    prepareSmsDelivery.mockImplementation(async options=>{if(gate==='consent'&&options.purpose==='polling')throw Error('polling unavailable');return options;});
    verifyCarrierSmsDelivery.mockImplementation(async delivery=>{if(gate==='carrier'&&delivery.purpose==='polling')throw Error('polling unavailable');});
    const getClient=vi.spyOn(VonageService,'getClient');
    await expect(VonageService.sendSms({purpose:'workforce',confirmationPurposes:['workforce','polling']})).rejects.toThrow('polling unavailable');
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe('Vonage number provisioning',()=>{
 it('reads the exact requested number even when the carrier returns other owned numbers',async()=>{
  const getOwnedNumbers=vi.fn().mockResolvedValue({numbers:[
   {msisdn:'17197163884',moHttpUrl:'https://example.test/other'},
   {msisdn:'17197163661',moHttpUrl:'https://example.test/inbound'}
  ]});
  vi.spyOn(VonageService,'getClient').mockReturnValue({numbers:{getOwnedNumbers}});
  expect(await VonageService.getIncomingNumber({incomingPhoneNumberSid:'+17197163661'})).toMatchObject({msisdn:'17197163661',smsUrl:'https://example.test/inbound'});
  expect(getOwnedNumbers).toHaveBeenCalledWith({pattern:'17197163661',searchPattern:1});
 });
 it('does not substitute another owned number if the requested one is absent',async()=>{
  vi.spyOn(VonageService,'getClient').mockReturnValue({numbers:{getOwnedNumbers:vi.fn().mockResolvedValue({numbers:[{msisdn:'17197163884'}]})}});
  await expect(VonageService.getIncomingNumber({incomingPhoneNumberSid:'+17197163661'})).rejects.toThrow('number not found');
 });
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
