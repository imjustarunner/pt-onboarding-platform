import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: {} }));
import Identity from '../../models/EmailSenderIdentity.model.js';
import User from '../../models/User.model.js';
import { resolveEmailSendMailbox } from '../emailSendMailbox.service.js';
const inbox = { id: 10, agency_id: 2, kind: 'personal', owner_user_id: 5, sender_identity_id: 7, from_email: 'staff@itsco.health' };
beforeEach(() => { vi.resetAllMocks(); User.getAgencies.mockResolvedValue([{ id: 2 }]); Identity.findById.mockResolvedValue({ id: 7, agency_id: 2, from_email: inbox.from_email, is_active: 1 }); });
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
