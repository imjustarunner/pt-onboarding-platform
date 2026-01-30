/**
 * Provider slot adjustments (transactional)
 * Callers should be inside a transaction on the same connection.
 */

export async function adjustProviderSlots(connection, { providerUserId, schoolId, dayOfWeek, delta, allowNegative = false }) {
  const [rows] = await connection.execute(
    `SELECT id, slots_total, slots_available
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ? AND is_active = TRUE
     LIMIT 1
     FOR UPDATE`,
    [providerUserId, schoolId, dayOfWeek]
  );

  if (!rows[0]?.id) return { ok: false, reason: 'Provider is not scheduled for that school/day' };

  // Best-effort: reconcile drift between stored slots_available and actual assigned count.
  // This prevents mismatches where UI shows "correct" assigned/available but enforcement uses stale storage.
  let baseAvailable = rows[0].slots_available ?? 0;
  try {
    const total = Number(rows[0].slots_total ?? 0);
    const totalOk = Number.isFinite(total) && total >= 0;
    if (totalOk) {
      const orgId = parseInt(schoolId, 10);
      const pid = parseInt(providerUserId, 10);
      const day = String(dayOfWeek || '').trim();
      if (orgId && pid && day) {
        let used = 0;
        // Prefer client_provider_assignments if present; also include legacy clients.provider_id assignments
        // that do not have a matching active client_provider_assignments row.
        try {
          const [cpaRows] = await connection.execute(
            `SELECT COUNT(*) AS cnt
             FROM client_provider_assignments cpa
             WHERE cpa.organization_id = ?
               AND cpa.provider_user_id = ?
               AND cpa.is_active = TRUE
               AND cpa.service_day = ?`,
            [orgId, pid, day]
          );
          used += Number(cpaRows?.[0]?.cnt || 0);

          const [legacyRows] = await connection.execute(
            `SELECT COUNT(*) AS cnt
             FROM clients c
             LEFT JOIN client_provider_assignments cpa
               ON cpa.organization_id = c.organization_id
              AND cpa.client_id = c.id
              AND cpa.provider_user_id = c.provider_id
              AND cpa.service_day = c.service_day
              AND cpa.is_active = TRUE
             WHERE c.organization_id = ?
               AND c.provider_id = ?
               AND c.service_day = ?
               AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
               AND cpa.client_id IS NULL`,
            [orgId, pid, day]
          );
          used += Number(legacyRows?.[0]?.cnt || 0);
        } catch (e) {
          const msg = String(e?.message || '');
          const missing =
            msg.includes("doesn't exist") ||
            msg.includes('ER_NO_SUCH_TABLE') ||
            msg.includes('Unknown column') ||
            msg.includes('ER_BAD_FIELD_ERROR');
          if (!missing) throw e;

          // Legacy-only fallback
          const [legacyRows] = await connection.execute(
            `SELECT COUNT(*) AS cnt
             FROM clients c
             WHERE c.organization_id = ?
               AND c.provider_id = ?
               AND c.service_day = ?
               AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'`,
            [orgId, pid, day]
          );
          used = Number(legacyRows?.[0]?.cnt || 0);
        }

        // IMPORTANT: allow negative availability to represent overbooked states.
        // This preserves correct "used" math when admins later change slots_total.
        const reconciledRaw = total - used;
        if (Number.isFinite(reconciledRaw) && reconciledRaw !== baseAvailable) {
          baseAvailable = reconciledRaw;
          await connection.execute(`UPDATE provider_school_assignments SET slots_available = ? WHERE id = ?`, [baseAvailable, rows[0].id]);
        }
      }
    }
  } catch {
    // best-effort only (never block an adjustment because of reconciliation)
  }

  const next = Number(baseAvailable ?? 0) + delta;
  if (next < 0 && !allowNegative) return { ok: false, reason: 'No provider slots available for that school/day' };

  await connection.execute(`UPDATE provider_school_assignments SET slots_available = ? WHERE id = ?`, [next, rows[0].id]);
  return { ok: true, nextSlotsAvailable: next };
}

