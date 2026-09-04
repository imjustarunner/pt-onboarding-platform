import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import GoogleWorkspaceDirectoryService from '../googleWorkspaceDirectory.service.js';
import {
  resolveAlwaysOnSchoolGroupMembers,
  resolveSchoolReplyEmail
} from '../schoolGroupProvisioning.service.js';
import { syncSchoolEmailInboundForAgency } from './schoolEmailInboundSync.service.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure every affiliated school Google Group that has an itsco_email:
 * 1) includes schoolreply@ (and other always-on members) so inbound mail reaches the ticket agent
 * 2) is registered on the schoolreply inbound routes
 *
 * Also backfills school_profiles.itsco_email when a known school↔group pair is provided.
 */
export async function reconcileSchoolGroupTicketIntakeForAgency({
  agencyId = null,
  agencySlug = 'itsco',
  dryRun = false,
  profileLinks = []
} = {}) {
  let resolvedAgencyId = Number(agencyId || 0);
  let agency = resolvedAgencyId ? await Agency.findById(resolvedAgencyId) : null;
  if (!agency) {
    const needle = String(agencySlug || 'itsco').trim().toLowerCase();
    const [rows] = await pool.execute(
      `SELECT id, name, slug FROM agencies
       WHERE LOWER(COALESCE(slug, '')) = ? OR LOWER(COALESCE(name, '')) = ?
       ORDER BY id ASC LIMIT 1`,
      [needle, needle]
    );
    agency = rows?.[0] || null;
    resolvedAgencyId = Number(agency?.id || 0);
  }
  if (!resolvedAgencyId || !agency) {
    const err = new Error(`Agency not found (${agencySlug || agencyId})`);
    err.status = 404;
    throw err;
  }

  const stats = {
    agencyId: resolvedAgencyId,
    agencySlug: agency.slug || agencySlug,
    schoolReplyEmail: resolveSchoolReplyEmail(agency),
    dryRun: !!dryRun,
    profilesLinked: 0,
    schoolsScanned: 0,
    groupsMissing: 0,
    membersAdded: 0,
    membersAlreadyPresent: 0,
    memberErrors: 0,
    inboundSync: null,
    added: [],
    missingGroups: [],
    errors: []
  };

  // Optional explicit school_id → group email links (e.g. Grant Beacon).
  for (const link of profileLinks || []) {
    const schoolOrganizationId = Number(link.schoolOrganizationId || link.school_id || 0);
    const itscoEmail = normalizeEmail(link.itscoEmail || link.itsco_email || link.groupEmail);
    const districtName = String(link.districtName || link.district_name || '').trim() || null;
    if (!schoolOrganizationId || !itscoEmail.includes('@')) continue;
    if (dryRun) {
      stats.profilesLinked += 1;
      continue;
    }
    await pool.execute(
      `INSERT INTO school_profiles (school_organization_id, district_name, itsco_email)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         itsco_email = VALUES(itsco_email),
         district_name = COALESCE(NULLIF(TRIM(district_name), ''), VALUES(district_name)),
         updated_at = CURRENT_TIMESTAMP`,
      [schoolOrganizationId, districtName, itscoEmail]
    );
    stats.profilesLinked += 1;
  }

  const [schools] = await pool.execute(
    `SELECT a.id AS school_organization_id, a.name AS school_name,
            LOWER(TRIM(sp.itsco_email)) AS itsco_email
     FROM agencies a
     JOIN school_profiles sp ON sp.school_organization_id = a.id
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = a.id AND oa.is_active = TRUE
     LEFT JOIN agency_schools asch
       ON asch.school_organization_id = a.id AND asch.is_active = TRUE
     WHERE a.organization_type = 'school'
       AND (oa.agency_id = ? OR asch.agency_id = ?)
       AND sp.itsco_email IS NOT NULL
       AND TRIM(sp.itsco_email) <> ''
     ORDER BY a.name ASC`,
    [resolvedAgencyId, resolvedAgencyId]
  );

  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    stats.errors.push({ error: 'google_workspace_not_configured' });
    if (!dryRun) {
      stats.inboundSync = await syncSchoolEmailInboundForAgency({ agencyId: resolvedAgencyId }).catch((e) => ({
        error: e?.message || String(e)
      }));
    }
    return stats;
  }

  const alwaysOn = resolveAlwaysOnSchoolGroupMembers(agency);

  for (const school of schools || []) {
    const groupEmail = normalizeEmail(school.itsco_email);
    if (!groupEmail.includes('@')) continue;
    stats.schoolsScanned += 1;

    let group = null;
    try {
      group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail });
    } catch (e) {
      stats.errors.push({ groupEmail, school: school.school_name, error: e?.message || String(e) });
      continue;
    }
    if (!group) {
      stats.groupsMissing += 1;
      stats.missingGroups.push({
        groupEmail,
        schoolOrganizationId: Number(school.school_organization_id),
        schoolName: school.school_name
      });
      continue;
    }

    for (const member of alwaysOn) {
      if (dryRun) {
        stats.membersAdded += 1;
        stats.added.push({ groupEmail, member: member.email, role: member.role, dryRun: true });
        continue;
      }
      try {
        const result = await GoogleWorkspaceDirectoryService.addGroupMember({
          groupEmail,
          memberEmail: member.email,
          role: member.role
        });
        if (result?.alreadyMember) {
          stats.membersAlreadyPresent += 1;
        } else {
          stats.membersAdded += 1;
          stats.added.push({
            groupEmail,
            member: member.email,
            role: result?.role || member.role,
            schoolName: school.school_name
          });
        }
        await sleep(150);
      } catch (e) {
        stats.memberErrors += 1;
        stats.errors.push({
          groupEmail,
          member: member.email,
          school: school.school_name,
          error: e?.message || String(e)
        });
      }
    }
  }

  if (!dryRun) {
    try {
      stats.inboundSync = await syncSchoolEmailInboundForAgency({ agencyId: resolvedAgencyId });
    } catch (e) {
      stats.inboundSync = { error: e?.message || String(e) };
      stats.errors.push({ error: e?.message || String(e), phase: 'inbound_sync' });
    }
  }

  return stats;
}

export default {
  reconcileSchoolGroupTicketIntakeForAgency
};
