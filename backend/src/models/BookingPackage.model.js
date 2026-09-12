import { planPackageUsage } from '../utils/bookingPackageUsage.js';
import pool from '../config/database.js';
import AgencyBusinessType from './AgencyBusinessType.model.js';

const PACKAGE_TYPES = new Set([
  'prepaid_bundle',
  'payg',
  'subscription',
  'installment',
  'retainer',
  'consulting_project'
]);

const DEFAULT_BILLING_OPTIONS = {
  modes: ['pay_in_full'],
  installments: null,
  subscriptionInterval: null
};

const DEFAULT_POLICIES = {
  cancellationNoticeHours: 24,
  lateCancelPolicy: 'forfeit',
  noShowPolicy: 'forfeit',
  expirationDays: null,
  rolloverAllowed: false
};

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function normalizePackageType(raw) {
  const t = String(raw || 'prepaid_bundle').toLowerCase().trim();
  return PACKAGE_TYPES.has(t) ? t : 'prepaid_bundle';
}

function toJsonOrNull(value, fallback = null) {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value);
}

function creditAllowance(value) {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0 || n > 10000) throw Object.assign(new Error('Credit allowances must be whole numbers from 0 to 10000'), { status: 400 });
  return n;
}
function validateCreditPolicy(policy) {
  const p = parseJson(policy, {}) || {};
  creditAllowance(p.freeMisses); creditAllowance(p.bonusSessions);
  if (!Number.isFinite(Number(p.cancellationNoticeHours ?? 24)) || Number(p.cancellationNoticeHours ?? 24) < 0) {
    throw Object.assign(new Error('Cancellation notice must be a nonnegative number of hours'), { status: 400 });
  }
  if ([p.lateCancelPolicy, p.noShowPolicy].includes('fee') && (!Number.isSafeInteger(Number(p.missedFeeCents)) || Number(p.missedFeeCents) < 1)) {
    throw Object.assign(new Error('Configure a positive missed-appointment fee for the fee policy'), { status: 400 });
  }
}

function mapPackage(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    businessType: String(r.business_type),
    learningProgramClassId: r.learning_program_class_id == null ? null : Number(r.learning_program_class_id),
    name: String(r.name || ''),
    description: r.description || null,
    packageType: normalizePackageType(r.package_type),
    sessionCount: Number(r.session_count || 0),
    priceCents: Number(r.price_cents || 0),
    billingOptions: parseJson(r.billing_options_json, { ...DEFAULT_BILLING_OPTIONS }),
    policies: parseJson(r.policies_json, { ...DEFAULT_POLICIES }),
    domainConfig: parseJson(r.domain_config_json, null),
    allowedTenantServiceIds: parseJson(r.allowed_tenant_service_ids_json, null),
    consumeOn: String(r.consume_on || 'reserve'),
    isActive: Number(r.is_active) === 1,
    isPublic: Number(r.is_public) === 1,
    stripeProductId: r.stripe_product_id || null,
    stripePriceId: r.stripe_price_id || null,
    sortOrder: Number(r.sort_order || 0),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    programName: r.program_name != null ? String(r.program_name) : undefined
  };
}

function mapEntitlement(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    clientId: Number(r.client_id),
    packageId: Number(r.package_id),
    learningProgramClassId: r.learning_program_class_id == null ? null : Number(r.learning_program_class_id),
    businessType: String(r.business_type),
    sessionsPurchased: Number(r.sessions_purchased || 0),
    sessionsRemaining: Number(r.sessions_remaining || 0),
    sessionsReserved: Number(r.sessions_reserved || 0),
    freeMissesRemaining: Number(r.free_misses_remaining || 0),
    bonusSessionsRemaining: Number(r.bonus_sessions_remaining || 0),
    bonusSessionsReserved: Number(r.bonus_sessions_reserved || 0),
    paymentStatus: String(r.payment_status || 'PENDING'),
    status: String(r.status || 'ACTIVE'),
    practitionerEntitlementId: r.practitioner_entitlement_id == null ? null : Number(r.practitioner_entitlement_id),
    activatedAt: r.activated_at || null,
    purchaserUserId: r.purchaser_user_id == null ? null : Number(r.purchaser_user_id),
    stripeCheckoutSessionId: r.stripe_checkout_session_id || null,
    stripePaymentIntentId: r.stripe_payment_intent_id || null,
    packageName: r.package_name != null ? String(r.package_name) : undefined,
    packageType: r.package_type != null ? normalizePackageType(r.package_type) : undefined,
    priceCents: r.price_cents != null ? Number(r.price_cents) : undefined,
    consumeOn: r.consume_on != null ? String(r.consume_on) : undefined,
    allowedTenantServiceIds: r.allowed_tenant_service_ids_json != null
      ? parseJson(r.allowed_tenant_service_ids_json, null)
      : undefined,
    domainConfig: r.domain_config_json != null ? parseJson(r.domain_config_json, null) : undefined
  };
}

