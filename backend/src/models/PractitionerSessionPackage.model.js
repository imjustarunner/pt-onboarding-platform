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

function defaultMissedPolicy() {
  return {
    type: 'forfeit', // fee | free_rebook | forfeit | custom
    freeRebooks: 0,
    feeCents: 0,
    note: ''
  };
}

function defaultAllowedModes() {
  return ['PAY_IN_FULL', 'INSTALLMENTS', 'PER_SESSION'];
}

class PractitionerSessionPackage {
  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      session_count: Number(row.session_count || 0),
      price_cents: Number(row.price_cents || 0),
      pay_in_full_price_cents:
        row.pay_in_full_price_cents == null ? null : Number(row.pay_in_full_price_cents),
      pay_in_full_discount_cents:
        row.pay_in_full_discount_cents == null ? null : Number(row.pay_in_full_discount_cents),
      per_session_price_cents:
        row.per_session_price_cents == null ? null : Number(row.per_session_price_cents),
      installment_plan: parseJson(row.installment_plan_json, null),
      allowed_payment_modes: parseJson(row.allowed_payment_modes_json, defaultAllowedModes()),
      missed_session_policy: parseJson(row.missed_session_policy_json, defaultMissedPolicy()),
      is_active: !!row.is_active
    };
  }

  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const params = [Number(agencyId)];
    let sql = `SELECT * FROM practitioner_session_packages WHERE agency_id = ?`;
    if (!includeInactive) sql += ' AND is_active = 1';
    sql += ' ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM practitioner_session_packages WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    return this.hydrate(rows?.[0] || null);
  }

  static async create(data) {
    const allowed = Array.isArray(data.allowedPaymentModes)
      ? data.allowedPaymentModes
      : defaultAllowedModes();
    const missed = data.missedSessionPolicy || defaultMissedPolicy();
    const [result] = await pool.execute(
      `INSERT INTO practitioner_session_packages
        (agency_id, name, description, session_count, price_cents, payment_mode_default,
         pay_in_full_price_cents, pay_in_full_discount_cents, installment_plan_json,
         per_session_price_cents, allowed_payment_modes_json, missed_session_policy_json,
         is_active, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(data.agencyId),
        String(data.name || '').trim(),
        data.description ? String(data.description).trim() : null,
        Math.max(1, Number(data.sessionCount || 1)),
        Math.max(0, Number(data.priceCents || 0)),
        String(data.paymentModeDefault || 'PAY_IN_FULL').toUpperCase(),
        data.payInFullPriceCents == null ? null : Number(data.payInFullPriceCents),
        data.payInFullDiscountCents == null ? null : Number(data.payInFullDiscountCents),
        data.installmentPlan ? JSON.stringify(data.installmentPlan) : null,
        data.perSessionPriceCents == null ? null : Number(data.perSessionPriceCents),
        JSON.stringify(allowed),
        JSON.stringify(missed),
        data.isActive === false ? 0 : 1,
        Number(data.sortOrder || 0),
        data.createdByUserId ? Number(data.createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, data = {}) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const name = data.name !== undefined ? String(data.name).trim() : existing.name;
    const description =
      data.description !== undefined
        ? data.description
          ? String(data.description).trim()
          : null
        : existing.description;
    const sessionCount =
      data.sessionCount !== undefined
        ? Math.max(1, Number(data.sessionCount || 1))
        : existing.session_count;
    const priceCents =
      data.priceCents !== undefined ? Math.max(0, Number(data.priceCents || 0)) : existing.price_cents;
    const paymentModeDefault =
      data.paymentModeDefault !== undefined
        ? String(data.paymentModeDefault).toUpperCase()
        : existing.payment_mode_default;
    const payInFullPriceCents =
      data.payInFullPriceCents !== undefined
        ? data.payInFullPriceCents == null
          ? null
          : Number(data.payInFullPriceCents)
        : existing.pay_in_full_price_cents;
    const payInFullDiscountCents =
      data.payInFullDiscountCents !== undefined
        ? data.payInFullDiscountCents == null
          ? null
          : Number(data.payInFullDiscountCents)
        : existing.pay_in_full_discount_cents;
    const installmentPlan =
      data.installmentPlan !== undefined ? data.installmentPlan : existing.installment_plan;
    const perSessionPriceCents =
      data.perSessionPriceCents !== undefined
        ? data.perSessionPriceCents == null
          ? null
          : Number(data.perSessionPriceCents)
        : existing.per_session_price_cents;
    const allowed =
      data.allowedPaymentModes !== undefined
        ? data.allowedPaymentModes
        : existing.allowed_payment_modes;
    const missed =
      data.missedSessionPolicy !== undefined
        ? data.missedSessionPolicy
        : existing.missed_session_policy;
    const isActive =
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active ? 1 : 0;
    const sortOrder =
      data.sortOrder !== undefined ? Number(data.sortOrder || 0) : existing.sort_order;

    await pool.execute(
      `UPDATE practitioner_session_packages
       SET name = ?, description = ?, session_count = ?, price_cents = ?, payment_mode_default = ?,
           pay_in_full_price_cents = ?, pay_in_full_discount_cents = ?, installment_plan_json = ?,
           per_session_price_cents = ?, allowed_payment_modes_json = ?, missed_session_policy_json = ?,
           is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name,
        description,
        sessionCount,
        priceCents,
        paymentModeDefault,
        payInFullPriceCents,
        payInFullDiscountCents,
        installmentPlan ? JSON.stringify(installmentPlan) : null,
        perSessionPriceCents,
        JSON.stringify(allowed || defaultAllowedModes()),
        JSON.stringify(missed || defaultMissedPolicy()),
        isActive,
        sortOrder,
        Number(id)
      ]
    );
    return this.findById(id);
  }
}

export default PractitionerSessionPackage;
