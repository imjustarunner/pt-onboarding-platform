import { expect, it, vi } from 'vitest';
import { assertVerifiedGmailSender } from '../unifiedEmail/verifiedSender.js';
function client(data) { return { users: { settings: { sendAs: { get: vi.fn(async () => ({ data })) } } } }; }
it('rejects the AI sender without asking Gmail to send', async () => {
 const gmail = client({ sendAsEmail: 'ai@plottwistco.com', verificationStatus: 'accepted' });
 await expect(assertVerifiedGmailSender(gmail, 'ai@plottwistco.com')).rejects.toMatchObject({ code: 'EMAIL_SENDER_FORBIDDEN' });
 expect(gmail.users.settings.sendAs.get).not.toHaveBeenCalled();
});
it('allows only the exact accepted send-as address', async () => {
 const gmail = client({ sendAsEmail: 'provider@itsco.health', verificationStatus: 'accepted' });
 await expect(assertVerifiedGmailSender(gmail, 'Provider@itsco.health')).resolves.toBeUndefined();
 expect(gmail.users.settings.sendAs.get).toHaveBeenCalledWith({ userId: 'me', sendAsEmail: 'provider@itsco.health' });
});
it('rejects missing, pending, and substituted sender identities', async () => {
 for (const data of [null, { sendAsEmail: 'provider@itsco.health', verificationStatus: 'pending' }, { sendAsEmail: 'ai@plottwistco.com', verificationStatus: 'accepted' }]) await expect(assertVerifiedGmailSender(client(data), 'provider@itsco.health')).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
});
it('fails closed when the Gmail alias check fails', async () => {
 const gmail = client(null);gmail.users.settings.sendAs.get.mockRejectedValue(new Error('403'));
 await expect(assertVerifiedGmailSender(gmail, 'provider@itsco.health')).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
});
it('distinguishes a temporary Gmail limit and preserves its retry deadline',async()=>{
 const gmail=client(null);gmail.users.settings.sendAs.get.mockRejectedValue({response:{status:429,data:{error:{message:'User-rate limit exceeded. Retry after 2026-09-30T13:11:40.640Z'}}}});
 await expect(assertVerifiedGmailSender(gmail,'provider@itsco.health')).rejects.toMatchObject({code:'EMAIL_SENDER_TEMPORARY',retryAt:Date.parse('2026-09-30T13:11:40.640Z')});
});
it('caches successful verification briefly, never a failed lookup',async()=>{
 const gmail=client({sendAsEmail:'provider@itsco.health',verificationStatus:'accepted'});
 await assertVerifiedGmailSender(gmail,'provider@itsco.health');await assertVerifiedGmailSender(gmail,'provider@itsco.health');
 expect(gmail.users.settings.sendAs.get).toHaveBeenCalledTimes(1);
});
it('preserves a shared-mailbox cooldown without misclassifying the sender as unverified',async()=>{
 const gmail=client(null);gmail.users.settings.sendAs.get.mockRejectedValue({code:'GMAIL_MAILBOX_THROTTLED',retryAt:12345});
 await expect(assertVerifiedGmailSender(gmail,'kiosk@itsco.health')).rejects.toMatchObject({code:'EMAIL_SENDER_TEMPORARY',retryAt:12345});
});
