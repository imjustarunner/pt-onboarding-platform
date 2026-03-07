import pool from '../config/database.js';

class AgencyCommunicationUsageLedger {
  static async upsertEvent(event) {
    const {
      agencyId,
      invoiceId = null,
      sourceKey,
      sourceType,
      sourceId = null,
      eventType,
      usageQuantity = 0,
      usageUnit = 'count',
      currency = 'USD',
      actualCostCents = 0,
      markupCents = 0,
      billableAmountCents = 0,
      occurredAt,
      billingPeriodStart,
      billingPeriodEnd,
      isInvoiced = false,
      metadataJson = null
    } = event || {};
    if (!Number(agencyId) || !sourceKey || !sourceType || !eventType || !occurredAt || !billingPeriodStart || !billingPeriodEnd) {
      throw new Error('Missing required communications ledger fields');
    }
    await pool.execute(
      `INSERT INTO agency_communication_usage_ledger
        (agency_id, invoice_id, source_key, source_type, source_id, event_type,
         usage_quantity, usage_unit, currency, actual_cost_cents, markup_cents, billable_amount_cents,
         occurred_at, billing_period_start, billing_period_end, is_invoiced, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         invoice_id = VALUES(invoice_id),
         source_type = VALUES(source_type),
         source_id = VALUES(source_id),
         event_type = VALUES(event_type),
         usage_quantity = VALUES(usage_quantity),
         usage_unit = VALUES(usage_unit),
         currency = VALUES(currency),
         actual_cost_cents = VALUES(actual_cost_cents),
         markup_cents = VALUES(markup_cents),
         billable_amount_cents = VALUES(billable_amount_cents),
         occurred_at = VALUES(occurred_at),
         billing_period_start = VALUES(billing_period_start),
         billing_period_end = VALUES(billing_period_end),
         is_invoiced = VALUES(is_invoiced),
         metadata_json = VALUES(metadata_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        Number(agencyId),
        invoiceId ? Number(invoiceId) : null,
        String(sourceKey).trim().slice(0, 191),
        String(sourceType).trim().slice(0, 64),
        sourceId == null ? null : Number(sourceId),
        String(eventType).trim().slice(0, 64),
        Number(usageQuantity || 0),
        String(usageUnit || 'count').trim().slice(0, 32),
        String(currency || 'USD').trim().slice(0, 3).toUpperCase(),
        Math.round(Number(actualCostCents || 0)),
        Math.round(Number(markupCents || 0)),
        Math.round(Number(billableAmountCents || 0)),
        occurredAt,
        billingPeriodStart,
        billingPeriodEnd,
        isInvoiced ? 1 : 0,
        metadataJson ? JSON.stringify(metadataJson) : null
      ]
    );
    return this.findBySourceKey(sourceKey);
  }

  static async findBySourceKey(sourceKey) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_communication_usage_ledger
       WHERE source_key = ?
       LIMIT 1`,
      [String(sourceKey || '').trim().slice(0, 191)]
    );
    return rows?.[0] || null;
  }

  static async listForAgencyPeriod(agencyId, { periodStart, periodEnd }) {
    const aid = Number(agencyId || 0);
    if (!aid || !periodStart || !periodEnd) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_communication_usage_ledger
       WHERE agency_id = ?
         AND billing_period_start = ?
         AND billing_period_end = ?
       ORDER BY occurred_at ASC, id ASC`,
      [aid, String(periodStart).slice(0, 10), String(periodEnd).slice(0, 10)]
    );
    return rows || [];
  }

  static async summarizeForAgencyPeriod(agencyId, { periodStart, periodEnd }) {
    const aid = Number(agencyId || 0);
    if (!aid || !periodStart || !periodEnd) return [];
    const [rows] = await pool.execute(
      `SELECT
         event_type,
         usage_unit,
         SUM(COALESCE(usage_quantity, 0)) AS quantity,
         SUM(COALESCE(actual_cost_cents, 0)) AS actual_cost_cents,
         SUM(COALESCE(markup_cents, 0)) AS markup_cents,
         SUM(COALESCE(billable_amount_cents, 0)) AS billable_amount_cents,
         COUNT(*) AS event_count
       FROM agency_communication_usage_ledger
       WHERE agency_id = ?
         AND billing_period_start = ?
         AND billing_period_end = ?
       GROUP BY event_type, usage_unit
       ORDER BY event_type ASC`,
      [aid, String(periodStart).slice(0, 10), String(periodEnd).slice(0, 10)]
    );
    return rows || [];
  }

  static async attachInvoiceToPeriod(agencyId, { periodStart, periodEnd, invoiceId }) {
    const aid = Number(agencyId || 0);
    const invId = Number(invoiceId || 0);
    if (!aid || !invId || !periodStart || !periodEnd) return;
    await pool.execute(
      `UPDATE agency_communication_usage_ledger
       SET invoice_id = ?,
           is_invoiced = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ?
         AND billing_period_start = ?
         AND billing_period_end = ?`,
      [invId, aid, String(periodStart).slice(0, 10), String(periodEnd).slice(0, 10)]
    );
  }
}

export default AgencyCommunicationUsageLedger;
