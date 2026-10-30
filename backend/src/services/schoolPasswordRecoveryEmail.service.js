import { routingDestination } from './schoolCareBridgeRouting.service.js';
import { escapePortalHtml as escape } from './portalEmailBranding.service.js';

// Account recovery belongs to the school product even when its parent agency
// owns the sending mailbox. Never render an agency login template into this mail.
export function schoolPasswordRecoveryEmail({ user, organization, token, loginEmail, firstSet, expiresInHours }) {
  const slug = String(organization?.portal_url || organization?.slug || '').trim().toLowerCase();
  if (!slug) throw new Error('No school recovery portal is configured for this account');
  const school = String(organization?.organization_type || '').toLowerCase() === 'school';
  const schoolName = school ? String(organization?.name || 'Your school').trim() : '';
  const entryUrl = routingDestination(slug);
  const portalUrl = school ? entryUrl : routingDestination('');
  const resetLink = `${entryUrl}/reset-password/${encodeURIComponent(token)}`;
  const action = firstSet ? 'Set your password' : 'Reset your password';
  const greeting = `Hi ${user.first_name || user.firstName || 'there'},`;
  const context = schoolName ? `Your SchoolCareBridge account for ${schoolName}` : 'Your SchoolCareBridge account';
  const expiry = `This private link expires in ${expiresInHours} hours. It can be used once. Please do not forward it.`;
  const notice = 'If you did not request this email, you can ignore it. Your password stays the same until you open the link and save a new one.';
  const body = [greeting, context, `${action}:\n${resetLink}`, expiry,
    `Your sign-in email: ${loginEmail}`, `School portal:\n${portalUrl}`, notice,
    'Need help? Reply to this email to reach your account support team.',
    'SchoolCareBridge · A program of MH4Kidz'].join('\n\n');
  const html = `<div data-schoolcarebridge="account-updates">
<p>${escape(greeting)}</p><h1 style="font-size:24px;line-height:1.3;color:#163e70;margin:0 0 16px">${escape(action)}</h1>
<p>${escape(context)}</p>
<p style="margin:24px 0"><a href="${escape(resetLink)}" style="display:inline-block;background:#0875be;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">${escape(action)}</a></p>
<p>${escape(expiry)}</p><p><strong>Your sign-in email:</strong> ${escape(loginEmail)}</p>
<p>Already have a password? <a href="${escape(portalUrl)}" style="color:#16457c">Open your school portal</a>.</p>
<p>${escape(notice)}</p><p>Need help? Reply to this email to reach your account support team.</p>
<p style="font-size:12px;color:#627187">SchoolCareBridge · A program of MH4Kidz</p></div>`;
  return {
    subject: `${schoolName || 'SchoolCareBridge'}: ${action}`, body, html, resetLink, firstSet, loginEmail,
    schoolOrganizationId: school ? organization.id : null,
    portalEmailBrand: {
      clinical: false, name: 'SchoolCareBridge', displayName: 'SchoolCareBridge',
      agencyLogo: 'https://schoolcarebridge.org/assets/schoolcarebridge/logo.png', products: []
    }
  };
}
