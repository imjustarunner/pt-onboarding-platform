/**
 * Create session documentation (Notes) tasks ~5 minutes before booked clinical sessions.
 */
import pool from '../config/database.js';
import Task from '../models/Task.model.js';

const WINDOW_START_MINUTES = 0;
const WINDOW_END_MINUTES = 5;

function toSqlDatetime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function resolveSessionNoteWorkTypeId() {
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM task_type_definitions
       WHERE slug = 'session_note' AND agency_id IS NULL
       LIMIT 1`
    );
    return rows?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function alreadyCreated(officeEventId) {
  const [rows] = await pool.execute(
    `SELECT task_id FROM session_note_task_sent WHERE office_event_id = ? LIMIT 1`,
    [officeEventId]
  );
  return rows?.[0] || null;
}

async function recordCreated(officeEventId, taskId) {
  await pool.execute(
    `INSERT INTO session_note_task_sent (office_event_id, task_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE task_id = VALUES(task_id), sent_at = CURRENT_TIMESTAMP`,
    [officeEventId, taskId]
  );
}

function durationMinutes(startAt, endAt) {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.round((e - s) / 60000);
}

/**
 * @returns {Promise<{ created: number, skipped: number, errors: number }>}
 */
export async function runSessionDocumentationTaskTick() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + WINDOW_START_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + WINDOW_END_MINUTES * 60 * 1000);
  const stats = { created: 0, skipped: 0, errors: 0 };

  let events = [];
  try {
    const [rows] = await pool.execute(
      `SELECT
         e.id AS office_event_id,
         e.start_at,
         e.end_at,
         e.service_code,
         e.client_id,
         e.booked_provider_id,
         e.assigned_provider_id,
         e.clinical_session_id,
         e.appointment_type_code,
         ol.agency_id,
         ol.name AS location_name,
         ol.street_address AS location_address,
         c.full_name AS client_name,
         c.initials AS client_initials,
         c.date_of_birth AS client_dob
       FROM office_events e
       INNER JOIN office_locations ol ON ol.id = e.office_location_id
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.status = 'BOOKED'
         AND e.client_id IS NOT NULL
         AND COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NOT NULL
         AND e.start_at >= ?
         AND e.start_at <= ?
       ORDER BY e.start_at ASC
       LIMIT 200`,
      [toSqlDatetime(windowStart), toSqlDatetime(windowEnd)]
    );
    events = rows || [];
  } catch (err) {
    console.warn('[sessionDocumentationTask] query failed', err?.message || err);
    return stats;
  }

  const workTypeId = await resolveSessionNoteWorkTypeId();

  for (const ev of events) {
    const officeEventId = Number(ev.office_event_id);
    const providerId = Number(ev.booked_provider_id || ev.assigned_provider_id || 0);
    if (!officeEventId || !providerId) {
      stats.skipped += 1;
      continue;
    }
    try {
      const existing = await alreadyCreated(officeEventId);
      if (existing) {
        stats.skipped += 1;
        continue;
      }

      const clientLabel =
        String(ev.client_name || '').trim()
        || String(ev.client_initials || '').trim()
        || `Client #${ev.client_id}`;
      const code = String(ev.service_code || '').trim().toUpperCase() || null;
      const mins = durationMinutes(ev.start_at, ev.end_at);
      const locationLabel = [ev.location_name, ev.location_address].filter(Boolean).join(' — ') || null;

      const metadata = {
        noteKind: 'progress',
        officeEventId,
        clinicalSessionId: ev.clinical_session_id ? Number(ev.clinical_session_id) : null,
        clientId: Number(ev.client_id),
        agencyId: ev.agency_id ? Number(ev.agency_id) : null,
        serviceCode: code,
        scheduledStart: ev.start_at,
        scheduledEnd: ev.end_at,
        durationMinutes: mins,
        locationLabel,
        participantsSummary: 'Client Only',
        clientName: clientLabel,
        clientDob: ev.client_dob || null
      };

      const title = code
        ? `Notes: ${clientLabel} (${code})`
        : `Notes: ${clientLabel}`;

      const task = await Task.create({
        taskType: 'session_note',
        title,
        description: `Session documentation due for ${clientLabel}. Open in Note Aid to generate and sign.`,
        assignedToUserId: providerId,
        assignedByUserId: providerId,
        assignedToAgencyId: metadata.agencyId,
        dueDate: ev.end_at || ev.start_at,
        referenceId: officeEventId,
        metadata,
        workTypeId,
        sourceRefType: 'office_event',
        sourceRefId: String(officeEventId),
        linkedScheduleEventId: officeEventId,
        urgency: 'high',
        categories: ['scheduling']
      });

      await recordCreated(officeEventId, task.id);
      stats.created += 1;
    } catch (err) {
      stats.errors += 1;
      console.warn('[sessionDocumentationTask] create failed', {
        officeEventId,
        message: err?.message || err
      });
    }
  }

  return stats;
}

/**
 * Soft-archive a session note task (hidden from open lists; retained for audit).
 */
export async function archiveSessionNoteTask(taskId, { userId = null } = {}) {
  const id = Number(taskId || 0);
  if (!id) return false;
  await pool.execute(
    `UPDATE tasks
     SET status = 'overridden',
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
         metadata = JSON_SET(
           COALESCE(metadata, JSON_OBJECT()),
           '$.archived', true,
           '$.archivedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
           '$.archivedByUserId', ?
         )
     WHERE id = ? AND task_type = 'session_note'`,
    [userId == null ? null : Number(userId), id]
  );
  return true;
}

/**
 * Complete linked session_note task(s) when a clinical note is signed for an office event / session.
 */
export async function completeSessionNoteTasksForSession({
  officeEventId = null,
  clinicalSessionId = null,
  clientId = null
} = {}) {
  const oe = Number(officeEventId || 0) || null;
  const cs = Number(clinicalSessionId || 0) || null;
  const cid = Number(clientId || 0) || null;
  if (!oe && !cs) return 0;

  const clauses = [`task_type = 'session_note'`, `status NOT IN ('completed', 'overridden')`];
  const params = [];
  if (oe) {
    clauses.push(
      `(reference_id = ? OR source_ref_id = ? OR linked_schedule_event_id = ? OR JSON_EXTRACT(metadata, '$.officeEventId') = ?)`
    );
    params.push(oe, String(oe), oe, oe);
  } else if (cs) {
    clauses.push(`JSON_EXTRACT(metadata, '$.clinicalSessionId') = ?`);
    params.push(cs);
    if (cid) {
      clauses.push(`JSON_EXTRACT(metadata, '$.clientId') = ?`);
      params.push(cid);
    }
  }

  const [result] = await pool.execute(
    `UPDATE tasks
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
     WHERE ${clauses.join(' AND ')}`,
    params
  );
  return Number(result?.affectedRows || 0);
}

export default {
  runSessionDocumentationTaskTick,
  archiveSessionNoteTask,
  completeSessionNoteTasksForSession
};
