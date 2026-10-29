import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js', async importOriginal => ({ ...await importOriginal(), prepareSmsDelivery: vi.fn() }));
vi.mock('../vonage10dlc.service.js', () => ({ verifyCarrierSmsDelivery: vi.fn() }));
import pool from '../../config/database.js';
import { prepareSmsDelivery, resolveRegisteredSmsSender } from '../smsCompliance.service.js';
import { verifyCarrierSmsDelivery } from '../vonage10dlc.service.js';
import VonageService from '../vonage.service.js';
import { smsTransport } from '../notifyre.service.js';
import { saveSmsRegistration } from '../smsEnrollment.service.js';
import { CLIENT_SMS_PURPOSES } from '../../utils/smsCarrierPolicy.js';

const registration = { provider: 'notifyre', brandId: 'itsco-brand', campaignId: 'itsco-client', resellerId: 'notifyre',
  brandName: 'ITSCO', legalName: 'ITSCO LLC', supportContact: 'support@example.test', website: 'https://example.test',
  privacyUrl: 'https://example.test/privacy', termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/consent',
  purposes: [...CLIENT_SMS_PURPOSES], keywordOwner: 'application', approved: true, numberLinked: true };
const delivery = { agencyId: 450, registration, purpose: 'care', from: '+17195550100', to: '+17195550101', body: 'Synthetic care message' };
const bindings = { '450': {brandId:'itsco-brand',campaignId:'itsco-client'}, '2': {brandId:'itsco-brand',campaignId:'itsco-client'},
  '10': {brandId:'nlu-brand',campaignId:'nlu-client'}, '11': {brandId:'inner-strength-brand',campaignId:'inner-strength-client'} };
