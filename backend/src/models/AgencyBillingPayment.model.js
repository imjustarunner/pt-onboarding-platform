import pool from '../config/database.js';

class AgencyBillingPayment {
  static async create(payment) {
    const {
      agencyId,
      billingDomain = 'agency_subscription',
      merchantMode = 'agency_managed',
      invoiceId,
      paymentMethodId = null,
      amountCents,
      currency = 'USD',
      paymentStatus = 'PENDING',
      processor = 'UNSET',
      providerConnectionId = null,
      processorCustomerId = null,
      processorPaymentMethodId = null,
      processorChargeId = null,
      processorReferenceId = null,
      processorStatus = null,
      initiatedAt = null,
      authorizedAt = null,
      capturedAt = null,
      failedAt = null,
      failureCode = null,
      failureMessage = null,
      idempotencyKey = null,
      metadataJson = null,
      createdByUserId = null
    } = payment || {};

    const [result] = await pool.execute(
      `INSERT INTO agency_billing_payments
        (agency_id, billing_domain, merchant_mode, invoice_id, payment_method_id, amount_cents, currency, payment_status, processor, provider_connection_id,
         processor_customer_id, processor_payment_method_id, processor_charge_id, processor_reference_id,
         processor_status, initiated_at, authorized_at, captured_at, failed_at, failure_code,
         failure_message, idempotency_key, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        String(billingDomain || 'agency_subscription'),
        String(merchantMode || 'agency_managed'),
        Number(invoiceId),
        paymentMethodId ? Number(paymentMethodId) : null,
        Number(amountCents || 0),
        String(currency || 'USD').trim().slice(0, 3).toUpperCase(),
        String(paymentStatus || 'PENDING').trim().toUpperCase(),
        String(processor || 'UNSET').trim().slice(0, 40).toUpperCase(),
        providerConnectionId ? Number(providerConnectionId) : null,
        processorCustomerId || null,
        processorPaymentMethodId || null,
        processorChargeId || null,
        processorReferenceId || null,
        processorStatus || null,
        initiatedAt || null,
        authorizedAt || null,
        capturedAt || null,
        failedAt || null,
        failureCode || null,
        failureMessage || null,
        idempotencyKey || null,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const pid = Number(id || 0);
    if (!pid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payments
       WHERE id = ?
       LIMIT 1`,
      [pid]
    );
    return rows?.[0] || null;
  }

  static async findByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payments
       WHERE idempotency_key = ?
       LIMIT 1`,
      [String(idempotencyKey)]
    );
    return rows?.[0] || null;
  }

  static async listByInvoice(invoiceId) {
    const iid = Number(invoiceId || 0);
    if (!iid) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payments
       WHERE invoice_id = ?
       ORDER BY created_at DESC, id DESC`,
      [iid]
    );
    return rows || [];
  }

  static async listPendingReconciliation({ limit = 100 } = {}) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_billing_payments
       WHERE payment_status IN ('PENDING', 'PROCESSING')
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [Math.max(1, Number(limit || 100))]
    );
    return rows || [];
  }

  static async updateById(id, patch = {}) {
    const pid = Number(id || 0);
    if (!pid) return null;

    const fields = [];
    const values = [];
    const set = (field, value) => {
      fields.push(`${field} = ?`);
      values.push(value);
    };

    if (patch.payment_status !== undefined) set('payment_status', patch.payment_status ? String(patch.payment_status).trim().toUpperCase() : null);
    if (patch.billing_domain !== undefined) set('billing_domain', patch.billing_domain || null);
    if (patch.merchant_mode !== undefined) set('merchant_mode', patch.merchant_mode || null);
    if (patch.payment_method_id !== undefined) set('payment_method_id', patch.payment_method_id ? Number(patch.payment_method_id) : null);
    if (patch.processor !== undefined) set('processor', patch.processor ? String(patch.processor).trim().toUpperCase() : null);
    if (patch.provider_connection_id !== undefined) set('provider_connection_id', patch.provider_connection_id ? Number(patch.provider_connection_id) : null);
    if (patch.processor_customer_id !== undefined) set('processor_customer_id', patch.processor_customer_id || null);
    if (patch.processor_payment_method_id !== undefined) set('processor_payment_method_id', patch.processor_payment_method_id || null);
    if (patch.processor_charge_id !== undefined) set('processor_charge_id', patch.processor_charge_id || null);
    if (patch.processor_reference_id !== undefined) set('processor_reference_id', patch.processor_reference_id || null);
    if (patch.processor_status !== undefined) set('processor_status', patch.processor_status || null);
    if (patch.initiated_at !== undefined) set('initiated_at', patch.initiated_at || null);
    if (patch.authorized_at !== undefined) set('authorized_at', patch.authorized_at || null);
    if (patch.captured_at !== undefined) set('captured_at', patch.captured_at || null);
    if (patch.failed_at !== undefined) set('failed_at', patch.failed_at || null);
    if (patch.failure_code !== undefined) set('failure_code', patch.failure_code || null);
    if (patch.failure_message !== undefined) set('failure_message', patch.failure_message || null);
    if (patch.metadata_json !== undefined) set('metadata_json', patch.metadata_json ? JSON.stringify(patch.metadata_json) : null);

    if (!fields.length) return this.findById(pid);
    values.push(pid);
    await pool.execute(
      `UPDATE agency_billing_payments
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      values
    );
    return this.findById(pid);
  }
}

export default AgencyBillingPayment;
