import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../cancellationSchoolRoster.service.js', () => ({ cancellationSchoolRoster: { list: vi.fn() } }));
vi.mock('../cancellationRecipients.service.js', () => ({ cancellationRecipients: { review: vi.fn(), permitted: vi.fn() } }));
vi.mock('../emailSendMailbox.service.js', () => ({ resolveEmailSendMailbox: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import { createProviderDayNoteEmail } from '../providerDayNoteEmail.service.js';

const roster = { list: vi.fn(async () => [{ client_id: 5, client_name: 'School client' }]) };
const database = { execute: vi.fn(async () => [[{ clientId: 8, clientName: 'Office client' }, { clientId: 5, clientName: 'School client' }]]) };
const contacts = {
  review: vi.fn(async clientId => ({ recipients: [{ key: 'guardian:1', email: `${clientId}@example.com`, userId: 1 }], contactIssue: '' })),
  permitted: vi.fn(async clientId => clientId !== 8)
};
const send = vi.fn(async () => ({ id: 'delivered' }));
const mailboxFor = vi.fn(async () => ({
  identity: { id: 4 }, fromEmail: 'messages@example.org', replyTo: 'messages@example.org', displayName: 'Provider'
}));
const service = createProviderDayNoteEmail({ database, roster, contacts, mailboxFor, send });

describe('provider day note', () => {
  it('lists school and booked clients once, then sends a note instead of a cancellation', async () => {
    const preview = await service.preview({ agencyId: 2, providerId: 7, date: '2026-10-13', timeZone: 'America/Denver' });
    expect(preview.clients.map(client => client.clientId).sort()).toEqual([5, 8]);
    const sent = await service.sendNote({
      agencyId: 2, providerId: 7, actorUserId: 7, date: '2026-10-13', timeZone: 'America/Denver',
      subject: 'A note about today', text: 'The building is open. See you this afternoon.'
    });
    expect(sent.sent).toBe(1);
    expect(sent.skipped).toBe(1);
    expect(mailboxFor).toHaveBeenCalledWith({ agencyId: 2, userId: 7 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 5, templateType: 'provider_day_note', subject: 'A note about today', source: 'manual',
      blindClientRecipient: true, senderIdentityId: 4, replyToOverride: 'messages@example.org', to: '5@example.com'
    }));
    expect(send.mock.calls[0][0].templateType).not.toBe('day_cancellation');
  });

  it('does not report a held or blocked email as sent', async () => {
    send.mockResolvedValueOnce({ skipped: true });
    await expect(service.sendNote({
      agencyId: 2, providerId: 7, actorUserId: 7, date: '2026-10-13', subject: 'Heads up', text: 'Watch for an update.'
    })).resolves.toMatchObject({ sent: 0, skipped: 1, unconfirmed: 1 });
  });
});
