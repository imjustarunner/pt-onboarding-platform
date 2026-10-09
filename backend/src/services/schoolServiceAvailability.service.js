import { schoolAvailabilitySummary, SCHOOL_WEEKDAYS } from '../utils/schoolServiceAvailability.js';

// Retain exact answers in the encrypted onboarding submission. Publish a staff-readable
// summary in the existing profile fields, inside that same transaction.
export async function persistSchoolServiceAvailability(db, userId, agencyId, value) {
  const fields = [
    ['school_days_preference', 'School days preference', 'multi_select', JSON.stringify(value.blocks.map(b => b.dayOfWeek)), JSON.stringify(SCHOOL_WEEKDAYS)],
    ['school_service_hours', 'In-school service availability', 'textarea', schoolAvailabilitySummary(value), null]
  ];
  for (const [key, label, type, answer, options] of fields) {
    const [[existing]] = await db.execute(`SELECT id FROM user_info_field_definitions WHERE field_key=?
      AND parent_field_id IS NULL AND (agency_id=? OR agency_id IS NULL) ORDER BY agency_id DESC,id DESC LIMIT 1`, [key, agencyId]);
    let id = existing?.id;
    if (!id) {
      const [result] = await db.execute(`INSERT INTO user_info_field_definitions (agency_id,field_key,field_label,field_type,is_required,options)
        VALUES (?,?,?,?,0,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [agencyId, key, label, type, options]);
      id = result.insertId;
    }
    await db.execute(`INSERT INTO user_info_values (user_id,field_definition_id,value) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE value=VALUES(value)`, [userId, id, answer]);
  }
}
