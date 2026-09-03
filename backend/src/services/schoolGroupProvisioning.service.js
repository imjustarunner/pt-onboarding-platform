import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';
import { syncSchoolEmailInboundForAgency } from './unifiedEmail/schoolEmailInboundSync.service.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function agencySlug(agency) {
  return String(agency?.slug || agency?.portal_url || 'itsco').trim().toLowerCase() || 'itsco';
}

/** Collaborative ITSCO schools mailbox — owner/manager of every school group (not support@). */
export function resolveSchoolsMailboxEmail(agency) {
  const fromEnv = String(process.env.SCHOOL_GROUP_SCHOOLS_EMAIL || '').trim().toLowerCase();
  if (fromEnv.includes('@')) return fromEnv;
  return `schools@${agencySlug(agency)}.health`;
}

/** @deprecated Use resolveSchoolsMailboxEmail — support@ is not added to school groups. */
export function resolveSupportManagerEmail(agency) {
  return resolveSchoolsMailboxEmail(agency);
}

/** School-reply mailbox that must be on every school group (not ai@plottwistco.com). */
export function resolveSchoolReplyEmail(agency) {
  const fromEnv = String(
    process.env.SCHOOL_GROUP_SCHOOLREPLY_EMAIL || process.env.SCHOOLREPLY_FROM_EMAIL || ''
  )
    .trim()
    .toLowerCase();
  if (fromEnv.includes('@')) return fromEnv;
  return `schoolreply@${agencySlug(agency)}.health`;
}

/**
 * Always-on ITSCO members for every school group.
 * Nested Google Groups (schools@, schoolreply@) are added as MEMBER; users as MEMBER.
 */
export function resolveAlwaysOnSchoolGroupMembers(agency) {
  const slug = agencySlug(agency);
  const members = [
    { email: resolveSchoolsMailboxEmail(agency), role: 'OWNER' },
    { email: resolveSchoolReplyEmail(agency), role: 'MANAGER' }
  ];
  const extras = [];
  if (slug === 'itsco') extras.push('rachel@itsco.health');
  const envList = String(process.env.SCHOOL_GROUP_ALWAYS_MEMBER_EMAILS || '')
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter((e) => e.includes('@'));
  extras.push(...envList);
  for (const email of extras) {
    if (members.some((m) => m.email === email)) continue;
    members.push({ email, role: 'MEMBER' });
  }
  return members;
}

function directoryActorEmail() {
  return String(
    process.env.GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER ||
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
      ''
  )
    .trim()
    .toLowerCase();
}

function emailsToStripFromSchoolGroups(agency) {
  const list = new Set(['ai@plottwistco.com']);
  const slug = agencySlug(agency);
  list.add(`support@${slug}.health`);
  list.add('support@itsco.health');
  const actor = directoryActorEmail();
  for (const key of ['GMAIL_IMPERSONATE_USER', 'GOOGLE_WORKSPACE_IMPERSONATE_USER']) {
    const v = String(process.env[key] || '')
      .trim()
      .toLowerCase();
    // Only strip the shared AI mailbox — never remove the Directory impersonation subject.
    if (v && v !== actor && (v === 'ai@plottwistco.com' || v.startsWith('ai@'))) list.add(v);
  }
  const alwaysOn = new Set(resolveAlwaysOnSchoolGroupMembers(agency).map((m) => m.email));
  if (actor) alwaysOn.add(actor);
  return Array.from(list).filter((e) => e && !alwaysOn.has(e));
}

function alwaysOnEmailSet(agency) {
  return new Set(resolveAlwaysOnSchoolGroupMembers(agency).map((m) => m.email));
}

function buildGroupDescription({ schoolName, agencyName, contactName, contactEmail }) {
  const school = String(schoolName || 'School').trim();
  const agency = String(agencyName || 'ITSCO').trim();
  const contact = String(contactName || '').trim();
  const email = String(contactEmail || '').trim();
  const lines = [
    `${school} — shared school group mailbox for ${agency}.`,
    'Use this address for school-wide communications with your ITSCO team (referrals, scheduling, and portal updates).',
    'External school staff may be added as members so they can receive messages at their school email addresses.'
  ];
  if (contact && email) {
    lines.push(`Primary portal contact: ${contact} (${email}).`);
  }
  return lines.join('\n').slice(0, 4096);
}

/**
 * Typical ITSCO school Google Group settings (mirrors admin console defaults).
 * allowExternalMembers is applied via Groups Settings API.
 */
function typicalSchoolGroupSettings() {
  return {
    whoCanJoin: 'CAN_REQUEST_TO_JOIN',
    whoCanViewMembership: 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
    whoCanPostMessage: 'ANYONE_CAN_POST',
    whoCanModerateContent: 'OWNERS_AND_MANAGERS',
    whoCanModerateMembers: 'OWNERS_AND_MANAGERS',
    allowExternalMembers: true,
    includeInGlobalAddressList: true,
    whoCanContactOwner: 'ANYONE_CAN_CONTACT',
    messageModerationLevel: 'MODERATE_NONE',
    spamModerationLevel: 'MODERATE',
    isArchived: false
  };
}

