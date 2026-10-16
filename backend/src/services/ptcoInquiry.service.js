export const PTCO_INQUIRY_EMAIL = 'admin@plottwistco.com';

export function isPtcoWebsite(slug) {
  return ['ptco', 'plottwistco'].includes(String(slug || '').trim().toLowerCase());
}

// The recipient and sender are server-owned; public payloads cannot override them.
export async function deliverPtcoInquiry({ subject, text, replyTo = null, linkUrl = null }, { send } = {}) {
  try {
    if (!send) {
      const { default: EmailService } = await import('./email.service.js');
      send = options => EmailService.sendEmail(options);
    }
    const result = await send({
      to: PTCO_INQUIRY_EMAIL,
      fromAddress: 'notifications@plottwistco.com',
      fromName: 'Plot Twist Co.',
      replyTo,
      subject,
      text,
      linkUrl,
      source: 'manual',
      templateType: 'ptco_website_inquiry'
    });
    return !!result?.id && !result.skipped && !result.blocked && !result.pendingApproval && !result.queued && !result.redirected && result.success !== false;
  } catch (error) {
    // The inquiry is already saved. Do not prompt visitors to submit it twice.
    console.error('[ptco-inquiry] email delivery failed', { code: error?.code || 'send_failed' });
    return false;
  }
}

export async function deliverPtcoBusinessInquiry({ id, business }) {
  return deliverPtcoInquiry({
    subject: 'New Plot Twist Co. service inquiry',
    replyTo: business.email,
    text: [
      `Reference: ${id}`,
      `Business: ${business.businessName}`,
      `Contact: ${business.firstName} ${business.lastName}`,
      `Email: ${business.email}`,
      `Phone: ${business.phone}`,
      `Starting point: ${business.path}`,
      `Business type: ${business.businessType}`,
      `Stage: ${business.stage}`,
      `Services: ${business.services.join(', ') || 'Help choosing services'}`,
      '', business.goals
    ].join('\n')
  });
}
