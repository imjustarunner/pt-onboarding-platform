/** Read-only cutover audit. Outputs aggregate counts and schema availability, never client data. */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const mainChecks = {
  appointments_without_calendar: `SELECT COUNT(*) AS count FROM appointments WHERE office_event_id IS NULL AND provider_schedule_event_id IS NULL AND status IN ('scheduled','confirmed')`,
  booked_clients_without_appointment: `SELECT COUNT(*) AS count FROM office_events e LEFT JOIN appointments a ON a.office_event_id = e.id WHERE e.status = 'BOOKED' AND e.client_id IS NOT NULL AND a.id IS NULL`,
  booked_clients_without_clinical_context: `SELECT COUNT(*) AS count FROM office_events e JOIN clients c ON c.id = e.client_id WHERE e.status = 'BOOKED' AND c.client_type IN ('clinical','school') AND e.clinical_session_id IS NULL`,
  duplicate_package_debits: `SELECT COUNT(*) AS count FROM (SELECT entitlement_id, appointment_id FROM booking_package_ledger WHERE direction = 'CONSUME' AND appointment_id IS NOT NULL GROUP BY entitlement_id, appointment_id HAVING COUNT(*) > 1) d`,
  negative_package_balances: `SELECT COUNT(*) AS count FROM booking_package_entitlements WHERE sessions_remaining < 0 OR sessions_reserved < 0`,
  office_appointment_time_mismatch: `SELECT COUNT(*) AS count FROM appointments a JOIN office_events e ON e.id = a.office_event_id WHERE a.status IN ('scheduled','confirmed') AND (a.start_at <> e.start_at OR a.end_at <> e.end_at)`,
  calendar_appointment_time_mismatch: `SELECT COUNT(*) AS count FROM appointments a JOIN provider_schedule_events e ON e.id = a.provider_schedule_event_id WHERE a.status IN ('scheduled','confirmed') AND (a.start_at <> e.start_at OR a.end_at <> e.end_at)`,
  delegated_billing_memberships: `SELECT COUNT(*) AS count FROM user_agencies WHERE has_billing_access = 1`,
  recurring_context_schema: `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'office_booking_plans' AND column_name = 'session_context_json'`,
  imported_encounters_missing_session: `SELECT COUNT(*) AS count FROM billing_encounters WHERE client_id IS NOT NULL AND clinical_session_id IS NULL`
};
const clinicalChecks = {
  appointment_link_schema: `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clinical_sessions' AND column_name = 'appointment_id'`,
  signed_notes_not_billable: `SELECT COUNT(*) AS count FROM clinical_notes WHERE is_deleted = 0 AND provider_signed_at IS NOT NULL AND is_billable = 0`,
  claim_note_client_mismatch: `SELECT COUNT(*) AS count FROM clinical_claims c JOIN clinical_notes n ON n.id = c.clinical_note_id WHERE c.is_deleted = 0 AND (c.clinical_session_id <> n.clinical_session_id OR c.client_id <> n.client_id OR c.agency_id <> n.agency_id)`,
  ready_claims_without_signed_billable_note: `SELECT COUNT(*) AS count FROM clinical_claims c LEFT JOIN clinical_notes n ON n.id = c.clinical_note_id WHERE c.is_deleted = 0 AND c.claim_lifecycle = 'ready' AND (n.id IS NULL OR n.is_deleted = 1 OR n.provider_signed_at IS NULL OR n.is_billable = 0)`
};

for (const [plane, checks] of [['main', mainChecks], ['clinical', clinicalChecks]]) {
  const prefix = plane === 'clinical' ? 'CLINICAL_DB_' : 'DB_';
  let host = process.env[`${prefix}HOST`] || process.env.DB_HOST || 'localhost';
  const mainHost = process.env.DB_HOST || 'localhost';
  if (plane === 'clinical' && ['localhost', '127.0.0.1', '::1'].includes(host)
      && !['localhost', '127.0.0.1', '::1'].includes(mainHost)) host = mainHost;
  const config = {
    user: process.env[`${prefix}USER`] || process.env.DB_USER,
    password: process.env[`${prefix}PASSWORD`] || process.env.DB_PASSWORD,
    database: process.env[`${prefix}NAME`] || process.env.DB_NAME || (plane === 'main' ? 'onboarding_stage' : 'onboarding_stage_clinical'),
    connectTimeout: 5000
  };
  if (host.startsWith('/')) config.socketPath = host;
  else { config.host = host; config.port = Number(process.env[`${prefix}PORT`] || process.env.DB_PORT || 3307); }
  let connection;
  try {
    connection = await mysql.createConnection(config);
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    for (const [check, sql] of Object.entries(checks)) {
      try {
        const [rows] = await connection.execute(sql);
        console.log(JSON.stringify({ plane, check, count: Number(rows[0].count) }));
      } catch (error) {
        console.log(JSON.stringify({ plane, check, unavailable: true, code: error.code }));
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ plane, reachable: false, code: error.code }));
    process.exitCode = 1;
  } finally { if (connection) await connection.end(); }
}
