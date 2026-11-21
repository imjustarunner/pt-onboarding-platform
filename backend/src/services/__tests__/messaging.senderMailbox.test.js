import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), findById: vi.fn() } }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: {} }));
vi.mock('../workspaceMailboxType.service.js', () => ({ workspaceMailboxType: vi.fn() }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: vi.fn() }));
vi.mock('../personalMailbox.service.js', () => ({ findPersonalInbox: vi.fn() }));
import { workspaceMailboxType } from '../workspaceMailboxType.service.js';
import { resolveMessagesSendMailbox } from '../tenantMessageMailboxes.service.js';
import { findPersonalInbox } from '../personalMailbox.service.js';
import Identity from '../../models/EmailSenderIdentity.model.js';
import User from '../../models/User.model.js';
import { resolveEmailSendMailbox } from '../emailSendMailbox.service.js';
const inbox = { id: 10, agency_id: 2, kind: 'personal', owner_user_id: 5, sender_identity_id: 7, from_email: 'staff@itsco.health' };
beforeEach(() => { vi.resetAllMocks(); User.findById.mockResolvedValue({ id: 5 }); workspaceMailboxType.mockResolvedValue('group'); User.getAgencies.mockResolvedValue([{ id: 2 }]); Identity.findById.mockResolvedValue({ id: 7, agency_id: 2, from_email: inbox.from_email, is_active: 1 }); });
it('sends from the selected Group identity and routes replies back to it', async () => {
  expect(await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).toMatchObject({ fromEmail: 'staff@itsco.health', replyTo: 'staff@itsco.health', identity: { id: 7 } });
});
it('does not let another staff member use a personal Group identity', async () => {
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 6, inbox })).rejects.toMatchObject({ status: 403 });
});
it('rejects an inbox from another tenant and an identity whose From disagrees', async () => {
  await expect(resolveEmailSendMailbox({ agencyId: 3, userId: 5, inbox })).rejects.toMatchObject({ status: 400 });
  Identity.findById.mockResolvedValue({ id: 7, agency_id: 2, from_email: 'different@itsco.health' });
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).rejects.toMatchObject({ status: 400 });
});

it('repairs a legacy shared Reply-To for a personal mailbox at send time', async () => {
 Identity.findById.mockResolvedValue({id:7,agency_id:2,from_email:inbox.from_email,reply_to:'messages@itsco.health',is_active:1});
 expect((await resolveEmailSendMailbox({agencyId:2,userId:5,inbox})).replyTo).toBe(inbox.from_email);
});

const managedAgency = { id: 2, slug: 'itsco', is_active: 1, organization_type: 'agency' };
it('sends SSO mailbox mail through tenant messages with messages as Reply-To', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('user');
  resolveMessagesSendMailbox.mockResolvedValue({ identity: { id: 8, agency_id: 2, is_active: 1 }, fromEmail: 'messages@itsco.health', inbox: { id: 99 } });
  const mailbox = await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox });
  expect(mailbox).toMatchObject({ identity: { id: 8 }, fromEmail: 'messages@itsco.health', replyTo: 'messages@itsco.health', inbox: { id: 10, owner_user_id: 5 }, routing: 'workspace_user' });
  expect(workspaceMailboxType).toHaveBeenCalledWith(inbox.from_email);
});
it('keeps a non-SSO Group sender and Reply-To unchanged', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('group');
  expect(await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).toMatchObject({ identity: { id: 7 }, fromEmail: inbox.from_email, replyTo: inbox.from_email });
  expect(resolveMessagesSendMailbox).not.toHaveBeenCalled();
});
it('does not guess the From address when mailbox verification fails', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockRejectedValue(new Error('Directory unavailable'));
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).rejects.toThrow('Directory unavailable');
  expect(resolveMessagesSendMailbox).not.toHaveBeenCalled();
});
it('rejects a messages sender belonging to another tenant', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('user');
  resolveMessagesSendMailbox.mockResolvedValue({ identity: { id: 8, agency_id: 3, is_active: 1 }, fromEmail: 'messages@other.example' });
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).rejects.toMatchObject({ status: 400 });
});
it('keeps Group users on their own sender even if messages was selected', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('group');
  findPersonalInbox.mockResolvedValue(inbox);
  Identity.findById.mockImplementation(async id => id === 8 ? { id: 8, agency_id: 2, from_email: 'messages@itsco.health', identity_key: 'messages' } : { id: 7, agency_id: 2, from_email: inbox.from_email });
  expect(await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox: { id: 99, agency_id: 2, sender_identity_id: 8, from_email: 'messages@itsco.health', kind: 'shared' } })).toMatchObject({ inbox: { id: 10 }, fromEmail: inbox.from_email, replyTo: inbox.from_email });
});

