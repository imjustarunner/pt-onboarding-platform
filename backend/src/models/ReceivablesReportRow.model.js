import pool from '../config/database.js';

class ReceivablesReportRow {
  static async bulkUpsert(rows) {
    if (!rows || rows.length === 0) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        r.uploadId,
        r.agencyId,
        r.serviceDate || null,
        r.rowFingerprint,

        r.patientNameCiphertextB64 || null,
        r.patientNameIvB64 || null,
        r.patientNameAuthTagB64 || null,
        r.patientNameKeyId || null,

        r.payerNameCiphertextB64 || null,
        r.payerNameIvB64 || null,
        r.payerNameAuthTagB64 || null,
        r.payerNameKeyId || null,

        r.claimIdCiphertextB64 || null,
        r.claimIdIvB64 || null,
        r.claimIdAuthTagB64 || null,
        r.claimIdKeyId || null,

        r.patientBalanceStatus || null,
        r.rowType || null,
        r.paymentType || null,

        Number(r.patientResponsibilityAmount || 0),
        Number(r.patientAmountPaid || 0),
        Number(r.patientOutstandingAmount || 0)
      ]);
    }

    const placeholders = values
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(',');
    const flat = values.flat();

    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_report_rows
       (upload_id, agency_id, service_date, row_fingerprint,
        patient_name_ciphertext_b64, patient_name_iv_b64, patient_name_auth_tag_b64, patient_name_key_id,
        payer_name_ciphertext_b64, payer_name_iv_b64, payer_name_auth_tag_b64, payer_name_key_id,
        claim_id_ciphertext_b64, claim_id_iv_b64, claim_id_auth_tag_b64, claim_id_key_id,
        patient_balance_status, row_type, payment_type,
        patient_responsibility_amount, patient_amount_paid, patient_outstanding_amount)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         upload_id = VALUES(upload_id),
         service_date = VALUES(service_date),
         patient_balance_status = VALUES(patient_balance_status),
         row_type = VALUES(row_type),
         payment_type = VALUES(payment_type),
         patient_responsibility_amount = VALUES(patient_responsibility_amount),
         patient_amount_paid = VALUES(patient_amount_paid),
         patient_outstanding_amount = VALUES(patient_outstanding_amount),
         patient_name_ciphertext_b64 = VALUES(patient_name_ciphertext_b64),
         patient_name_iv_b64 = VALUES(patient_name_iv_b64),
         patient_name_auth_tag_b64 = VALUES(patient_name_auth_tag_b64),
         patient_name_key_id = VALUES(patient_name_key_id),
         payer_name_ciphertext_b64 = VALUES(payer_name_ciphertext_b64),
         payer_name_iv_b64 = VALUES(payer_name_iv_b64),
         payer_name_auth_tag_b64 = VALUES(payer_name_auth_tag_b64),
         payer_name_key_id = VALUES(payer_name_key_id),
         claim_id_ciphertext_b64 = VALUES(claim_id_ciphertext_b64),
         claim_id_iv_b64 = VALUES(claim_id_iv_b64),
         claim_id_auth_tag_b64 = VALUES(claim_id_auth_tag_b64),
         claim_id_key_id = VALUES(claim_id_key_id)`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listOutstanding({ agencyId, startYmd = null, endYmd = null, minOutstanding = 0.01, limit = 200, offset = 0 }) {
    const lim = Math.max(0, Math.min(1000, parseInt(limit, 10) || 200));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const where = ['r.agency_id = ?', 'r.patient_outstanding_amount >= ?'];
    const params = [agencyId, Number(minOutstanding || 0)];
    if (startYmd) {
      where.push('r.service_date >= ?');
      params.push(String(startYmd).slice(0, 10));
    }
    if (endYmd) {
      where.push('r.service_date <= ?');
      params.push(String(endYmd).slice(0, 10));
    }

    const [rows] = await pool.execute(
      `SELECT
         r.id,
         r.service_date,
         r.patient_balance_status,
         r.patient_responsibility_amount,
         r.patient_amount_paid,
         r.patient_outstanding_amount,
         r.row_type,
         r.payment_type,
         r.patient_name_ciphertext_b64,
         r.patient_name_iv_b64,
         r.patient_name_auth_tag_b64,
         r.patient_name_key_id,
         r.payer_name_ciphertext_b64,
         r.payer_name_iv_b64,
         r.payer_name_auth_tag_b64,
         r.payer_name_key_id,
         r.claim_id_ciphertext_b64,
         r.claim_id_iv_b64,
         r.claim_id_auth_tag_b64,
         r.claim_id_key_id
       FROM agency_receivables_report_rows r
       WHERE ${where.join(' AND ')}
       ORDER BY r.service_date ASC, r.id ASC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    return rows || [];
  }
}

export default ReceivablesReportRow;

