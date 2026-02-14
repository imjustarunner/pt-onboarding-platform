/**
 * Shift program payroll integration.
 * Aggregates program_time_punches, on-call pay, and bonuses for payroll period.
 */
import pool from '../config/database.js';

/**
 * Aggregate time punch hours by user for an agency and date range.
 * Only includes clock_out punches (which have direct_hours/indirect_hours).
 * Programs must belong to the agency and have shift_scheduling_enabled.
 */
export async function aggregateShiftTimePunchesByUser({ agencyId, periodStart, periodEnd }) {
  const ps = String(periodStart || '').slice(0, 10);
  const pe = String(periodEnd || '').slice(0, 10);
  if (!agencyId || !ps || !pe) return new Map();

  try {
    const [rows] = await pool.execute(
      `SELECT ptp.user_id,
              COALESCE(SUM(ptp.direct_hours), 0) AS direct_hours,
              COALESCE(SUM(ptp.indirect_hours), 0) AS indirect_hours
       FROM program_time_punches ptp
       JOIN programs p ON ptp.program_id = p.id
       LEFT JOIN program_settings ps ON ps.program_id = p.id
       WHERE p.agency_id = ?
         AND ptp.user_id IS NOT NULL
         AND ptp.punch_type = 'clock_out'
         AND ptp.punched_at >= ?
         AND ptp.punched_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND COALESCE(ps.shift_scheduling_enabled, 1) = 1
       GROUP BY ptp.user_id`,
      [agencyId, ps, pe]
    );

    const byUser = new Map();
    for (const r of rows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const direct = Number(r?.direct_hours || 0) || 0;
      const indirect = Number(r?.indirect_hours || 0) || 0;
      byUser.set(uid, {
        directHours: Math.round(direct * 100) / 100,
        indirectHours: Math.round(indirect * 100) / 100,
        totalHours: Math.round((direct + indirect) * 100) / 100
      });
    }
    return byUser;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw e;
  }
}

/**
 * On-call pay: for each on-call signup in the period, add on_call_pay_amount.
 */
export async function aggregateOnCallPayByUser({ agencyId, periodStart, periodEnd }) {
  const ps = String(periodStart || '').slice(0, 10);
  const pe = String(periodEnd || '').slice(0, 10);
  if (!agencyId || !ps || !pe) return new Map();

  try {
    const [rows] = await pool.execute(
      `SELECT ss.user_id,
              COALESCE(ps.on_call_pay_amount, 0) AS on_call_pay_amount,
              COUNT(*) AS signup_count
       FROM program_shift_signups ss
       JOIN program_sites psite ON ss.program_site_id = psite.id
       JOIN programs p ON psite.program_id = p.id
       LEFT JOIN program_settings ps ON ps.program_id = p.id
       WHERE p.agency_id = ?
         AND ss.signup_type = 'on_call'
         AND ss.status = 'confirmed'
         AND ss.slot_date >= ?
         AND ss.slot_date <= ?
         AND COALESCE(ps.shift_scheduling_enabled, 1) = 1
       GROUP BY ss.user_id, p.id`,
      [agencyId, ps, pe]
    );

    const byUser = new Map();
    for (const r of rows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const amount = Number(r?.on_call_pay_amount || 0) || 0;
      const count = Number(r?.signup_count || 0) || 0;
      const total = amount * count;
      if (total < 1e-9) continue;
      const existing = byUser.get(uid) || 0;
      byUser.set(uid, existing + total);
    }
    return byUser;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw e;
  }
}

/**
 * Perfect attendance bonus: if all scheduled shifts have a clock-in, apply bonus.
 * Uses max bonus_perfect_attendance across programs the user has signups in.
 */
