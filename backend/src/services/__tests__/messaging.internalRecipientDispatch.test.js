import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 8, agency_id: 2, from_email: 'messages@itsco.health' })) } }));
vi.mock('../managedWorkspaceGroupAccess.service.js', () => ({ managedGroupEnvelope: vi.fn(async args => args) }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn(), getImpersonatedUser: () => 'automation@example.org' }));
vi.mock('../emailSettings.service.js', () => ({ getEmailSendingMode: async () => 'all', isEmailNotificationsEnabled: async () => true, emailRequiresAdminApproval: async () => false }));
vi.mock('../routineParentEmailPause.service.js', () => ({ routineParentEmailGate: vi.fn(async () => ({ allowed: true })) }));
vi.mock('../emailComplianceFooter.service.js', () => ({ assertRecipientAllowsEmail: vi.fn(async () => ({ allowed: true })), appendComplianceFooter: vi.fn() }));
import pool from '../../config/database.js';
import { getGmailClient } from '../unifiedEmail/gmailClient.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockReset().mockImplementation(async sql => sql.startsWith('SELECT id,slug')
    ? [[{ id: 2, slug: 'itsco', is_active: 1, organization_type: 'agency' }]]
    : [[{ email: 'schools@itsco.health' }]]);
});

it.each(['to', 'cc', 'bcc'])('rejects an unknown %s at dispatch, including callers without a draft', async field => {
  await expect(sendEmailFromIdentity({ senderIdentityId: 8, source: 'manual', templateType: 'hub_email', to: 'parent@example.org', [field]: 'schols@itsco.health', text: 'Do not send this' }))
    .rejects.toMatchObject({ status: 400, code: 'UNRECOGNIZED_INTERNAL_RECIPIENT', recipientIssues: [{ field, address: 'schols@itsco.health', suggestions: ['schools@itsco.health'] }] });
  expect(getGmailClient).not.toHaveBeenCalled();
  expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it('fails closed before contacting the mail provider when registry verification fails', async () => {
  pool.execute.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(sendEmailFromIdentity({ senderIdentityId: 8, source: 'manual', to: 'schools@itsco.health', text: 'Keep this draft' }))
    .rejects.toMatchObject({ status: 503, code: 'INTERNAL_RECIPIENT_CHECK_UNAVAILABLE' });
  expect(getGmailClient).not.toHaveBeenCalled();
});
