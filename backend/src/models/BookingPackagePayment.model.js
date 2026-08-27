import pool from '../config/database.js';

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function mapPayment(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    clientId: Number(r.client_id),
    entitlementId: r.entitlement_id == null ? null : Number(r.entitlement_id),
    packageId: r.package_id == null ? null : Number(r.package_id),
    amountCents: Number(r.amount_cents || 0),
    currency: String(r.currency || 'usd'),
    paymentMode: r.payment_mode || null,
    paymentStatus: String(r.payment_status || 'PENDING'),
    processor: String(r.processor || 'STRIPE'),
    processorIntentId: r.processor_intent_id || null,
    processorChargeId: r.processor_charge_id || null,
    paidAt: r.paid_at || null,
    metadata: parseJson(r.metadata_json, null),
    idempotencyKey: r.idempotency_key || null,
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

class BookingPackagePayment {
  static async findById(id) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM booking_package_payments WHERE id = ? LIMIT 1`,
      [pid]
    );
    return mapPayment(rows?.[0]);
  }

  static async findByIntentId(intentId) {
    const intent = String(intentId || '').trim();
    if (!intent) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM booking_package_payments WHERE processor_intent_id = ? ORDER BY id DESC LIMIT 1`,
      [intent]
    );
    return mapPayment(rows?.[0]);
  }

  static async create({
    agencyId,
    clientId,
    entitlementId = null,
    packageId = null,
    amountCents = 0,
    currency = 'usd',
    paymentMode = 'PAY_IN_FULL',
    paymentStatus = 'PENDING',
    processor = 'STRIPE',
    processorIntentId = null,
    processorChargeId = null,
    paidAt = null,
    metadata = null,
    idempotencyKey = null,
    createdByUserId = null
  } = {}) {
    const [result] = await pool.execute(
      `INSERT INTO booking_package_payments
        (agency_id, client_id, entitlement_id, package_id, amount_cents, currency,
         payment_mode, payment_status, processor, processor_intent_id, processor_charge_id,
         paid_at, metadata_json, idempotency_key, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(clientId),
        entitlementId || null,
        packageId || null,
        Math.max(0, Number(amountCents) || 0),
        String(currency || 'usd').toLowerCase(),
        paymentMode || null,
        paymentStatus || 'PENDING',
        processor || 'STRIPE',
        processorIntentId || null,
        processorChargeId || null,
        paidAt || null,
        metadata == null ? null : JSON.stringify(metadata),
        idempotencyKey || null,
        createdByUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch = {}) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const paymentStatus = patch.paymentStatus ?? patch.payment_status ?? existing.paymentStatus;
    const entitlementId =
      patch.entitlementId !== undefined || patch.entitlement_id !== undefined
        ? (patch.entitlementId ?? patch.entitlement_id)
        : existing.entitlementId;
    const processorIntentId =
      patch.processorIntentId !== undefined || patch.processor_intent_id !== undefined
        ? (patch.processorIntentId ?? patch.processor_intent_id)
        : existing.processorIntentId;
    const processorChargeId =
      patch.processorChargeId !== undefined || patch.processor_charge_id !== undefined
        ? (patch.processorChargeId ?? patch.processor_charge_id)
        : existing.processorChargeId;
    const paidAt = patch.paidAt !== undefined || patch.paid_at !== undefined
      ? (patch.paidAt ?? patch.paid_at)
      : existing.paidAt;
    const metadata = patch.metadata !== undefined || patch.metadata_json !== undefined
      ? (patch.metadata ?? patch.metadata_json)
      : existing.metadata;
    await pool.execute(
      `UPDATE booking_package_payments
       SET entitlement_id = ?, payment_status = ?, processor_intent_id = ?,
           processor_charge_id = ?, paid_at = ?, metadata_json = ?
       WHERE id = ?`,
      [
        entitlementId || null,
        paymentStatus,
        processorIntentId || null,
        processorChargeId || null,
        paidAt || null,
        metadata == null ? null : JSON.stringify(metadata),
        existing.id
      ]
    );
    return this.findById(existing.id);
  }

  static async listForClient(agencyId, clientId, { limit = 50 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM booking_package_payments
       WHERE agency_id = ? AND client_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [Number(agencyId), Number(clientId), Math.min(200, Math.max(1, Number(limit) || 50))]
    );
    return (rows || []).map(mapPayment);
  }
}

export default BookingPackagePayment;