export async function resolveSchoolGroupEmail(schoolOrganizationId) {
  const orgId = Number(schoolOrganizationId || 0);
  if (!orgId) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT itsco_email FROM school_profiles WHERE school_organization_id = ? LIMIT 1`,
      [orgId]
    );
    const email = normalizeEmail(rows?.[0]?.itsco_email);
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

async function listStaffEmailsForSchoolOrg(schoolOrganizationId, primaryEmail = null) {
  const orgId = Number(schoolOrganizationId || 0);
  if (!orgId) return [];
  const emails = new Set();
  const primary = normalizeEmail(primaryEmail);
  if (primary) emails.add(primary);
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT LOWER(TRIM(u.email)) AS email
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE LOWER(COALESCE(u.role, '')) = 'school_staff'
         AND u.email IS NOT NULL
         AND TRIM(u.email) <> ''`,
      [orgId]
    );
    for (const row of rows || []) {
      const e = normalizeEmail(row.email);
      if (e.includes('@')) emails.add(e);
    }
  } catch {
    // ignore
  }
  try {
    const [contacts] = await pool.execute(
      `SELECT LOWER(TRIM(email)) AS email
       FROM school_contacts
       WHERE school_organization_id = ?
         AND email IS NOT NULL
         AND TRIM(email) <> ''
         AND COALESCE(email_delivery_preference, 'email') <> 'no_email'`,
      [orgId]
    );
    for (const row of contacts || []) {
      const e = normalizeEmail(row.email);
      if (e.includes('@')) emails.add(e);
    }
  } catch {
    // ignore
  }
  return Array.from(emails);
}

async function addMemberSafe(groupEmail, memberEmail, role, { membersAdded, memberErrors }) {
  const m = normalizeEmail(memberEmail);
  if (!m || !m.includes('@') || m === normalizeEmail(groupEmail)) return;
  try {
    await GoogleWorkspaceDirectoryService.addGroupMember({
      groupEmail,
      memberEmail: m,
      role
    });
    membersAdded.push({ email: m, role });
  } catch (e) {
    memberErrors.push({ email: m, role, error: e?.message || String(e) });
  }
}

async function removeMemberSafe(groupEmail, memberEmail, { membersRemoved, memberErrors }) {
  const m = normalizeEmail(memberEmail);
  if (!m || !m.includes('@') || m === normalizeEmail(groupEmail)) return;
  try {
    const result = await GoogleWorkspaceDirectoryService.removeGroupMember({
      groupEmail,
      memberEmail: m
    });
    if (result?.removed) membersRemoved.push(m);
  } catch (e) {
    memberErrors.push({ email: m, role: 'REMOVE', error: e?.message || String(e) });
  }
}

async function applyAccessSettingsSafe(groupEmail, settings, memberErrors) {
  if (typeof GoogleWorkspaceDirectoryService.applyGroupAccessSettings !== 'function') return;
  try {
    await GoogleWorkspaceDirectoryService.applyGroupAccessSettings({
      groupEmail,
      ...settings
    });
  } catch (e) {
    memberErrors.push({
      email: groupEmail,
      role: 'SETTINGS',
      error: e?.message || String(e)
    });
  }
}

/**
 * Create (or reuse) the school's Google Group and add managers + staff.
 * Uses Workspace Directory API — group owner is the delegated admin, not ai@.
 */
