import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 5, role: 'provider', email: 'provider@itsco.health', personal_email: 'private@example.org', sso_password_override: 0, login_is_group_email: 0 })) } }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn(), getImpersonatedUser: () => 'ai@example.org' }));
import { getGmailClient } from '../unifiedEmail/gmailClient.js';
import { sendEmailFromIdentity, sendNotificationEmail } from '../unifiedEmail/unifiedEmailSender.service.js';

it('rejects personal reminder recipients in both send paths before contacting Gmail', async () => {
  for (const send of [sendEmailFromIdentity, sendNotificationEmail]) {
    for (const templateType of ['personal_thread_reminder', 'hub_secure_unread_digest', 'hub_sms_unread_digest']) {
      await expect(send({ userId: 5, to: 'private@example.org', templateType, existingCommunicationId: 123 })).rejects.toMatchObject({ code: 'REMINDER_RECIPIENT_POLICY' });
    }
  }
  expect(getGmailClient).not.toHaveBeenCalled();
});
