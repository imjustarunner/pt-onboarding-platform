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
vi.mock('../communicationRouting.service.js', () => ({ resolveOutboundNumber: vi.fn(), resolveClientCaregivers: vi.fn() }));
vi.mock('../smsProfileAudit.service.js', () => ({ recordSmsProfileAudit: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Client from '../../models/Client.model.js';
import Contact from '../../models/AgencyContact.model.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import { resolveOutboundNumber, resolveClientCaregivers } from '../communicationRouting.service.js';
import { sendClinicalSms } from '../clinicalSmsSend.service.js';
import { formatRegisteredSms } from '../../utils/smsCompliancePolicy.js';
beforeEach(() => {
 vi.clearAllMocks(); pool.execute.mockResolvedValue([[{ user_id: 10 }]]);
 User.findById.mockImplementation(async id => ({ id, first_name: id === 10 ? 'Michael' : 'Jamie', role: 'provider', is_active: 1 }));
 User.getAgencies.mockResolvedValue([{ id: 2 }]);
 Client.findById.mockResolvedValue({ id: 4, agency_id: 2, contact_phone: '+17195550100' });
 resolveClientCaregivers.mockResolvedValue({ ownerUserId: 10, caregiverIds: [10, 11] });
 resolveOutboundNumber.mockResolvedValue({ number: { id: 1, agency_id: 2, phone_number: '+17195550200' }, ownerType: 'agency' });
 MessageLog.createOutbound.mockResolvedValue({ id: 50 }); MessageLog.markSent.mockResolvedValue({ id: 50, delivery_status: 'sent' });
 Vonage.sendSms.mockResolvedValue({ sid: 'example', status: 'sent' }); Contact.findByPhone.mockResolvedValue(null);
});
it.each([[10, 'Michael'], [11, 'Jamie']])('lets assigned provider %s send with their own name', async (userId, name) => {
 await sendClinicalSms({ userId, clientId: 4, body: 'Sounds good, see you at 3pm.' });
 expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ from: '+17195550200', body: `${name}: Sounds good, see you at 3pm.`, senderFirstName: name }));
 expect(MessageLog.createOutbound).toHaveBeenCalledWith(expect.objectContaining({ userId, clientId: 4, body: `${name}: Sounds good, see you at 3pm.` }));
 const sent = Vonage.sendSms.mock.calls[0][0];
 expect(formatRegisteredSms(sent.body, 'ITSCO', sent.senderFirstName)).toBe(`${name}: Sounds good, see you at 3pm.\nITSCO. Reply STOP to opt out.`);
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
