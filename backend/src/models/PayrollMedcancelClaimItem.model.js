import pool from '../config/database.js';

class PayrollMedcancelClaimItem {
  static async createMany({ claimId, items }) {
    if (!claimId) return [];
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return [];

    const values = [];
    const placeholders = [];
    for (const it of rows) {
      placeholders.push('(?, ?, ?, ?, ?, ?)');
      values.push(
        Number(claimId),
        String(it.missedServiceCode || '').slice(0, 16),
        String(it.clientInitials || '').trim().slice(0, 16) || null,
        String(it.sessionTime || '').trim().slice(0, 16) || null,
        String(it.note || ''),
        it.attestation ? 1 : 0
      );
    }

    await pool.execute(
      `INSERT INTO payroll_medcancel_claim_items
       (claim_id, missed_service_code, client_initials, session_time, note, attestation)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    return this.listForClaim(claimId);
  }

  static async listForClaim(claimId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_medcancel_claim_items
       WHERE claim_id = ?
       ORDER BY id ASC`,
      [Number(claimId)]
    );
    return rows || [];
  }
}

export default PayrollMedcancelClaimItem;

