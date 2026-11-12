import pool from '../config/database.js';

// Bootstrap applies the additive migration before this probe. Never serve a
// ready release with retention controls that cannot save their durable state.
export async function requireNoteworthyTrialSchema(db=pool) {
  for(const query of [
    'SELECT agency_id,trial_policy_version,trial_policy_accepted_at,trial_started_at,trial_ends_at,retention_days,continuation_requested_at,commercial_activated_at,commercial_evidence_enc,deletion_requested_at,deleted_at FROM noteworthy_practices LIMIT 0',
    'SELECT id,agency_id,owner_user_id,support_ticket_id,email_hash,request_hash,contact_enc FROM noteworthy_contact_threads LIMIT 0',
    'SELECT thread_id,request_id,request_hash FROM noteworthy_message_receipts LIMIT 0',
    'SELECT agency_id,status,requested_by_user_id,reason,object_manifest_enc,attempts,error_code,deleted_row_count,deleted_object_count,updated_at,completed_at FROM noteworthy_deletion_jobs LIMIT 0'
  ])await db.execute(query);
  return {ready:true,migration:'1811_noteworthy_trial_contact_and_deletion'};
}
