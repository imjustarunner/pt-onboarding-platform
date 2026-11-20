import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(), getAgencies: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgencyContact.model.js', () => ({ default: { findById: vi.fn(), findByPhone: vi.fn() } }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { createOutbound: vi.fn(), markSent: vi.fn(), markFailed: vi.fn(), normalizePhone: x => x } }));
vi.mock('../../models/UserCallSettings.model.js', () => ({ default: { getByUserId: vi.fn(async () => ({})) } }));
vi.mock('../../models/SmsThreadEscalation.model.js', () => ({ default: { findActive: vi.fn(async () => null), resolveActive: vi.fn(async () => {}) } }));
vi.mock('../notificationGatekeeper.service.js', () => ({ default: { decideChannels: vi.fn(async () => ({})) } }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../communicationRouting.service.js', () => ({ resolveClientCaregivers: vi.fn() }));
vi.mock('../sharedCareNumber.service.js', () => ({ getSharedCareNumber: vi.fn(), configuredReminderNumberId: vi.fn() }));
vi.mock('../../models/PhoneNumber.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn(async () => []) } }));
vi.mock('../channelInboxAdapter.service.js', () => ({ syncSmsThreads: vi.fn(async () => {}) }));
vi.mock('../smsProfileAudit.service.js', () => ({ recordSmsProfileAudit: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Client from '../../models/Client.model.js';
import Contact from '../../models/AgencyContact.model.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import { resolveClientCaregivers } from '../communicationRouting.service.js';
import { getSharedCareNumber, configuredReminderNumberId } from '../sharedCareNumber.service.js';
import PhoneNumber from '../../models/PhoneNumber.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { prepareSmsDelivery } from '../smsCompliance.service.js';
import { sendClinicalSms } from '../clinicalSmsSend.service.js';
import { formatRegisteredSms } from '../../utils/smsCompliancePolicy.js';
vi.mock('../smsCompliance.service.js', () => ({
 prepareSmsDelivery: vi.fn(async input => ({ from: input.from, to: input.to })),
 resolveRegisteredSmsSender: vi.fn(async () => '+17195550300')
}));
beforeEach(() => {
 vi.clearAllMocks(); pool.execute.mockResolvedValue([[{ user_id: 10 }]]);
 User.findById.mockImplementation(async id => ({ id, first_name: id === 10 ? 'Michael' : 'Jamie', role: 'provider', is_active: 1 }));
 User.getAgencies.mockResolvedValue([{ id: 2 }]);
 Client.findById.mockResolvedValue({ id: 4, agency_id: 2, contact_phone: '+17195550100' });
 resolveClientCaregivers.mockResolvedValue({ ownerUserId: 10, caregiverIds: [10, 11] });
 const providerLine = { id: 1, agency_id: 2, phone_number: '+17195550200', is_active: 1, status: 'active', number_purpose: 'clinical_care' };
 const reminderLine = { ...providerLine, id: 2, phone_number: '+17195550300' };
 getSharedCareNumber.mockResolvedValue(providerLine);
 configuredReminderNumberId.mockResolvedValue(2);
 PhoneNumber.findById.mockImplementation(async id => Number(id) === 2 ? reminderLine : providerLine);
 ClientGuardian.listForClient.mockResolvedValue([]);
 MessageLog.createOutbound.mockResolvedValue({ id: 50 }); MessageLog.markSent.mockResolvedValue({ id: 50, delivery_status: 'sent' });
 Vonage.sendSms.mockResolvedValue({ sid: 'example', status: 'sent' }); Contact.findByPhone.mockResolvedValue(null);
});
it('checks the real clinical SMS route and consent for a preview without sending or creating a message log',async()=>{
 const result=await sendClinicalSms({userId:10,clientId:4,numberId:1,body:'Your signed appointment letter.',preview:true});
 expect(result).toMatchObject({eligible:true,numberId:1,from:'+17195550200',to:'+17195550100'});
 expect(MessageLog.createOutbound).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it.each([[10, 'Michael'], [11, 'Jamie']])('lets assigned provider %s send with their own name', async (userId, name) => {
 await sendClinicalSms({ userId, clientId: 4, body: 'Sounds good, see you at 3pm.' });
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ from: '+17195550200', body: `${name}: Sounds good, see you at 3pm.`, senderFirstName: name }));
 expect(MessageLog.createOutbound).toHaveBeenCalledWith(expect.objectContaining({ userId, clientId: 4, body: `${name}: Sounds good, see you at 3pm.` }));
 const sent = Vonage.sendSms.mock.calls[0][0];
 expect(formatRegisteredSms(sent.body, 'ITSCO', sent.senderFirstName)).toBe(`Sounds good, see you at 3pm.\n— ${name} with ITSCO\nReply STOP to opt out.`);
});
it('rejects an unrelated provider before logging or sending', async () => {
 await expect(sendClinicalSms({ userId: 12, clientId: 4, body: 'Hi' })).rejects.toMatchObject({ status: 403 });
 expect(MessageLog.createOutbound).not.toHaveBeenCalled(); expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('does not let a linked contact alias bypass assignment', async () => {
 Contact.findById.mockResolvedValue({ id: 7, client_id: 4, agency_id: 2, phone: '+17195550100' });
 await expect(sendClinicalSms({ userId: 12, contactId: 7, body: 'Hi' })).rejects.toMatchObject({ status: 403 });
 expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it.each([{ is_active: 0 }, { terminated_at: '2026-01-01' }])('blocks inactive staff %j', async patch => {
 User.findById.mockResolvedValue({ id: 10, role: 'provider', first_name: 'Michael', ...patch });
 await expect(sendClinicalSms({ userId: 10, clientId: 4, body: 'Hi' })).rejects.toMatchObject({ status: 403 });
 expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('requires active agency membership even for support', async () => {
 pool.execute.mockResolvedValue([[]]); User.findById.mockResolvedValue({ id: 10, role: 'support', first_name: 'Michael' });
 await expect(sendClinicalSms({ userId: 10, clientId: 4, body: 'Hi' })).rejects.toMatchObject({ status: 403 });
});
it('preserves authorized support coverage', async () => {
 User.findById.mockResolvedValue({ id: 12, role: 'support', first_name: 'Jamie' });
 await sendClinicalSms({ userId: 12, clientId: 4, body: 'We can help.' });
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ body: 'Jamie: We can help.' }));
});
it('does not duplicate a typed signature or take the author from user input', async () => {
 await sendClinicalSms({ userId: 10, clientId: 4, body: 'Michael: Hi', senderFirstName: 'Someone else' });
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ body: 'Michael: Hi', senderFirstName: 'Michael' }));
});
it('requires an identifiable sender', async () => {
 User.findById.mockResolvedValue({ id: 10, role: 'provider', first_name: '' });
 await expect(sendClinicalSms({ userId: 10, clientId: 4, body: 'Hi' })).rejects.toMatchObject({ status: 400 });
 expect(Vonage.sendSms).not.toHaveBeenCalled();
});

it('replies to the exact guardian phone from the original thread and checks their own consent', async () => {
 ClientGuardian.listForClient.mockResolvedValue([{ guardian_user_id: 90, access_enabled: 1, is_active: 1, phone: '+17195550190', relationship_type: 'guardian' }]);
 pool.execute.mockImplementation(async sql => sql.includes('twilio_numbers') ? [[{ id: 1 }]] : [[{ user_id: 10 }]]);
 await sendClinicalSms({ userId: 10, clientId: 4, body: 'Reply', threadKey: 'sms:v2:client:4:+17195550200:+17195550190' });
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: '+17195550190', recipientUserId: 90, requireConfirmedCare: false }));
 expect(MessageLog.createOutbound).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ guardianUserId: 90 }) }));
});
it('only allows new personal texts from the confirmed provider line of the client agency', async () => {
 await sendClinicalSms({ userId: 10, clientId: 4, numberId: 1, body: 'Hi', preview: true });
 expect(prepareSmsDelivery).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, requireConfirmedCare: true }));
 PhoneNumber.findById.mockResolvedValue({ id: 9, agency_id: 3, phone_number: '+17195550900', is_active: 1, status: 'active' });
 await expect(sendClinicalSms({ userId: 10, clientId: 4, numberId: 9, body: 'Hi' })).rejects.toMatchObject({ status: 403 });
 expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('blocks the reminder line in personal Messages, even for a support user, and permits only the support inbox to reply', async () => {
 User.findById.mockResolvedValue({ id: 10, role: 'support', first_name: 'Michael' });
 pool.execute.mockImplementation(async sql => sql.includes('twilio_numbers') ? [[{ id: 2 }]] : [[{ user_id: 10 }]]);
 const request = { userId: 10, clientId: 4, body: 'Hi', threadKey: 'sms:v2:client:4:+17195550300:+17195550100' };
 await expect(sendClinicalSms(request)).rejects.toMatchObject({ status: 403 });
 await sendClinicalSms({ ...request, supportInbox: true });
 expect(Vonage.sendSms).toHaveBeenCalledOnce();
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ from: '+17195550300' }));
});
it('requires two separate registered lines before sending from the provider inbox', async () => {
 configuredReminderNumberId.mockResolvedValue(null);
 await expect(sendClinicalSms({ userId: 10, clientId: 4, body: 'Hi' })).rejects.toMatchObject({ status: 409 });
 expect(MessageLog.createOutbound).not.toHaveBeenCalled();
});
