/**
 * Email App Assistant — inbound handler for app@tenant.
 *
 * Extensible: add intents under ./intents and register in ./registry.js.
 * See .cursor/rules/email-app-assistant.mdc
 */
import User from '../../models/User.model.js';
import Agency from '../../models/Agency.model.js';
import { matchIntent, APP_EMAIL_INTENTS } from './registry.js';
import {
  combineSubjectBody,
  isFeatureEnabled,
  isPrivilegedRole,
  normalizeRole,
  normalizeText
} from './helpers.js';
import { clearSession, getSession, replyFromAppMailbox, setSession } from './reply.js';

export function isAppEmailIdentity(identity) {
  return String(identity?.identity_key || '').trim().toLowerCase() === 'app';
}

async function resolveMembership(user, agencyId) {
  const agencies = await User.getAgencies(user.id);
  const list = Array.isArray(agencies) ? agencies : [];
  const membership = list.find((a) => Number(a.id) === Number(agencyId));
  if (!membership) return null;

  const platformRole = normalizeRole(user.role);
  const agencyRole = normalizeRole(membership.agency_role || membership.agencyRole || membership.role);
  // Super admins are always privileged; otherwise prefer agency_role when set.
  const effectiveRole = platformRole === 'super_admin'
    ? 'super_admin'
    : (agencyRole || platformRole);

  return {
    membership,
    effectiveRole,
    isPrivileged: isPrivilegedRole(effectiveRole) || platformRole === 'super_admin'
  };
}

async function resumeSession(ctx, session) {
  const intent = APP_EMAIL_INTENTS.find((i) => i.key === session.intentKey);
  if (!intent) {
    await clearSession(ctx.agency.id, ctx.user.id);
    return null;
  }
  if (intent.roles === 'privileged' && !ctx.isPrivileged) {
    await clearSession(ctx.agency.id, ctx.user.id);
    return {
      text: 'That follow-up requires admin, super admin, or support access.'
    };
  }

  const awaiting = session.state?.awaiting;
  const replyText = normalizeText(ctx.text);

  if (session.intentKey === 'create_task' && awaiting === 'title') {
    return intent.handle({ ...ctx, text: `add task: ${replyText}` }, { title: replyText });
  }
  if (session.intentKey === 'school_status' && awaiting === 'school_name') {
    return intent.handle({ ...ctx, text: `providers at ${replyText} today` }, { schoolName: replyText });
  }

  // Generic: treat reply as fresh text for the same intent
  return intent.handle({ ...ctx, text: replyText }, session.state || {});
}

/**
 * @returns {{ handled: boolean, replied?: boolean, ignored?: boolean, reason?: string }}
 */
export async function handleAppEmailInbound({
  fromEmail,
  subject,
  bodyText,
  senderIdentityId,
  agencyId = null,
  messageIdHeader = null
} = {}) {
  const email = String(fromEmail || '').trim().toLowerCase();
  if (!email) {
    return { handled: true, ignored: true, reason: 'missing_from' };
  }

  const agency = agencyId ? await Agency.findById(agencyId) : null;
  if (!agency?.id) {
    return { handled: true, ignored: true, reason: 'missing_agency' };
  }

  if (!isFeatureEnabled(agency)) {
    // Feature off — silent ignore (do not advertise mailbox)
    return { handled: true, ignored: true, reason: 'feature_disabled' };
  }

  const user = await User.findByEmail(email);
  if (!user?.id) {
    // Unknown sender — silent (avoid spam loops / info leak)
    return { handled: true, ignored: true, reason: 'unknown_sender' };
  }
  if (user.is_active === 0 || user.is_active === false || user.is_archived) {
    await replyFromAppMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: 'This email is not an approved active user for the app assistant.',
      messageIdHeader
    });
    return { handled: true, replied: true, reason: 'inactive_user' };
  }

  const membership = await resolveMembership(user, agency.id);
  if (!membership) {
    await replyFromAppMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: `You are not an approved user for ${agency.name || 'this organization'}. Ask an admin if your account should be linked.`,
      messageIdHeader,
      userId: user.id
    });
    return { handled: true, replied: true, reason: 'not_member' };
  }

  const text = combineSubjectBody(subject, bodyText);
  const ctx = {
    agency,
    user: { id: user.id, email: user.email, role: membership.effectiveRole, firstName: user.first_name, lastName: user.last_name },
    subject,
    text,
    isPrivileged: membership.isPrivileged,
    effectiveRole: membership.effectiveRole
  };

  try {
    const session = await getSession(agency.id, user.id);
    let result = null;

    if (session) {
      result = await resumeSession(ctx, session);
    }

    if (!result) {
      const matched = matchIntent(text, ctx);
      if (!matched) {
        await replyFromAppMailbox({
          senderIdentityId,
          to: email,
          subject,
          text: [
            'I am not sure what you are asking.',
            '',
            'Reply with "help" for examples, or try:',
            '• Who is in office today?',
            '• What offices are available at 12pm today?',
            '• Add task: Follow up with payroll',
            membership.isPrivileged ? '• Who is at what school today?' : null
          ].filter(Boolean).join('\n'),
          messageIdHeader,
          userId: user.id
        });
        return { handled: true, replied: true, reason: 'unmatched' };
      }

      if (matched.intent.roles === 'privileged' && !membership.isPrivileged) {
        await replyFromAppMailbox({
          senderIdentityId,
          to: email,
          subject,
          text: 'That question is limited to admin, super admin, and support for this organization.',
          messageIdHeader,
          userId: user.id
        });
        return { handled: true, replied: true, reason: 'role_denied' };
      }

      result = await matched.intent.handle(ctx, matched.matchResult);
    }

    if (result?.clearSession !== false) {
      await clearSession(agency.id, user.id);
    } else if (result?.session) {
      await setSession(agency.id, user.id, result.session.intentKey, result.session.state || {});
    }

    await replyFromAppMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: result?.text || 'Done.',
      messageIdHeader,
      userId: user.id
    });
    return { handled: true, replied: true, reason: 'ok' };
  } catch (err) {
    console.error('[AppEmail] handler failed:', err);
    await replyFromAppMailbox({
      senderIdentityId,
      to: email,
      subject,
      text: `Something went wrong (${err.message || 'error'}). Try again, or open the app.`,
      messageIdHeader,
      userId: user.id
    });
    return { handled: true, replied: true, reason: 'error' };
  }
}

export default {
  handleAppEmailInbound,
  isAppEmailIdentity
};
