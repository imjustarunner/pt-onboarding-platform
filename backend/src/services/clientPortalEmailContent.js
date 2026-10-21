import { escapePortalHtml as e, portalMessageHtml } from './portalEmailBranding.service.js';
import { conversaEmailBlock, conversaEmailNote } from './conversaEmail.service.js';

export function clientEmailLabel(client = {}) {
  const parts = String(client.full_name || client.name || '').replace(/\s*[—–-]\s*(?:DEMO|FICTIONAL).*$/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0].slice(0, 2)}${parts.at(-1).slice(0, 2)}`.toUpperCase();
  return String(client.initials || parts[0] || 'Your dependent').slice(0, 4).toUpperCase();
}

export function portalActionHtml(label, url) {
  return `${portalMessageHtml({ text: url, linkUrl: url, linkLabel: label })}<p style="font-size:12px;line-height:1.5;overflow-wrap:anywhere;color:#627187">Or copy and paste this link into your browser:<br><a href="${e(url)}" style="color:#16457c">${e(url)}</a></p>`;
}

export function buildClientEnrollmentEmail({ firstName, agencyName, clients = [], learning = false, existingAccount = false, url, username = null }) {
  const labels = clients.map(clientEmailLabel).join(', '), count = clients.length || 1;
  const who = count === 1 ? 'Your dependent' : `Your ${count} dependents`;
  const service = learning ? 'tutoring services' : 'counseling services';
  const heading = existingAccount ? `${agencyName}: ${learning ? 'tutoring' : 'counseling'} access added` : `${agencyName}: welcome to your ${learning ? 'family' : 'AuricWell'} portal`;
  const introduction = `${who}${labels ? ` (${labels})` : ''} ${count === 1 ? 'has' : 'have'} been enrolled in ${service} with ${agencyName}.`;
  const details = existingAccount
    ? learning
      ? `Their ${agencyName} profile and tutoring information have been added to your existing account. Sign in with the same account you use for AuricWell, then select ${agencyName} or your dependent to view their tutoring dashboard, learning information, and appointments. Your other dependents remain available in the same account.`
      : `Their information and care profile have been added to your AuricWell portal. Sign in with your existing account and select your dependent to see their ${agencyName} care team, appointments, documents, and shared treatment plan. You do not need a new account or password.`
    : `Use one ${learning ? 'family' : 'AuricWell'} portal account for ${count === 2 ? 'both dependents' : count > 2 ? 'all your dependents' : 'your dependent'}. ${agencyName} is your ${learning ? 'tutoring' : 'care'} agency. You can view appointments, complete forms, manage billing, and review information shared by your team. Set your password below to get started.`;
  const greeting = `Hi ${firstName || 'there'},`, action = existingAccount ? 'View your dependents' : 'Set up your portal';
  const preferences = 'Review your notification preferences in the portal to choose which reminders you receive.';
  const signIn = username ? `Your sign-in email (username): ${username}` : '';
  const nextTime = existingAccount ? '' : 'After saving your password, you will be signed in automatically. On your own device, you can save your password when your browser offers. Next time, use your email and password from the Portal login button on our website.';
  return { subject: heading, text: `${greeting}\n\n${introduction}\n\n${details}\n\n${signIn ? `${signIn}\n\n` : ''}${action}:\n${url}\n\n${nextTime ? `${nextTime}\n\n` : ''}${preferences}`,
    html: `<p>${e(greeting)}</p><h2 style="font-size:22px;line-height:1.3">${existingAccount ? 'Your account has new access' : 'Welcome to your portal'}</h2><p>${e(introduction)}</p><p>${e(details)}</p>${username ? `<p>Your sign-in email (username): <strong style="overflow-wrap:anywhere">${e(username)}</strong></p>` : ''}${portalActionHtml(action, url)}${nextTime ? `<p>${e(nextTime)}</p>` : ''}<p>${e(preferences)}</p>`, linkUrl: url };
}

export function buildFamilyBillingEmail({ kind, agencyName, url }) {
  const copy = kind === 'payment_setup'
    ? { subject:'Complete your payment setup', body:'Please verify your payment method and complete your billing authorization.', action:'Complete payment setup' }
    : kind === 'balance'
      ? { subject:`${agencyName}: a new payment is due`, body:'A new payment is due. Sign in to your secure portal to view service dates, payment details, and the amount assigned to you.', action:'View billing' }
      : { subject:'Your account statement is ready', body:'Please sign in to review your account statement. You can make a payment or contact our billing team for assistance.', action:'View my statement' };
  const footer = kind === 'balance' ? 'Statements are shared with authorized guardians. Saving a card or receiving this notification does not authorize a new charge. Contact billing if you need help.' : 'Sign in with the account that received this invitation.';
  return { subject:copy.subject, text:`${agencyName}\n\n${copy.body}\n\n${copy.action}:\n${url}\n\n${footer}`,
    html:`<h2 style="font-size:22px">${e(copy.subject)}</h2><p>${e(copy.body)}</p>${portalActionHtml(copy.action,url)}<p>${e(footer)}</p>`,linkUrl:url };
}

export function buildTreatmentPlanEmail({ client, recipientName, url, expires = false }) {
  const label = clientEmailLabel(client);
  const text = `Hi ${recipientName || 'there'},\n\nPlease review and sign the treatment plan for ${label}.\n\n${url}${expires ? '\n\nThis link expires in 14 days.' : ''}`;
  return { subject:'Please review and sign the treatment plan', text,
    html:`<p>Hi ${e(recipientName || 'there')},</p><p>Please review and sign the treatment plan for <strong>${e(label)}</strong>.</p>${portalActionHtml('Review treatment plan',url)}${expires ? '<p>This link expires in 14 days.</p>' : ''}`,linkUrl:url };
}
export function buildSecureMessageEmail({agencyName,clinical=true,url}) {
  const portal=clinical?'AuricWell':`${agencyName} portal`;
  const subject=`You have a secure message in ${portal}`;
  const intro=`${agencyName} sent you a secure message. Sign in to ${portal} to read and reply.`;
  const note='Your message stays inside your secure portal. This email does not include its contents. Please reply in the portal.';
  return {subject,text:`${intro}\n\nRead secure message:\n${url}\n\n${note}\n\n${conversaEmailNote}`,
    html:`<h2>You have a secure message</h2><p>${e(intro)}</p>${portalActionHtml('Read secure message',url)}<p>${e(note)}</p>${conversaEmailBlock()}`};
}
