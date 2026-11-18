import pool from '../config/database.js';

export const NARRIVA_ROLLOUT_MIGRATIONS = Object.freeze([
  '1846_narriva_plan_provider_signoffs',
  '1847_narriva_platform_generator_settings',
  '1848_itsco_provider_account_conversions'
]);
const SCHEMA_PROBES = Object.freeze([
  'SELECT id,agency_id,client_id,treatment_plan_id,provider_user_id,content_hash,statement,signed_at FROM clinical_treatment_plan_provider_signoffs LIMIT 0',
  'SELECT id,version,configuration_json,updated_by_user_id,updated_at FROM narriva_generator_settings LIMIT 0',
  'SELECT version,configuration_json,change_reason,actor_user_id,created_at FROM narriva_generator_settings_versions LIMIT 0',
  'SELECT id,tool_id,settings_version,feedback_text,created_by_user_id,created_at FROM narriva_generator_feedback LIMIT 0',
  'SELECT id,agency_id,provider_user_id,target_email,original_workspace_user_id,original_workspace_email,recovery_email,group_id,state,revision,password_prepared_at,activated_at,requested_by_user_id,last_error_code,created_at,updated_at FROM provider_account_conversions LIMIT 0',
  'SELECT id,conversion_id,agency_id,provider_user_id,initiated_by_user_id,event_type,automation_principal,delegation_subject,evidence_json,created_at FROM provider_account_conversion_events LIMIT 0'
]);

// Startup migrations historically tolerate some failures. This rollout must
// never advertise readiness without its durable settings and signature storage.
// LIMIT 0 validates real columns without selecting any clinical/user content.
export async function requireNarrivaRolloutSchema(db = pool) {
  try {
    const [migrations] = await db.execute(
      'SELECT migration_name FROM migrations_log WHERE success=1 AND migration_name IN (?,?,?)',
      NARRIVA_ROLLOUT_MIGRATIONS
    );
    const applied = new Set((migrations || []).map(row => row.migration_name));
    if (!NARRIVA_ROLLOUT_MIGRATIONS.every(name => applied.has(name))) throw new Error('migration');
    for (const query of SCHEMA_PROBES) await db.execute(query);
    const [rows] = await db.execute('SELECT id,version FROM narriva_generator_settings WHERE id=1 LIMIT 1');
    const version = Number(rows?.[0]?.version);
    if (Number(rows?.[0]?.id) !== 1 || !Number.isSafeInteger(version) || version < 1) throw new Error('singleton');
    return { ready: true, tables: SCHEMA_PROBES.length, migrations: NARRIVA_ROLLOUT_MIGRATIONS.length, settingsVersion: version };
  } catch {
    throw Object.assign(new Error('Required Narriva rollout storage is not ready. Verify migrations 1846, 1847 and 1848 before serving this revision.'), { code: 'NARRIVA_SCHEMA_NOT_READY', status: 503 });
  }
}
