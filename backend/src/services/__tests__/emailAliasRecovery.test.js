import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn(), task: vi.fn(), send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/UserCommunication.model.js', () => ({ default: { create: m.create } }));
vi.mock('../googleWorkspaceEmail.service.js', () => ({ default: { sendEmail: m.send } }));
vi.mock('../emailAliasFallbackTask.service.js', () => ({
  createMissingAliasTaskAndBlock: m.task, isForbiddenFallbackFrom: ({ fromEmail }) => String(fromEmail).startsWith('ai@')
}));
vi.mock('../schoolSessionEmailPreferences.service.js', () => ({ schoolSessionEmailDeliveryGate: async () => ({ allowed: true }) }));
vi.mock('../routineParentEmailPause.service.js', () => ({ routineParentEmailGate: async () => ({ allowed: true }) }));
vi.mock('../../utils/hogwartsTestEmail.js', () => ({ shouldRedirectHogwartsOutboundEmail: async () => false,
  shouldRedirectForDemoAttachment: async () => false, rewriteHogwartsOutboundRecipient: vi.fn(), buildTestInboxRedirectMetadata: vi.fn() }));
vi.mock('../automationEmailOpsNotify.service.js', () => ({ notifyTestingInboxOfHeldEmail: vi.fn() }));
vi.mock('../emailSettings.service.js', () => ({ getEmailSendingMode: async () => 'all', isEmailNotificationsEnabled: async () => true,
  emailRequiresAdminApproval: async () => false }));
import EmailService from '../email.service.js';

const input = { agencyId: 2, userId: 42, to: 'sam@example.com', subject: 'Your portal',
  text: 'Continue using your current private portal link.', fromAddress: 'ai@plottwistco.com', templateType: 'onboarding_portal_invite' };
beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockResolvedValue({ id: 91 }); m.execute.mockResolvedValue([{ affectedRows: 1 }]); m.task.mockResolvedValue({ taskId: 801 });
});

it('retains blocked content in failed history and links the alert without invoking transport', async () => {
  expect(await EmailService.sendEmail(input)).toMatchObject({ blocked: true, communicationId: 91, taskId: 801 });
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ body: input.text, deliveryStatus: 'failed',
    agencyId: 2, userId: 42, recipientAddress: input.to, metadata: expect.objectContaining({ reason: 'missing_sender_alias_blocked' }) }));
  expect(m.task).toHaveBeenCalledWith(expect.objectContaining({ communicationId: 91 }));
  expect(m.send).not.toHaveBeenCalled();
});

it('retains HTML and attachment requirements without copying attachment payloads into metadata', async () => {
  await EmailService.sendEmail({ ...input, html: '<p>Review your statement.</p>', attachments: [{ filename: 'statement.pdf', content: 'private-file' }] });
  const row = m.create.mock.calls[0][0];
  expect(row.body).toBe('<p>Review your statement.</p>');
  expect(row.metadata).toMatchObject({ hadAttachments: true, attachmentCount: 1 });
  expect(JSON.stringify(row.metadata)).not.toContain('private-file');
  expect(m.send).not.toHaveBeenCalled();
});

it('reuses an existing failed communication without duplicating or overwriting its body', async () => {
  expect(await EmailService.sendEmail({ ...input, existingCommunicationId: 77 })).toMatchObject({ communicationId: 77 });
  expect(m.create).not.toHaveBeenCalled();
  const [sql, values] = m.execute.mock.calls[0];
  expect(sql).toContain("delivery_status NOT IN ('sent', 'delivered')");
  expect(sql).not.toContain('body =');
  expect(values.at(-1)).toBe(77);
  expect(m.task).toHaveBeenCalledWith(expect.objectContaining({ communicationId: 77 }));
});

it('still blocks and creates an alert if preserving the content fails', async () => {
  m.create.mockRejectedValue(new Error('Storage unavailable'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await EmailService.sendEmail(input)).toMatchObject({ blocked: true, communicationId: null, taskId: 801 });
  expect(m.task).toHaveBeenCalledOnce(); expect(m.send).not.toHaveBeenCalled();
});
