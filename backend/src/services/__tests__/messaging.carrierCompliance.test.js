import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCarrierSmsPolicy, verifyCarrierSmsDelivery, listVonage10dlc } from '../vonage10dlc.service.js';
import { formatRegisteredSms } from '../../utils/smsCompliancePolicy.js';

const registration = { brandId: 'B123', campaignId: 'VC123', resellerId: 'R000000', keywordOwner: 'application' };
const campaign = { brand_id: 'B123', campaign_id: 'VC123', reseller_id: 'R000000', status: 'ACTIVE', traffic_enabled: true,
  usecase: 'MIXED', sub_usecases: ['ACCOUNT_NOTIFICATION', 'CUSTOMER_CARE'], embedded_link: true, embedded_phone: true, opt_out_assist: false };
const number = { number: '17195550100', status: 'LINKED', compliance: [] };
const message = { registration, from: '+17195550100', purpose: 'reminders', body: 'ITSCO: Your appointment is tomorrow. Reply STOP to opt out.' };
const check = (patch = {}) => assertCarrierSmsPolicy({ ...message, campaign, number, ...patch });
beforeEach(() => { vi.stubEnv('VONAGE_API_KEY', 'test'); vi.stubEnv('VONAGE_API_SECRET', 'test'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('carrier approval cannot be replaced by local flags', () => {
  it('allows the approved service purpose on its linked number', () => expect(() => check()).not.toThrow());
  it.each([{ status: 'SUSPENDED' }, { traffic_enabled: false }, { brand_id: 'BOTHER' }, { campaign_id: 'VCOTHER' }])('rejects campaign %j', patch => {
    expect(() => check({ campaign: { ...campaign, ...patch } })).toThrow('exact brand and campaign');
  });
  it.each(['LINKING', 'REJECTED', 'UNLINKING', 'UNLINKED'])('blocks number status %s', status => {
    expect(() => check({ number: { ...number, status } })).toThrow('not linked');
  });
  it('rejects a different number even when linked', () => expect(() => check({ number: { ...number, number: '17195550200' } })).toThrow('not linked'));
  it('blocks polling and marketing on a service-only campaign', () => {
    for (const purpose of ['polling', 'marketing']) expect(() => check({ purpose })).toThrow('use cases');
  });
  it('allows polling only when the carrier registered polling', () => {
    expect(() => check({ purpose: 'polling', campaign: { ...campaign, usecase: 'LOW_VOLUME', sub_usecases: ['ACCOUNT_NOTIFICATION', 'POLLING_VOTING'] } })).not.toThrow();
  });
  it('rejects a reseller or keyword ownership mismatch', () => {
    expect(() => check({ campaign: { ...campaign, reseller_id: 'ROTHER' } })).toThrow('reseller');
    expect(() => check({ campaign: { ...campaign, opt_out_assist: true } })).toThrow('STOP and HELP');
  });
  it('preserves the HIPAA provisioning hold when required locally or by the campaign', () => {
    expect(() => check({ registration: { ...registration, hipaaRequired: true } })).toThrow('HIPAA');
    expect(() => check({ campaign: { ...campaign, hipaa: true } })).toThrow('HIPAA');
    expect(() => check({ campaign: { ...campaign, hipaa: true }, number: { ...number, compliance: ['HIPAA'] } })).not.toThrow();
  });
  it('allows keyword HELP contact details without declaring embedded callback numbers, but still checks suspension', () => {
    expect(() => check({ controlReply: true, body: 'For help call 719-555-0100', campaign: { ...campaign, embedded_phone: false } })).not.toThrow();
    expect(() => check({ controlReply: true, campaign: { ...campaign, traffic_enabled: false } })).toThrow('exact brand');
  });
});

describe('message content attributes', () => {
  it('rejects undeclared links and callback numbers', () => {
    expect(() => check({ body: 'Sign in: https://app.itsco.health', campaign: { ...campaign, embedded_link: false } })).toThrow('Links were not declared');
    expect(() => check({ body: 'Call (719) 555-0100', campaign: { ...campaign, embedded_phone: false } })).toThrow('Callback numbers');
  });
  it.each(['https://bit.ly/test', 'bit.ly/test', 'https://tinyurl.com/test', 'http://app.itsco.health', 'https://user:password@app.itsco.health'])('blocks unsafe link %s', body => {
    expect(() => check({ body })).toThrow();
  });
  it('allows a full HTTPS portal or meeting link', () => {
    expect(() => check({ body: 'Sign in at https://app.itsco.health' })).not.toThrow();
    expect(() => check({ body: 'Join https://meet.google.com/abc-defg-hij' })).not.toThrow();
  });
  it('an incidental STOP does not remove the unsubscribe instructions', () => {
    expect(formatRegisteredSms('Please stop at the front desk.', 'ITSCO')).toContain('Reply STOP to opt out.');
    expect(formatRegisteredSms('Reply STOP to opt out.', 'ITSCO').match(/STOP/g)).toHaveLength(1);
  });
});

describe('live read-only checks', () => {
  const ok = data => ({ ok: true, json: async () => data });
  it('checks both campaign and number on every attempt, including a later suspension', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok(campaign)).mockResolvedValueOnce(ok(number))
      .mockResolvedValueOnce(ok({ ...campaign, traffic_enabled: false })).mockResolvedValueOnce(ok(number));
    vi.stubGlobal('fetch', fetch);
    await verifyCarrierSmsDelivery(message);
    await expect(verifyCarrierSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_carrier_campaign_blocked' });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([url, options]) => url.startsWith('https://api-eu.vonage.com/v1/10dlc/brands/B123/campaigns/VC123') && options.method === 'GET' && options.redirect === 'error')).toBe(true);
  });
  it.each([404, 429, 500])('fails closed on carrier HTTP %s without reading/logging its body', async status => {
    const json = vi.fn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json }));
    await expect(verifyCarrierSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_carrier_unavailable' });
    expect(json).not.toHaveBeenCalled();
  });
  it('fails closed on a network timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    await expect(verifyCarrierSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_carrier_unavailable' });
  });
  it('includes later inventory pages and rejects an incomplete response', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ total_pages: 2, _embedded: { brands: [{ brand_id: 'B1' }] } }))
      .mockResolvedValueOnce(ok({ total_pages: 2, _embedded: { brands: [{ brand_id: 'B2' }] } }))
      .mockResolvedValueOnce(ok({}));
    vi.stubGlobal('fetch', fetch);
    expect(await listVonage10dlc('/brands', 'brands')).toHaveLength(2);
    expect(fetch.mock.calls[1][0]).toContain('page=2');
    await expect(listVonage10dlc('/brands', 'brands')).rejects.toThrow('incomplete');
  });
});
