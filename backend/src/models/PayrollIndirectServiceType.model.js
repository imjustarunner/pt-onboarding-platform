import pool from '../config/database.js';
import { normalizePayBucket } from '../utils/hourlyDualRateContract.js';

export const DEFAULT_INDIRECT_SERVICE_TYPES = [
  // Indirect Service Time (hourly)
  { typeKey: 'clinical_documentation', label: 'Clinical Documentation', description: 'Clinical documentation and charting', iconKey: 'file-text', payBucket: 'indirect', sortOrder: 10, displayCode: 'IND-01' },
  { typeKey: 'treatment_planning_svc', label: 'Treatment Planning', description: 'Treatment planning (non-billable)', iconKey: 'clipboard', payBucket: 'indirect', sortOrder: 20, displayCode: 'IND-02' },
  { typeKey: 'care_coordination', label: 'Care Coordination', description: 'Care coordination activities', iconKey: 'handshake', payBucket: 'indirect', sortOrder: 30, displayCode: 'IND-03' },
  { typeKey: 'client_communication', label: 'Client Communication', description: 'Client or guardian communication', iconKey: 'phone', payBucket: 'indirect', sortOrder: 40, displayCode: 'IND-04' },
  { typeKey: 'client_record_review', label: 'Client Record Review', description: 'Review client records and charts', iconKey: 'book', payBucket: 'indirect', sortOrder: 50, displayCode: 'IND-05' },
  { typeKey: 'scheduling_follow_up', label: 'Scheduling & Follow-up', description: 'Scheduling and follow-up activities', iconKey: 'calendar', payBucket: 'indirect', sortOrder: 60, displayCode: 'IND-06' },
  { typeKey: 'outreach_activities', label: 'Outreach Activities', description: 'Approved outreach activities', iconKey: 'megaphone', payBucket: 'indirect', sortOrder: 70, displayCode: 'IND-07' },
  // Support Activity Time (everyone) — paid at MEETING
  { typeKey: 'staff_meeting', label: 'Staff Meeting', description: 'Staff meeting (non-auto-logged)', iconKey: 'users', payBucket: 'support', sortOrder: 210, displayCode: 'SUP-01' },
  { typeKey: 'required_training', label: 'Required Training', description: 'Required training when not auto-logged', iconKey: 'book', payBucket: 'support', sortOrder: 220, displayCode: 'SUP-02' },
  { typeKey: 'clinical_supervision_sa', label: 'Clinical Supervision', description: 'Clinical supervision when not auto-logged', iconKey: 'users', payBucket: 'support', sortOrder: 230, displayCode: 'SUP-03' },
  { typeKey: 'onboarding_sa', label: 'Onboarding', description: 'Onboarding activities when not auto-logged', iconKey: 'user-check', payBucket: 'support', sortOrder: 240, displayCode: 'SUP-04' },
  { typeKey: 'fingerprinting_credentialing', label: 'Fingerprinting / Credentialing', description: 'Fingerprinting and credentialing activities', iconKey: 'clipboard', payBucket: 'support', sortOrder: 250, displayCode: 'SUP-05' },
  { typeKey: 'approved_travel', label: 'Approved Travel', description: 'Approved travel time', iconKey: 'car', payBucket: 'support', sortOrder: 260, displayCode: 'SUP-06' },
  // Supervision Note Time (supervisors) — paid at Admin Time
  { typeKey: 'supervision_note_time', label: 'Supervision Note Time', description: 'Write and complete supervision notes / related admin after sessions', iconKey: 'file-text', payBucket: 'supervision_note', sortOrder: 310, displayCode: 'SN-01' },
  { typeKey: 'supervisors_meeting', label: 'Supervisor\'s Meeting', description: 'Supervisor meeting when not auto-logged (paid at Admin Time rate)', iconKey: 'users', payBucket: 'supervision_note', sortOrder: 320, displayCode: 'SN-02' }
];

const DEFAULT_TYPES = DEFAULT_INDIRECT_SERVICE_TYPES;

const DISPLAY_CODE_PREFIX_BY_BUCKET = {
  indirect: 'IND',
  support: 'SUP',
  supervision_note: 'SN',
  other_1: 'OTH'
};

function slugifyKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

class PayrollIndirectServiceType {
  static defaults() {
    return DEFAULT_TYPES.map((d) => ({ ...d }));
  }

