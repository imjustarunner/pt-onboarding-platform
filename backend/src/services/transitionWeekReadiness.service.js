import pool from '../config/database.js';
import { isChatEncryptionConfigured } from './chatEncryption.service.js';

export const TRANSITION_REQUIRED_COLUMNS = {
  practice_transition_weeks: ['agency_id','week_start','revision','payload_json','updated_by_user_id','updated_at'],
  practice_transition_week_events: ['id','agency_id','week_start','revision','actor_user_id','payload_json','created_at'],
  sms_phone_enrollments: ['id','agency_id','scope_key','phone_hash','phone_last_four','number_id','status','command_at','payload_json','linked_user_id','linked_client_id','reviewed_by_user_id','reviewed_at'],
  sms_phone_enrollment_events: ['id','enrollment_id','event_key','keyword','command_at','payload_json','created_at']
};

export async function requireTransitionWeekReadiness(db = pool) {
  if (!isChatEncryptionConfigured()) throw new Error('Transition rollout requires the existing chat encryption configuration before release.');
  const tables = Object.keys(TRANSITION_REQUIRED_COLUMNS);
  const [columns] = await db.execute(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`, tables);
  const actual = new Set(columns.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
  const missing = Object.entries(TRANSITION_REQUIRED_COLUMNS).flatMap(([table, fields]) => fields.filter(field => !actual.has(`${table}.${field}`)).map(field => `${table}.${field}`));
  if (missing.length) throw new Error(`Transition migration 1830 is incomplete: ${missing.join(', ')}`);
  const [[migration]] = await db.execute('SELECT success FROM migrations_log WHERE migration_name=? LIMIT 1', ['1830_practice_transition_week']);
  if (Number(migration?.success) !== 1) throw new Error('Transition migration 1830 must be recorded successful before release.');
  return { ready: true, tables: tables.length, migration: '1830_practice_transition_week' };
}
