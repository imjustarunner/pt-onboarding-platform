import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../clientPortalContext.service.js', () => ({ resolveClientPortalContext: vi.fn() }));
vi.mock('../messagesHub.service.js', () => ({ sendHubPortalInvitation: vi.fn() }));
import { resolveClientPortalContext } from '../clientPortalContext.service.js';
import Client from '../../models/Client.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { sendHubPortalInvitation } from '../messagesHub.service.js';
import { previewClientPortalInvites, sendClientPortalInvite } from '../clientPortalInvites.service.js';
const actor = { id: 5, role: 'provider' };
const contact = { guardian_user_id: 10, role: 'client_guardian', access_enabled: 1, email: 'parent@example.com', first_name: 'Parent', status: 'PENDING_SETUP' };
beforeEach(() => {
  vi.resetAllMocks();
  resolveClientPortalContext.mockResolvedValue({ tenant: { id: 2 }, portal: { id: 2, name: 'Tenant' }, learning: false });
  resolveClientRecordAccess.mockResolvedValue({ ok: true });
  Client.findById.mockImplementation(async id => ({ id, agency_id: 2, initials: `C${id}`, status: 'ACTIVE' }));
  ClientGuardian.listForClient.mockResolvedValue([contact]);
  sendHubPortalInvitation.mockResolvedValue({ delivery: { id: 'email-1' } });
});
describe('client portal invitation selection', () => {
  it('deduplicates shared accounts and repeated client IDs without sending on preview', async () => {
    const result = await previewClientPortalInvites({ actor, clientIds: [1, 2, 1] });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].clients.map(c => c.clientId)).toEqual([1, 2]);
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
    expect(Client.update).not.toHaveBeenCalled();
  });
  it('rejects unauthorized clients before sending or enabling portal access', async () => {
    resolveClientRecordAccess.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    await expect(sendClientPortalInvite({ actor, clientIds: [1, 2], recipientKey: '2:10' })).rejects.toMatchObject({ status: 403 });
    expect(sendHubPortalInvitation).not.toHaveBeenCalled(); expect(Client.update).not.toHaveBeenCalled();
  });
  it('never invites disabled, staff, suspended, or missing-email contacts', async () => {
    ClientGuardian.listForClient.mockResolvedValue([
      { ...contact, access_enabled: 0 }, { ...contact, role: 'admin' }, { ...contact, status: 'SUSPENDED' }, { ...contact, email: null }
    ]);
    const result = await previewClientPortalInvites({ actor, clientIds: [1] });
    expect(result.recipients).toEqual([]); expect(result.skipped).toHaveLength(1);
  });
  it('revalidates recipient selection and sends one invitation for siblings', async () => {
    await expect(sendClientPortalInvite({ actor, clientIds: [1], recipientKey: '9:10' })).rejects.toMatchObject({ status: 409 });
    await sendClientPortalInvite({ actor, clientIds: [1, 2], recipientKey: '2:10' });
    expect(sendHubPortalInvitation).toHaveBeenCalledTimes(1);
    expect(sendHubPortalInvitation).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, guardianUserId: 10, existingLinkOnly: true }));
    expect(Client.update).toHaveBeenCalledTimes(2);
  });
  it('reports blocked, queued and redirected email without claiming it was sent', async () => {
    for (const [delivery, status] of [[{ skipped: true }, 'skipped'], [{ pendingApproval: true }, 'queued'], [{ redirected: true, id: 'test-1' }, 'redirected'], [{}, 'unconfirmed'], [{ id: 'email-1' }, 'sent']]) {
      sendHubPortalInvitation.mockResolvedValue({ delivery });
      expect(await sendClientPortalInvite({ actor, clientIds: [1], recipientKey: '2:10' })).toMatchObject({ status });
    }
  });
  it('keeps tutoring and care invitations separate for a shared family account', async () => {
    resolveClientPortalContext.mockResolvedValueOnce({ tenant: { id: 2 }, portal: { id: 2 }, learning: false })
      .mockResolvedValueOnce({ tenant: { id: 2 }, portal: { id: 3 }, learning: true });
    const result = await previewClientPortalInvites({ actor, clientIds: [1, 2] });
    expect(result.recipients.map(r => r.key)).toEqual(['2:10', '2:10:learning:3']);
  });
  it('rejects non-staff actors, invalid and oversized selections', async () => {
    await expect(previewClientPortalInvites({ actor: { id: 10, role: 'client' }, clientIds: [1] })).rejects.toMatchObject({ status: 403 });
    for (const clientIds of [[], [1.5], ['bad'], Array(201).fill(1)]) await expect(previewClientPortalInvites({ actor, clientIds })).rejects.toMatchObject({ status: 400 });
  });
});
