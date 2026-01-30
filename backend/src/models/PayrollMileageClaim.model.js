import pool from '../config/database.js';

class PayrollMileageClaim {
  static async findSuggestedPeriodId({ agencyId, driveDate }) {
    if (!agencyId || !driveDate) return null;
    const [rows] = await pool.execute(
      `SELECT id
       FROM payroll_periods
       WHERE agency_id = ?
         AND ? BETWEEN period_start AND period_end
       ORDER BY id DESC
       LIMIT 1`,
      [agencyId, driveDate]
    );
    return rows?.[0]?.id || null;
  }

  static async create({
    agencyId,
    userId,
    submittedByUserId = null,
    driveDate,
    claimType = 'school_travel',
    schoolOrganizationId = null,
    officeLocationId = null,
    officeKey = null,
    homeSchoolRoundtripMiles = null,
    homeOfficeRoundtripMiles = null,
    eligibleMiles = null,
    miles = null,
    roundTrip = 1,
    startLocation = null,
    endLocation = null,
    tripPurpose = null,
    tripApprovedBy = null,
    tripPreapproved = null,
    costCenter = null,
    notes = null,
    attestation = 0,
    tierLevel = null,
    suggestedPayrollPeriodId = null
  }) {
    const resolvedSuggestedPayrollPeriodId =
      Number.isFinite(Number(suggestedPayrollPeriodId)) && Number(suggestedPayrollPeriodId) > 0
        ? Number(suggestedPayrollPeriodId)
        : await PayrollMileageClaim.findSuggestedPeriodId({ agencyId, driveDate });
    const computedEligibleMiles =
      Number.isFinite(Number(eligibleMiles)) ? Number(eligibleMiles)
        : (Number.isFinite(Number(homeSchoolRoundtripMiles)) && Number.isFinite(Number(homeOfficeRoundtripMiles)))
          ? Math.max(0, Number(homeSchoolRoundtripMiles) - Number(homeOfficeRoundtripMiles))
          : null;

    const storedMiles =
      Number.isFinite(Number(miles)) ? Number(miles)
        : (computedEligibleMiles !== null ? computedEligibleMiles : 0);
    const [result] = await pool.execute(
      `INSERT INTO payroll_mileage_claims
       (agency_id, user_id, submitted_by_user_id, status, claim_type, drive_date, school_organization_id, office_location_id, office_key,
        home_school_roundtrip_miles, home_office_roundtrip_miles, eligible_miles,
        miles, round_trip, start_location, end_location, trip_purpose, trip_approved_by, trip_preapproved, cost_center,
        notes, attestation, suggested_payroll_period_id, tier_level)
       VALUES (
         ?, ?, ?, 'submitted',
         ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?
       )`,
      [
        agencyId,
        userId,
        (Number.isFinite(Number(submittedByUserId)) && Number(submittedByUserId) > 0) ? Number(submittedByUserId) : Number(userId),
        String(claimType || 'school_travel'),
        driveDate,
        schoolOrganizationId,
        officeLocationId,
        officeKey,
        homeSchoolRoundtripMiles,
        homeOfficeRoundtripMiles,
        computedEligibleMiles,
        storedMiles,
        roundTrip ? 1 : 0,
        startLocation,
        endLocation,
        tripPurpose,
        tripApprovedBy,
        tripPreapproved === null || tripPreapproved === undefined ? null : (tripPreapproved ? 1 : 0),
        costCenter,
        notes,
        attestation ? 1 : 0,
        resolvedSuggestedPayrollPeriodId,
        tierLevel
      ]
    );
    const id = result?.insertId || null;
    return id ? PayrollMileageClaim.findById(id) : null;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_mileage_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async listForUser({ agencyId, userId, status = null, limit = 200, offset = 0 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const off = Math.max(0, Number(offset || 0));
    const params = [agencyId, userId];
    let where = `c.agency_id = ? AND c.user_id = ?`;
    if (status) {
      where += ` AND c.status = ?`;
      params.push(String(status));
    }
    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_mileage_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE ${where}
       ORDER BY c.drive_date DESC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async listForAgency({
    agencyId,
    status = null,
    suggestedPayrollPeriodId = null,
    targetPayrollPeriodId = null,
    userId = null,
    limit = 500,
    offset = 0
  }) {
    const lim = Math.max(1, Math.min(1000, Number(limit || 500)));
    const off = Math.max(0, Number(offset || 0));

    const params = [agencyId];
    const conds = [`c.agency_id = ?`];
    if (status) {
      const st = String(status);
      // "submitted" means truly pending approval. Returned claims use 'deferred' and should not appear as pending.
      conds.push(`c.status = ?`);
      params.push(st);
    }
    if (Number.isFinite(Number(suggestedPayrollPeriodId)) && Number(suggestedPayrollPeriodId) > 0) {
      conds.push(`c.suggested_payroll_period_id = ?`);
      params.push(Number(suggestedPayrollPeriodId));
    }
    if (Number.isFinite(Number(targetPayrollPeriodId)) && Number(targetPayrollPeriodId) > 0) {
      conds.push(`c.target_payroll_period_id = ?`);
      params.push(Number(targetPayrollPeriodId));
    }
    if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
      conds.push(`c.user_id = ?`);
      params.push(Number(userId));
    }

    const [rows] = await pool.execute(
      `SELECT c.*,
              sb.first_name AS submitted_by_first_name,
              sb.last_name AS submitted_by_last_name,
              sb.email AS submitted_by_email
       FROM payroll_mileage_claims c
       LEFT JOIN users sb ON sb.id = c.submitted_by_user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY c.status ASC, c.drive_date DESC, c.id DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }

  static async approve({
    id,
    approverUserId,
    targetPayrollPeriodId,
    tierLevel,
    ratePerMile,
    appliedAmount
  }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET status = 'approved',
           target_payroll_period_id = ?,
           tier_level = ?,
           rate_per_mile = ?,
           applied_amount = ?,
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, tierLevel, ratePerMile, appliedAmount, approverUserId, id]
    );
    return PayrollMileageClaim.findById(id);
  }

  static async reject({ id, rejectorUserId, rejectionReason }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET status = 'rejected',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [rejectionReason || null, rejectorUserId, id]
    );
    return PayrollMileageClaim.findById(id);
  }

  static async defer({ id }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET status = 'deferred'
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return PayrollMileageClaim.findById(id);
  }

  // "Returned" == needs changes. We reuse the existing 'deferred' status to avoid schema changes.
  static async returnForChanges({ id, actorUserId, note }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET status = 'deferred',
           rejection_reason = ?,
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           target_payroll_period_id = NULL,
           tier_level = NULL,
           rate_per_mile = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [String(note || '').trim().slice(0, 255) || null, actorUserId || null, id]
    );
    return PayrollMileageClaim.findById(id);
  }

  static async unapprove({ id }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET status = 'submitted',
           target_payroll_period_id = NULL,
           tier_level = NULL,
           rate_per_mile = NULL,
           applied_amount = NULL,
           approved_by_user_id = NULL,
           approved_at = NULL,
           rejection_reason = NULL,
           rejected_by_user_id = NULL,
           rejected_at = NULL
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return PayrollMileageClaim.findById(id);
  }

  static async moveTargetPeriod({ id, targetPayrollPeriodId }) {
    await pool.execute(
      `UPDATE payroll_mileage_claims
       SET target_payroll_period_id = ?
       WHERE id = ?
       LIMIT 1`,
      [targetPayrollPeriodId, id]
    );
    return PayrollMileageClaim.findById(id);
  }

  static async sumApprovedForPeriodUser({ payrollPeriodId, agencyId, userId }) {
    const [rows] = await pool.execute(
      `SELECT SUM(applied_amount) AS total
       FROM payroll_mileage_claims
       WHERE agency_id = ?
         AND user_id = ?
         AND status IN ('approved','paid')
         AND target_payroll_period_id = ?`,
      [agencyId, userId, payrollPeriodId]
    );
    return Number(rows?.[0]?.total || 0);
  }

  static async countUnresolvedForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM payroll_mileage_claims
       WHERE agency_id = ?
         AND status = 'submitted'
         AND (
           target_payroll_period_id = ?
           OR (target_payroll_period_id IS NULL AND suggested_payroll_period_id = ?)
         )`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return Number(rows?.[0]?.cnt || 0);
  }

  static async listUnresolvedForPeriod({ payrollPeriodId, agencyId, limit = 50 }) {
    const lim = Math.max(1, Math.min(200, Number(limit || 50)));
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_mileage_claims
       WHERE agency_id = ?
         AND status = 'submitted'
         AND (
           target_payroll_period_id = ?
           OR (target_payroll_period_id IS NULL AND suggested_payroll_period_id = ?)
         )
       ORDER BY drive_date DESC, id DESC
       LIMIT ${lim}`,
      [agencyId, payrollPeriodId, payrollPeriodId]
    );
    return rows || [];
  }
}

export default PayrollMileageClaim;

