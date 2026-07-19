import pool from '../config/database.js';
import AgencyBusinessType from './AgencyBusinessType.model.js';

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function mapPackage(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    businessType: String(r.business_type),
    name: String(r.name || ''),
    description: r.description || null,
    sessionCount: Number(r.session_count || 0),
    priceCents: Number(r.price_cents || 0),
    allowedTenantServiceIds: parseJson(r.allowed_tenant_service_ids_json, null),
    consumeOn: String(r.consume_on || 'reserve'),
    isActive: Number(r.is_active) === 1,
    sortOrder: Number(r.sort_order || 0),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapEntitlement(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    clientId: Number(r.client_id),
    packageId: Number(r.package_id),
    businessType: String(r.business_type),
    sessionsPurchased: Number(r.sessions_purchased || 0),
    sessionsRemaining: Number(r.sessions_remaining || 0),
    sessionsReserved: Number(r.sessions_reserved || 0),
    paymentStatus: String(r.payment_status || 'PENDING'),
    status: String(r.status || 'ACTIVE'),
    practitionerEntitlementId: r.practitioner_entitlement_id == null ? null : Number(r.practitioner_entitlement_id),
    activatedAt: r.activated_at || null,
    packageName: r.package_name != null ? String(r.package_name) : undefined,
    consumeOn: r.consume_on != null ? String(r.consume_on) : undefined,
    allowedTenantServiceIds: r.allowed_tenant_service_ids_json != null
      ? parseJson(r.allowed_tenant_service_ids_json, null)
      : undefined
  };
}

class BookingPackage {
  static async listForAgency(agencyId, { includeInactive = false, businessType = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const params = [aid];
    let sql = `SELECT * FROM booking_packages WHERE agency_id = ?`;
    if (!includeInactive) sql += ` AND is_active = 1`;
    const bt = AgencyBusinessType.normalizeType(businessType);
    if (bt) {
      sql += ` AND business_type = ?`;
      params.push(bt);
    }
    sql += ` ORDER BY sort_order ASC, name ASC`;
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map(mapPackage);
  }

  static async findById(id, agencyId = null) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const params = [pid];
    let sql = `SELECT * FROM booking_packages WHERE id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
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
    const [result] = await pool.execute(
      `INSERT INTO booking_packages
        (agency_id, business_type, name, description, session_count, price_cents,
         allowed_tenant_service_ids_json, consume_on, is_active, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        aid,
        businessType,
        name,
        data.description || null,
        sessionCount,
        priceCents,
        allowed == null ? null : JSON.stringify(allowed),
        consumeOn,
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
    await pool.execute(
      `UPDATE booking_packages
       SET business_type = ?, name = ?, description = ?, session_count = ?, price_cents = ?,
           allowed_tenant_service_ids_json = ?, consume_on = ?, is_active = ?, sort_order = ?
       WHERE id = ? AND agency_id = ?`,
      [
        businessType,
        name,
        data.description !== undefined ? (data.description || null) : existing.description,
        Math.max(1, Number(data.sessionCount ?? data.session_count ?? existing.sessionCount) || 1),
        Math.max(0, Number(data.priceCents ?? data.price_cents ?? existing.priceCents) || 0),
        allowed == null ? null : JSON.stringify(allowed),
        consumeOn,
        isActive ? 1 : 0,
        Number(data.sortOrder ?? data.sort_order ?? existing.sortOrder) || 0,
        existing.id,
        existing.agencyId
      ]
    );
    return this.findById(existing.id, existing.agencyId);
  }

  static async listEntitlementsForClient(agencyId, clientId, { status = 'ACTIVE' } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const params = [aid, cid];
    let sql = `
      SELECT e.*, p.name AS package_name, p.consume_on, p.allowed_tenant_service_ids_json
      FROM booking_package_entitlements e
      JOIN booking_packages p ON p.id = e.package_id
      WHERE e.agency_id = ? AND e.client_id = ?`;
    if (status) {
      sql += ` AND e.status = ?`;
      params.push(String(status));
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
      SELECT e.*, p.name AS package_name, p.consume_on, p.allowed_tenant_service_ids_json
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

  static async activateEntitlement({
    agencyId,
    clientId,
    packageId,
    paymentStatus = 'PAID',
    createdByUserId = null,
    practitionerEntitlementId = null
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
      const [result] = await conn.execute(
        `INSERT INTO booking_package_entitlements
          (agency_id, client_id, package_id, business_type, sessions_purchased, sessions_remaining,
           sessions_reserved, payment_status, status, practitioner_entitlement_id, activated_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', ?, NOW(), ?)`,
        [
          pkg.agencyId,
          cid,
          pkg.id,
          pkg.businessType,
          pkg.sessionCount,
          pkg.sessionCount,
          String(paymentStatus || 'PAID'),
          practitionerEntitlementId || null,
          createdByUserId || null
        ]
      );
      const entitlementId = Number(result.insertId);
      await conn.execute(
        `INSERT INTO booking_package_ledger
          (agency_id, entitlement_id, client_id, appointment_id, direction, quantity, reason_code, created_by_user_id)
         VALUES (?, ?, ?, NULL, 'CREDIT', ?, 'PACKAGE_PURCHASE', ?)`,
        [pkg.agencyId, entitlementId, cid, pkg.sessionCount, createdByUserId || null]
      );
      await conn.commit();
      return this.findEntitlementById(entitlementId, pkg.agencyId);
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
