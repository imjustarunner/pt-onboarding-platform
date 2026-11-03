const recipient = 'admin@auricwell.com';
export const AURICWELL_SUPPORT_AGENCY_ID = 1; // Plot Twist Co., the product owner.
export const isAuricwellWebsite = slug => String(slug || '').trim().toLowerCase() === 'auricwell';

// Routing is server-owned. Never accept recipients or sender identities from visitors.
export async function deliverAuricwellInquiry({ subject, text, replyTo = null }, { send } = {}) {
  try {
    if (!send) {
      const { default: EmailService } = await import('./email.service.js');
      send = options => EmailService.sendEmail(options);
    }
    const result = await send({
      to: recipient,
      fromAddress: 'notifications@plottwistco.com',
      fromName: 'AuricWell',
      replyTo,
      subject,
      text,
      source: 'manual',
      templateType: 'auricwell_website_inquiry'
    });
    return !!result?.id && !result.skipped && !result.blocked && !result.pendingApproval && !result.queued && !result.redirected && result.success !== false;
  } catch (error) {
    // The encrypted support ticket remains available when an email alert fails.
    console.error('[auricwell-inquiry] email alert failed', { code: error?.code || 'send_failed' });
    return false;
  }
}
