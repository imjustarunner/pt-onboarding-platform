#!/usr/bin/env node
/**
 * Inventory (and optionally deactivate) office standing assignments held by
 * non-provider staff roles (super_admin, admin, staff, support, etc.).
 *
 * Usage:
 *   node backend/src/scripts/inventoryStaffOfficeHolds.js
 *   node backend/src/scripts/inventoryStaffOfficeHolds.js --apply
 *
 * Default is dry-run (list only). --apply sets is_active=FALSE on matching
 * active rows and deactivates their booking plans. Does NOT delete rows.
 */
import pool from '../config/database.js';

const APPLY = process.argv.includes('--apply');

const STAFF_ROLES = [
  'super_admin',
  'superadmin',
  'admin',
  'staff',
  'support',
  'clinical_practice_assistant'
];

async function main() {
  const placeholders = STAFF_ROLES.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       osa.id,
       osa.provider_id,
       u.first_name,
       u.last_name,
       u.email,
       u.role,
       ol.name AS office_name,
       r.room_number,
       r.label AS room_label,
       osa.weekday,
       osa.hour,
       osa.assigned_frequency,
       osa.availability_mode,
       osa.is_active,
       osa.created_at,
       osa.created_by_user_id
     FROM office_standing_assignments osa
     JOIN users u ON u.id = osa.provider_id
     JOIN office_locations ol ON ol.id = osa.office_location_id
     JOIN office_rooms r ON r.id = osa.room_id
     WHERE LOWER(COALESCE(u.role, '')) IN (${placeholders})
       AND osa.is_active = TRUE
     ORDER BY u.role ASC, u.last_name ASC, ol.name ASC, osa.weekday ASC, osa.hour ASC`,
    STAFF_ROLES
  );

  console.log(`Found ${rows.length} active staff/admin office standing hold(s).`);
  for (const r of rows) {
    console.log(JSON.stringify({
      id: r.id,
      provider: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      email: r.email,
      role: r.role,
      office: r.office_name,
      room: r.room_label || r.room_number,
      weekday: r.weekday,
      hour: r.hour,
      frequency: r.assigned_frequency,
      mode: r.availability_mode,
      createdAt: r.created_at,
      createdByUserId: r.created_by_user_id
    }));
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to deactivate these holds.');
    await pool.end();
    return;
  }

  if (!rows.length) {
    console.log('Nothing to deactivate.');
    await pool.end();
    return;
  }

  const ids = rows.map((r) => Number(r.id)).filter((n) => n > 0);
  const ph = ids.map(() => '?').join(',');
  const [sa] = await pool.execute(
    `UPDATE office_standing_assignments
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${ph}) AND is_active = TRUE`,
    ids
  );
  const [bp] = await pool.execute(
    `UPDATE office_booking_plans
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE standing_assignment_id IN (${ph}) AND is_active = TRUE`,
    ids
  );
  console.log(`Deactivated standing rows: ${sa?.affectedRows || 0}; booking plans: ${bp?.affectedRows || 0}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
