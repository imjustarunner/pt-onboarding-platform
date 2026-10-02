import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../tenantMessageMailboxes.service.js', () => ({ ensureTenantNotificationsMailbox: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import { ensureTenantNotificationsMailbox } from '../tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { sendPacketCompletionNotification } from '../packetCompletionNotification.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  ensureTenantNotificationsMailbox.mockResolvedValue({domain:'tenant.test', notifications:{id:6,agency_id:2,is_active:1,from_email:'notifications@tenant.test'}});
  sendEmailFromIdentity.mockResolvedValue({id:'accepted',communicationId:44});
});
describe('packet receipt delivery', () => {
  it('uses the caring tenant notifications sender and support replies, never the school personal identity', async () => {
    const attachment={filename:'packet.pdf',contentBase64:'synthetic'};
    const result=await sendPacketCompletionNotification({agencyId:2,organizationId:280,scopeType:'school',to:'parent@example.test',text:'We received your packet',attachments:[attachment],intakeSubmissionId:1105,intakeLinkId:64,senderIdentityId:264,replyToOverride:'school@example.test'});
    expect(ensureTenantNotificationsMailbox).toHaveBeenCalledWith(2);
    expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'support@tenant.test',usedFallbackSender:false,source:'auto',templateType:'intake_packet_completion',attachments:[attachment],intakeSubmissionId:1105,intakeLinkId:64}));
    expect(result.sent).toBe(true);
  });
  it('requires an explicit caring tenant for a school packet', async () => {
    await expect(sendPacketCompletionNotification({organizationId:280,scopeType:'school'})).rejects.toHaveProperty('code','INTAKE_NOTIFICATION_TENANT_REQUIRED');
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it('supports an agency-owned office packet', async () => {
    await sendPacketCompletionNotification({organizationId:2,scopeType:'agency'});
    expect(ensureTenantNotificationsMailbox).toHaveBeenCalledWith(2);
  });
  it.each([{queued:true},{pendingApproval:true},{blocked:true},{skipped:true},{id:'test',redirected:true},{}])('does not mistake %j for a sent receipt',async status => {
    sendEmailFromIdentity.mockResolvedValue(status);
    expect((await sendPacketCompletionNotification({agencyId:2})).sent).toBe(false);
  });
  it('keeps the original failed communication reference for recovery', async () => {
    sendEmailFromIdentity.mockRejectedValue(Object.assign(new Error('Sender unavailable'),{communicationId:44}));
    await expect(sendPacketCompletionNotification({agencyId:2})).rejects.toHaveProperty('communicationId',44);
  });
});
