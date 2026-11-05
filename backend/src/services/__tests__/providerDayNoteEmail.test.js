import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../cancellationSchoolRoster.service.js', () => ({ cancellationSchoolRoster: { list: vi.fn() } }));
vi.mock('../cancellationRecipients.service.js', () => ({ cancellationRecipients: { review: vi.fn(), permitted: vi.fn() } }));
vi.mock('../clientPortalEmail.service.js', () => ({ sendClientPortalEmail: vi.fn() }));
import { createProviderDayNoteEmail } from '../providerDayNoteEmail.service.js';

const roster = { list: vi.fn(async () => [{ client_id: 5, client_name: 'School client' }]) };
const database = { execute: vi.fn(async () => [[{ clientId: 8, clientName: 'Office client' }, { clientId: 5, clientName: 'School client' }]]) };
const contacts = {
  review: vi.fn(async clientId => ({ recipients: [{ key: 'guardian:1', email: `${clientId}@example.com`, userId: 1 }], contactIssue: '' })),
  permitted: vi.fn(async clientId => clientId !== 8)
};
const send = vi.fn(async () => ({ ok: true }));
const service = createProviderDayNoteEmail({ database, roster, contacts, send });

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
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 5, templateType: 'provider_day_note', subject: 'A note about today', source: 'manual'
    }));
    expect(send.mock.calls[0][0].templateType).not.toBe('day_cancellation');
  });
});
