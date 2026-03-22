/**
 * Link Skill-Builder-eligible providers to the affiliated "Skill Builders" program organization
 * via user_agencies, so Program Affiliation and provider-self affiliation APIs match event roster intent.
 */
import { resolveSkillBuildersProgramOrganizationId } from './skillBuildersSkillsGroup.service.js';

/**
 * Parent agencies the user is tied to for Skill Builders scoping:
 * - direct membership on an agency org row
 * - any affiliated school/program child via organization_affiliations
 * - any skills_group_providers row under that agency
 */
async function parentAgencyIdsForSkillBuildersScope(conn, userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];
  const [rows] = await conn.execute(
    `SELECT DISTINCT parent_agency_id FROM (
       SELECT ua.agency_id AS parent_agency_id
       FROM user_agencies ua
       INNER JOIN agencies ag ON ag.id = ua.agency_id
       WHERE ua.user_id = ?
         AND LOWER(COALESCE(ag.organization_type, 'agency')) = 'agency'
       UNION
       SELECT oa.agency_id AS parent_agency_id
       FROM user_agencies ua
       INNER JOIN organization_affiliations oa
         ON oa.organization_id = ua.agency_id AND oa.is_active = TRUE
       WHERE ua.user_id = ?
       UNION
       SELECT sg.agency_id AS parent_agency_id
       FROM skills_group_providers sgp
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
       WHERE sgp.provider_user_id = ?
     ) t
     WHERE parent_agency_id IS NOT NULL`,
    [uid, uid, uid]
  );
  return [...new Set((rows || []).map((r) => Number(r.parent_agency_id)).filter((n) => Number.isFinite(n) && n > 0))];
}

/**
 * For each parent agency that has a Skill Builders program org, ensure user_agencies(user, programOrgId).
 */
export async function syncProgramMembershipForSkillBuilderEligibleUser(conn, userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return { linkedPrograms: 0, details: [] };

  const [eligRows] = await conn.execute(
    `SELECT skill_builder_eligible FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const elig = eligRows?.[0]?.skill_builder_eligible;
  const isElig = elig === 1 || elig === true;
  if (!isElig) return { linkedPrograms: 0, details: [], skipped: 'not_skill_builder_eligible' };

  const parentIds = await parentAgencyIdsForSkillBuildersScope(conn, uid);
  const details = [];
  const seenProgram = new Set();
  for (const aid of parentIds) {
    const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, aid);
    if (!programOrgId) continue;
    if (seenProgram.has(programOrgId)) continue;
    seenProgram.add(programOrgId);
    await conn.execute(
      `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, programOrgId]
    );
    details.push({ parentAgencyId: aid, programOrganizationId: programOrgId });
  }
  return { linkedPrograms: details.length, details };
}

/**
 * For every tenant agency with a Skill Builders program, link all skill_builder_eligible users
 * who belong to that agency (directly, via affiliated org membership, or via skills_group_providers).
 */
export async function backfillSkillBuilderEligibleProgramAffiliations(conn, opts = {}) {
  const onlyAgencyId =
    opts.agencyId != null && Number.isFinite(Number(opts.agencyId)) && Number(opts.agencyId) > 0
      ? Number(opts.agencyId)
      : null;

  const [agencies] = await conn.execute(
    `SELECT id FROM agencies
     WHERE (is_archived = FALSE OR is_archived IS NULL)
       AND (is_active = FALSE OR is_active IS NULL OR is_active = TRUE)
       AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'
       ${onlyAgencyId ? 'AND id = ?' : ''}`,
    onlyAgencyId ? [onlyAgencyId] : []
  );

  let totalUserProgramLinks = 0;
  const detail = [];

  for (const a of agencies || []) {
    const aid = Number(a.id);
    const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, aid);
    if (!programOrgId) {
      detail.push({ agencyId: aid, skipped: 'no_skill_builders_program' });
      continue;
    }

    const [users] = await conn.execute(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       WHERE (u.skill_builder_eligible = 1 OR u.skill_builder_eligible = TRUE)
         AND (
           EXISTS (
             SELECT 1 FROM user_agencies ua
             INNER JOIN agencies ag ON ag.id = ua.agency_id
             WHERE ua.user_id = u.id
               AND LOWER(COALESCE(ag.organization_type, 'agency')) = 'agency'
               AND ua.agency_id = ?
           )
           OR EXISTS (
             SELECT 1 FROM user_agencies ua
             INNER JOIN organization_affiliations oa
               ON oa.organization_id = ua.agency_id AND oa.is_active = TRUE
             WHERE ua.user_id = u.id AND oa.agency_id = ?
           )
           OR EXISTS (
             SELECT 1 FROM skills_group_providers sgp
             INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
             WHERE sgp.provider_user_id = u.id AND sg.agency_id = ?
           )
         )`,
      [aid, aid, aid]
    );

    let n = 0;
    for (const row of users || []) {
      const uid = Number(row.user_id);
      if (!Number.isFinite(uid) || uid <= 0) continue;
      await conn.execute(
        `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id`,
        [uid, programOrgId]
      );
      n += 1;
    }
    totalUserProgramLinks += n;
    detail.push({ agencyId: aid, programOrganizationId: programOrgId, eligibleUsersLinked: n });
  }

  return {
    totalUserProgramLinks,
    agenciesProcessed: (agencies || []).length,
    detail
  };
}
