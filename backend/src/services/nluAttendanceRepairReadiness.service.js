import pool from '../config/database.js';

export async function requireNluAttendanceRepairSchema(db = pool) {
  // Check metadata only. Never promote a candidate whose new history or
  // immutable family-publication storage did not migrate successfully.
  try {
    await db.execute('SELECT id,review_id,signed_payload FROM appointment_change_workflow_history LIMIT 0');
    await db.execute('SELECT id,note_id,appointment_id,payload_hash,snapshot_json FROM tutoring_note_publications LIMIT 0');
    const [indexes] = await db.execute('SHOW INDEX FROM appointment_no_show_reviews');
    if (indexes.some(row => row.Key_name === 'uq_no_show_appointment') ||
        !indexes.some(row => row.Key_name === 'idx_no_show_appointment_version')) {
      throw new Error('Attendance declaration version index is missing.');
    }
  } catch (error) {
    throw Object.assign(new Error('NLU attendance history storage is unavailable. Apply migrations 1847 and 1848 before releasing this version.'), {
      code: error.code || 'NLU_ATTENDANCE_SCHEMA_REQUIRED',
      requiredMigrations: ['1847', '1848'], component: 'nlu_attendance_history'
    });
  }
}
