import pool from '../config/database.js';

const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value || '{}'); } catch { return {}; } };
const list = value => Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 14) : value ? [String(value).slice(0, 250)] : [];
const WAITING_PROVIDER_SQL = `CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.intake_preferences_json, '$.waitlist.providerId')), 'null'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.intake_preferences_json, '$.providerSelection.providerId')), 'null'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.intake_preferences_json, '$.preferredProviderUserId')), 'null'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.adaptive_intake_meta_json, '$.preferredProviderUserId')), 'null'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.intake_preferences_json, '$.preferred_office_provider_ids[0]')), 'null')) AS UNSIGNED)`;

/** Scheduling/contact details only. This does not grant access to a client chart. */
export async function loadEnrollmentWaitlist({ agencyId, providerId = null, clientId = null }, database = pool) {
  const aid = Number(agencyId);
  if (!Number.isSafeInteger(aid) || aid < 1) throw Object.assign(new Error('A valid agency is required.'), { status: 400 });
  const parameters = [aid];
  let filter = '';
  for (const [value, field] of [[providerId, 'u.id'], [clientId, 'c.id']]) {
    if (value != null) {
      if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw Object.assign(new Error('A valid provider or client is required.'), { status: 400 });
      filter += ` AND ${field} = ?`;
      parameters.push(Number(value));
    }
  }
  const [rows] = await database.execute(`SELECT c.id, c.agency_id, c.full_name, c.initials, c.email, c.contact_phone,
      c.intake_preferences_json, c.adaptive_intake_meta_json, c.created_at,
      u.id AS provider_id, CONCAT_WS(' ', u.first_name, u.last_name) AS provider_name, u.email AS provider_email,
      a.name AS agency_name, a.slug AS agency_slug,
      guardian.email AS guardian_email, CONCAT_WS(' ', guardian.first_name, guardian.last_name) AS guardian_name,
      guardian.phone_number AS guardian_phone, EXISTS(SELECT 1 FROM client_guardians linked WHERE linked.client_id = c.id) AS has_guardian_links
    FROM clients c
    JOIN users u ON u.id = ${WAITING_PROVIDER_SQL}
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = c.agency_id AND COALESCE(ua.is_active, 1) = 1
    JOIN agencies a ON a.id = c.agency_id
    LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
    LEFT JOIN intake_submissions enrollment ON enrollment.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(c.intake_preferences_json, '$.providerSelection.submissionId')) AS UNSIGNED)
    LEFT JOIN client_guardians cg ON cg.id = (SELECT g.id FROM client_guardians g
      JOIN users gu ON gu.id = g.guardian_user_id AND COALESCE(gu.is_active, 1) = 1 AND COALESCE(gu.is_archived, 0) = 0
      WHERE g.client_id = c.id AND g.access_enabled = 1
        AND COALESCE(JSON_EXTRACT(g.permissions_json, '$.noView'), FALSE) <> TRUE
        AND COALESCE(JSON_EXTRACT(g.permissions_json, '$.noViewOtherGuardian'), FALSE) <> TRUE
      ORDER BY (g.guardian_user_id = enrollment.guardian_user_id) DESC,
        CASE WHEN g.relationship_type = 'self' THEN 0 ELSE 1 END, g.created_at, g.id LIMIT 1)
    LEFT JOIN users guardian ON guardian.id = cg.guardian_user_id
    WHERE c.agency_id = ? AND JSON_EXTRACT(c.intake_preferences_json, '$.waitlist.active') = TRUE
      AND c.terminated_at IS NULL AND COALESCE(c.provider_id, 0) = 0
      AND UPPER(COALESCE(c.status, '')) NOT IN ('ARCHIVED', 'TERMINATED', 'CLOSED', 'DISCHARGED', 'INACTIVE')
      AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('archived', 'terminated', 'closed', 'discharged', 'inactive', 'deceased')
      AND NOT EXISTS (SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id = c.id AND cpa.is_active = TRUE)
      AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0 AND COALESCE(u.is_demo, 0) = 0
      AND UPPER(COALESCE(u.status, 'ACTIVE_EMPLOYEE')) IN ('ACTIVE_EMPLOYEE', 'ACTIVE')
      ${filter}
    ORDER BY c.created_at, c.id`, parameters);
  return (rows || []).map(row => {
    const prefs = parse(row.intake_preferences_json), meta = parse(row.adaptive_intake_meta_json);
    const selection = prefs.providerSelection || {};
    const rawOpening = prefs.requestedOpening || prefs.requested_opening_preference || meta.requestedOpening;
    const opening = rawOpening && Number(rawOpening.providerId) === Number(row.provider_id) ? {
      startAt: rawOpening.startAt, endAt: rawOpening.endAt, frequency: rawOpening.frequency || 'WEEKLY',
      timeZone: rawOpening.timeZone || 'America/Denver', modality: rawOpening.modality
    } : null;
    const respondent = row.has_guardian_links ? {} : (meta.respondent || {});
    const contact = { name: row.guardian_name || respondent.firstName || row.full_name || '',
      email: row.guardian_email || (!row.has_guardian_links ? row.email || respondent.email : null) || null,
      phone: row.guardian_phone || (!row.has_guardian_links ? row.contact_phone || respondent.phone : null) || null };
    const joinedAt = prefs.waitlist?.addedAt || selection.requestedAt || row.created_at;
    return { id: Number(row.id), clientId: Number(row.id), clientName: row.full_name || row.initials || 'Prospective client',
      providerId: Number(row.provider_id), providerName: row.provider_name, providerEmail: row.provider_email,
      agencyId: Number(row.agency_id), agencyName: row.agency_name, agencySlug: row.agency_slug,
      submissionId: Number(selection.submissionId) || null, status: 'WAITLIST', joinedAt, requestedAt: joinedAt,
      modality: selection.modality || prefs.preferredModality || meta.preferredModality || 'ALL',
      requestedOpening: opening, preferredDays: list(prefs.preferredDays || prefs.preferred_days || meta.preferredDays),
      preferredTimes: list(prefs.preferredTimes || prefs.preferredTimeOfDay || prefs.preferred_times || meta.preferredTimeOfDay),
      schedulingNotes: String(prefs.preferredSchedulingNotes || '').slice(0, 1000), timeZone: prefs.preferredTimeZone || 'America/Denver',
      contact, contactEmail: contact.email };
  });
}

