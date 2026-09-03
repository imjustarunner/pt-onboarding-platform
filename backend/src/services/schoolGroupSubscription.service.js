/**
 * School Google Group delivery subscription (Each email / Digest / Abridged / No email).
 * Membership stays; only Google Groups deliverySettings change.
 */
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';

export const GROUP_SUBSCRIPTION_OPTIONS = Object.freeze([
  { value: 'all_mail', google: 'ALL_MAIL', label: 'Each email' },
  { value: 'digest', google: 'DIGEST', label: 'Digest' },
  { value: 'daily', google: 'DAILY', label: 'Abridged' },
  { value: 'none', google: 'NONE', label: 'No email' }
]);

const LABEL_BY_VALUE = Object.fromEntries(GROUP_SUBSCRIPTION_OPTIONS.map((o) => [o.value, o.label]));
const GOOGLE_BY_VALUE = Object.fromEntries(GROUP_SUBSCRIPTION_OPTIONS.map((o) => [o.value, o.google]));

export function normalizeGroupSubscription(raw, fallback = 'all_mail') {
  const v = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (v === 'email' || v === 'all_mail' || v === 'each_email' || v === 'all') return 'all_mail';
  if (v === 'digest') return 'digest';
  if (v === 'daily' || v === 'abridged' || v === 'abridge') return 'daily';
  if (v === 'none' || v === 'no_email' || v === 'noemail' || v === 'mute') return 'none';
  return fallback;
}

export function groupSubscriptionLabel(value) {
  return LABEL_BY_VALUE[normalizeGroupSubscription(value)] || 'Each email';
}

export function groupSubscriptionGoogle(value) {
  return GOOGLE_BY_VALUE[normalizeGroupSubscription(value)] || 'ALL_MAIL';
}

function sourceLabel(source) {
  const s = String(source || '').trim().toLowerCase();
  if (s === 'email_link' || s === 'email') return 'via an email link';
  if (s === 'onboarding') return 'during school onboarding';
  if (s === 'staff_settings' || s === 'portal') return 'in School Staff settings';
  return 'in the app';
}

