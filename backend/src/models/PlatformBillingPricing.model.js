import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) {
    const s = v.toString('utf8').trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') {
    return Array.isArray(v) ? null : v;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

class PlatformBillingPricing {
  static SINGLETON_ID = 1;

  static async getSingletonRow() {
    const [rows] = await pool.execute(
      `SELECT * FROM platform_billing_pricing WHERE id = ? LIMIT 1`,
      [PlatformBillingPricing.SINGLETON_ID]
    );
    return rows[0] || null;
  }

  static async getPricingJson() {
    const row = await this.getSingletonRow();
    const pricing = parseJsonMaybe(row?.pricing_json);
    return pricing || null;
  }

  static async upsertPricingJson(pricingJson) {
    await pool.execute(
      `INSERT INTO platform_billing_pricing (id, pricing_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE pricing_json = VALUES(pricing_json), updated_at = CURRENT_TIMESTAMP`,
      [PlatformBillingPricing.SINGLETON_ID, JSON.stringify(pricingJson)]
    );
    return this.getPricingJson();
  }
}

export default PlatformBillingPricing;

