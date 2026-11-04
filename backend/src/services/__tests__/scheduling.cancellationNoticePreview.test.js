import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), agency: vi.fn(), execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../messageReminderRecipient.service.js', () => ({ messageReminderRecipient: vi.fn() }));
vi.mock('../personalMailboxImportPolicy.service.js', () => ({ canImportPersonalMailboxEmail: vi.fn() }));
import { createCancellationNoticePreview } from '../cancellationNoticePreview.service.js';

const item = (kind = 'appointment', agencyId = 450) => ({
  kind, agencyId, message: { subject: 'Session canceled — 2026-11-09', text: 'Reviewed body' },
  clients: [{ clientId: 8, mode: 'guardian', channels: ['email'], recipients: [{ userId: 7, email: 'parent@example.com' }] }],
  recipients: ['school@example.com']
});
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ email: 'parent@example.com', personal_email: 'parent@example.com' });
  m.agency.mockResolvedValue({ name: 'ITSCO', slug: 'auricwell-qa-demo' });
  m.execute.mockResolvedValue([[]]);
});
describe('cancellation delivery envelope preview', () => {
  it('uses actual sender rules for the personal-address prefix followed by QA routing without changing reviewed content', async () => {
    const consent = vi.fn(async () => ({ guardianUserId: 7 }));
    const preview = createCancellationNoticePreview({ consent });
    const original = item();
    const before = structuredClone(original);
    expect(await preview(original)).toEqual([{
      clientId: 8, intendedTo: 'parent@example.com', deliveryTo: 'testing@itsco.health',
      subject: '[Demo test → parent@example.com] ITSCO: Session canceled — 2026-11-09', redirected: true
    }]);
    expect(consent).toHaveBeenCalledWith(8, 450, 7);
    expect(m.user).toHaveBeenCalledWith(7);
    expect(original).toEqual(before);
    expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it.each(['school_roster', 'school'])('matches identity sender lookup order for %s instead of adding an office-only prefix', async kind => {
    m.execute.mockResolvedValue([[{ id: 7 }]]);
    const consent = vi.fn();
    const preview = createCancellationNoticePreview({ consent });
    const result = await preview(item(kind));
    expect(result[0]).toMatchObject({ redirected: true, deliveryTo: 'testing@itsco.health' });
    expect(result[0].subject).not.toContain('ITSCO:');
    expect(m.user).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
    expect(m.execute).toHaveBeenCalledWith('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [kind === 'school' ? 'school@example.com' : 'parent@example.com']);
  });
  it('shows each guardian envelope, deduplicates only within a client, and skips unselected or missing contacts', async () => {
    const original = item();
    original.clients[0].recipients.push({ userId: 7, email: 'PARENT@example.com' }, { userId: 9, email: 'other@example.com' }, { email: '' });
    original.clients.push({ ...original.clients[0], clientId: 10, mode: 'none' });
    original.clients.push({ ...original.clients[0], clientId: 11, channels: ['sms'] });
    m.user.mockImplementation(async id => ({ email: id === 7 ? 'parent@example.com' : 'other@example.com', personal_email: id === 7 ? 'parent@example.com' : null }));
    const preview = createCancellationNoticePreview({ consent: async (_client, _agency, user) => ({ guardianUserId: user }) });
    const result = await preview(original);
    expect(result).toHaveLength(2);
    expect(result[0].subject).toContain('ITSCO:');
    expect(result[1].subject).not.toContain('ITSCO:');
  });
  it('preserves a real tenant destination and scopes all resolution to that tenant and client', async () => {
    const original = item('appointment', 88);
    original.clients[0].recipients = [{ userId: 7, email: 'family@real.test' }];
    const redirect = vi.fn(async args => ({ to: args.to, subject: args.subject, redirected: false }));
    const consent = vi.fn(async () => ({ guardianUserId: 7 }));
    const preview = createCancellationNoticePreview({ consent, redirect });
    expect((await preview(original))[0]).toMatchObject({ deliveryTo: 'family@real.test', redirected: false });
    expect(consent).toHaveBeenCalledWith(8, 88, 7);
    expect(redirect).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 88, clientId: 8, userId: 7 }));
  });
});
