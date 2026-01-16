/**
 * Provider slot adjustments (transactional)
 * Callers should be inside a transaction on the same connection.
 */

export async function adjustProviderSlots(connection, { providerUserId, schoolId, dayOfWeek, delta }) {
  const [rows] = await connection.execute(
    `SELECT id, slots_available
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
     LIMIT 1
     FOR UPDATE`,
    [providerUserId, schoolId, dayOfWeek]
  );

  if (!rows[0]?.id) return { ok: false, reason: 'Provider is not scheduled for that school/day' };

  const next = (rows[0].slots_available ?? 0) + delta;
  if (next < 0) return { ok: false, reason: 'No provider slots available for that school/day' };

  await connection.execute(`UPDATE provider_school_assignments SET slots_available = ? WHERE id = ?`, [next, rows[0].id]);
  return { ok: true };
}