class BookingPackage {
  static get DEFAULT_BILLING_OPTIONS() {
    return { ...DEFAULT_BILLING_OPTIONS };
  }

  static get DEFAULT_POLICIES() {
    return { ...DEFAULT_POLICIES };
  }

  static async listForAgency(agencyId, {
    includeInactive = false,
    businessType = null,
    learningProgramClassId = undefined,
    tenantWideOnly = false,
    isPublic = null,
    publicOnly = false
  } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const params = [aid];
    let sql = `
      SELECT p.*, lpc.class_name AS program_name
      FROM booking_packages p
      LEFT JOIN learning_program_classes lpc ON lpc.id = p.learning_program_class_id
      WHERE p.agency_id = ?`;
    if (!includeInactive) sql += ` AND p.is_active = 1`;
    if (publicOnly || isPublic === true) sql += ` AND p.is_public = 1`;
    const bt = AgencyBusinessType.normalizeType(businessType);
    if (bt) {
      sql += ` AND p.business_type = ?`;
      params.push(bt);
    }
    if (tenantWideOnly) {
      sql += ` AND p.learning_program_class_id IS NULL`;
    } else if (learningProgramClassId !== undefined && learningProgramClassId !== null) {
      const pid = Number(learningProgramClassId);
      if (pid > 0) {
        sql += ` AND p.learning_program_class_id = ?`;
        params.push(pid);
      }
    } else if (learningProgramClassId === null) {
      sql += ` AND p.learning_program_class_id IS NULL`;
    }
    sql += ` ORDER BY p.sort_order ASC, p.name ASC`;
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map(mapPackage);
  }

