import pool from '../config/database.js';

export const DEFAULT_INDIRECT_SERVICE_TYPES = [
  { typeKey: 'preparing_for_sessions', label: 'Preparing for Sessions', description: 'Prep materials and plan for upcoming sessions', iconKey: 'book', sortOrder: 10 },
  { typeKey: 'writing_notes', label: 'Writing Notes', description: 'Write clinical or session documentation', iconKey: 'file-text', sortOrder: 20 },
  { typeKey: 'non_billable_contacts', label: 'Non-Billable Contacts', description: 'Phone and outreach contacts that are not billable', iconKey: 'phone', sortOrder: 30 },
  { typeKey: 'prep_for_outreach', label: 'Prep or attendance of outreach', description: 'Prepare for or attend community/outreach activities', iconKey: 'megaphone', sortOrder: 40 },
  { typeKey: 'travel_for_outreach', label: 'Travel for Outreach Events', description: 'Travel time related to outreach events', iconKey: 'car', sortOrder: 50 },
  { typeKey: 'virtual_outreach', label: 'Virtual Outreach', description: 'Virtual outreach and community engagement', iconKey: 'laptop', sortOrder: 60 },
  { typeKey: 'treatment_planning', label: 'Treatment Planning (Non-Billable)', description: 'Non-billable treatment planning work', iconKey: 'clipboard', sortOrder: 70 },
  { typeKey: 'case_consultations', label: 'Case Consultations (Non-Billable)', description: 'Non-billable case consultation time', iconKey: 'users', sortOrder: 80 },
  { typeKey: 'documentation_emr', label: 'Documentation / EMR (Non-Billable)', description: 'Non-billable EMR and chart documentation', iconKey: 'monitor', sortOrder: 90 },
  { typeKey: 'client_follow_up', label: 'Client Follow-Up (Non-Billable)', description: 'Non-billable client follow-up activities', iconKey: 'user-check', sortOrder: 100 },
  { typeKey: 'resource_coordination', label: 'Resource Coordination (Non-Billable)', description: 'Coordinate resources and supports', iconKey: 'handshake', sortOrder: 110 },
  { typeKey: 'other_indirect', label: 'Other Indirect', description: 'Other approved indirect work', iconKey: 'more', sortOrder: 120 }
];

const DEFAULT_TYPES = DEFAULT_INDIRECT_SERVICE_TYPES;

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
      sortOrder: Number(row.sort_order || 0),
      isActive: !!(row.is_active === 1 || row.is_active === true || row.is_active === '1'),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  static async ensureDefaults(agencyId) {
    const aid = Number(agencyId);
    if (!Number.isFinite(aid) || aid <= 0) return;
    // Upsert missing default keys so agencies always get the full starter set.
    for (const d of DEFAULT_TYPES) {
      await pool.execute(
        `INSERT IGNORE INTO payroll_indirect_service_types
         (agency_id, type_key, label, description, icon_key, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [aid, d.typeKey, d.label, d.description, d.iconKey, d.sortOrder]
      );
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

  static async create({
    agencyId,
    typeKey,
    label,
    description = '',
    iconKey = 'circle',
    sortOrder = 0,
    isActive = true
  }) {
    const aid = Number(agencyId);
    let key = slugifyKey(typeKey || label);
    if (!key) key = `type_${Date.now()}`;
    const [result] = await pool.execute(
      `INSERT INTO payroll_indirect_service_types
       (agency_id, type_key, label, description, icon_key, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        key,
        String(label || '').trim().slice(0, 128),
        String(description || '').trim().slice(0, 255) || null,
        String(iconKey || 'circle').trim().slice(0, 64) || 'circle',
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        isActive ? 1 : 0
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
      sortOrder: patch.sortOrder !== undefined && Number.isFinite(Number(patch.sortOrder))
        ? Number(patch.sortOrder)
        : current.sortOrder,
      isActive: patch.isActive !== undefined ? !!patch.isActive : current.isActive
    };
    if (patch.typeKey !== undefined) {
      const key = slugifyKey(patch.typeKey);
      if (key) next.typeKey = key;
    } else {
      next.typeKey = current.typeKey;
    }
    await pool.execute(
      `UPDATE payroll_indirect_service_types
       SET type_key = ?, label = ?, description = ?, icon_key = ?, sort_order = ?, is_active = ?
       WHERE id = ?
       LIMIT 1`,
      [
        next.typeKey,
        next.label,
        next.description || null,
        next.iconKey,
        next.sortOrder,
        next.isActive ? 1 : 0,
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
