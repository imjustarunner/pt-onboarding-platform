import pool from '../config/database.js';

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

class PayrollManualPayLine {
  static async _hasColumn(colName) {
    try {
      const [rows] = await pool.execute(
        `SELECT 1 AS ok
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payroll_manual_pay_lines'
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [colName]
      );
      return Boolean(rows?.[0]?.ok);
    } catch {
      return false;
    }
  }

  static async _hasCreditsHoursColumn() {
    return this._hasColumn('credits_hours');
  }

  static async _hasMetadataJsonColumn() {
    return this._hasColumn('metadata_json');
  }

  static async listForPeriod(args) {
    // Supports:
    // - listForPeriod(payrollPeriodId)
    // - listForPeriod({ payrollPeriodId, agencyId })
    const payrollPeriodId =
      (typeof args === 'object' && args !== null)
        ? Number(args.payrollPeriodId || args.payroll_period_id || 0)
        : Number(args || 0);
    const agencyId =
      (typeof args === 'object' && args !== null)
        ? Number(args.agencyId || args.agency_id || 0)
        : 0;

    if (!payrollPeriodId) return [];

    const hasMetadataJson = await this._hasMetadataJsonColumn();
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ?
         ${agencyId ? 'AND agency_id = ?' : ''}
       ORDER BY id ASC`,
      agencyId ? [payrollPeriodId, agencyId] : [payrollPeriodId]
    );
    return (rows || []).map((row) => ({
      ...row,
      ...(hasMetadataJson ? { metadata_json: parseJsonMaybe(row?.metadata_json) } : {})
    }));
  }

  static async create({
    payrollPeriodId,
    agencyId,
    userId,
    lineType = 'pay',
    ptoBucket = null,
    label,
    category = 'indirect',
    creditsHours = null,
    metadataJson = null,
    amount,
    createdByUserId
  }) {
    const lt = String(lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
    const ptoB = (String(ptoBucket || '').trim().toLowerCase() === 'training') ? 'training' : 'sick';
    const cat = String(category || 'indirect').trim().toLowerCase();
    const safeCat = (cat === 'indirect') ? 'indirect' : 'direct';
    const hasCredits = await this._hasCreditsHoursColumn();
    const hasLineType = await this._hasColumn('line_type');
    const hasPtoBucket = await this._hasColumn('pto_bucket');
    const hasMetadataJson = await this._hasMetadataJsonColumn();
    const hrsRaw = creditsHours === null || creditsHours === undefined || creditsHours === '' ? null : Number(creditsHours);
    const safeHrs = Number.isFinite(hrsRaw) ? Math.round(hrsRaw * 100) / 100 : null;
    const cols = ['payroll_period_id', 'agency_id', 'user_id'];
    const vals = [payrollPeriodId, agencyId, userId];
    if (hasLineType) {
      cols.push('line_type');
      vals.push(lt);
    }
    if (hasPtoBucket) {
      cols.push('pto_bucket');
      vals.push(lt === 'pto' ? ptoB : null);
    }
    cols.push('label', 'category');
    vals.push(label, safeCat);
    if (hasCredits) {
      cols.push('credits_hours');
      vals.push(safeHrs);
    }
    if (hasMetadataJson) {
      cols.push('metadata_json');
      vals.push(metadataJson && typeof metadataJson === 'object' ? JSON.stringify(metadataJson) : null);
    }
    cols.push('amount', 'created_by_user_id');
    vals.push(amount, createdByUserId);
    const placeholders = cols.map(() => '?').join(', ');
    const [res] = await pool.execute(
      `INSERT INTO payroll_manual_pay_lines
       (${cols.join(', ')})
       VALUES (${placeholders})`,
      vals
    );
    return res?.insertId || null;
  }

  static async updateById({ id, payrollPeriodId, agencyId, creditsHours, amount }) {
    if (!id || !payrollPeriodId || !agencyId) return false;
    const hasCredits = await this._hasCreditsHoursColumn();
    const updates = [];
    const params = [];
    if (creditsHours !== undefined && creditsHours !== null) {
      const hrs = Number(creditsHours);
      if (Number.isFinite(hrs) && hrs >= 0) {
        if (hasCredits) {
          updates.push('credits_hours = ?');
          params.push(Math.round(hrs * 100) / 100);
        }
      }
    }
    if (amount !== undefined && amount !== null) {
      const amt = Number(amount);
      if (Number.isFinite(amt)) {
        updates.push('amount = ?');
        params.push(Math.round(amt * 100) / 100);
      }
    }
    if (!updates.length) return false;
    params.push(id, payrollPeriodId, agencyId);
    const [res] = await pool.execute(
      `UPDATE payroll_manual_pay_lines SET ${updates.join(', ')}
       WHERE id = ? AND payroll_period_id = ? AND agency_id = ?`,
      params
    );
    return (res?.affectedRows || 0) > 0;
  }

  static async sumByUserForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT user_id, COALESCE(SUM(amount), 0) AS amount
       FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ? AND agency_id = ?
       GROUP BY user_id`,
      [payrollPeriodId, agencyId]
    );
    return rows || [];
  }

  static async listForPeriodGroupedByUser({ payrollPeriodId, agencyId }) {
    const lines = await this.listForPeriod({ payrollPeriodId, agencyId });
    const byUserId = new Map();
    for (const l of lines || []) {
      const uid = Number(l?.user_id || 0);
      if (!uid) continue;
      if (!byUserId.has(uid)) byUserId.set(uid, []);
      byUserId.get(uid).push({
        id: Number(l?.id || 0),
        lineType: String(l?.line_type || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay',
        ptoBucket: (String(l?.pto_bucket || '').trim().toLowerCase() === 'training') ? 'training' : 'sick',
        label: String(l?.label || ''),
        category: String(l?.category || 'direct').trim().toLowerCase() === 'indirect' ? 'indirect' : 'direct',
        creditsHours:
          (l?.credits_hours === null || l?.credits_hours === undefined || l?.credits_hours === '')
            ? null
            : Number(l?.credits_hours),
        amount: Number(l?.amount || 0),
        metadataJson: parseJsonMaybe(l?.metadata_json)
      });
    }
    return { byUserId };
  }

  static async replaceForPeriod({ payrollPeriodId, agencyId, rows, createdByUserId }) {
    // Replace everything for the period. Intended for staging UI "Save manual lines".
    await pool.execute(
      `DELETE FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ? AND agency_id = ?`,
      [payrollPeriodId, agencyId]
    );

    const clean = [];
    for (const r of rows || []) {
      const userId = Number(r?.userId || r?.user_id || 0);
      const label = String(r?.label || '').trim();
      const cat = String(r?.category || 'indirect').trim().toLowerCase();
      const category = (cat === 'indirect') ? 'indirect' : 'direct';
      const amount = Number(r?.amount);
      const metadataJson =
        r?.metadataJson && typeof r.metadataJson === 'object'
          ? r.metadataJson
          : null;
      const hrsRaw = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '' || r?.credits_hours === null || r?.credits_hours === undefined || r?.credits_hours === '')
        ? null
        : Number(r?.creditsHours ?? r?.credits_hours);
      if (!Number.isFinite(userId) || userId <= 0) continue;
      if (!label) continue;
      if (label.length > 128) continue;
      if (!Number.isFinite(amount)) continue;
      if (hrsRaw !== null && (!Number.isFinite(hrsRaw) || hrsRaw < 0)) continue;
      // Allow negative amounts for corrections.
      clean.push({
        userId,
        label,
        category,
        creditsHours: (hrsRaw === null ? null : Number((Math.round(hrsRaw * 100) / 100).toFixed(2))),
        metadataJson,
        amount: Number(amount.toFixed(2))
      });
    }

    if (!clean.length) return [];

    const hasCredits = await this._hasCreditsHoursColumn();
    const hasMetadataJson = await this._hasMetadataJsonColumn();
    const cols = ['payroll_period_id', 'agency_id', 'user_id', 'label', 'category'];
    if (hasCredits) cols.push('credits_hours');
    if (hasMetadataJson) cols.push('metadata_json');
    cols.push('amount', 'created_by_user_id');
    const placeholders = clean.map(() => `(${cols.map(() => '?').join(', ')})`).join(',');
    const params = [];
    for (const r of clean) {
      params.push(
        payrollPeriodId,
        agencyId,
        r.userId,
        r.label,
        r.category,
        ...(hasCredits ? [r.creditsHours] : []),
        ...(hasMetadataJson ? [r.metadataJson ? JSON.stringify(r.metadataJson) : null] : []),
        r.amount,
        createdByUserId
      );
    }
    await pool.execute(
      `INSERT INTO payroll_manual_pay_lines
       (${cols.join(', ')})
       VALUES ${placeholders}`,
      params
    );

    return this.listForPeriod({ payrollPeriodId, agencyId });
  }
}

export default PayrollManualPayLine;