export async function lookupSchoolStaffGroupContext(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@')) {
    return { isSchoolStaff: false, schoolOrganizationId: null, groupEmail: null };
  }
  let schoolOrganizationId = null;
  try {
    const [contacts] = await pool.execute(
      `SELECT school_organization_id
       FROM school_contacts
       WHERE LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [normalized]
    );
    schoolOrganizationId = Number(contacts?.[0]?.school_organization_id || 0) || null;
  } catch {
    schoolOrganizationId = null;
  }
  if (!schoolOrganizationId) {
    try {
      const [users] = await pool.execute(
        `SELECT u.id
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         INNER JOIN agencies a ON a.id = ua.agency_id
         WHERE (LOWER(u.email) = ? OR LOWER(COALESCE(u.work_email, '')) = ?)
           AND LOWER(COALESCE(u.role, '')) = 'school_staff'
           AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'program', 'learning')
         LIMIT 1`,
        [normalized, normalized]
      );
      if (users?.[0]?.id) {
        const [orgs] = await pool.execute(
          `SELECT ua.agency_id
           FROM user_agencies ua
           INNER JOIN agencies a ON a.id = ua.agency_id
           WHERE ua.user_id = ?
             AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'program', 'learning')
           LIMIT 1`,
          [users[0].id]
        );
        schoolOrganizationId = Number(orgs?.[0]?.agency_id || 0) || null;
      }
    } catch {
      schoolOrganizationId = null;
    }
  }
  const groupEmail = schoolOrganizationId ? await resolveGroupEmailForSchool(schoolOrganizationId) : null;
  return {
    isSchoolStaff: !!schoolOrganizationId,
    schoolOrganizationId,
    groupEmail
  };
}

async function persistContactSubscription({ schoolOrganizationId, email, subscription }) {
  const orgId = Number(schoolOrganizationId || 0);
  const normalized = String(email || '').trim().toLowerCase();
  const pref = normalizeGroupSubscription(subscription);
  if (!orgId || !normalized.includes('@')) return;
  try {
    await pool.execute(
      `UPDATE school_contacts
       SET email_delivery_preference = ?, updated_at = CURRENT_TIMESTAMP
       WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?`,
      [pref, orgId, normalized]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[schoolGroupSubscription] persist failed:', e?.message || e);
    }
  }
}

export async function resolveGroupEmailForSchool(schoolOrganizationId) {
  const orgId = Number(schoolOrganizationId || 0);
  if (!orgId) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT itsco_email FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
      [orgId]
    );
    const email = String(rows?.[0]?.itsco_email || '').trim().toLowerCase();
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

export async function applyGoogleGroupDeliverySettings({ groupEmail, memberEmail, subscription }) {
  const group = String(groupEmail || '').trim().toLowerCase();
  const member = String(memberEmail || '').trim().toLowerCase();
  if (!group.includes('@') || !member.includes('@')) {
    return { ok: false, skipped: true, reason: 'invalid_email' };
  }
  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    return { ok: false, skipped: true, reason: 'google_workspace_not_configured' };
  }
  try {
    await GoogleWorkspaceDirectoryService.setGroupMemberDeliverySettings({
      groupEmail: group,
      memberEmail: member,
      deliverySettings: groupSubscriptionGoogle(subscription)
    });
    return { ok: true, groupEmail: group, deliverySettings: groupSubscriptionGoogle(subscription) };
  } catch (e) {
    return { ok: false, groupEmail: group, error: e?.message || String(e) };
  }
}

async function notifyAdminsAndSupport({
  agencyId,
  schoolOrganizationId,
  email,
  name,
  groupEmail,
  subscription,
  previousSubscription = null,
  source = 'portal',
  actorUserId = null
}) {
  if (!agencyId) return 0;
  const Notification = (await import('../models/Notification.model.js')).default;
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN user_agencies ua ON ua.user_id = u.id
     WHERE (
       (ua.agency_id = ? AND LOWER(COALESCE(u.role, '')) IN ('admin', 'support'))
       OR LOWER(COALESCE(u.role, '')) = 'super_admin'
     )
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [Number(agencyId)]
  );
  const ids = [...new Set((rows || []).map((r) => Number(r.id)).filter(Boolean))];
  const who = name ? `${name} (${email})` : email;
  const nextLabel = groupSubscriptionLabel(subscription);
  const prevLabel = previousSubscription ? groupSubscriptionLabel(previousSubscription) : null;
  const group = groupEmail || 'the school group';
  const viaEmail = String(source || '').toLowerCase() === 'email_link' || String(source || '').toLowerCase() === 'email';
  const title = 'School group email subscription changed';
  const message = [
    viaEmail
      ? `${who} replied from an email and changed their subscription to ${group}.`
      : `${who} changed their subscription to ${group} ${sourceLabel(source)}.`,
    prevLabel && prevLabel !== nextLabel ? `Previous: ${prevLabel}.` : null,
    `Now: ${nextLabel}.`,
    'They remain on the school portal and in the Google Group; only email delivery changed.'
  ]
    .filter(Boolean)
    .join(' ');

  await Promise.all(
    ids.map((userId) =>
      Notification.create({
        type: 'school_group_subscription_changed',
        severity: 'info',
        title,
        message,
        userId,
        agencyId: Number(agencyId),
        relatedEntityType: 'school',
        relatedEntityId: Number(schoolOrganizationId) || undefined,
        actorUserId: actorUserId || undefined,
        actorSource: source === 'email_link' ? 'Email link' : 'School Portal'
      })
    )
  );
  return ids.length;
}

/**
 * Set a staff member's Google Group subscription without removing portal access.
 */
export async function applySchoolGroupSubscription({
  schoolOrganizationId,
  email,
  subscription,
  source = 'portal',
  actorUserId = null,
  displayName = null,
  notify = true,
  previousSubscription = null
} = {}) {
  const orgId = Number(schoolOrganizationId || 0);
  const memberEmail = String(email || '').trim().toLowerCase();
  const next = normalizeGroupSubscription(subscription);
  if (!orgId || !memberEmail.includes('@')) {
    return { ok: false, reason: 'invalid_args' };
  }

  let prior = previousSubscription;
  if (!prior) {
    try {
      const [rows] = await pool.execute(
        `SELECT email_delivery_preference
         FROM school_contacts
         WHERE school_organization_id = ? AND LOWER(TRIM(email)) = ?
         LIMIT 1`,
        [orgId, memberEmail]
      );
      prior = rows?.[0]?.email_delivery_preference || null;
    } catch {
      prior = null;
    }
  }

  await persistContactSubscription({ schoolOrganizationId: orgId, email: memberEmail, subscription: next });
  const groupEmail = await resolveGroupEmailForSchool(orgId);
  const google = groupEmail
    ? await applyGoogleGroupDeliverySettings({
        groupEmail,
        memberEmail,
        subscription: next
      })
    : { ok: false, skipped: true, reason: 'missing_group_email' };

  let agencyId = null;
  try {
    agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
  } catch {
    agencyId = null;
  }

  if (notify && agencyId && normalizeGroupSubscription(prior || 'all_mail') !== next) {
    try {
      await notifyAdminsAndSupport({
        agencyId,
        schoolOrganizationId: orgId,
        email: memberEmail,
        name: displayName,
        groupEmail,
        subscription: next,
        previousSubscription: prior,
        source,
        actorUserId
      });
    } catch (e) {
      console.warn('[schoolGroupSubscription] notify failed:', e?.message || e);
    }
  }

  return {
    ok: true,
    email: memberEmail,
    schoolOrganizationId: orgId,
    groupEmail,
    subscription: next,
    subscriptionLabel: groupSubscriptionLabel(next),
    google
  };
}
