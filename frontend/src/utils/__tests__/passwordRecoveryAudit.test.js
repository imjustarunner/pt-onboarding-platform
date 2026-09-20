import { describe, expect, it } from 'vitest';
import { formatPasswordRecoveryAudit, isPasswordRecoveryAudit } from '../passwordRecoveryAudit.js';
import { getActionCategory, getActionLabel } from '../auditActionRegistry.js';
describe('password recovery history', () => {
  it('shows requester and delivery details clearly', () => {
    const text = formatPasswordRecoveryAudit({ performedByName: 'Pat Admin', performedByEmail: 'pat@example.com', email: 'staff@school.example', requestSource: 'school_portal', deliveryStatus: 'sent', fromEmail: 'app@tenant.example', replyTo: 'technology@tenant.example', communicationId: 123 });
    for (const value of ['Pat Admin', 'pat@example.com', 'To: staff@school.example', 'Status: Sent', 'School portal', 'app@tenant.example', 'technology@tenant.example', 'Communication #123']) expect(text).toContain(value);
  });
  it('identifies public requests without claiming to know who submitted them', () => {
    expect(formatPasswordRecoveryAudit({ requestSource: 'public_forgot_password' })).toContain('not signed in');
  });
  it('keeps unknown historical requesters and unverified delivery explicit', () => {
    const text = formatPasswordRecoveryAudit('{}');
    expect(text).toContain('Requester not recorded'); expect(text).toContain('See Communications for delivery status');
  });
  it('keeps staff ID attribution for older records', () => {
    expect(formatPasswordRecoveryAudit(JSON.stringify({ performedByUserId: 8 }))).toContain('Staff user #8');
  });
  it('distinguishes failure and link generation from email delivery', () => {
    expect(formatPasswordRecoveryAudit({ deliveryStatus: 'failed', error: 'Unavailable' })).toContain('Status: Failed');
    expect(formatPasswordRecoveryAudit({ deliveryStatus: 'not_sent' })).toContain('email not sent');
    for (const action of ['password_reset_link_sent', 'password_reset_email_failed', 'password_reset_link_generated']) {
      expect(isPasswordRecoveryAudit(action)).toBe(true);
      expect(getActionCategory(action)).toBe('Password recovery');
      expect(getActionLabel(action)).not.toBe(action);
    }
  });
});
