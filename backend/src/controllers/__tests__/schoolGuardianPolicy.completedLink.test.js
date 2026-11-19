import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), find: vi.fn(), create: vi.fn(), getLink: vi.fn(), upsert: vi.fn(), link: vi.fn(), submission: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail: m.find, create: m.create } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: m.getLink, upsertLink: m.upsert } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: m.link } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: m.submission } }));
import { ensureGuardianAccountLinkedForClient, issuePublicIntakePortalCredentials } from '../publicIntake.controller.js';
const profile = { email: 'parent@example.test', firstName: 'Synthetic', lastName: 'Parent' };
beforeEach(() => {
  vi.resetAllMocks();
  m.find.mockResolvedValue({ id: 8, email: profile.email, role: 'client_guardian' });
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT agency_id') ? [[{ agency_id: 2 }]] : [[]]);
});
it('enables a system-disabled school enrollment guardian and the client portal together', async () => {
  m.getLink.mockResolvedValue({ access_enabled: 0, permissions_json: { intakeLinkGuardianProfile: true } });
  await ensureGuardianAccountLinkedForClient({ clientId: 4, profile, accessEnabled: true });
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ clientId: 4, guardianUserId: 8, accessEnabled: true,
    permissionsJson: expect.objectContaining({ canViewDocs: true, canSignDocs: true, canMessage: true }) }));
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE clients SET guardian_portal_enabled = 1'), [4]);
});
it('keeps a standalone ROI from granting portal access', async () => {
  m.getLink.mockResolvedValue(null);
  await ensureGuardianAccountLinkedForClient({ clientId: 4, profile });
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ accessEnabled: false }));
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clients'))).toBe(false);
});
it('restores full care access after enrollment despite a previous staff portal setting', async () => {
  m.getLink.mockResolvedValue({ access_enabled: 0, permissions_json: { intakeLinkGuardianProfile: true, portalAccessDecision: 'none' } });
  await ensureGuardianAccountLinkedForClient({ clientId: 4, profile, accessEnabled: true });
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ accessEnabled: true,permissionsJson:expect.objectContaining({portalAccessDecision:'care',canMessage:true}) }));
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clients'))).toBe(true);
});
it('links a parent who already has a client account without changing identity or credentials', async () => {
  m.find.mockResolvedValue({ id: 8, role: 'client' });
  await ensureGuardianAccountLinkedForClient({ clientId: 4, profile, accessEnabled: true });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ guardianUserId: 8, accessEnabled: true }));
});
it.each([undefined, '', 'different-session'])('requires the saved enrollment session before showing portal details: %s', async sessionToken => {
  m.link.mockResolvedValue({ id: 3, is_active: 1, scope_type: 'school', form_type: 'intake' });
  m.submission.mockResolvedValue({ id: 4, intake_link_id: 3, status: 'submitted', session_token: 'saved-enrollment-session' });
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await issuePublicIntakePortalCredentials({ params: { publicKey: 'packet', submissionId: '4' }, body: { sessionToken }, headers: {} }, res, next);
  expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);
  expect(m.find).not.toHaveBeenCalled();
});
