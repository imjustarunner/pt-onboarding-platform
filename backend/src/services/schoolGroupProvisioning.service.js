import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';
import { syncSchoolEmailInboundForAgency } from './unifiedEmail/schoolEmailInboundSync.service.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveSupportManagerEmail(agency) {
  const slug = String(agency?.slug || agency?.portal_url || 'itsco').trim().toLowerCase();
  return `support@${slug}.health`;
}

/** School-reply mailbox that must be on every school group (not ai@plottwistco.com). */
function resolveSchoolReplyEmail(agency) {
  const fromEnv = String(
    process.env.SCHOOL_GROUP_SCHOOLREPLY_EMAIL || process.env.SCHOOLREPLY_FROM_EMAIL || ''
  )
    .trim()
    .toLowerCase();
  if (fromEnv.includes('@')) return fromEnv;
  const slug = String(agency?.slug || agency?.portal_url || 'itsco').trim().toLowerCase();
  return `schoolreply@${slug}.health`;
}

function emailsToStripFromSchoolGroups() {
  const list = new Set(['ai@plottwistco.com']);
  for (const key of ['GMAIL_IMPERSONATE_USER', 'GOOGLE_WORKSPACE_IMPERSONATE_USER']) {
    const v = String(process.env[key] || '')
      .trim()
      .toLowerCase();
    // Only strip the shared AI mailbox — never remove a human Directory admin.
    if (v === 'ai@plottwistco.com' || v.startsWith('ai@')) list.add(v);
  }
  return Array.from(list);
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
 */
function typicalSchoolGroupSettings() {
  return {
    whoCanJoin: 'CAN_REQUEST_TO_JOIN',
    whoCanViewMembership: 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanViewGroup: 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST',
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
  const supportEmail = resolveSupportManagerEmail(agency);
  const schoolReplyEmail = resolveSchoolReplyEmail(agency);
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

  const addMember = async (memberEmail, role) => {
    const m = normalizeEmail(memberEmail);
    if (!m || !m.includes('@')) return;
    try {
      await GoogleWorkspaceDirectoryService.addGroupMember({
        groupEmail: email,
        memberEmail: m,
        role
      });
      membersAdded.push({ email: m, role });
    } catch (e) {
      memberErrors.push({ email: m, role, error: e?.message || String(e) });
    }
  };

  const removeMember = async (memberEmail) => {
    const m = normalizeEmail(memberEmail);
    if (!m || !m.includes('@') || m === email) return;
    try {
      const result = await GoogleWorkspaceDirectoryService.removeGroupMember({
        groupEmail: email,
        memberEmail: m
      });
      if (result?.removed) membersRemoved.push(m);
    } catch (e) {
      memberErrors.push({ email: m, role: 'REMOVE', error: e?.message || String(e) });
    }
  };

  // Managers: support@ as OWNER (so we can strip ai@), schoolreply@ as MANAGER
  await addMember(supportEmail, 'OWNER');
  await addMember(schoolReplyEmail, 'MANAGER');

  // Directory create often auto-adds the impersonated subject (sometimes ai@) as OWNER — strip it.
  for (const strip of emailsToStripFromSchoolGroups()) {
    if (strip === supportEmail || strip === schoolReplyEmail) continue;
    await removeMember(strip);
  }

  const staff =
    Array.isArray(staffEmails) && staffEmails.length
      ? staffEmails.map(normalizeEmail).filter((e) => e.includes('@'))
      : await listStaffEmailsForSchoolOrg(schoolOrganizationId, contactEmail);

  for (const staffEmail of staff) {
    if (staffEmail === email) continue;
    if (staffEmail === supportEmail || staffEmail === schoolReplyEmail) continue;
    if (emailsToStripFromSchoolGroups().includes(staffEmail)) continue;
    await addMember(staffEmail, 'MEMBER');
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
    supportManagerEmail: supportEmail,
    schoolReplyEmail,
    membersAdded,
    membersRemoved: membersRemoved.length ? membersRemoved : undefined,
    memberErrors: memberErrors.length ? memberErrors : undefined
  };
}

export default {
  provisionSchoolGoogleGroup,
  buildGroupDescription,
  resolveSchoolReplyEmail
};
