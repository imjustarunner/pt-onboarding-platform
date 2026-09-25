import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: async () => ({ clientOooAutoReplyEnabled: true }) }));
vi.mock('../afterHoursEmailPolicy.service.js', () => ({ eligibleClientAfterHoursReply: vi.fn() }));
vi.mock('../availabilityWindow.service.js', () => ({ isUserAvailable: vi.fn(async () => ({ available: false, schedule: { enabled: true, timezone: 'America/Denver' } })), nextAvailableAt: () => new Date('2026-09-28T13:00:00Z'), formatReturnAt: () => 'Monday 7 a.m.', addBusinessHours: vi.fn(), resolveAvailabilitySchedule: vi.fn() }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: { findById: async () => ({ id: 3, agency_id: 2, owner_user_id: 5, kind: 'personal', sender_identity_id: 4, from_email: 'provider@itsco.health' }) } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { addMessage: vi.fn(async () => 1) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ name: 'Agency' }) } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import pool from '../../config/database.js';
import Conversation from '../../models/CommunicationConversation.model.js';
import { eligibleClientAfterHoursReply } from '../afterHoursEmailPolicy.service.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { maybeSendClientOooAutoReply } from '../emailAutomation.service.js';
const input = { agencyId: 2, ownerUserId: 5, conversationId: 10, fromEmail: 'parent@example.org', subject: 'Re: Appointment', recipientEmails: ['provider@itsco.health'] };
beforeEach(() => { vi.clearAllMocks();pool.execute.mockResolvedValue([[{ id: 10, inbox_id: 3, sender_trust: 'guardian', auto_reply_sent_at: null }]]);eligibleClientAfterHoursReply.mockResolvedValue({ id: 5, first_name: 'Provider' });sendEmailFromIdentity.mockResolvedValue({ id: 'gmail-message' }); });
it('does not send or mark the conversation replied when the policy excludes the owner/sender/recipients', async () => {
 eligibleClientAfterHoursReply.mockResolvedValue(null);
 expect(await maybeSendClientOooAutoReply(input)).toMatchObject({ sent: false, reason: 'after_hours_reply_not_allowed' });
 expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(Conversation.addMessage).not.toHaveBeenCalled();
});
it('carries the original recipient context to the send boundary and does not double-prefix Re', async () => {
 expect(await maybeSendClientOooAutoReply(input)).toMatchObject({ sent: true });
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Re: Appointment', afterHoursReplyContext: expect.objectContaining({ recipientEmails: input.recipientEmails, senderTrust: 'guardian', ownerUserId: 5 }) }));
});
it('does not record a failed or blocked sender as a delivered auto-reply', async () => {
 sendEmailFromIdentity.mockResolvedValue({ skipped: true, blocked: true, reason: 'sender_unverified' });
 expect(await maybeSendClientOooAutoReply(input)).toMatchObject({ sent: false });
 expect(Conversation.addMessage).not.toHaveBeenCalled();
 expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SET auto_reply_sent_at'))).toBe(false);
});
