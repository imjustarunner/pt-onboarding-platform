// The message is protected inside the portal; the notification email contains no message text.
export const conversaEmailNote = 'Secure messaging through Conversa by AuricWell. Read and reply inside your secure portal.';
export function conversaEmailBlock() {
  return `<table role="presentation" data-conversa="compact" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border:1px solid #dce4ed;border-radius:8px"><tr><td width="40" style="padding:12px"><img src="https://auricwell.com/assets/conversa/brand/conversa-mark-email.png" alt="" width="28" style="display:block;width:28px;height:28px"></td><td style="padding:12px 12px 12px 0;font-size:12px;line-height:1.5;color:#627187"><strong>Conversa by AuricWell</strong><br>Secure messaging inside your portal. This email does not include your message.</td></tr></table>`;
}
