import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
import { preparePortalInvitationAccess } from '../portalInvitationAccess.service.js';
it.each(['2026-09-18', '2099-01-01'])('offers setup for temporary credentials even when the password hash exists (expiry %s)', async expiry => {
  const db = { execute: vi.fn().mockResolvedValue([[]]) };
  const users = { generatePasswordlessToken: vi.fn().mockResolvedValue({ token: 'test-setup-token' }) };
  expect(await preparePortalInvitationAccess({ id: 10, password_hash: 'temporary', temporary_password_hash: 'temporary', temporary_password_expires_at: expiry }, { db, users })).toMatchObject({ existingAccount: false, tokenResult: { token: 'test-setup-token' } });
  expect(users.generatePasswordlessToken).toHaveBeenCalledWith(10, 48, 'setup');
});
it('reuses a still-valid setup invitation instead of invalidating another agency invitation', async () => {
  const users = { generatePasswordlessToken: vi.fn() };
  const db = { execute: vi.fn().mockResolvedValue([[{ token: 'still-valid' }]]) };
  expect((await preparePortalInvitationAccess({ id: 10 }, { db, users })).tokenResult.token).toBe('still-valid');
  expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
it('preserves an established password, including legacy accounts without password_changed_at', async () => {
  const db = { execute: vi.fn() }, users = { generatePasswordlessToken: vi.fn() };
  expect(await preparePortalInvitationAccess({ id: 10, password_hash: 'permanent' }, { db, users })).toEqual({ existingAccount: true, tokenResult: null });
  expect(db.execute).not.toHaveBeenCalled();
  expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
