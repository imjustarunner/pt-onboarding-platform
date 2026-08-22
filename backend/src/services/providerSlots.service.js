import pool from '../config/database.js';

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Waitlisted clients hold a provider/day preference but do not consume caseload slots. */
export function clientStatusConsumesProviderSlot(statusKey) {
  return String(statusKey || '').toLowerCase() !== 'waitlist';
}

/** SQL fragment: only count CPA rows whose client is not waitlisted. */
export const CPA_SLOT_CONSUMING_FILTER = `
  AND NOT EXISTS (
    SELECT 1 FROM clients c_slot
    LEFT JOIN client_statuses cs_slot ON cs_slot.id = c_slot.client_status_id
    WHERE c_slot.id = cpa.client_id
      AND LOWER(COALESCE(cs_slot.status_key, '')) = 'waitlist'
  )
`;

export async function adjustProviderSlotsPool(params) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await adjustProviderSlots(connection, params);
    if (!result.ok) {
      await connection.rollback();
      return result;
    }
    await connection.commit();
    return result;
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    throw e;
  } finally {
    connection.release();
  }
}

/** When a client enters waitlist, release any slots their weekday assignments were holding. */
export async function refundSlotsForClientEnteringWaitlist(clientId, { organizationId = null } = {}) {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const params = [cid];
  let orgFilter = '';
  if (organizationId) {
    orgFilter = ' AND cpa.organization_id = ?';
    params.push(Number(organizationId));
  }
  const [rows] = await pool.execute(
    `SELECT cpa.organization_id, cpa.provider_user_id, cpa.service_day
     FROM client_provider_assignments cpa
     WHERE cpa.client_id = ? AND cpa.is_active = TRUE AND cpa.service_day IS NOT NULL
     ${orgFilter}`,
    params
  );
  for (const r of rows || []) {
    const day = String(r.service_day || '').trim();
    if (!allowedDays.includes(day)) continue;
    await adjustProviderSlotsPool({
      providerUserId: r.provider_user_id,
      schoolId: r.organization_id,
      dayOfWeek: day,
      delta: +1
    }).catch(() => {});
  }
}

/** When a client leaves waitlist, take slots for active weekday assignments (may go over capacity). */
export async function takeSlotsForClientLeavingWaitlist(clientId, { organizationId = null, allowNegative = true } = {}) {
  const cid = Number(clientId || 0);
  if (!cid) return { ok: true };
  const params = [cid];
  let orgFilter = '';
  if (organizationId) {
    orgFilter = ' AND cpa.organization_id = ?';
    params.push(Number(organizationId));
  }
  const [rows] = await pool.execute(
    `SELECT cpa.organization_id, cpa.provider_user_id, cpa.service_day
     FROM client_provider_assignments cpa
     WHERE cpa.client_id = ? AND cpa.is_active = TRUE AND cpa.service_day IS NOT NULL
     ${orgFilter}`,
    params
  );
  for (const r of rows || []) {
    const day = String(r.service_day || '').trim();
    if (!allowedDays.includes(day)) continue;
    const take = await adjustProviderSlotsPool({
      providerUserId: r.provider_user_id,
      schoolId: r.organization_id,
      dayOfWeek: day,
      delta: -1,
      allowNegative
    });
    if (!take.ok) return take;
  }
  return { ok: true };
}

/**
 * Zero slots_available for all provider_school_assignments when provider goes on leave.
 * Uses pool directly (no transaction required).
 */
export async function zeroSlotsForProviderOnLeave(providerUserId) {
  const uid = parseInt(providerUserId, 10);
  if (!Number.isInteger(uid) || uid <= 0) return;
  await pool.execute(
    `UPDATE provider_school_assignments SET slots_available = 0 WHERE provider_user_id = ?`,
    [uid]
  );
}

/**
 * Reconcile slots_available for all provider_school_assignments when provider returns from leave.
 * Sets slots_available = slots_total - used (from actual client assignments).
 */
export async function reconcileSlotsForProviderReturningFromLeave(providerUserId) {
  const uid = parseInt(providerUserId, 10);
  if (!Number.isInteger(uid) || uid <= 0) return;

  const [rows] = await pool.execute(
    `SELECT id, school_organization_id, day_of_week, slots_total
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND is_active = TRUE`,
    [uid]
  );

  for (const r of rows || []) {
    const orgId = Number(r.school_organization_id);
    const day = String(r.day_of_week || '').trim();
    const total = Number(r.slots_total ?? 0);
    if (!orgId || !allowedDays.includes(day) || !Number.isFinite(total) || total < 0) continue;

    let used = 0;
    try {
      const [cpaRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM client_provider_assignments cpa
         WHERE cpa.organization_id = ? AND cpa.provider_user_id = ? AND cpa.is_active = TRUE AND cpa.service_day = ?
         ${CPA_SLOT_CONSUMING_FILTER}`,
        [orgId, uid, day]
      );
      used += Number(cpaRows?.[0]?.cnt || 0);

      const [legacyRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM clients c
         LEFT JOIN client_provider_assignments cpa
           ON cpa.organization_id = c.organization_id AND cpa.client_id = c.id
           AND cpa.provider_user_id = c.provider_id AND cpa.service_day = c.service_day AND cpa.is_active = TRUE
         WHERE c.organization_id = ? AND c.provider_id = ? AND c.service_day = ?
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED' AND cpa.client_id IS NULL`,
        [orgId, uid, day]
      );
      used += Number(legacyRows?.[0]?.cnt || 0);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
      const [legacyRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM clients c
         WHERE c.organization_id = ? AND c.provider_id = ? AND c.service_day = ?
           AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'`,
        [orgId, uid, day]
      );
      used = Number(legacyRows?.[0]?.cnt || 0);
    }

    const avail = Math.max(0, total - used);
    await pool.execute(`UPDATE provider_school_assignments SET slots_available = ? WHERE id = ?`, [avail, r.id]);
  }
}

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
               AND cpa.service_day = ?
             ${CPA_SLOT_CONSUMING_FILTER}`,
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