it('blocks private addresses before looking up send-as credentials', async () => {
  User.findById.mockResolvedValue({ id: 5, personal_email: inbox.from_email });
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).rejects.toMatchObject({ status: 400 });
  expect(workspaceMailboxType).not.toHaveBeenCalled();
});
it('does not route non-SSO messages through the tenant sender or through a direct Workspace user mailbox', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  User.findById.mockResolvedValue({ id: 5, sso_password_override: 1 });
  workspaceMailboxType.mockResolvedValue('user');
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox })).rejects.toMatchObject({ status: 400 });
  expect(resolveMessagesSendMailbox).not.toHaveBeenCalled();
});

it('sends an SSO appointment email through Messages with replies routed into Messages', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('user');
  resolveMessagesSendMailbox.mockResolvedValue({
    identity: { id: 8, agency_id: 2, is_active: 1 }, fromEmail: 'messages@itsco.health', inbox: { id: 99 }
  });
  const mailbox = await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox, appointmentReplyRouting: true });
  expect(mailbox).toMatchObject({
    identity: { id: 8 }, fromEmail: 'messages@itsco.health', replyTo: 'messages@itsco.health',
    inbox: { id: 10, owner_user_id: 5 }, routing: 'appointment_email'
  });
});

it.each([{}, { sso_password_override: 1 }, { login_is_group_email: 1 }])('sends non-SSO appointment email from the owned work group with work Reply-To %j', async (account) => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  User.findById.mockResolvedValue({ id: 5, ...account });
  workspaceMailboxType.mockResolvedValue('group');
  expect(await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox, appointmentReplyRouting: true }))
    .toMatchObject({ fromEmail: inbox.from_email, replyTo: inbox.from_email, identity: { id: 7 } });
  expect(resolveMessagesSendMailbox).not.toHaveBeenCalled();
});

it('rechecks the owned group before replying to an older linked Messages conversation', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  findPersonalInbox.mockResolvedValue(inbox);
  Identity.findById.mockImplementation(async id => id === 8
    ? { id: 8, agency_id: 2, from_email: 'messages@itsco.health', identity_key: 'messages' }
    : { id: 7, agency_id: 2, from_email: inbox.from_email });
  const selected = { id: 99, agency_id: 2, sender_identity_id: 8, from_email: 'messages@itsco.health', kind: 'shared' };
  expect(await resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox: selected, keepMessagesRoute: true }))
    .toMatchObject({ inbox: { id: 10 }, fromEmail: inbox.from_email, replyTo: inbox.from_email });
});

it('requires the verified work address and ITSCO sender for appointment routing', async () => {
  User.getAgencies.mockResolvedValue([managedAgency]);
  workspaceMailboxType.mockResolvedValue('user');
  resolveMessagesSendMailbox.mockResolvedValue({ identity: { id: 8, agency_id: 2 }, fromEmail: 'support@itsco.health' });
  await expect(resolveEmailSendMailbox({ agencyId: 2, userId: 5, inbox, appointmentReplyRouting: true })).rejects.toMatchObject({ status: 400 });
});
