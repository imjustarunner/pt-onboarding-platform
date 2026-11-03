import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: {
  findByEmail: vi.fn(), create: vi.fn(), changePassword: vi.fn(), generateTemporaryPassword: vi.fn(), generatePasswordlessToken: vi.fn()
} }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { upsertLink: vi.fn() } }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: vi.fn(), sendClientPortalEmail: vi.fn() }));
vi.mock('../clientPortalEmailContent.js', () => ({ buildClientEnrollmentEmail: vi.fn(), portalActionHtml: vi.fn() }));
vi.mock('../clientPortalContext.service.js', () => ({ clientPortalInviteUrl: vi.fn() }));

import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { provisionQuickProspectiveAccess } from '../adaptiveIntake.service.js';
import { emailPortalLoginInfo } from '../coGuardianInvite.service.js';
import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { buildClientEnrollmentEmail } from '../clientPortalEmailContent.js';
import { clientPortalInviteUrl } from '../clientPortalContext.service.js';

const request = { email: ' Demo@Example.com ', firstName: 'DEMO', lastName: 'QA', clientId: 123, whoFor: 'myself', agencyId: 2, agencyRow: { id: 2, slug: 'demo' } };
beforeEach(() => {
  vi.resetAllMocks();
  pool.execute.mockResolvedValue([[]]);
  ClientGuardian.upsertLink.mockResolvedValue({});
  User.create.mockResolvedValue({ id: 456 });
  User.generatePasswordlessToken.mockResolvedValue({ token: 'synthetic-email-token' });
  clientEmailContext.mockResolvedValue({ portal: 'demo', client: { id: 123 }, clinical: true });
  clientPortalInviteUrl.mockReturnValue('https://example.com/private-setup');
  buildClientEnrollmentEmail.mockReturnValue({ subject: 'Set up your account', text: 'Private setup link', html: '<p>Private setup link</p>' });
  sendClientPortalEmail.mockResolvedValue({ id: 1 });
});

it.each([null, 'existing-hash'])('preserves an existing account with hash %s when a public inquiry is submitted', async password_hash => {
  User.findByEmail.mockResolvedValue({ id: 456, password_hash, role: 'client_guardian' });
  const access = await provisionQuickProspectiveAccess(request);
  expect(User.findByEmail).toHaveBeenCalledWith('demo@example.com');
  expect(User.changePassword).not.toHaveBeenCalled();
  expect(User.generateTemporaryPassword).not.toHaveBeenCalled();
  expect(User.create).not.toHaveBeenCalled();
  expect(access).toEqual({ existingAccount: true, email: 'demo@example.com', userId: 456, portalPath: '/demo/guardian' });
});

it('creates a new prospective account without generating or returning a password', async () => {
  User.findByEmail.mockResolvedValue(null);
  const access = await provisionQuickProspectiveAccess(request);
  expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'demo@example.com', role: 'client_guardian' }));
  expect(User.create.mock.calls[0][0]).not.toHaveProperty('password');
  expect(User.generateTemporaryPassword).not.toHaveBeenCalled();
  expect(access).not.toHaveProperty('password');
  expect(access.existingAccount).toBe(false);
  expect(ClientGuardian.upsertLink).toHaveBeenCalledWith(expect.objectContaining({ clientId: 123, guardianUserId: 456 }));
});

it('sends setup only by email for a linked prospective guardian without enabling clinical access', async () => {
  User.findByEmail.mockResolvedValue({ id: 456, email: 'demo@example.com', role: 'client_guardian', password_hash: null });
  pool.execute.mockImplementation(async sql => sql.includes('SELECT c.id') ? [[{ id: 123 }]] : [[]]);
  expect(await emailPortalLoginInfo({ to: 'demo@example.com', agency: { id: 2, name: 'Demo' } })).toMatchObject({ sent: true });
  const [lookup, params] = pool.execute.mock.calls[0];
  expect(lookup).toContain("c.source='ADAPTIVE_QUICK_PROSPECTIVE'");
  expect(lookup).toContain('cg.access_enabled=1');
  expect(lookup).toContain('c.agency_id=?');
  expect(params).toEqual([456, 2]);
  expect(User.generatePasswordlessToken).toHaveBeenCalledWith(456, 48, 'setup');
  expect(clientPortalInviteUrl).toHaveBeenCalledWith(expect.objectContaining({ token: 'synthetic-email-token', existingAccount: false }));
  expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'demo@example.com', clientId: 123 }));
  expect(pool.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});

it.each([true, false])('does not reset an established or unlinked account (linked: %s)', async linked => {
  User.findByEmail.mockResolvedValue({ id: 456, role: 'client_guardian', password_hash: linked ? 'existing-hash' : null });
  pool.execute.mockResolvedValue([linked ? [{ id: 123 }] : []]);
  await emailPortalLoginInfo({ to: 'demo@example.com', agency: { id: 2, name: 'Demo' } });
  expect(User.generatePasswordlessToken).not.toHaveBeenCalled();
  expect(User.changePassword).not.toHaveBeenCalled();
  expect(clientPortalInviteUrl).toHaveBeenCalledWith(expect.objectContaining({ token: null, existingAccount: true }));
});
