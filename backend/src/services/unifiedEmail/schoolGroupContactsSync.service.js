import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import GoogleWorkspaceDirectoryService from '../googleWorkspaceDirectory.service.js';
import { syncSchoolEmailInboundForAgency } from './schoolEmailInboundSync.service.js';
import { reconcileSchoolGroupTicketIntakeForAgency } from './reconcileSchoolGroupTicketIntake.service.js';

const DEFAULT_MEMBER_EMAIL = 'schoolreply@itsco.health';
const SYNC_SOURCE_PREFIX = 'google_group_sync';

const INTERNAL_EMAIL_SUFFIXES = [
  '@itsco.health',
  '@plottwistco.com',
  '@plottwisthq.com'
];

const INTERNAL_EMAIL_EXACT = new Set([
  'schoolreply@itsco.health',
  'schools@itsco.health',
  'ai@plottwistco.com',
  'notifications@itsco.health'
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isInternalMemberEmail(email) {
  const em = normalizeEmail(email);
  if (!em) return true;
  if (INTERNAL_EMAIL_EXACT.has(em)) return true;
  return INTERNAL_EMAIL_SUFFIXES.some((suffix) => em.endsWith(suffix));
}

function displayNameFromUser(user) {
  const given = String(user?.name?.givenName || '').trim();
  const family = String(user?.name?.familyName || '').trim();
  const full = [given, family].filter(Boolean).join(' ').trim();
  if (full) return full;
  return String(user?.name?.fullName || '').trim() || null;
}

function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  if (!local) return null;
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function buildSchoolEmailMap(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return new Map();
  const [rows] = await pool.execute(
    `SELECT sp.school_organization_id, a.name AS school_name, LOWER(TRIM(sp.itsco_email)) AS itsco_email
     FROM school_profiles sp
     JOIN agencies a ON a.id = sp.school_organization_id
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = sp.school_organization_id AND oa.is_active = TRUE
     LEFT JOIN agency_schools asch
       ON asch.school_organization_id = sp.school_organization_id AND asch.is_active = TRUE
     WHERE (oa.agency_id = ? OR asch.agency_id = ?)
       AND sp.itsco_email IS NOT NULL
       AND TRIM(sp.itsco_email) <> ''`,
    [aid, aid]
  );
  const map = new Map();
  for (const row of rows || []) {
    const email = normalizeEmail(row.itsco_email);
    if (!email.includes('@')) continue;
    map.set(email, {
      schoolOrganizationId: Number(row.school_organization_id),
      schoolName: row.school_name || null,
      itscoEmail: email
    });
  }
  return map;
}

async function upsertSchoolContact({
  schoolOrganizationId,
  fullName,
  email,
  groupEmail,
  dryRun = false
}) {
  const em = normalizeEmail(email);
  if (!em) return { action: 'skipped', reason: 'no_email' };

  if (dryRun) {
    const [existing] = await pool.execute(
      `SELECT id, full_name FROM school_contacts
       WHERE school_organization_id = ? AND LOWER(COALESCE(email, '')) = ?
       LIMIT 1`,
      [Number(schoolOrganizationId), em]
    );
    return existing?.[0]
      ? { action: 'would_update', contactId: existing[0].id }
      : { action: 'would_create' };
  }

  const sourceTag = `${SYNC_SOURCE_PREFIX}:${normalizeEmail(groupEmail)}`;
  const name = String(fullName || '').trim() || displayNameFromEmail(em) || null;

  const [result] = await pool.execute(
    `INSERT INTO school_contacts
      (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler)
     VALUES (?, ?, ?, NULL, 'Synced from Google Group membership', ?, 0, 0, 0)
     ON DUPLICATE KEY UPDATE
       full_name = CASE
         WHEN VALUES(full_name) IS NOT NULL AND TRIM(VALUES(full_name)) <> '' THEN VALUES(full_name)
         ELSE full_name
       END,
       raw_source_text = VALUES(raw_source_text),
       updated_at = CURRENT_TIMESTAMP`,
    [Number(schoolOrganizationId), name, em, sourceTag]
  );

  if (Number(result?.affectedRows || 0) === 1) return { action: 'created' };
  if (Number(result?.affectedRows || 0) === 2) return { action: 'updated' };
  return { action: 'unchanged' };
}

function parseName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { firstName: 'School', lastName: 'Staff' };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Staff' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/**
 * Ensure a PENDING_SETUP school_staff user exists and is assigned to the school.
 * Never creates duplicates; never demotes ACTIVE_EMPLOYEE; skips non-school_staff roles.
 */
async function ensurePendingSchoolStaffUser({
  schoolOrganizationId,
  fullName,
  email,
  dryRun = false
}) {
  const em = normalizeEmail(email);
  if (!em) return { action: 'skipped', reason: 'no_email' };

  const existing = await User.findByEmail(em);
  if (existing?.id) {
    const role = String(existing.role || '').toLowerCase();
    if (role !== 'school_staff') {
      return { action: 'skipped_other_role', reason: `role:${role}`, userId: existing.id };
    }
    const membership = await User.getAgencyMembership(existing.id, Number(schoolOrganizationId));
    if (membership) {
      return { action: 'already_member', userId: existing.id };
    }
    if (dryRun) return { action: 'would_assign', userId: existing.id };
    await User.assignToAgency(existing.id, Number(schoolOrganizationId));
    return { action: 'assigned', userId: existing.id };
  }

  if (dryRun) return { action: 'would_create_pending' };

  const { firstName, lastName } = parseName(fullName);
  const user = await User.create({
    email: em,
    passwordHash: null,
    firstName,
    lastName,
    role: 'school_staff',
    status: 'PENDING_SETUP',
    personalEmail: em
  });
  try {
    await User.setWorkEmail?.(user.id, em);
  } catch {
    // ignore
  }
  try {
    await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [em, em, user.id]);
  } catch {
    // ignore
  }
  await User.assignToAgency(user.id, Number(schoolOrganizationId));
  return { action: 'created_pending', userId: user.id };
}

/**
 * Sync Google Group members (for groups schoolreply belongs to) into school_contacts
 * and ensure PENDING_SETUP school_staff memberships for external members.
 * Matches group email addresses to school_profiles.itsco_email for the agency.
 */
export async function syncSchoolGroupContactsForAgency({
  agencyId,
  agencySlug = 'itsco',
  memberEmail = process.env.SCHOOL_GROUP_SYNC_MEMBER_EMAIL || DEFAULT_MEMBER_EMAIL,
  dryRun = false,
  fetchUserNames = true,
  alsoSyncInboundRoutes = true,
  createPendingStaff = true
} = {}) {
  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    const err = new Error(
      'Google Workspace Directory is not configured (set GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 and GOOGLE_WORKSPACE_IMPERSONATE_USER to a super admin)'
    );
    err.status = 503;
    throw err;
  }

  let resolvedAgencyId = Number(agencyId || 0);
  if (!resolvedAgencyId) {
    const [rows] = await pool.execute(
      `SELECT id, name, slug FROM agencies
       WHERE LOWER(COALESCE(slug, '')) = ? OR LOWER(COALESCE(name, '')) = ?
       ORDER BY id ASC LIMIT 1`,
      [String(agencySlug || 'itsco').trim().toLowerCase(), String(agencySlug || 'itsco').trim().toLowerCase()]
    );
    resolvedAgencyId = Number(rows?.[0]?.id || 0);
  }
  if (!resolvedAgencyId) {
    const err = new Error(`Agency not found (${agencySlug || agencyId})`);
    err.status = 404;
    throw err;
  }

  // Ensure schoolreply@ (ticket-intake mailbox) is on every school group with an
  // itsco_email, and refresh inbound routes before contact sync.
  let ticketIntakeReconcile = null;
  try {
    ticketIntakeReconcile = await reconcileSchoolGroupTicketIntakeForAgency({
      agencyId: resolvedAgencyId,
      dryRun
    });
  } catch (e) {
    // Continue contact sync even if membership reconcile fails.
    ticketIntakeReconcile = { error: e?.message || String(e) };
  }

  const schoolMap = await buildSchoolEmailMap(resolvedAgencyId);
  const member = normalizeEmail(memberEmail) || DEFAULT_MEMBER_EMAIL;

  const groups = await GoogleWorkspaceDirectoryService.listGroupsForMember(member);
  const stats = {
    agencyId: resolvedAgencyId,
    memberEmail: member,
    groupsFound: groups.length,
    groupsMatched: 0,
    groupsUnmatched: 0,
    membersScanned: 0,
    membersSkippedInternal: 0,
    membersSkippedNonUser: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsUnchanged: 0,
    staffCreatedPending: 0,
    staffAssigned: 0,
    staffAlreadyMember: 0,
    staffSkippedOtherRole: 0,
    dryRun,
    matchedGroups: [],
    unmatchedGroups: [],
    errors: []
  };

  const userNameCache = new Map();

  for (const group of groups) {
    const groupEmail = normalizeEmail(group?.email);
    if (!groupEmail) continue;

    const school = schoolMap.get(groupEmail);
    if (!school) {
      stats.groupsUnmatched += 1;
      stats.unmatchedGroups.push({
        groupEmail,
        groupName: group?.name || null
      });
      continue;
    }

    stats.groupsMatched += 1;
    const groupStats = {
      groupEmail,
      schoolOrganizationId: school.schoolOrganizationId,
      schoolName: school.schoolName,
      membersScanned: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      staffCreatedPending: 0,
      staffAssigned: 0
    };

    let members = [];
    try {
      members = await GoogleWorkspaceDirectoryService.listGroupMembers(groupEmail);
    } catch (e) {
      stats.errors.push({
        groupEmail,
        message: e?.message || String(e)
      });
      continue;
    }

    for (const m of members) {
      stats.membersScanned += 1;
      groupStats.membersScanned += 1;

      const type = String(m?.type || 'USER').toUpperCase();
      if (type !== 'USER') {
        stats.membersSkippedNonUser += 1;
        continue;
      }
      const status = String(m?.status || 'ACTIVE').toUpperCase();
      if (status && status !== 'ACTIVE') continue;

      const email = normalizeEmail(m?.email);
      if (!email) continue;
      if (isInternalMemberEmail(email)) {
        stats.membersSkippedInternal += 1;
        continue;
      }

      let fullName = null;
      if (fetchUserNames) {
        if (userNameCache.has(email)) {
          fullName = userNameCache.get(email);
        } else {
          try {
            const user = await GoogleWorkspaceDirectoryService.getUser({ primaryEmail: email });
            fullName = displayNameFromUser(user) || displayNameFromEmail(email);
          } catch {
            fullName = displayNameFromEmail(email);
          }
          userNameCache.set(email, fullName);
        }
      } else {
        fullName = displayNameFromEmail(email);
      }

      try {
        const result = await upsertSchoolContact({
          schoolOrganizationId: school.schoolOrganizationId,
          fullName,
          email,
          groupEmail,
          dryRun
        });
        if (result.action === 'created' || result.action === 'would_create') {
          stats.contactsCreated += 1;
          groupStats.contactsCreated += 1;
        } else if (result.action === 'updated' || result.action === 'would_update') {
          stats.contactsUpdated += 1;
          groupStats.contactsUpdated += 1;
        } else {
          stats.contactsUnchanged += 1;
        }

        if (createPendingStaff) {
          const staffResult = await ensurePendingSchoolStaffUser({
            schoolOrganizationId: school.schoolOrganizationId,
            fullName,
            email,
            dryRun
          });
          if (
            staffResult.action === 'created_pending' ||
            staffResult.action === 'would_create_pending'
          ) {
            stats.staffCreatedPending += 1;
            groupStats.staffCreatedPending += 1;
          } else if (
            staffResult.action === 'assigned' ||
            staffResult.action === 'would_assign'
          ) {
            stats.staffAssigned += 1;
            groupStats.staffAssigned += 1;
          } else if (staffResult.action === 'already_member') {
            stats.staffAlreadyMember += 1;
          } else if (staffResult.action === 'skipped_other_role') {
            stats.staffSkippedOtherRole += 1;
          }
        }
      } catch (e) {
        stats.errors.push({
          groupEmail,
          email,
          message: e?.message || String(e)
        });
      }
    }

    stats.matchedGroups.push(groupStats);
  }

  let inboundSync = null;
  if (alsoSyncInboundRoutes && !dryRun) {
    try {
      inboundSync = await syncSchoolEmailInboundForAgency({
        agencyId: resolvedAgencyId,
        configureAiPolicy: true
      });
    } catch (e) {
      stats.errors.push({
        phase: 'inbound_sync',
        message: e?.message || String(e)
      });
    }
  }

  return {
    ...stats,
    ticketIntakeReconcile,
    inboundSync: inboundSync
      ? {
          identityId: inboundSync.identity?.id || null,
          inboundCount: inboundSync.identity?.inboundCount || 0,
          schoolsRouted: inboundSync.schoolsRouted || 0
        }
      : null
  };
}

export { DEFAULT_MEMBER_EMAIL, SYNC_SOURCE_PREFIX };
