import pool from '../config/database.js';
import AgencyBusinessType from './AgencyBusinessType.model.js';

const SCOPE_LEVELS = new Set([
  'affiliation',
  'tenant',
  'business_type',
  'service',
  'package',
  'appointment'
]);

const LATE_ACTIONS = new Set(['release', 'forfeit', 'review']);

function mapRow(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    name: String(r.name || ''),
    description: r.description || null,
    scopeLevel: String(r.scope_level || 'tenant'),
    businessType: r.business_type || null,
    tenantServiceId: r.tenant_service_id == null ? null : Number(r.tenant_service_id),
    bookingPackageId: r.booking_package_id == null ? null : Number(r.booking_package_id),
    noticeHours: Number(r.notice_hours ?? 24),
    lateFeeCents: Number(r.late_fee_cents || 0),
    latePackageAction: String(r.late_package_action || 'forfeit'),
    complimentaryCancelsPerPeriod: Number(r.complimentary_cancels_per_period || 0),
    periodDays: Number(r.period_days || 90),
    allowClientCancel: Number(r.allow_client_cancel) === 1,
    requireReason: Number(r.require_reason) === 1,
    isActive: Number(r.is_active) === 1,
    sortOrder: Number(r.sort_order || 0)
  };
}

class BookingCancellationPolicy {
  static mapRow = mapRow;

  static async listForAgency(agencyId, { includeInactive = false } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM booking_cancellation_policies
       WHERE agency_id = ?
         ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY
         FIELD(scope_level, 'appointment', 'package', 'service', 'business_type', 'tenant', 'affiliation'),
         sort_order ASC, id ASC`,
      [aid]
    );
    return (rows || []).map(mapRow);
  }

  static async findById(id, agencyId = null) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const params = [pid];
    let sql = `SELECT * FROM booking_cancellation_policies WHERE id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` LIMIT 1`;
    const [rows] = await pool.execute(sql, params);
    return mapRow(rows?.[0]);
  }

  static normalizePayload(body = {}, agencyId) {
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    const scopeLevel = String(body.scopeLevel || body.scope_level || 'tenant').toLowerCase();
    if (!SCOPE_LEVELS.has(scopeLevel)) {
      throw Object.assign(new Error('Invalid scopeLevel'), { status: 400 });
    }
    const latePackageAction = String(body.latePackageAction || body.late_package_action || 'forfeit').toLowerCase();
    if (!LATE_ACTIONS.has(latePackageAction)) {
      throw Object.assign(new Error('Invalid latePackageAction'), { status: 400 });
    }
    const businessType = body.businessType || body.business_type
      ? AgencyBusinessType.normalizeType(body.businessType || body.business_type)
      : null;
    return {
      agencyId: Number(agencyId),
      name: name.slice(0, 200),
      description: body.description != null ? String(body.description).slice(0, 8000) : null,
      scopeLevel,
      businessType,
      tenantServiceId: body.tenantServiceId != null || body.tenant_service_id != null
        ? Number(body.tenantServiceId ?? body.tenant_service_id) || null
        : null,
      bookingPackageId: body.bookingPackageId != null || body.booking_package_id != null
        ? Number(body.bookingPackageId ?? body.booking_package_id) || null
        : null,
      noticeHours: Math.max(0, Number(body.noticeHours ?? body.notice_hours ?? 24) || 0),
      lateFeeCents: Math.max(0, Number(body.lateFeeCents ?? body.late_fee_cents ?? 0) || 0),
      latePackageAction,
      complimentaryCancelsPerPeriod: Math.max(0, Number(body.complimentaryCancelsPerPeriod ?? body.complimentary_cancels_per_period ?? 0) || 0),
      periodDays: Math.max(1, Number(body.periodDays ?? body.period_days ?? 90) || 90),
      allowClientCancel: body.allowClientCancel !== false && body.allow_client_cancel !== 0,
      requireReason: body.requireReason !== false && body.require_reason !== 0,
      isActive: body.isActive !== false && body.is_active !== 0,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0) || 0
    };
  }

  static async create(agencyId, body = {}, createdByUserId = null) {
    const p = this.normalizePayload(body, agencyId);
    const [result] = await pool.execute(
      `INSERT INTO booking_cancellation_policies
        (agency_id, name, description, scope_level, business_type, tenant_service_id, booking_package_id,
         notice_hours, late_fee_cents, late_package_action, complimentary_cancels_per_period, period_days,
         allow_client_cancel, require_reason, is_active, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        p.agencyId, p.name, p.description, p.scopeLevel, p.businessType, p.tenantServiceId, p.bookingPackageId,
        p.noticeHours, p.lateFeeCents, p.latePackageAction, p.complimentaryCancelsPerPeriod, p.periodDays,
        p.allowClientCancel ? 1 : 0, p.requireReason ? 1 : 0, p.sortOrder, createdByUserId || null
      ]
    );
    return this.findById(result.insertId, agencyId);
  }

  static async update(id, agencyId, body = {}) {
    const existing = await this.findById(id, agencyId);
    if (!existing) return null;
    const p = this.normalizePayload({ ...existing, ...body }, agencyId);
    await pool.execute(
      `UPDATE booking_cancellation_policies
       SET name = ?, description = ?, scope_level = ?, business_type = ?, tenant_service_id = ?,
           booking_package_id = ?, notice_hours = ?, late_fee_cents = ?, late_package_action = ?,
           complimentary_cancels_per_period = ?, period_days = ?, allow_client_cancel = ?,
           require_reason = ?, is_active = ?, sort_order = ?
       WHERE id = ? AND agency_id = ?`,
      [
        p.name, p.description, p.scopeLevel, p.businessType, p.tenantServiceId, p.bookingPackageId,
        p.noticeHours, p.lateFeeCents, p.latePackageAction, p.complimentaryCancelsPerPeriod, p.periodDays,
        p.allowClientCancel ? 1 : 0, p.requireReason ? 1 : 0, p.isActive ? 1 : 0, p.sortOrder,
        existing.id, existing.agencyId
      ]
    );
    return this.findById(existing.id, existing.agencyId);
  }

  static async recordWaiver({
    agencyId,
    appointmentId,
    policyId = null,
    waivedFeeCents = 0,
    packageActionOverridden = null,
    reason,
    waivedByUserId
  } = {}) {
    const reasonText = String(reason || '').trim();
    if (!reasonText) throw Object.assign(new Error('Waiver reason is required'), { status: 400 });
    const [result] = await pool.execute(
      `INSERT INTO booking_cancellation_waivers
        (agency_id, appointment_id, policy_id, waived_fee_cents, package_action_overridden, reason, waived_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(appointmentId),
        policyId || null,
        Math.max(0, Number(waivedFeeCents) || 0),
        packageActionOverridden || null,
        reasonText.slice(0, 500),
        Number(waivedByUserId)
      ]
    );
    return { id: Number(result.insertId) };
  }

  static async countComplimentaryUsed({ agencyId, clientId, periodDays = 90 } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return 0;
    const days = Math.max(1, Number(periodDays) || 90);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM appointments a
       JOIN appointment_participants p ON p.appointment_id = a.id AND p.client_id = ?
       WHERE a.agency_id = ?
         AND a.status LIKE 'canceled%'
         AND a.canceled_at >= (NOW() - INTERVAL ? DAY)
         AND JSON_EXTRACT(a.cancellation_recommendation_json, '$.usedComplimentary') = true`,
      [cid, aid, days]
    );
    return Number(rows?.[0]?.c || 0);
  }
}

export default BookingCancellationPolicy;
