import pool from '../config/database.js';

// Catalog row of an external referral source/resource (e.g. "Dr. Smith,
// pediatric psychiatry"). See migration 736 and referralDirectory.controller.js.

const UPDATABLE_COLUMNS = [
  'category_id',
  'name',
  'organization_name',
  'phone',
  'email',
  'website',
  'address',
  'specialties',
  'insurances_accepted',
  'notes',
  'is_active'
];

// Only the columns that make sense to come from a user-submitted payload. We
// never trust agency_id / approval_status / approved_by / etc. from payload —
// those are set by the controller based on the authenticated request.
const PAYLOAD_ALLOWED_COLUMNS = [
  'category_id',
  'name',
  'organization_name',
  'phone',
  'email',
  'website',
  'address',
  'specialties',
  'insurances_accepted',
  'notes'
];

const DIRECTORY_SELECT = `
  SELECT e.*,
    c.name AS category_name,
    c.slug AS category_slug,
    u.first_name AS created_by_first_name,
    u.last_name  AS created_by_last_name,
    ap.first_name AS approved_by_first_name,
    ap.last_name  AS approved_by_last_name,
    (SELECT COUNT(*) FROM referral_directory_change_requests cr
      WHERE cr.entry_id = e.id AND cr.status = 'pending') AS pending_change_requests_count
  FROM referral_directory_entries e
  LEFT JOIN referral_directory_categories c ON c.id = e.category_id
  LEFT JOIN users u  ON u.id = e.created_by_user_id
  LEFT JOIN users ap ON ap.id = e.approved_by_user_id
`;

class ReferralDirectoryEntry {
  static sanitizePayload(payload = {}, { includeAllKeys = false } = {}) {
    const cleaned = {};
    const keys = includeAllKeys ? UPDATABLE_COLUMNS : PAYLOAD_ALLOWED_COLUMNS;
    for (const k of keys) {
      if (payload[k] === undefined) continue;
      let v = payload[k];
      if (k === 'category_id') {
        v = v === null || v === '' ? null : Number(v);
        if (Number.isNaN(v)) v = null;
      } else if (k === 'is_active') {
        v = v ? 1 : 0;
      } else {
        v = v === null ? null : String(v).trim();
        if (v === '') v = null;
      }
      cleaned[k] = v;
    }
    return cleaned;
  }

  static async findById(id) {
    const [rows] = await pool.execute(`${DIRECTORY_SELECT} WHERE e.id = ? LIMIT 1`, [id]);
    return rows[0] || null;
  }

  static async listForAgency(agencyId, { search = '', categoryId = null, includeInactive = false, limit = 500 } = {}) {
    const conditions = ['e.agency_id = ?', "e.approval_status = 'approved'"];
    const params = [agencyId];
    if (!includeInactive) conditions.push('e.is_active = TRUE');
    if (categoryId) {
      conditions.push('e.category_id = ?');
      params.push(Number(categoryId));
    }
    const needle = String(search || '').trim();
    if (needle) {
      // Simple LIKE across the searchable columns; FULLTEXT exists on this table
      // but LIKE is more forgiving for short / fragment queries that users type.
      const like = `%${needle}%`;
      conditions.push('(e.name LIKE ? OR e.organization_name LIKE ? OR e.specialties LIKE ? OR e.notes LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)');
      params.push(like, like, like, like, like, like);
    }
    const lim = Math.max(1, Math.min(1000, Number(limit) || 500));
    const [rows] = await pool.execute(
      `${DIRECTORY_SELECT}
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.name ASC
       LIMIT ${lim}`,
      params
    );
    return rows || [];
  }

  static async create({ agencyId, createdByUserId = null, approvalStatus = 'approved', approvedByUserId = null, payload = {} }) {
    const cleaned = this.sanitizePayload(payload);
    if (!cleaned.name) throw new Error('Entry name is required');
    const now = new Date();
    const approvedAt = approvalStatus === 'approved' ? now : null;
    const cols = ['agency_id', 'created_by_user_id', 'approval_status', 'approved_by_user_id', 'approved_at'];
    const vals = [agencyId, createdByUserId, approvalStatus, approvedByUserId, approvedAt];
    for (const k of PAYLOAD_ALLOWED_COLUMNS) {
      cols.push(k);
      vals.push(cleaned[k] === undefined ? null : cleaned[k]);
    }
    const [ins] = await pool.execute(
      `INSERT INTO referral_directory_entries (${cols.join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    );
    return this.findById(ins.insertId);
  }

  static async update(id, payload = {}) {
    const cleaned = this.sanitizePayload(payload, { includeAllKeys: true });
    const keys = Object.keys(cleaned);
    if (!keys.length) return this.findById(id);
    const sets = keys.map((k) => `${k} = ?`);
    const values = keys.map((k) => cleaned[k]);
    values.push(id);
    await pool.execute(
      `UPDATE referral_directory_entries SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async softDelete(id) {
    await pool.execute(
      'UPDATE referral_directory_entries SET is_active = FALSE WHERE id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async hardDelete(id) {
    const [r] = await pool.execute(
      'DELETE FROM referral_directory_entries WHERE id = ?',
      [id]
    );
    return r.affectedRows > 0;
  }
}

export { PAYLOAD_ALLOWED_COLUMNS };
export default ReferralDirectoryEntry;
