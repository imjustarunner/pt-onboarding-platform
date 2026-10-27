import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), recordSmsPermission: vi.fn(), isSmsSuppressed: vi.fn() }));
import { getSmsSender, recordSmsPermission, isSmsSuppressed } from '../smsCompliance.service.js';
import pool from '../../config/database.js';
import { enrollSmsRecipient, enrollSmsRecipientBatch, saveSmsRegistration } from '../smsEnrollment.service.js';
const registration = { brandId: 'B123', campaignId: 'C123', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC',
  supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy',
  termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof',
  purposes: ['reminders'], keywordOwner: 'application', approved: true, numberLinked: true };
const enrollment = { from: '+13035550100', phone: '+13035550101', purpose: 'reminders', status: 'opted_in', actorUserId: 7,
  evidence: { source: 'web_form', reference: 'request:4', signatureReference: 'request:4', signerVerified: true,
    disclosure: 'Exact disclosed choices', collectedAt: '2026-01-01T00:00:00Z' } };
beforeEach(() => {
  vi.resetAllMocks(); getSmsSender.mockResolvedValue({ agency_id: 2, registration, scope: 'campaign:C123', phone_number: enrollment.from });
  isSmsSuppressed.mockResolvedValue(false);
});
describe('signed enrollment', () => {
  it('accepts separately reviewed staff consent when account preferences have never been saved', async () => {
    getSmsSender.mockResolvedValue({ agency_id: 450, registration: { ...registration, purposes: ['workforce'] }, scope: 'campaign:C123', phone_number: enrollment.from });
    pool.execute.mockResolvedValue([[{ staff_choices: null }, { staff_choices: 'null' }]]);
    const sendConfirmation = vi.fn();
    await enrollSmsRecipient({ ...enrollment, purpose: 'workforce', sendConfirmation });
    expect(sendConfirmation).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 450, staffNotificationKind: 'notifications' }));
  });
  it('preserves explicit staff opt-outs even when another shared-phone account has no preferences', async () => {
    getSmsSender.mockResolvedValue({ agency_id: 450, registration: { ...registration, purposes: ['workforce'] }, scope: 'campaign:C123', phone_number: enrollment.from });
    pool.execute.mockResolvedValue([[{ staff_choices: null }, { staff_choices: { notifications: false, messageAlerts: false } }]]);
    const sendConfirmation = vi.fn();
    await expect(enrollSmsRecipient({ ...enrollment, purpose: 'workforce', sendConfirmation })).rejects.toMatchObject({ code: 'sms_staff_choice_off' });
    expect(recordSmsPermission).not.toHaveBeenCalled();
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
  it('confirms administrator-reviewed message alerts without enabling general notifications', async () => {
    getSmsSender.mockResolvedValue({ agency_id: 2, registration: { ...registration, purposes: ['workforce'] }, scope: 'campaign:C123', phone_number: enrollment.from });
    pool.execute.mockResolvedValue([[{ staff_choices: {notifications:false,messageAlerts:true} }]]);
    const sendConfirmation = vi.fn();
    await enrollSmsRecipient({ ...enrollment, purpose: 'workforce', sendConfirmation });
    expect(sendConfirmation).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, staffNotificationKind: 'messageAlerts' }));
  });
  it('rejects conflicting purposes on another number of the same campaign', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 3, agency_id: 2 }]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ registration_json: { ...registration, purposes: ['marketing'] } }]]);
    await expect(saveSmsRegistration({ numberId: 3, registration, actorUserId: 7 })).rejects.toMatchObject({ code: 'sms_campaign_inconsistent' });
  });
  it('sends the recurring confirmation for a reviewed signature', async () => {
    const sendConfirmation = vi.fn();
    await enrollSmsRecipient({ ...enrollment, sendConfirmation });
    expect(sendConfirmation.mock.calls[0][0].body).toContain('Message and data rates may apply');
    expect(recordSmsPermission.mock.calls[0][0]).toMatchObject({ purpose: 'reminders', status: 'opted_in' });
  });
  it('disables consent when the required confirmation fails', async () => {
    await expect(enrollSmsRecipient({ ...enrollment, sendConfirmation: vi.fn().mockRejectedValue(new Error('provider unavailable')) })).rejects.toThrow('provider unavailable');
    expect(recordSmsPermission.mock.calls.at(-1)[0]).toMatchObject({ status: 'opted_out', evidence: { source: 'confirmation_failed' } });
  });
  it('never allows a signed form to override STOP', async () => {
    isSmsSuppressed.mockResolvedValue(true);
    const sendConfirmation = vi.fn();
    await expect(enrollSmsRecipient({ ...enrollment, sendConfirmation })).rejects.toMatchObject({ code: 'sms_opted_out' });
    expect(recordSmsPermission).not.toHaveBeenCalled(); expect(sendConfirmation).not.toHaveBeenCalled();
  });
});

it('sends one combined account confirmation for multiple selected purposes with supported keywords',async()=>{
  const purposes=['reminders','care','billing'];
  getSmsSender.mockResolvedValue({agency_id:2,registration:{...registration,purposes,allowRestart:true},scope:'campaign:C123',phone_number:enrollment.from});
  const sendConfirmation=vi.fn().mockResolvedValue({sid:'one-confirmation'});
  const result=await enrollSmsRecipientBatch({...enrollment,enrollments:purposes.map(purpose=>({purpose,status:'opted_in',evidence:enrollment.evidence})),sendConfirmation});
  expect(sendConfirmation).toHaveBeenCalledOnce();
  const message=sendConfirmation.mock.calls[0][0];
  expect(message.confirmationPurposes).toEqual(purposes);
  expect(message.body).toContain('ITSCO:');
  for(const keyword of ['STOP','HELP','START'])expect(message.body).toContain(keyword);
  expect(message.body.length).toBeLessThanOrEqual(160);
  expect(result.every(entry=>entry.confirmationMessageId==='one-confirmation')).toBe(true);
});
it('does not promise START when the registered program does not support restarting',async()=>{
  const sendConfirmation=vi.fn();await enrollSmsRecipient({...enrollment,sendConfirmation});
  expect(sendConfirmation.mock.calls[0][0].body).not.toContain('START');
});

it('permits only the owner-approved ITSCO test sender to share the ITSCO brand',async()=>{
 const approved={...registration,brandId:'BRC2ZW3',campaignId:'VCV2DNM4'};
 pool.execute.mockResolvedValueOnce([[{id:2,agency_id:450}]])
  .mockResolvedValueOnce([[{number_id:3,agency_id:2,brand_id:'BRC2ZW3'}]])
  .mockResolvedValueOnce([[{id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,smsSponsorAgencyId:2}}}]])
  .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
 await saveSmsRegistration({numberId:2,registration:approved,actorUserId:1435});
 expect(pool.execute.mock.calls.at(-1)[0]).toContain('INSERT INTO sms_sender_registrations');
});
it.each([['different workspace',451,'BRC2ZW3'],['different brand',450,'OTHER']])('rejects sharing for %s',async(_,agencyId,brandId)=>{
 pool.execute.mockResolvedValueOnce([[{id:2,agency_id:agencyId}]])
  .mockResolvedValueOnce([[{agency_id:2,brand_id:brandId}]])
  .mockResolvedValueOnce([[{id:agencyId,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,smsSponsorAgencyId:2}}}]]);
 await expect(saveSmsRegistration({numberId:2,registration:{...registration,brandId,campaignId:'VCV2DNM4'},actorUserId:1435}))
  .rejects.toMatchObject({code:'sms_cross_tenant_campaign'});
});
