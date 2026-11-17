import pool from '../config/database.js';

// Migration 1674 uses a composite primary key; this table has no synthetic id.
export async function hasPortalMigrationEnrollment({agencyId,clientId,guardianUserId},db=pool) {
  const [[row]]=await db.execute('SELECT client_id FROM family_portal_migration_enrollments WHERE agency_id=? AND client_id=? AND guardian_user_id=? LIMIT 1',[agencyId,clientId,guardianUserId]);
  return !!row;
}