let send, fetchMock;
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  for (const [key,value] of Object.entries({NOTIFYRE_ENABLED:'true',NOTIFYRE_API_TOKEN:'test-only',NOTIFYRE_WEBHOOK_SECRET:'test-only',NOTIFYRE_BAA_REFERENCE:'test-only',NOTIFYRE_CLIENT_CAMPAIGNS_JSON:JSON.stringify(bindings)})) vi.stubEnv(key,value);
  prepareSmsDelivery.mockImplementation(async options => options);
  send = vi.fn().mockResolvedValue({messages:[{status:'0','message-id':'staff-1'}]});
  vi.spyOn(VonageService,'getClient').mockReturnValue({sms:{send}});
  fetchMock = vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,payload:{smsMessageID:'clinical-1',invalidToNumbers:[]}})});
  vi.stubGlobal('fetch',fetchMock);
  pool.execute.mockResolvedValue([[]]);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('purpose determines carrier, even for an approved legacy sender',()=>{
  it.each(CLIENT_SMS_PURPOSES)('never delivers %s through Vonage, with or without a clinical flag',async purpose=>{
    for (const provider of [undefined,'vonage']) {
      await expect(VonageService.sendSms({...delivery,purpose,registration:{...registration,provider,hipaaRequired:true}})).rejects.toMatchObject({code:'sms_client_notifyre_required'});
    }
    expect(send).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();expect(verifyCarrierSmsDelivery).not.toHaveBeenCalled();
  });
  it.each(['workforce','polling'])('keeps approved %s on Vonage when Notifyre is disabled or misconfigured',async purpose=>{
    vi.stubEnv('NOTIFYRE_ENABLED','false');vi.stubEnv('NOTIFYRE_CLIENT_CAMPAIGNS_JSON','broken');
    const staff={...delivery,purpose,registration:{...registration,provider:undefined,purposes:['workforce','polling']}};
    await expect(VonageService.sendSms(staff)).resolves.toMatchObject({sid:'staff-1'});
    expect(send).toHaveBeenCalledOnce();expect(verifyCarrierSmsDelivery).toHaveBeenCalledWith(staff);expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(CLIENT_SMS_PURPOSES)('sends authorized %s only through Notifyre',async purpose=>{
    await expect(VonageService.sendSms({...delivery,purpose})).resolves.toMatchObject({provider:'notifyre',status:'queued'});
    expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0][0]).toBe('https://api.notifyre.com/sms/send');
    expect(send).not.toHaveBeenCalled();expect(verifyCarrierSmsDelivery).not.toHaveBeenCalled();
  });
  it.each(['NOTIFYRE_ENABLED','NOTIFYRE_API_TOKEN','NOTIFYRE_WEBHOOK_SECRET','NOTIFYRE_BAA_REFERENCE'])('fails closed when %s is unavailable',async key=>{
    vi.stubEnv(key,'');await expect(VonageService.sendSms(delivery)).rejects.toMatchObject({code:'notifyre_not_ready'});
    expect(send).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['workforce','polling','marketing'])('does not use the client campaign for %s',async purpose=>{
    await expect(VonageService.sendSms({...delivery,purpose})).rejects.toMatchObject({code:'notifyre_client_scope_required'});
    expect(send).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not send any part of a combined confirmation spanning clinical and staff campaigns',async()=>{
    await expect(VonageService.sendSms({...delivery,purpose:'workforce',registration:{...registration,provider:'vonage'},confirmationPurposes:['workforce','care']})).rejects.toMatchObject({code:'sms_client_notifyre_required'});
    expect(send).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['timeout','rejection'])('never retries with Vonage after Notifyre %s',async failure=>{
    if(failure==='timeout')fetchMock.mockRejectedValue(new Error('timeout'));
    else fetchMock.mockResolvedValue({ok:false,json:async()=>({success:false})});
    await expect(VonageService.sendSms(delivery)).rejects.toThrow();expect(fetchMock).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
  });
});

describe('organization and campaign boundaries',()=>{
  it.each([10,11,99,undefined])('does not reuse ITSCO approval for agency %s',async agencyId=>{
    await expect(VonageService.sendSms({...delivery,agencyId})).rejects.toMatchObject({code:'notifyre_agency_campaign_mismatch'});
    expect(fetchMock).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  });
  it('checks both brand and campaign and permits only explicit same-business demo mapping',()=>{
    expect(smsTransport(delivery)).toBe('notifyre');expect(smsTransport({...delivery,agencyId:2})).toBe('notifyre');
    for(const patch of [{brandId:'nlu-brand'},{campaignId:'nlu-client'}])expect(()=>smsTransport({...delivery,registration:{...registration,...patch}})).toThrow('organization');
  });
  it('filters sender lookup by agency, carrier, brand, campaign and requested purposes',async()=>{
    await resolveRegisteredSmsSender({agencyId:450,purpose:'reminders'});
    const [sql,args]=pool.execute.mock.calls[0];expect(sql).toContain("'$.provider'");expect(sql).toContain('r.campaign_id = ?');expect(sql).toContain("'$.brandId'");
    expect(args).toEqual([450,'reminders',null,null,null,null,'notifyre','itsco-client','itsco-client','itsco-brand','itsco-brand']);
    pool.execute.mockClear();await resolveRegisteredSmsSender({agencyId:2,purpose:'workforce'});
    expect(pool.execute.mock.calls[0][1]).toEqual([2,'workforce',null,null,null,null,'vonage',null,null,null,null]);
  });
  it('does not choose a staff number when client setup or required purposes mismatch',async()=>{
    expect(await resolveRegisteredSmsSender({agencyId:99,purpose:'care'})).toBe(null);
    expect(await resolveRegisteredSmsSender({agencyId:450,purpose:'care',requiredPurpose:'workforce'})).toBe(null);
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('prevents an administrator from saving a live Vonage clinical registration',async()=>{
    pool.execute.mockResolvedValueOnce([[{id:2,agency_id:450}]]);
    await expect(saveSmsRegistration({numberId:2,registration:{...registration,provider:'vonage'},actorUserId:1})).rejects.toMatchObject({code:'sms_client_notifyre_required'});
    expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
  it('preserves bounded STOP/HELP control responses on the staff carrier',()=>{
    expect(smsTransport({registration:{provider:'vonage',purposes:['workforce']},controlReply:true})).toBe('vonage');
  });
});
