import pool from '../config/database.js';

const allowedDays = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

/**
 * Keep School Portal day/provider tables in sync with provider_school_assignments.
 *
 * Why:
 * - School Portal weekday clickability is driven by `school_day_provider_assignments` rows.
 * - Provider work-hour configuration is stored in `provider_school_assignments`.
 *
 * This function is intentionally safe to call repeatedly (idempotent via UNIQUE keys).
 */
export async function syncSchoolPortalDayProvider({
  executor,
  schoolId,
  providerUserId,
  weekday,
  isActive,
  actorUserId
}) {
  const exec = executor?.execute ? executor : pool;

  const sid = parseInt(schoolId, 10);
  const pid = parseInt(providerUserId, 10);
  const day = String(weekday || '').trim();
  const active = isActive === undefined ? true : !!isActive;
  const actor = parseInt(actorUserId, 10);

  if (!sid || !pid || !allowedDays.has(day) || !actor) return;

  try {
    // Ensure the day exists in school_day_schedules (best-effort).
    // We only ever activate days here; we don't deactivate schedules since a school
    // may want the day present even when no providers are currently active.
    await exec.execute(
      `INSERT INTO school_day_schedules (school_organization_id, weekday, is_active, created_by_user_id)
       VALUES (?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [sid, day, actor]
    );
  } catch {
    // Backward-compatible: if table isn't available yet, do nothing.
  }

  try {
    await exec.execute(
      `INSERT INTO school_day_provider_assignments
        (school_organization_id, weekday, provider_user_id, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
      [sid, day, pid, active ? 1 : 0, actor]
    );
  } catch {
    // Backward-compatible: if table isn't available yet, do nothing.
  }
}

