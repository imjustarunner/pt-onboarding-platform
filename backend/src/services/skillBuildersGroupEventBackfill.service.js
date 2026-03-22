import {
  resolveSkillBuildersProgramOrganizationId,
  buildSkillsGroupEventDescription,
  computeSkillsGroupEventWindow,
  insertSkillsGroupCompanyEvent
} from './skillBuildersSkillsGroup.service.js';
import { ProviderAvailabilityService } from './providerAvailability.service.js';

/**
 * Create program-scoped company_events for school skills_groups missing integration.
 * Uses the same titles/descriptions as live school-portal sync.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ agencyId?: number | null, actorUserId: number }} opts - agencyId scopes to one agency; omit for all agencies
 * @returns {Promise<{ created: number, skipped: number, warnings: string[] }>}
 */
export async function backfillSkillsGroupCompanyEvents(conn, opts) {
  const actorUserId = Number(opts?.actorUserId);
  if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
    throw new Error('actorUserId is required');
  }
  const filterAgencyId = opts?.agencyId != null ? Number(opts.agencyId) : null;
  const params = [];
  let sql = `
    SELECT sg.id, sg.agency_id, sg.organization_id, sg.name, sg.start_date, sg.end_date
    FROM skills_groups sg
    JOIN agencies sch ON sch.id = sg.organization_id
    WHERE LOWER(COALESCE(sch.organization_type, '')) = 'school'
      AND (sg.company_event_id IS NULL OR sg.skill_builders_program_organization_id IS NULL)`;
  if (filterAgencyId != null && Number.isFinite(filterAgencyId) && filterAgencyId > 0) {
    sql += ' AND sg.agency_id = ?';
    params.push(filterAgencyId);
  }

  const [groups] = await conn.execute(sql, params);
  let created = 0;
  let skipped = 0;
  const warnings = [];

  for (const sg of groups || []) {
    const groupAgencyId = Number(sg.agency_id);
    const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, groupAgencyId);
    if (!programOrgId) {
      skipped += 1;
      warnings.push(`Group ${sg.id}: no Skill Builders program org for agency ${groupAgencyId}`);
      continue;
    }

    const [mrows] = await conn.execute(
      `SELECT weekday, start_time, end_time FROM skills_group_meetings WHERE skills_group_id = ? ORDER BY id ASC`,
      [sg.id]
    );
    const meetings = mrows || [];

    const [schoolRows] = await conn.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [sg.organization_id]);
    const schoolName = String(schoolRows?.[0]?.name || 'School').trim();

    const agencyTz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId: groupAgencyId });
    const { startsAt, endsAt, timeZone: eventTz } = computeSkillsGroupEventWindow(
      sg.start_date,
      sg.end_date,
      agencyTz
    );
    const description = buildSkillsGroupEventDescription({
      schoolName,
      groupName: String(sg.name || '').trim() || `Group ${sg.id}`,
      startDate: sg.start_date,
      endDate: sg.end_date,
      meetings
    });
    const title = `Skill Builders: ${String(sg.name || '').trim() || `Group ${sg.id}`}`.slice(0, 255);

    await conn.beginTransaction();
    try {
      const eventId = await insertSkillsGroupCompanyEvent(conn, {
        agencyId: groupAgencyId,
        programOrgId,
        userId: actorUserId,
        title,
        description,
        startsAt,
        endsAt,
        timeZone: eventTz
      });
      await conn.execute(
        `UPDATE skills_groups SET skill_builders_program_organization_id = ?, company_event_id = ? WHERE id = ?`,
        [programOrgId, eventId, sg.id]
      );
      await conn.commit();
      created += 1;
    } catch (e) {
      await conn.rollback();
      skipped += 1;
      warnings.push(`Group ${sg.id}: ${e.message || String(e)}`);
    }
  }

  return { created, skipped, warnings };
}