  static _normalize(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      agencyId: Number(row.agency_id),
      typeKey: String(row.type_key || ''),
      label: String(row.label || ''),
      description: row.description != null ? String(row.description) : '',
      iconKey: String(row.icon_key || 'circle'),
      payBucket: normalizePayBucket(row.pay_bucket),
      sortOrder: Number(row.sort_order || 0),
      isActive: !!(row.is_active === 1 || row.is_active === true || row.is_active === '1'),
      displayCode: row.display_code != null ? String(row.display_code) : '',
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  /**
   * Auto-generate the next sequential code for a pay bucket within an agency
   * (e.g. SUP-07 if SUP-01..SUP-06 already exist). Used when creating a new
   * type without an explicit displayCode; admins can always view/edit it after.
   */
  static async generateDisplayCode({ agencyId, payBucket }) {
    const aid = Number(agencyId);
    const prefix = DISPLAY_CODE_PREFIX_BY_BUCKET[normalizePayBucket(payBucket)] || 'OTH';
    if (!aid) return `${prefix}-01`;
    let maxN = 0;
    try {
      const [rows] = await pool.execute(
        `SELECT display_code FROM payroll_indirect_service_types
         WHERE agency_id = ? AND display_code LIKE ?`,
        [aid, `${prefix}-%`]
      );
      for (const r of rows || []) {
        const m = /^([A-Z]+)-(\d+)$/.exec(String(r.display_code || '').trim().toUpperCase());
        if (m && m[1] === prefix) maxN = Math.max(maxN, parseInt(m[2], 10) || 0);
      }
    } catch { /* column may not exist yet on very old DBs; fall through to -01 */ }
    return `${prefix}-${String(maxN + 1).padStart(2, '0')}`;
  }

  static async ensureDefaults(agencyId) {
    const aid = Number(agencyId);
    if (!Number.isFinite(aid) || aid <= 0) return;
    let hasPayBucket = true;
    try {
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payroll_indirect_service_types'
           AND COLUMN_NAME = 'pay_bucket'
         LIMIT 1`
      );
      hasPayBucket = !!(cols && cols.length);
    } catch {
      hasPayBucket = false;
    }
    for (const d of DEFAULT_TYPES) {
      if (hasPayBucket) {
        // display_code is only set on first INSERT — never overwritten on conflict,
        // so an admin's custom code is preserved across future ensureDefaults() calls.
        await pool.execute(
          `INSERT INTO payroll_indirect_service_types
           (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active, display_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             label = VALUES(label),
             description = VALUES(description),
             icon_key = VALUES(icon_key),
             pay_bucket = VALUES(pay_bucket),
             sort_order = VALUES(sort_order),
             is_active = 1`,
          [aid, d.typeKey, d.label, d.description, d.iconKey, normalizePayBucket(d.payBucket), d.sortOrder, d.displayCode || null]
        );
      } else if (normalizePayBucket(d.payBucket) === 'indirect') {
        await pool.execute(
          `INSERT IGNORE INTO payroll_indirect_service_types
           (agency_id, type_key, label, description, icon_key, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [aid, d.typeKey, d.label, d.description, d.iconKey, d.sortOrder]
        );
      }
    }
  }

  static async listForAgency({ agencyId, activeOnly = false }) {
    const aid = Number(agencyId);
    await this.ensureDefaults(aid);
    const params = [aid];
    let where = 'agency_id = ?';
    if (activeOnly) where += ' AND is_active = 1';
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_indirect_service_types
       WHERE ${where}
       ORDER BY sort_order ASC, label ASC, id ASC`,
      params
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM payroll_indirect_service_types WHERE id = ? LIMIT 1',
      [Number(id)]
    );
    return this._normalize(rows?.[0] || null);
  }

  static async findByIds(ids = []) {
    const list = (ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    if (!list.length) return [];
    const placeholders = list.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_indirect_service_types WHERE id IN (${placeholders})`,
      list
    );
    return (rows || []).map((r) => this._normalize(r));
  }

  static async create({
    agencyId,
    typeKey,
    label,
    description = '',
    iconKey = 'circle',
    payBucket = 'indirect',
    sortOrder = 0,
    isActive = true,
    displayCode = ''
  }) {
    const aid = Number(agencyId);
    let key = slugifyKey(typeKey || label);
    if (!key) key = `type_${Date.now()}`;
    const bucket = normalizePayBucket(payBucket);
    const code = String(displayCode || '').trim().slice(0, 20)
      || await this.generateDisplayCode({ agencyId: aid, payBucket: bucket });
    const [result] = await pool.execute(
      `INSERT INTO payroll_indirect_service_types
       (agency_id, type_key, label, description, icon_key, pay_bucket, sort_order, is_active, display_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        key,
        String(label || '').trim().slice(0, 128),
        String(description || '').trim().slice(0, 255) || null,
        String(iconKey || 'circle').trim().slice(0, 64) || 'circle',
        bucket,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        isActive ? 1 : 0,
        code
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch = {}) {
    const current = await this.findById(id);
    if (!current) return null;
    const next = {
      label: patch.label !== undefined ? String(patch.label || '').trim().slice(0, 128) : current.label,
      description: patch.description !== undefined
        ? String(patch.description || '').trim().slice(0, 255)
        : current.description,
      iconKey: patch.iconKey !== undefined
        ? String(patch.iconKey || 'circle').trim().slice(0, 64) || 'circle'
        : current.iconKey,
      payBucket: patch.payBucket !== undefined || patch.pay_bucket !== undefined
        ? normalizePayBucket(patch.payBucket ?? patch.pay_bucket)
        : current.payBucket,
      sortOrder: patch.sortOrder !== undefined && Number.isFinite(Number(patch.sortOrder))
        ? Number(patch.sortOrder)
        : current.sortOrder,
      isActive: patch.isActive !== undefined ? !!patch.isActive : current.isActive,
      displayCode: patch.displayCode !== undefined
        ? String(patch.displayCode || '').trim().slice(0, 20)
        : current.displayCode
    };
    if (patch.typeKey !== undefined) {
      const key = slugifyKey(patch.typeKey);
      if (key) next.typeKey = key;
    } else {
      next.typeKey = current.typeKey;
    }
    await pool.execute(
      `UPDATE payroll_indirect_service_types
       SET type_key = ?, label = ?, description = ?, icon_key = ?, pay_bucket = ?, sort_order = ?, is_active = ?, display_code = ?
       WHERE id = ?
       LIMIT 1`,
      [
        next.typeKey,
        next.label,
        next.description || null,
        next.iconKey,
        next.payBucket,
        next.sortOrder,
        next.isActive ? 1 : 0,
        next.displayCode || null,
        Number(id)
      ]
    );
    return this.findById(id);
  }

  static async softDelete(id) {
    await pool.execute(
      'UPDATE payroll_indirect_service_types SET is_active = 0 WHERE id = ? LIMIT 1',
      [Number(id)]
    );
    return this.findById(id);
  }
}

export default PayrollIndirectServiceType;
