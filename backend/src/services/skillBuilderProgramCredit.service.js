import pool from '../config/database.js';

/**
 * Minutes between two MySQL TIME values on the same calendar day (no overnight wrap).
 */
export function minutesBetweenMysqlTime(startTime, endTime) {
  const s = String(startTime || '').trim();
  const e = String(endTime || '').trim();
  const m1 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const m2 = e.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m1 || !m2) return 0;
  const a = Number(m1[1]) * 60 + Number(m1[2]);
  const b = Number(m2[1]) * 60 + Number(m2[2]);
  return b > a ? b - a : 0;
}

/**
 * Weekly minutes credited from Skill Builders programs the provider is rostered on:
 * — Prefer meeting start→end (same as session wall time in materialized sessions).
 * — If span is missing/invalid, use 1.5× event skill_builder_direct_hours (hours→minutes).
 */
export async function computeSkillBuilderProgramCreditMinutesPerWeek(poolConn, { agencyId, providerId }) {
  const aid = Number(agencyId);
  const pid = Number(providerId);
  if (!aid || !pid) return { totalMinutes: 0, items: [] };

  let rows = [];
  try {
    const [r] = await poolConn.execute(
      `SELECT m.weekday,
              m.start_time,
              m.end_time,
              sg.name AS skills_group_name,
              ce.title AS event_title,
              ce.skill_builder_direct_hours,
              school.name AS school_name
       FROM skills_group_providers sgp
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
       INNER JOIN skills_group_meetings m ON m.skills_group_id = sg.id
       INNER JOIN company_events ce ON ce.id = sg.company_event_id
       LEFT JOIN agencies school ON school.id = sg.organization_id
       WHERE sgp.provider_user_id = ?
         AND (ce.is_active = TRUE OR ce.is_active IS NULL)`,
      [aid, pid]
    );
    rows = r || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { totalMinutes: 0, items: [] };
    throw e;
  }

  const items = [];
  let totalMinutes = 0;
  for (const r of rows) {
    const span = minutesBetweenMysqlTime(r.start_time, r.end_time);
    let mins = span;
    let source = 'meeting_span';
    if (mins <= 0) {
      const direct = Number(r.skill_builder_direct_hours);
      const fh = Number.isFinite(direct) && direct > 0 ? direct : 0;
      mins = Math.round(fh * 60 * 1.5);
      source = 'direct_hours_fallback';
    }
    if (mins <= 0) continue;
    totalMinutes += mins;
    items.push({
      weekday: r.weekday,
      startTime: String(r.start_time || '').slice(0, 8),
      endTime: String(r.end_time || '').slice(0, 8),
      minutes: mins,
      eventTitle: r.event_title || '',
      skillsGroupName: r.skills_group_name || '',
      schoolName: r.school_name || '',
      source
    });
  }

  return { totalMinutes, items };
}