export async function provisionSchoolGoogleGroup({
  agencyId,
  schoolOrganizationId,
  groupEmail,
  schoolName,
  contactFirstName = '',
  contactLastName = '',
  contactEmail = '',
  staffEmails = null
} = {}) {
  const email = normalizeEmail(groupEmail);
  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'invalid_group_email' };
  }
  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    return { ok: false, reason: 'google_workspace_not_configured', skipped: true };
  }

  const agency = await Agency.findById(agencyId);
  const alwaysOn = resolveAlwaysOnSchoolGroupMembers(agency);
  const description = buildGroupDescription({
    schoolName,
    agencyName: agency?.name,
    contactName: `${contactFirstName || ''} ${contactLastName || ''}`.trim(),
    contactEmail
  });
  const settings = typicalSchoolGroupSettings();

  let group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail: email });
  let created = false;
  if (!group) {
    try {
      group = await GoogleWorkspaceDirectoryService.createGroup({
        email,
        name: String(schoolName || email.split('@')[0]).trim().slice(0, 73),
        description,
        ...settings
      });
      created = true;
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 409) {
        group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail: email });
      } else {
        throw e;
      }
    }
  } else {
    try {
      await GoogleWorkspaceDirectoryService.updateGroupSettings?.({
        groupEmail: email,
        name: String(schoolName || group.name || email.split('@')[0]).trim().slice(0, 73),
        description,
        ...settings
      });
    } catch {
      // best-effort refresh settings
    }
  }

  // New groups can take a few seconds before members.insert accepts the groupKey.
  if (created) {
    await sleep(3000);
  }

  const membersAdded = [];
  const membersRemoved = [];
  const memberErrors = [];

  await applyAccessSettingsSafe(email, settings, memberErrors);

  // Directory members.insert requires the impersonated admin to remain a group owner.
  const actorEmail = directoryActorEmail();
  if (actorEmail && actorEmail.includes('@') && actorEmail !== email) {
    await addMemberSafe(email, actorEmail, 'OWNER', { membersAdded, memberErrors });
  }

  for (const member of alwaysOn) {
    await addMemberSafe(email, member.email, member.role, { membersAdded, memberErrors });
  }

  for (const strip of emailsToStripFromSchoolGroups(agency)) {
    await removeMemberSafe(email, strip, { membersRemoved, memberErrors });
  }

  const staff =
    Array.isArray(staffEmails) && staffEmails.length
      ? staffEmails.map(normalizeEmail).filter((e) => e.includes('@'))
      : await listStaffEmailsForSchoolOrg(schoolOrganizationId, contactEmail);

  const protectedEmails = alwaysOnEmailSet(agency);
  protectedEmails.add(email);
  if (actorEmail) protectedEmails.add(actorEmail);

  for (const staffEmail of staff) {
    if (protectedEmails.has(staffEmail)) continue;
    if (emailsToStripFromSchoolGroups(agency).includes(staffEmail)) continue;
    await addMemberSafe(email, staffEmail, 'MEMBER', { membersAdded, memberErrors });
  }

  try {
    await syncSchoolEmailInboundForAgency(agencyId);
  } catch {
    // best-effort — inbound routing can catch up on next sync
  }

  return {
    ok: true,
    groupEmail: email,
    created,
    groupId: group?.id || null,
    supportManagerEmail: resolveSchoolsMailboxEmail(agency),
    schoolsMailboxEmail: resolveSchoolsMailboxEmail(agency),
    schoolReplyEmail: resolveSchoolReplyEmail(agency),
    alwaysOnMembers: alwaysOn.map((m) => m.email),
    membersAdded,
    membersRemoved: membersRemoved.length ? membersRemoved : undefined,
    memberErrors: memberErrors.length ? memberErrors : undefined
  };
}

/**
 * Add or remove a single school-staff email on that school's Google Group.
 * Always-on ITSCO mailboxes (schools@, schoolreply@, rachel@) are never removed.
 */
export async function syncSchoolStaffGoogleGroupMembership({
  schoolOrganizationId,
  email,
  action = 'add'
} = {}) {
  const memberEmail = normalizeEmail(email);
  const orgId = Number(schoolOrganizationId || 0);
  if (!orgId || !memberEmail.includes('@')) {
    return { ok: false, reason: 'invalid_args' };
  }
  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    return { ok: false, reason: 'google_workspace_not_configured', skipped: true };
  }

  const groupEmail = await resolveSchoolGroupEmail(orgId);
  if (!groupEmail) return { ok: false, reason: 'missing_group_email', skipped: true };

  let agencyId = null;
  try {
    agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
  } catch {
    agencyId = null;
  }
  const agency = agencyId ? await Agency.findById(agencyId) : await Agency.findById(orgId);
  const protectedEmails = alwaysOnEmailSet(agency);
  protectedEmails.add(groupEmail);
  const actorEmail = directoryActorEmail();
  if (actorEmail) protectedEmails.add(actorEmail);

  if (action === 'remove') {
    if (protectedEmails.has(memberEmail)) {
      return { ok: true, skipped: true, reason: 'protected_mailbox' };
    }
    try {
      const result = await GoogleWorkspaceDirectoryService.removeGroupMember({
        groupEmail,
        memberEmail
      });
      return { ok: true, groupEmail, action: 'remove', ...result };
    } catch (e) {
      return { ok: false, groupEmail, action: 'remove', error: e?.message || String(e) };
    }
  }

  try {
    await GoogleWorkspaceDirectoryService.applyGroupAccessSettings?.({
      groupEmail,
      ...typicalSchoolGroupSettings()
    });
  } catch {
    // best-effort; member insert may still succeed if settings already allow externals
  }

  try {
    const result = await GoogleWorkspaceDirectoryService.addGroupMember({
      groupEmail,
      memberEmail,
      role: 'MEMBER'
    });
    return { ok: true, groupEmail, action: 'add', ...result };
  } catch (e) {
    return { ok: false, groupEmail, action: 'add', error: e?.message || String(e) };
  }
}

export function queueSchoolStaffGoogleGroupSync(args) {
  Promise.resolve()
    .then(() => syncSchoolStaffGoogleGroupMembership(args))
    .then((result) => {
      if (result?.ok === false && !result?.skipped) {
        console.warn('[schoolGoogleGroup] staff sync failed:', result?.error || result?.reason);
      }
    })
    .catch((e) => {
      console.warn('[schoolGoogleGroup] staff sync error:', e?.message || e);
    });
}

export default {
  provisionSchoolGoogleGroup,
  syncSchoolStaffGoogleGroupMembership,
  queueSchoolStaffGoogleGroupSync,
  resolveSchoolGroupEmail,
  buildGroupDescription,
  resolveSchoolReplyEmail,
  resolveSchoolsMailboxEmail,
  resolveAlwaysOnSchoolGroupMembers
};
