import pool from '../config/database.js';

/** Recheck automatic enrollment reminders when a queued email is approved, too. */
export async function enrollmentReminderDeliveryGate({ templateType, intakeSubmissionId, existingCommunicationId, agencyId }) {
  if (!/^enrollment_unfinished_reminder_(24h|72h|7d)$/.test(String(templateType || ''))) return { allowed: true };
  let id = Number(intakeSubmissionId) || null;
  if (!id && existingCommunicationId) {
    const [[communication]] = await pool.execute(`SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId')) AS submission_id
      FROM user_communications WHERE id=? AND agency_id=?`, [existingCommunicationId, agencyId]);
    id = Number(communication?.submission_id) || null;
  }
  if (!id) return { allowed: false, reason: 'enrollment_reference_missing' };
  const [[row]] = await pool.execute(`SELECT s.status,s.submitted_at,s.session_token,s.reminder_consent_status,s.reminder_opt_out_at,s.draft_expires_at
    FROM intake_submissions s JOIN intake_links il ON il.id=s.intake_link_id
    WHERE s.id=? AND ((il.scope_type='agency' AND il.organization_id=?) OR EXISTS
      (SELECT 1 FROM agency_schools a WHERE a.agency_id=? AND a.school_organization_id=il.organization_id AND a.is_active=1))`, [id, agencyId, agencyId]);
  const allowed = !!row && ['started','consented'].includes(row.status) && !row.submitted_at
    && row.reminder_consent_status === 'agreed' && !row.reminder_opt_out_at && !!row.session_token
    && (!row.draft_expires_at || new Date(row.draft_expires_at).getTime() > Date.now());
  return { allowed, reason: allowed ? null : 'enrollment_reminder_no_longer_eligible' };
}
