import pool from '../config/database.js';

// Read-only check: a Google Group contact is not evidence that an archived
// identity should be restored. Review these accounts with the school first.
try {
  const [summary] = await pool.execute(`
    SELECT COUNT(*) total_users,
      SUM(role = 'school_staff') school_staff_users,
      SUM(status = 'ACTIVE_EMPLOYEE' AND
        (is_active = 0 OR COALESCE(is_archived, 0) = 1)) conflicting_active_accounts
    FROM users`);
  const [accounts] = await pool.execute(`
    SELECT u.id, u.email, u.status, u.is_active, u.is_archived, u.archived_at,
      a.id school_id, a.name school_name, ua.created_at membership_created_at
    FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND COALESCE(ua.is_active, 1) = 1
    JOIN agencies a ON a.id = ua.agency_id
    WHERE u.role = 'school_staff' AND a.organization_type = 'school'
      AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0
      AND (u.is_active = 0 OR u.is_archived = 1
        OR u.status IN ('ARCHIVED', 'INACTIVE_EMPLOYEE'))
    ORDER BY a.name, u.id`);
  console.log(JSON.stringify({ ...summary[0], blocked_school_memberships: accounts }, null, 2));
} catch (error) {
  console.error('School staff access audit failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