export async function aggregatePerfectAttendanceBonusByUser({ agencyId, periodStart, periodEnd }) {
  const ps = String(periodStart || '').slice(0, 10);
  const pe = String(periodEnd || '').slice(0, 10);
  if (!agencyId || !ps || !pe) return new Map();

  try {
    const [signupRows] = await pool.execute(
      `SELECT ss.user_id, ss.slot_date, ss.program_site_id, p.id AS program_id
       FROM program_shift_signups ss
       JOIN program_sites psite ON ss.program_site_id = psite.id
       JOIN programs p ON psite.program_id = p.id
       LEFT JOIN program_settings pset ON pset.program_id = p.id
       WHERE p.agency_id = ?
         AND ss.signup_type = 'scheduled'
         AND ss.status = 'confirmed'
         AND ss.slot_date >= ?
         AND ss.slot_date <= ?
         AND COALESCE(pset.shift_scheduling_enabled, 1) = 1`,
      [agencyId, ps, pe]
    );

    const byUser = new Map(); // userId -> { signups: Set, programIds: Set }
    for (const r of signupRows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const key = `${r.slot_date}|${r.program_site_id}`;
      if (!byUser.has(uid)) byUser.set(uid, { signups: new Set(), programIds: new Set() });
      byUser.get(uid).signups.add(key);
      byUser.get(uid).programIds.add(Number(r.program_id || 0));
    }

    const [punchRows] = await pool.execute(
      `SELECT ptp.user_id, DATE(ptp.punched_at) AS punch_date, ptp.program_site_id
       FROM program_time_punches ptp
       JOIN programs p ON ptp.program_id = p.id
       LEFT JOIN program_settings ps ON ps.program_id = p.id
       WHERE p.agency_id = ?
         AND ptp.user_id IS NOT NULL
         AND ptp.punch_type = 'clock_in'
         AND ptp.punched_at >= ?
         AND ptp.punched_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND COALESCE(ps.shift_scheduling_enabled, 1) = 1`,
      [agencyId, ps, pe]
    );

    const punchedByUser = new Map();
    for (const r of punchRows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const key = `${r.punch_date}|${r.program_site_id}`;
      if (!punchedByUser.has(uid)) punchedByUser.set(uid, new Set());
      punchedByUser.get(uid).add(key);
    }

    const programIds = [...new Set((signupRows || []).map((r) => Number(r?.program_id || 0)).filter(Boolean))];
    const bonusByProgram = new Map();
    if (programIds.length > 0) {
      const placeholders = programIds.map(() => '?').join(',');
      const [setRows] = await pool.execute(
        `SELECT program_id, bonus_perfect_attendance FROM program_settings WHERE program_id IN (${placeholders})`,
        programIds
      );
      for (const row of setRows || []) {
        const amt = Number(row?.bonus_perfect_attendance || 0) || 0;
        if (amt > 1e-9) bonusByProgram.set(Number(row.program_id), amt);
      }
    }

    const bonusByUser = new Map();
    for (const [uid, data] of byUser.entries()) {
      const signups = data.signups;
      const punched = punchedByUser.get(uid) || new Set();
      const allPunched = [...signups].every((k) => punched.has(k));
      if (!allPunched || signups.size === 0) continue;

      let maxBonus = 0;
      for (const pid of data.programIds) {
        const b = bonusByProgram.get(pid) || 0;
        if (b > maxBonus) maxBonus = b;
      }
      if (maxBonus > 1e-9) bonusByUser.set(uid, maxBonus);
    }
    return bonusByUser;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw e;
  }
}

/**
 * Shift coverage bonus: when on-call staff covers a call-off.
 */
export async function aggregateShiftCoverageBonusByUser({ agencyId, periodStart, periodEnd }) {
  const ps = String(periodStart || '').slice(0, 10);
  const pe = String(periodEnd || '').slice(0, 10);
  if (!agencyId || !ps || !pe) return new Map();

  try {
    const [rows] = await pool.execute(
      `SELECT c.covered_by_user_id AS user_id,
              COALESCE(pset.bonus_shift_coverage, 0) AS bonus_amount
       FROM program_shift_calloffs c
       JOIN program_shift_signups ss ON c.shift_signup_id = ss.id
       JOIN program_sites psite ON ss.program_site_id = psite.id
       JOIN programs p ON psite.program_id = p.id
       LEFT JOIN program_settings pset ON pset.program_id = p.id
       WHERE p.agency_id = ?
         AND c.status = 'covered'
         AND c.covered_by_user_id IS NOT NULL
         AND c.covered_at >= ?
         AND c.covered_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND COALESCE(pset.shift_scheduling_enabled, 1) = 1`,
      [agencyId, ps, pe]
    );

    const byUser = new Map();
    for (const r of rows || []) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      const amount = Number(r?.bonus_amount || 0) || 0;
      if (amount < 1e-9) continue;
      const existing = byUser.get(uid) || 0;
      byUser.set(uid, existing + amount);
    }
    return byUser;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw e;
  }
}