export function waitlistWeekKey(now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

/** A confirmed care assignment resolves the request even if later unassigned. */
export async function resolveAssignedEnrollmentWaitlist(database, clientId) {
  await database.execute(`UPDATE clients c SET intake_preferences_json = JSON_SET(c.intake_preferences_json,
      '$.waitlist.active', CAST('false' AS JSON), '$.waitlist.resolvedAt', UTC_TIMESTAMP(), '$.waitlist.resolution', 'provider_assigned',
      '$.providerSelection.resolvedAt', UTC_TIMESTAMP())
    WHERE c.id = ? AND JSON_EXTRACT(c.intake_preferences_json, '$.waitlist.active') = TRUE
      AND ${WAITING_PROVIDER_SQL} > 0
      AND (COALESCE(c.provider_id, 0) > 0 OR EXISTS (
        SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id = c.id AND cpa.is_active = TRUE))`, [clientId]);
}

/** One inbox reminder per provider + agency + week for the provider and support. */
export async function runProviderWaitlistStaffReminders({ database = pool, now = new Date() } = {}) {
  const [agencies] = await database.execute(`SELECT DISTINCT agency_id FROM clients
    WHERE JSON_EXTRACT(intake_preferences_json, '$.waitlist.active') = TRUE AND status <> 'ARCHIVED' AND terminated_at IS NULL`);
  let reminders = 0;
  for (const agency of agencies || []) {
    const rows = await loadEnrollmentWaitlist({ agencyId: Number(agency.agency_id) }, database);
    const providerIds = [...new Set(rows.map(row => row.providerId))];
    for (const providerId of providerIds) {
      const connection = await database.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [providerId]);
        const pending = await loadEnrollmentWaitlist({ agencyId: Number(agency.agency_id), providerId }, connection);
        if (!pending.length) { await connection.commit(); continue; }
        const actorSource = `provider_waitlist_week:${waitlistWeekKey(now)}`;
        const [existing] = await connection.execute(`SELECT id FROM notifications WHERE type = 'provider_waitlist_reminder'
          AND agency_id = ? AND related_entity_type = 'user' AND related_entity_id = ? AND actor_source = ? LIMIT 1`,
          [Number(agency.agency_id), providerId, actorSource]);
        if (existing.length) { await connection.commit(); continue; }
        const count = pending.length;
        const message = `${count} ${count === 1 ? 'person is' : 'people are'} waiting for ${pending[0].providerName}. Review preferred days, times, and format in the provider waitlist, and coordinate next steps with support.`;
        for (const userId of [providerId, null]) {
          await connection.execute(`INSERT INTO notifications
            (type, severity, title, message, audience_json, user_id, agency_id, related_entity_type, related_entity_id, actor_source)
            VALUES ('provider_waitlist_reminder', 'info', ?, ?, ?, ?, ?, 'user', ?, ?)`,
            [userId ? 'Your provider waitlist needs a check-in' : 'Provider waitlist check-in', message,
              userId ? null : JSON.stringify({ admin: true, provider: false, supervisor: true, clinicalPracticeAssistant: false, schoolStaff: false, guardian: false }),
              userId, Number(agency.agency_id), providerId, actorSource]);
        }
        await connection.commit();
        reminders += 2;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
  }
  return { reminders };
}
