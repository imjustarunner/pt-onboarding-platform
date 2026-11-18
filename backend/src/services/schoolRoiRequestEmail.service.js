import User from '../models/User.model.js';
import { preparePortalInvitationAccess } from './portalInvitationAccess.service.js';
import { clientPortalInviteUrl } from './clientPortalContext.service.js';
import { createFamilyNotificationInvitation } from './familyNotificationChoices.service.js';
import { escapePortalHtml as e } from './portalEmailBranding.service.js';
import { portalActionHtml } from './clientPortalEmailContent.js';

export async function schoolRoiRequestActions({ client, guardian, issuedLink, context, actorUserId }, {
  loadUser = id => User.findById(id), prepareAccess = preparePortalInvitationAccess,
  inviteNotifications = createFamilyNotificationInvitation
} = {}) {
  if (!issuedLink?.public_key || Number(issuedLink.recipient_guardian_user_id) !== Number(guardian.guardian_user_id)) {
    throw new Error('Prepare a separate school release for this guardian before sending.');
  }
  const user = await loadUser(guardian.guardian_user_id);
  if (!user || String(user.email).trim().toLowerCase() !== String(guardian.email).trim().toLowerCase()) throw new Error('The guardian contact changed. Refresh before sending.');
  const releasePath = `/intake/${encodeURIComponent(issuedLink.public_key)}`;
  const releaseUrl = `https://auricwell.com${releasePath}`;
  const access = await prepareAccess(user);
  const portal = new URL(clientPortalInviteUrl({ portal: context.portal, token: access.tokenResult?.token, existingAccount: access.existingAccount }));
  portal.searchParams.set('redirect', releasePath);
  // A declined optional enrollment invitation must not prevent a necessary ROI
  // request, and must not be silently replaced with a new subscription.
  let optInUrl = null;
  try {
    const invitation = await inviteNotifications({ agencyId: client.agency_id, clientId: client.id, guardianUserId: guardian.guardian_user_id, actorUserId });
    optInUrl = `${invitation.url}/text`;
  } catch (error) {
    if (error.status !== 409) throw error;
  }
  return { releaseUrl, portalUrl: portal.toString(), needsSetup: !access.existingAccount, optInUrl };
}

export function buildSchoolRoiRequestEmail({ agencyName, firstName, actions, colorPalette, languageCode = 'en' }) {
  const es = languageCode === 'es';
  let palette = colorPalette;
  if (typeof palette === 'string') { try { palette = JSON.parse(palette); } catch { palette = {}; } }
  const rawColor = palette?.primary || palette?.primaryColor;
  const color = /^#[0-9a-f]{6}$/i.test(rawColor || '') ? rawColor : '#21634f';
  const subject = es ? `${agencyName}: revise su autorización escolar` : `${agencyName}: please review your school release`;
  const intro = es ? 'Su equipo de atención solicita que revise y firme su autorización escolar. Cada tutor debe responder por separado.' : 'Your care team asks you to review and sign your school release. Each guardian needs to respond separately.';
  const review = es ? 'Revisar y firmar autorización' : 'Review and sign school ROI';
  const portalLabel = actions.needsSetup ? (es ? 'Crear contraseña de AuricWell' : 'Set up your AuricWell password') : (es ? 'Abrir AuricWell' : 'Open AuricWell');
  const setup = actions.needsSetup ? (es ? '¿Primera vez en AuricWell? Cree su contraseña con el botón de abajo y continuará a esta autorización.' : 'New to AuricWell? Set your password below and continue directly to this release.') : (es ? 'Use su cuenta actual de AuricWell para continuar.' : 'Use your existing AuricWell account to continue.');
  const optIn = es ? '¿Desea avisos como estos y recordatorios de citas? Inscríbase para recibir correo y textos opcionales.' : 'Want notifications like these, including appointment reminders? Choose email and optional text updates.';
  const textNote = es ? 'Ingrese su teléfono y confirme START desde ese teléfono para activar los textos. No se incluye publicidad.' : 'Enter your phone number, then confirm START from that phone to activate texts. No marketing is included.';
  const smallButton = `display:inline-block;padding:9px 13px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;`;
  return { subject, linkUrl: actions.releaseUrl,
    text: `${firstName ? `Hello ${firstName},` : 'Hello,'}\n\n${intro}\n\n${review}:\n${actions.releaseUrl}\n\n${setup}\n${portalLabel}:\n${actions.portalUrl}${actions.optInUrl ? `\n\n${optIn}\n${textNote}\nOpt in:\n${actions.optInUrl}` : ''}`,
    html: `<p>${e(firstName ? `Hello ${firstName},` : 'Hello,')}</p><p>${e(intro)}</p>${portalActionHtml(review, actions.releaseUrl)}<div data-roi-secondary-actions style="border-top:1px solid #e2e8ed;margin-top:24px;padding-top:16px;font-size:13px;color:#627187"><p>${e(setup)}</p><a href="${e(actions.portalUrl)}" style="${smallButton}background:#edf3f9;color:#16457c;border:1px solid #d3deea"><img src="https://auricwell.com/auricwell/logo.png" alt="" width="19" style="vertical-align:middle;margin-right:7px;border:0">${e(portalLabel)}</a>${actions.optInUrl ? `<p>${e(optIn)}</p><a href="${e(actions.optInUrl)}" style="${smallButton}background:${color};color:#fff">${es ? 'Inscribirme' : 'Opt in'}</a><p style="font-size:12px">${e(textNote)}</p>` : ''}</div>` };
}
