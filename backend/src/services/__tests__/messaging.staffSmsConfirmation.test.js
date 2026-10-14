import {beforeEach, it, expect, vi} from 'vitest';
vi.mock('../../config/database.js', () => ({default: {execute: vi.fn(), getConnection: vi.fn()}}));
vi.mock('../chatEncryption.service.js', () => ({decryptChatText: () => '{}'}));
vi.mock('../staffSmsEnrollmentBridge.service.js', () => ({currentStaffEnrollmentEvidence: vi.fn()}));
vi.mock('../smsCompliance.service.js', () => ({getSmsSender: vi.fn(), isSmsSuppressed: vi.fn(), recordSmsPermission: vi.fn()}));
import pool from '../../config/database.js';
import {currentStaffEnrollmentEvidence} from '../staffSmsEnrollmentBridge.service.js';
import {getSmsSender, isSmsSuppressed, recordSmsPermission} from '../smsCompliance.service.js';
import {reviewSmsConsentRequest} from '../smsConsentRequest.service.js';

const registration = {brandId:'B1',campaignId:'C2',resellerId:'R1',brandName:'ITSCO',legalName:'ITSCO, LLC',supportContact:'support@example.test',
  website:'https://example.test',termsUrl:'https://example.test/terms',privacyUrl:'https://example.test/privacy',evidenceUrl:'https://example.test/proof',
  purposes:['workforce','polling'],keywordOwner:'application',approved:true,numberLinked:true};
const row = {id:4,agency_id:2,number_id:3,phone:'+13035550101',signer_role:'staff',signed_at:new Date('2026-01-01'),signed_payload_json:{},
  disclosure_json:{enrollmentCategory:'staff_communications',userId:7},disclosure_hash:'saved'};
let signed, activation, send, connection;
const review = () => reviewSmsConsentRequest({agencyId:2,requestId:4,actorUserId:501,signerVerified:true,sendConfirmation:send});
beforeEach(() => {
  vi.resetAllMocks(); activation = {};
  signed = {choices:{workforce:'yes',polling:'yes'},disclosure:{text:'Signed staff choices',enrollmentCategory:'staff_communications'},signedAt:'2026-01-01T00:00:00Z',staffCommunicationReference:'staff_communications:7:1'};
  currentStaffEnrollmentEvidence.mockImplementation(async () => signed);
  getSmsSender.mockResolvedValue({registration,agency_id:2,scope:'campaign:C2',phone_number:'+13035550100'});
  isSmsSuppressed.mockResolvedValue(false);
  connection = {execute:vi.fn().mockResolvedValue([[{acquired:1}]]),release:vi.fn()};
  pool.getConnection.mockResolvedValue(connection);
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT * FROM sms_consent_requests')) return [[row]];
    if (sql.startsWith('SELECT phone_number')) return [[{phone_number:'+13035550100'}]];
    if (sql.startsWith('SELECT id FROM sms_consent_requests')) return [[]];
    if (sql.startsWith('SELECT activation_json')) return [[{activation_json:activation}]];
    if (sql.includes('AS staff_choices')) return [[{staff_choices:{notifications:true,polling:signed.choices.polling==='yes'}}]];
    if (sql.startsWith('UPDATE sms_consent_requests SET activation_json')) activation = JSON.parse(args[0]);
    return [{affectedRows:1}];
  });
  send = vi.fn().mockResolvedValue({sid:'one-confirmation'});
});
it('confirms both selected types once and does not resend on a repeated review', async () => {
  const result = await review();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({purpose:'workforce',confirmationPurposes:['workforce','polling']});
  expect(send.mock.calls[0][0].body).toContain('workforce notifications and optional polls and surveys');
  expect(result.results.workforce.confirmationMessageId).toBe('one-confirmation');
  expect(result.results.polling.confirmationMessageId).toBe('one-confirmation');
  await review();
  expect(send).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(2);
});
it.each([['workforce','polling'],['polling','workforce']])('confirms %s alone when %s is declined', async (yes, no) => {
  signed.choices[no]='no';
  await review();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({purpose:yes,confirmationPurposes:[yes]});
  expect(recordSmsPermission).toHaveBeenCalledWith(expect.objectContaining({purpose:no,status:'opted_out'}));
  expect(activation[no].confirmationMessageId).toBeNull();
});
it('saves all No without sending a confirmation', async () => {
  signed.choices={workforce:'no',polling:'no'};
  await review();
  expect(send).not.toHaveBeenCalled();
  expect(recordSmsPermission.mock.calls.every(([entry]) => entry.status==='opted_out')).toBe(true);
});
it('revokes both newly accepted types if their combined confirmation fails', async () => {
  send.mockRejectedValue(new Error('carrier unavailable'));
  await expect(review()).rejects.toThrow('carrier unavailable');
  expect(recordSmsPermission.mock.calls.slice(-2).map(([entry]) => [entry.purpose,entry.status])).toEqual([['workforce','opted_out'],['polling','opted_out']]);
  expect(activation).toEqual({});
  expect(connection.release).toHaveBeenCalledOnce();
});
it('does not activate or send after STOP', async () => {
  isSmsSuppressed.mockResolvedValue(true);
  await expect(review()).rejects.toMatchObject({code:'sms_opted_out'});
  expect(send).not.toHaveBeenCalled();
  expect(recordSmsPermission).not.toHaveBeenCalled();
});
