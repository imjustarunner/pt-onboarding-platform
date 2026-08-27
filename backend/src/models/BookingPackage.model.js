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
        if (String(row.status) === 'ACTIVE' && String(row.payment_status) === 'PAID') {
          await conn.commit();
          return this.findEntitlementById(entitlementIdNum, pkg.agencyId);
        }
        await conn.execute(
          `UPDATE booking_package_entitlements
           SET sessions_purchased = ?, sessions_remaining = ?, payment_status = ?, status = 'ACTIVE',
               learning_program_class_id = ?, purchaser_user_id = COALESCE(?, purchaser_user_id),
               stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
               activated_at = NOW()
           WHERE id = ?`,
          [
            pkg.sessionCount,
            pkg.sessionCount,
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
             sessions_purchased, sessions_remaining, sessions_reserved, payment_status, status,
             practitioner_entitlement_id, purchaser_user_id, stripe_payment_intent_id,
             activated_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', ?, ?, ?, NOW(), ?)`,
          [
            pkg.agencyId,
            cid,
            pkg.id,
            pkg.learningProgramClassId,
            pkg.businessType,
            pkg.sessionCount,
            pkg.sessionCount,
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
   * consumeOn=reserve: remaining--, reserved++
   * consumeOn=complete: no-op at book time (caller should pass mode='complete' later)
   */
  static async applyAppointmentUsage({
    entitlementId,
    agencyId,
    appointmentId,
    mode = 'reserve',
    actorUserId = null
  } = {}) {
    const ent = await this.findEntitlementById(entitlementId, agencyId);
    if (!ent || ent.status !== 'ACTIVE') {
      throw Object.assign(new Error('Entitlement not available'), { status: 400 });
    }
    const consumeOn = String(ent.consumeOn || 'reserve');
    if (mode === 'reserve' && consumeOn === 'complete') {
      return ent; // defer debit until complete
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT * FROM booking_package_entitlements WHERE id = ? AND agency_id = ? FOR UPDATE`,
        [ent.id, ent.agencyId]
      );
      const row = rows?.[0];
      if (!row || String(row.status) !== 'ACTIVE') {
        throw Object.assign(new Error('Entitlement not available'), { status: 400 });
      }
      const remaining = Number(row.sessions_remaining || 0);
      const reserved = Number(row.sessions_reserved || 0);
      if (mode === 'reserve') {
        if (remaining < 1) throw Object.assign(new Error('No sessions remaining on package'), { status: 400 });
        const nextRemaining = remaining - 1;
        const nextReserved = reserved + 1;
        const nextStatus = nextRemaining <= 0 && nextReserved <= 0 ? 'EXHAUSTED' : 'ACTIVE';
        await conn.execute(
          `UPDATE booking_package_entitlements
           SET sessions_remaining = ?, sessions_reserved = ?, status = ?
           WHERE id = ?`,
          [nextRemaining, nextReserved, nextStatus, ent.id]
        );
        await conn.execute(
          `INSERT INTO booking_package_ledger
            (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
           VALUES (?, ?, ?, ?, 'RESERVE', 1, 'BOOKING_RESERVE', ?)`,
          [ent.agencyId, ent.id, ent.clientId, appointmentId || null, actorUserId || null]
        );
      } else if (mode === 'complete') {
        if (consumeOn === 'reserve') {
          if (reserved < 1) throw Object.assign(new Error('No reserved session to complete'), { status: 400 });
          const nextReserved = reserved - 1;
          const nextStatus = Number(row.sessions_remaining || 0) <= 0 && nextReserved <= 0 ? 'EXHAUSTED' : 'ACTIVE';
          await conn.execute(
            `UPDATE booking_package_entitlements
             SET sessions_reserved = ?, status = ?
             WHERE id = ?`,
            [nextReserved, nextStatus, ent.id]
          );
        } else {
          if (remaining < 1) throw Object.assign(new Error('No sessions remaining on package'), { status: 400 });
          const nextRemaining = remaining - 1;
          const nextStatus = nextRemaining <= 0 ? 'EXHAUSTED' : 'ACTIVE';
          await conn.execute(
            `UPDATE booking_package_entitlements
             SET sessions_remaining = ?, status = ?
             WHERE id = ?`,
            [nextRemaining, nextStatus, ent.id]
          );
        }
        await conn.execute(
          `INSERT INTO booking_package_ledger
            (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
           VALUES (?, ?, ?, ?, 'CONSUME', 1, 'SESSION_COMPLETE', ?)`,
          [ent.agencyId, ent.id, ent.clientId, appointmentId || null, actorUserId || null]
        );
      } else if (mode === 'forfeit') {
        if (consumeOn === 'reserve' || reserved >= 1) {
          if (reserved < 1) {
            await conn.commit();
            return this.findEntitlementById(ent.id, ent.agencyId);
          }
          const nextReserved = reserved - 1;
          const nextStatus = Number(row.sessions_remaining || 0) <= 0 && nextReserved <= 0 ? 'EXHAUSTED' : 'ACTIVE';
          await conn.execute(
            `UPDATE booking_package_entitlements
             SET sessions_reserved = ?, status = ?
             WHERE id = ?`,
            [nextReserved, nextStatus, ent.id]
          );
        } else {
          if (remaining < 1) {
            await conn.commit();
            return this.findEntitlementById(ent.id, ent.agencyId);
          }
          const nextRemaining = remaining - 1;
          const nextStatus = nextRemaining <= 0 ? 'EXHAUSTED' : 'ACTIVE';
          await conn.execute(
            `UPDATE booking_package_entitlements
             SET sessions_remaining = ?, status = ?
             WHERE id = ?`,
            [nextRemaining, nextStatus, ent.id]
          );
        }
        await conn.execute(
          `INSERT INTO booking_package_ledger
            (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
           VALUES (?, ?, ?, ?, 'CONSUME', 1, 'SESSION_NOSHOW_FORFEIT', ?)`,
          [ent.agencyId, ent.id, ent.clientId, appointmentId || null, actorUserId || null]
        );
      } else if (mode === 'release') {
        if (reserved < 1) {
          await conn.commit();
          return this.findEntitlementById(ent.id, ent.agencyId);
        }
        const nextReserved = reserved - 1;
        const nextRemaining = remaining + 1;
        await conn.execute(
          `UPDATE booking_package_entitlements
           SET sessions_remaining = ?, sessions_reserved = ?, status = 'ACTIVE'
           WHERE id = ?`,
          [nextRemaining, nextReserved, ent.id]
        );
        await conn.execute(
          `INSERT INTO booking_package_ledger
            (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
           VALUES (?, ?, ?, ?, 'RELEASE', 1, 'BOOKING_RELEASE', ?)`,
          [ent.agencyId, ent.id, ent.clientId, appointmentId || null, actorUserId || null]
        );
      }
      await conn.commit();
      return this.findEntitlementById(ent.id, ent.agencyId);
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default BookingPackage;
