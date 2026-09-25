import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getUser: vi.fn(async () => null), getGroup: vi.fn(async () => ({ id: 'group' })) } }));
import User from '../../models/User.model.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import pool from '../../config/database.js';
import { eligibleClientAfterHoursReply, verifiedAppOnlyProvider } from '../afterHoursEmailPolicy.service.js';
const user = { id: 5, role: 'provider', status: 'ACTIVE', is_active: 1, email: 'provider@itsco.health', sso_password_override: 1, login_is_group_email: 1 };
const context = { agencyId: 2, ownerUserId: 5, inbox: { kind: 'personal', agency_id: 2, owner_user_id: 5, from_email: user.email }, recipientEmails: [user.email], senderTrust: 'guardian', fromEmail: 'parent@example.org' };
beforeEach(() => { vi.clearAllMocks();User.findById.mockResolvedValue(user);Directory.getUser.mockResolvedValue(null);Directory.getGroup.mockResolvedValue({ id: 'group' });pool.execute.mockResolvedValue([[]]); });
it('never replies for SSO inboxes, even when the sender was misclassified as a guardian', async () => {
 User.findById.mockResolvedValue({ ...user, sso_password_override: 0, login_is_group_email: 0 });
 expect(await eligibleClientAfterHoursReply(context)).toBeNull();expect(Directory.getUser).not.toHaveBeenCalled();
});
it('does not trust stale app-only flags on a real Workspace account', async () => {
 Directory.getUser.mockResolvedValue({ id: 'workspace' });expect(await eligibleClientAfterHoursReply(context)).toBeNull();
});
it('suppresses group and multi-recipient replies before any directory calls', async () => {
 for (const recipientEmails of [[], ['staff@itsco.health'], [user.email, 'other@itsco.health']]) expect(await eligibleClientAfterHoursReply({ ...context, recipientEmails })).toBeNull();
 expect(Directory.getUser).not.toHaveBeenCalled();
});
it('suppresses staff, school, unknown, and shared-inbox replies', async () => {
 for (const senderTrust of ['staff', 'school_contact', 'unknown']) expect(await eligibleClientAfterHoursReply({ ...context, senderTrust })).toBeNull();
 expect(await eligibleClientAfterHoursReply({ ...context, inbox: { ...context.inbox, kind: 'shared' } })).toBeNull();
});
it('suppresses managed organization senders even if an old guardian record matches', async () => {
 pool.execute.mockResolvedValue([[{ id: 1 }]]);
 expect(await eligibleClientAfterHoursReply({ ...context, fromEmail: 'michael@itsco.health' })).toBeNull();
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SUBSTRING_INDEX'), ['itsco.health']);
});
it('preserves a direct external-client reply for an active, verified app-only provider', async () => {
 expect(await eligibleClientAfterHoursReply(context)).toEqual(user);
});
it('requires positive group verification and an active owner', async () => {
 Directory.getGroup.mockResolvedValue(null);expect(await verifiedAppOnlyProvider(5)).toBeNull();
 User.findById.mockResolvedValue({ ...user, status: 'INACTIVE' });expect(await verifiedAppOnlyProvider(5)).toBeNull();
});
it('does not guess when directory verification is unavailable', async () => {
 Directory.getUser.mockRejectedValueOnce(new Error('Directory unavailable'));
 await expect(eligibleClientAfterHoursReply(context)).rejects.toThrow('Directory unavailable');
});