  static async findById(id, agencyId = null) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const params = [pid];
    let sql = `
      SELECT p.*, lpc.class_name AS program_name
      FROM booking_packages p
      LEFT JOIN learning_program_classes lpc ON lpc.id = p.learning_program_class_id
      WHERE p.id = ?`;
    if (agencyId) {
      sql += ` AND p.agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` LIMIT 1`;
    const [rows] = await pool.execute(sql, params);
    return mapPackage(rows?.[0]);
  }

  static async create(agencyId, data = {}, createdByUserId = null) {
    const aid = Number(agencyId || 0);
    const businessType = AgencyBusinessType.normalizeType(data.businessType || data.business_type);
    if (!aid || !businessType) {
      throw Object.assign(new Error('agencyId and businessType are required'), { status: 400 });
    }
    const name = String(data.name || '').trim();
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    const sessionCount = Math.max(1, Number(data.sessionCount ?? data.session_count ?? 1) || 1);
    const priceCents = Math.max(0, Number(data.priceCents ?? data.price_cents ?? 0) || 0);
    const consumeOn = String(data.consumeOn || data.consume_on || 'reserve').toLowerCase() === 'complete'
      ? 'complete'
      : 'reserve';
    let allowed = data.allowedTenantServiceIds ?? data.allowed_tenant_service_ids_json ?? null;
    if (Array.isArray(allowed)) {
      allowed = allowed.map((n) => Number(n)).filter((n) => n > 0);
    } else if (allowed != null && typeof allowed !== 'object') {
      allowed = null;
    }
    const programIdRaw = data.learningProgramClassId ?? data.learning_program_class_id;
    const learningProgramClassId =
      programIdRaw === null || programIdRaw === '' || programIdRaw === undefined
        ? null
        : Number(programIdRaw) || null;
    const packageType = normalizePackageType(data.packageType || data.package_type);
    const billingOptions = data.billingOptions ?? data.billing_options_json ?? DEFAULT_BILLING_OPTIONS;
    const policies = data.policies ?? data.policies_json ?? DEFAULT_POLICIES;
    validateCreditPolicy(policies);
    const domainConfig = data.domainConfig ?? data.domain_config_json ?? null;
    const isPublic = data.isPublic === true || data.is_public === 1 || data.is_public === true;
    const [result] = await pool.execute(
      `INSERT INTO booking_packages
        (agency_id, business_type, learning_program_class_id, name, description, package_type,
         session_count, price_cents, billing_options_json, policies_json, domain_config_json,
         allowed_tenant_service_ids_json, consume_on, is_active, is_public,
         stripe_product_id, stripe_price_id, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        aid,
        businessType,
        learningProgramClassId,
        name,
        data.description || null,
        packageType,
        sessionCount,
        priceCents,
        toJsonOrNull(billingOptions, DEFAULT_BILLING_OPTIONS),
        toJsonOrNull(policies, DEFAULT_POLICIES),
        toJsonOrNull(domainConfig, null),
        allowed == null ? null : JSON.stringify(allowed),
        consumeOn,
        isPublic ? 1 : 0,
        data.stripeProductId || data.stripe_product_id || null,
        data.stripePriceId || data.stripe_price_id || null,
        Number(data.sortOrder ?? data.sort_order ?? 0) || 0,
        createdByUserId || null
      ]
    );
    return this.findById(result.insertId, aid);
  }

  static async update(id, agencyId, data = {}) {
    const existing = await this.findById(id, agencyId);
    if (!existing) return null;
    const businessType = data.businessType != null || data.business_type != null
      ? AgencyBusinessType.normalizeType(data.businessType || data.business_type)
      : existing.businessType;
    if (!businessType) throw Object.assign(new Error('Invalid businessType'), { status: 400 });
    const name = data.name != null ? String(data.name).trim() : existing.name;
    if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
    let allowed = data.allowedTenantServiceIds !== undefined
      ? data.allowedTenantServiceIds
      : (data.allowed_tenant_service_ids_json !== undefined ? data.allowed_tenant_service_ids_json : existing.allowedTenantServiceIds);
    if (Array.isArray(allowed)) allowed = allowed.map((n) => Number(n)).filter((n) => n > 0);
    const consumeOn = data.consumeOn != null || data.consume_on != null
      ? (String(data.consumeOn || data.consume_on).toLowerCase() === 'complete' ? 'complete' : 'reserve')
      : existing.consumeOn;
    const isActive = data.isActive != null || data.is_active != null
      ? (data.isActive !== false && data.is_active !== 0 && data.is_active !== false)
      : existing.isActive;
    const isPublic = data.isPublic != null || data.is_public != null
      ? (data.isPublic === true || data.is_public === 1 || data.is_public === true)
      : existing.isPublic;
    let learningProgramClassId = existing.learningProgramClassId;
    if (data.learningProgramClassId !== undefined || data.learning_program_class_id !== undefined) {
      const raw = data.learningProgramClassId !== undefined
        ? data.learningProgramClassId
        : data.learning_program_class_id;
      learningProgramClassId = raw === null || raw === '' ? null : Number(raw) || null;
    }
    const packageType = data.packageType != null || data.package_type != null
      ? normalizePackageType(data.packageType || data.package_type)
      : existing.packageType;
    const billingOptions = data.billingOptions !== undefined || data.billing_options_json !== undefined
      ? (data.billingOptions ?? data.billing_options_json)
      : existing.billingOptions;
    const policies = data.policies !== undefined || data.policies_json !== undefined
      ? (data.policies ?? data.policies_json)
      : existing.policies;
    validateCreditPolicy(policies);
    const domainConfig = data.domainConfig !== undefined || data.domain_config_json !== undefined
      ? (data.domainConfig ?? data.domain_config_json)
      : existing.domainConfig;
    await pool.execute(
      `UPDATE booking_packages
       SET business_type = ?, learning_program_class_id = ?, name = ?, description = ?,
           package_type = ?, session_count = ?, price_cents = ?,
           billing_options_json = ?, policies_json = ?, domain_config_json = ?,
           allowed_tenant_service_ids_json = ?, consume_on = ?, is_active = ?, is_public = ?,
           stripe_product_id = ?, stripe_price_id = ?, sort_order = ?
       WHERE id = ? AND agency_id = ?`,
      [
        businessType,
        learningProgramClassId,
        name,
        data.description !== undefined ? (data.description || null) : existing.description,
        packageType,
        Math.max(1, Number(data.sessionCount ?? data.session_count ?? existing.sessionCount) || 1),
        Math.max(0, Number(data.priceCents ?? data.price_cents ?? existing.priceCents) || 0),
        toJsonOrNull(billingOptions, DEFAULT_BILLING_OPTIONS),
        toJsonOrNull(policies, DEFAULT_POLICIES),
        toJsonOrNull(domainConfig, null),
        allowed == null ? null : JSON.stringify(allowed),
        consumeOn,
        isActive ? 1 : 0,
        isPublic ? 1 : 0,
        data.stripeProductId !== undefined || data.stripe_product_id !== undefined
          ? (data.stripeProductId ?? data.stripe_product_id)
          : existing.stripeProductId,
        data.stripePriceId !== undefined || data.stripe_price_id !== undefined
          ? (data.stripePriceId ?? data.stripe_price_id)
          : existing.stripePriceId,
        Number(data.sortOrder ?? data.sort_order ?? existing.sortOrder) || 0,
        existing.id,
        existing.agencyId
      ]
    );
    return this.findById(existing.id, existing.agencyId);
  }

  static async duplicate(id, agencyId, { learningProgramClassId, nameSuffix = ' (copy)' } = {}) {
    const existing = await this.findById(id, agencyId);
    if (!existing) return null;
    return this.create(
      agencyId,
      {
        ...existing,
        name: `${existing.name}${nameSuffix}`,
        learningProgramClassId:
          learningProgramClassId !== undefined ? learningProgramClassId : existing.learningProgramClassId,
        stripeProductId: null,
        stripePriceId: null
      },
      existing.createdByUserId
    );
  }

  static async listEntitlementsForClient(agencyId, clientId, {
    status = 'ACTIVE',
    businessType = null,
    includePending = false
  } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const params = [aid, cid];
    let sql = `
      SELECT e.*, p.name AS package_name, p.consume_on, p.allowed_tenant_service_ids_json,
             p.package_type, p.price_cents, p.domain_config_json
      FROM booking_package_entitlements e
      JOIN booking_packages p ON p.id = e.package_id
      WHERE e.agency_id = ? AND e.client_id = ?`;
    if (status) {
      if (includePending && status === 'ACTIVE') {
        sql += ` AND e.status IN ('ACTIVE', 'PENDING')`;
      } else {
        sql += ` AND e.status = ?`;
        params.push(String(status));
      }
    }
    const bt = AgencyBusinessType.normalizeType(businessType);
    if (bt) {
      sql += ` AND e.business_type = ?`;
      params.push(bt);
    }
    sql += ` ORDER BY e.activated_at DESC, e.id DESC`;
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map(mapEntitlement);
  }

  static async findEntitlementById(id, agencyId = null) {
    const eid = Number(id || 0);
    if (!eid) return null;
    const params = [eid];
    let sql = `
      SELECT e.*, p.name AS package_name, p.consume_on, p.allowed_tenant_service_ids_json,
             p.package_type, p.price_cents, p.domain_config_json
      FROM booking_package_entitlements e
      JOIN booking_packages p ON p.id = e.package_id
      WHERE e.id = ?`;
    if (agencyId) {
      sql += ` AND e.agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` LIMIT 1`;
    const [rows] = await pool.execute(sql, params);
    const row = rows?.[0];
    if (!row) return null;
    return {
      ...mapEntitlement(row),
      allowedTenantServiceIds: parseJson(row.allowed_tenant_service_ids_json, null)
    };
  }

  static async findEntitlementByPaymentIntent(intentId, agencyId = null) {
    const intent = String(intentId || '').trim();
    if (!intent) return null;
    const params = [intent];
    let sql = `
      SELECT e.*, p.name AS package_name, p.consume_on, p.allowed_tenant_service_ids_json,
             p.package_type, p.price_cents, p.domain_config_json
      FROM booking_package_entitlements e
      JOIN booking_packages p ON p.id = e.package_id
      WHERE e.stripe_payment_intent_id = ?`;
    if (agencyId) {
      sql += ` AND e.agency_id = ?`;
      params.push(Number(agencyId));
    }
    sql += ` ORDER BY e.id DESC LIMIT 1`;
    const [rows] = await pool.execute(sql, params);
    return rows?.[0] ? mapEntitlement(rows[0]) : null;
  }

  /**
   * Create a PENDING entitlement row before Stripe payment completes.
   */
  static async createPendingEntitlement({
    agencyId,
    clientId,
    packageId,
    purchaserUserId = null,
    stripePaymentIntentId = null,
    createdByUserId = null
  } = {}) {
    const pkg = await this.findById(packageId, agencyId);
    if (!pkg || !pkg.isActive) {
      throw Object.assign(new Error('Package not found'), { status: 404 });
    }
    const cid = Number(clientId || 0);
    if (!cid) throw Object.assign(new Error('clientId is required'), { status: 400 });
    const [result] = await pool.execute(
      `INSERT INTO booking_package_entitlements
        (agency_id, client_id, package_id, learning_program_class_id, business_type,
         sessions_purchased, sessions_remaining, sessions_reserved,
         payment_status, status, purchaser_user_id, stripe_payment_intent_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', 'PENDING', ?, ?, ?)`,
      [
        pkg.agencyId,
        cid,
        pkg.id,
        pkg.learningProgramClassId,
        pkg.businessType,
        pkg.sessionCount,
        purchaserUserId || null,
        stripePaymentIntentId || null,
        createdByUserId || null
      ]
    );
    return this.findEntitlementById(result.insertId, pkg.agencyId);
  }

  /**
   * Activate a pending entitlement after successful payment (or activate fresh for staff/offline).
   */
  static async activateEntitlement({
    agencyId,
    clientId,
    packageId,
    paymentStatus = 'PAID',
    createdByUserId = null,
    practitionerEntitlementId = null,
    purchaserUserId = null,
    stripePaymentIntentId = null,
    entitlementId = null
  } = {}) {
    const pkg = await this.findById(packageId, agencyId);
    if (!pkg || !pkg.isActive) {
      throw Object.assign(new Error('Package not found'), { status: 404 });
    }
    const cid = Number(clientId || 0);
    if (!cid) throw Object.assign(new Error('clientId is required'), { status: 400 });
    const bonus = creditAllowance(pkg.policies?.bonusSessions);
    const free = creditAllowance(pkg.policies?.freeMisses);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let entitlementIdNum = Number(entitlementId || 0);
      if (entitlementIdNum) {
        const [rows] = await conn.execute(
          `SELECT * FROM booking_package_entitlements WHERE id = ? AND agency_id = ? FOR UPDATE`,
          [entitlementIdNum, pkg.agencyId]
        );
        const row = rows?.[0];
        if (!row) {
          throw Object.assign(new Error('Entitlement not found'), { status: 404 });
        }
        if (Number(row.client_id) !== cid || Number(row.package_id) !== Number(pkg.id)
          || (stripePaymentIntentId && row.stripe_payment_intent_id !== stripePaymentIntentId)
          || (purchaserUserId && Number(row.purchaser_user_id) !== Number(purchaserUserId))) {
          throw Object.assign(new Error('Entitlement ownership mismatch'), { status: 409 });
        }
        if (String(row.payment_status) === 'PAID') {
          await conn.commit();
          return this.findEntitlementById(entitlementIdNum, pkg.agencyId);
        }
        if (String(row.status) !== 'PENDING') throw Object.assign(new Error('Entitlement is not pending activation'), { status: 409 });
        await conn.execute(
          `UPDATE booking_package_entitlements
           SET sessions_purchased = ?, sessions_remaining = ?, bonus_sessions_remaining = ?, free_misses_remaining = ?, payment_status = ?, status = 'ACTIVE',
               learning_program_class_id = ?, purchaser_user_id = COALESCE(?, purchaser_user_id),
               stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
               activated_at = NOW()
           WHERE id = ?`,
          [
            pkg.sessionCount,
            pkg.sessionCount + bonus,
            bonus, free,
            String(paymentStatus || 'PAID'),
            pkg.learningProgramClassId,
            purchaserUserId || null,
            stripePaymentIntentId || null,
            entitlementIdNum
          ]
        );
      } else {
        const [result] = await conn.execute(
          `INSERT INTO booking_package_entitlements
            (agency_id, client_id, package_id, learning_program_class_id, business_type,
             sessions_purchased, sessions_remaining, bonus_sessions_remaining, free_misses_remaining, sessions_reserved, payment_status, status,
             practitioner_entitlement_id, purchaser_user_id, stripe_payment_intent_id,
             activated_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', ?, ?, ?, NOW(), ?)`,
          [
            pkg.agencyId,
            cid,
            pkg.id,
            pkg.learningProgramClassId,
            pkg.businessType,
            pkg.sessionCount,
            pkg.sessionCount + bonus,
            bonus, free,
            String(paymentStatus || 'PAID'),
            practitionerEntitlementId || null,
            purchaserUserId || null,
            stripePaymentIntentId || null,
            createdByUserId || null
          ]
        );
        entitlementIdNum = Number(result.insertId);
      }
      await conn.execute(
        `INSERT INTO booking_package_ledger
          (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
         VALUES (?, ?, ?, NULL, 'CREDIT', ?, 'PACKAGE_PURCHASE', ?)`,
        [pkg.agencyId, entitlementIdNum, cid, pkg.sessionCount, createdByUserId || null]
      );
      if (bonus || free) await conn.execute(
        `INSERT INTO booking_package_ledger (agency_id, entitlement_id, client_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
         VALUES (?, ?, ?, 'CREDIT', ?, 'PACKAGE_ALLOWANCES', ?, ?)`,
        [pkg.agencyId, entitlementIdNum, cid, bonus, JSON.stringify({ bonusSessions: bonus, freeMisses: free }), createdByUserId || null]
      );
      await conn.commit();
      return this.findEntitlementById(entitlementIdNum, pkg.agencyId);
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Reserve or consume one session for an appointment.
   * Booking reserves capacity for either policy; completion consumes that reservation.
   * Existing consume-on-complete appointments without a reservation are handled by the ledger planner.
   */
  static async applyAppointmentUsage({ entitlementId, agencyId, appointmentId, mode = 'reserve', actorUserId = null, connection = null } = {}) {
    if (!Number.isSafeInteger(Number(appointmentId)) || Number(appointmentId) < 1) {
      throw Object.assign(new Error('appointmentId is required for package usage'), { status: 400 });
    }
    const conn = connection || await pool.getConnection();
    try {
      if (!connection) await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT e.*, p.consume_on FROM booking_package_entitlements e JOIN booking_packages p ON p.id = e.package_id
         WHERE e.id = ? AND e.agency_id = ? FOR UPDATE`, [entitlementId, agencyId]);
      const row = rows[0];
      if (!row) throw Object.assign(new Error('Entitlement not available'), { status: 400 });
      const [history] = await conn.execute(
        `SELECT id, direction, reason_code, metadata_json FROM booking_package_ledger
         WHERE entitlement_id = ? AND agency_id = ? AND appointment_id = ? ORDER BY id ASC`,
        [row.id, agencyId, Number(appointmentId)]);
      const change = planPackageUsage({ mode, remaining: row.sessions_remaining, reserved: row.sessions_reserved,
        freeMisses: row.free_misses_remaining, bonusRemaining: row.bonus_sessions_remaining, bonusReserved: row.bonus_sessions_reserved,
        status: row.status, consumeOn: row.consume_on, history });
      if (change) {
        await conn.execute(
          `UPDATE booking_package_entitlements SET sessions_remaining = ?, sessions_reserved = ?, free_misses_remaining = ?,
           bonus_sessions_remaining = ?, bonus_sessions_reserved = ?, status = ? WHERE id = ?`,
          [change.remaining, change.reserved, change.freeMisses, change.bonusRemaining, change.bonusReserved, change.status, row.id]);
        await conn.execute(
          `INSERT INTO booking_package_ledger
           (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [agencyId, row.id, row.client_id, Number(appointmentId), change.direction, change.quantity, change.reason, JSON.stringify(change.metadata), actorUserId || null]);
      }
      const [updated] = await conn.execute('SELECT * FROM booking_package_entitlements WHERE id = ?', [row.id]);
      if (!connection) await conn.commit();
      const applied = change ? { reason: change.reason, ...change.metadata } : null;
      const prior = history.find((h) => ['SESSION_NOSHOW_FORFEIT', 'MISSED_FREE_MISS'].includes(h.reason_code));
      return { ...mapEntitlement(updated[0]), appliedUsage: applied || (prior ? { reason: prior.reason_code, ...parseJson(prior.metadata_json, {}) } : null) };
    } catch (e) {
      if (!connection) await conn.rollback();
      throw e;
    } finally { if (!connection) conn.release(); }
  }
}

export default BookingPackage;
