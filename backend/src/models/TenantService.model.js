import pool from '../config/database.js';
import AgencyBusinessType, { BUSINESS_TYPE_CODES } from './AgencyBusinessType.model.js';

const MODALITIES = new Set(['IN_PERSON', 'TELEHEALTH', 'EITHER']);

class TenantService {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      businessType: String(r.business_type || ''),
      name: String(r.name || ''),
      description: r.description != null ? String(r.description) : null,
      serviceCode: r.service_code != null ? String(r.service_code) : null,
      defaultDurationMinutes: Number(r.default_duration_minutes || 60),
      allowsIndividual: Number(r.allows_individual) === 1,
      allowsGroup: Number(r.allows_group) === 1,
      maxParticipants: r.max_participants == null ? null : Number(r.max_participants),
      modality: String(r.modality || 'EITHER').toUpperCase(),
      priceCents: r.price_cents == null ? null : Number(r.price_cents),
      billingMethod: String(r.billing_method || 'self_pay'),
      isPubliclyBookable: Number(r.is_publicly_bookable) === 1,
      isStaffBookable: Number(r.is_staff_bookable) === 1,
      packageEligible: Number(r.package_eligible) === 1,
      programEligible: Number(r.program_eligible) === 1,
      bufferBeforeMinutes: Number(r.buffer_before_minutes || 0),
      bufferAfterMinutes: Number(r.buffer_after_minutes || 0),
      minNoticeHours: r.min_notice_hours == null ? null : Number(r.min_notice_hours),
      maxAdvanceDays: r.max_advance_days == null ? null : Number(r.max_advance_days),
      cancellationPolicyId: r.cancellation_policy_id == null ? null : Number(r.cancellation_policy_id),
      reminderDefaultsJson: r.reminder_defaults_json || null,
      isActive: Number(r.is_active) === 1,
      sortOrder: Number(r.sort_order || 0)
    };
  }

  static async listForAgency(agencyId, { includeInactive = false } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM tenant_services
       WHERE agency_id = ?
         ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY sort_order ASC, name ASC`,
      [aid]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async findById(id, agencyId = null) {
    const sid = Number(id || 0);
    if (!sid) return null;
    const params = [sid];
    let sql = `SELECT * FROM tenant_services WHERE id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
      params.push(Number(agencyId));
    }
    const [rows] = await pool.execute(sql, params);
    return this.mapRow(rows?.[0]);
  }

  static normalizePayload(body = {}, agencyId) {
    const businessType = AgencyBusinessType.normalizeType(body.businessType || body.business_type);
    if (!businessType || !BUSINESS_TYPE_CODES.includes(businessType)) {
      throw Object.assign(new Error('Invalid businessType'), { status: 400 });
    }
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    const modality = String(body.modality || 'EITHER').trim().toUpperCase();
    if (!MODALITIES.has(modality)) {
      throw Object.assign(new Error('Invalid modality'), { status: 400 });
    }
    const rawCode = body.serviceCode ?? body.service_code;
    const serviceCode = rawCode != null && String(rawCode).trim()
      ? String(rawCode).trim().toUpperCase().slice(0, 32)
      : null;
    return {
      agencyId: Number(agencyId),
      businessType,
      name: name.slice(0, 200),
      description: body.description != null ? String(body.description).slice(0, 8000) : null,
      serviceCode,
      defaultDurationMinutes: Math.max(5, Math.min(480, Number(body.defaultDurationMinutes || body.default_duration_minutes || 60))),
      allowsIndividual: body.allowsIndividual !== false && body.allows_individual !== 0,
      allowsGroup: body.allowsGroup === true || body.allows_group === true || body.allows_group === 1,
      maxParticipants: body.maxParticipants != null || body.max_participants != null
        ? Math.max(1, Number(body.maxParticipants ?? body.max_participants))
        : null,
      modality,
      priceCents: body.priceCents != null || body.price_cents != null
        ? Math.max(0, Number(body.priceCents ?? body.price_cents))
        : null,
      billingMethod: String(body.billingMethod || body.billing_method || 'self_pay').slice(0, 64),
      isPubliclyBookable: body.isPubliclyBookable === true || body.is_publicly_bookable === true || body.is_publicly_bookable === 1,
      isStaffBookable: body.isStaffBookable !== false && body.is_staff_bookable !== 0,
      packageEligible: body.packageEligible !== false && body.package_eligible !== 0,
      programEligible: body.programEligible !== false && body.program_eligible !== 0,
      bufferBeforeMinutes: Math.max(0, Number(body.bufferBeforeMinutes ?? body.buffer_before_minutes ?? 0)),
      bufferAfterMinutes: Math.max(0, Number(body.bufferAfterMinutes ?? body.buffer_after_minutes ?? 0)),
      minNoticeHours: body.minNoticeHours != null || body.min_notice_hours != null
        ? Math.max(0, Number(body.minNoticeHours ?? body.min_notice_hours))
        : null,
      maxAdvanceDays: body.maxAdvanceDays != null || body.max_advance_days != null
        ? Math.max(1, Number(body.maxAdvanceDays ?? body.max_advance_days))
        : null,
      isActive: body.isActive !== false && body.is_active !== 0,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0) || 0
    };
  }

  static async create(agencyId, body) {
    const p = this.normalizePayload(body, agencyId);
    const [result] = await pool.execute(
      `INSERT INTO tenant_services (
         agency_id, business_type, name, description, service_code, default_duration_minutes,
         allows_individual, allows_group, max_participants, modality, price_cents,
         billing_method, is_publicly_bookable, is_staff_bookable, package_eligible,
         program_eligible, buffer_before_minutes, buffer_after_minutes,
         min_notice_hours, max_advance_days, is_active, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.agencyId, p.businessType, p.name, p.description, p.serviceCode, p.defaultDurationMinutes,
        p.allowsIndividual ? 1 : 0, p.allowsGroup ? 1 : 0, p.maxParticipants, p.modality, p.priceCents,
        p.billingMethod, p.isPubliclyBookable ? 1 : 0, p.isStaffBookable ? 1 : 0, p.packageEligible ? 1 : 0,
        p.programEligible ? 1 : 0, p.bufferBeforeMinutes, p.bufferAfterMinutes,
        p.minNoticeHours, p.maxAdvanceDays, p.isActive ? 1 : 0, p.sortOrder
      ]
    );
    return this.findById(result.insertId, agencyId);
  }

  static async update(id, agencyId, body) {
    const existing = await this.findById(id, agencyId);
    if (!existing) return null;
    const merged = {
      ...existing,
      ...body,
      businessType: body.businessType || existing.businessType,
      serviceCode: body.serviceCode !== undefined || body.service_code !== undefined
        ? (body.serviceCode ?? body.service_code)
        : existing.serviceCode
    };
    const p = this.normalizePayload(merged, agencyId);
    await pool.execute(
      `UPDATE tenant_services SET
         business_type = ?, name = ?, description = ?, service_code = ?, default_duration_minutes = ?,
         allows_individual = ?, allows_group = ?, max_participants = ?, modality = ?, price_cents = ?,
         billing_method = ?, is_publicly_bookable = ?, is_staff_bookable = ?, package_eligible = ?,
         program_eligible = ?, buffer_before_minutes = ?, buffer_after_minutes = ?,
         min_notice_hours = ?, max_advance_days = ?, is_active = ?, sort_order = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [
        p.businessType, p.name, p.description, p.serviceCode, p.defaultDurationMinutes,
        p.allowsIndividual ? 1 : 0, p.allowsGroup ? 1 : 0, p.maxParticipants, p.modality, p.priceCents,
        p.billingMethod, p.isPubliclyBookable ? 1 : 0, p.isStaffBookable ? 1 : 0, p.packageEligible ? 1 : 0,
        p.programEligible ? 1 : 0, p.bufferBeforeMinutes, p.bufferAfterMinutes,
        p.minNoticeHours, p.maxAdvanceDays, p.isActive ? 1 : 0, p.sortOrder,
        Number(id), Number(agencyId)
      ]
    );
    return this.findById(id, agencyId);
  }

  static async softDelete(id, agencyId) {
    const [result] = await pool.execute(
      `UPDATE tenant_services SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [Number(id), Number(agencyId)]
    );
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default TenantService;
