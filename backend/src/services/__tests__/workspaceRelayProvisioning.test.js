import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ group: vi.fn(), ensureGroup: vi.fn(), verify: vi.fn(), auth: vi.fn(), gmail: vi.fn(), update: vi.fn() }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getGroup: m.group } }));
vi.mock('../workspaceSenderGroup.service.js', () => ({ ensureWorkspaceSenderGroup: m.ensureGroup }));
vi.mock('../workspaceRelaySender.js', () => ({ verifyWorkspaceRelaySender: m.verify }));
vi.mock('../googleWorkspaceAuth.service.js', () => ({ buildImpersonatedJwtClient: m.auth, GOOGLE_WORKSPACE_SCOPES: [], logGoogleUnauthorizedHint: vi.fn() }));
vi.mock('googleapis', () => ({ google: { gmail: m.gmail } }));
vi.mock('../../models/UserCommunication.model.js', () => ({ default: { updateDeliveryStatus: m.update } }));
vi.mock('../email.service.js', () => ({ default: {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import { ensureHireGroupEmailForActivation } from '../hireGroupEmail.service.js';
import { recordCommunicationSent } from '../communicationRecordDelivery.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('WORKSPACE_EMAIL_RELAY_MODE', 'pilot');
  vi.stubEnv('WORKSPACE_EMAIL_RELAY_SENDERS', 'newstaff@practice.example');
  m.group.mockResolvedValue({ id: 'staff-group', email: 'newstaff@practice.example' });
  m.ensureGroup.mockResolvedValue({ group: { id: 'staff-group' } });
  m.verify.mockResolvedValue({ transport: 'workspace_smtp_relay', groupId: 'staff-group' });
});
afterEach(() => vi.unstubAllEnvs());
it('activates a verified staff Group without adding a 101st Gmail sender', async () => {
  const result = await ensureHireGroupEmailForActivation({ login_is_group_email: 1, work_email: 'newstaff@practice.example', first_name: 'Demo', last_name: 'Staff' });
  expect(result.emailSendingReady).toBe(true);
  expect(m.verify).toHaveBeenCalledWith('newstaff@practice.example');
  expect(m.auth).not.toHaveBeenCalled(); expect(m.gmail).not.toHaveBeenCalled();
});
it('never activates the staff sender if relay verification fails', async () => {
  m.verify.mockRejectedValue(Object.assign(new Error('Missing app reply member'), { code: 'EMAIL_SENDER_UNVERIFIED' }));
  await expect(ensureHireGroupEmailForActivation({ login_is_group_email: 1, work_email: 'newstaff@practice.example' })).rejects.toHaveProperty('code', 'EMAIL_SENDER_UNVERIFIED');
  expect(m.gmail).not.toHaveBeenCalled();
});
it('preserves accepted relay and archival evidence after staff approval/retry', async () => {
  const relay = { id: 'relay-42', messageId: '<comm-42@practice.example>', accepted: true, archivePending: true };
  await recordCommunicationSent({ id: 42 }, { senderIdentityId: 7 }, { id: 'relay-42', relay }, 501);
  expect(m.update).toHaveBeenCalledWith(42, 'sent', 'relay-42', null, null, expect.objectContaining({ senderIdentityId: 7, relay, internetMessageId: relay.messageId }));
});
