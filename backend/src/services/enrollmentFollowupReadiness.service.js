import pool from '../config/database.js';

export async function requireEnrollmentFollowupReadiness(db = pool) {
  try {
    await db.execute('SELECT termination_effective_date,termination_last_provider_id,termination_last_provider_name,enrollment_followup_id,enrollment_reopened_at,enrollment_reopened_source FROM clients LIMIT 0');
    await db.execute('SELECT id,client_id,agency_id,request_key,payload_hash,payload_json,disposition,state,recipient_email,reply_to_email,communication_id,internet_message_id,reply_message_id FROM client_enrollment_followups LIMIT 0');
  } catch {
    throw Object.assign(new Error('Enrollment follow-up storage is unavailable. Apply migration 1867 before starting this release.'), { code: 'ENROLLMENT_FOLLOWUP_SCHEMA_REQUIRED' });
  }
  return { migration: 1867 };
}
