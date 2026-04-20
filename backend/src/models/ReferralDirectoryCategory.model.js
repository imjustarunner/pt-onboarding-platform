import pool from '../config/database.js';

// Agency-scoped categories that group referral_directory_entries (migration 735).
// Free-form: admins can add new ones from the Referral Directory UI. Slug is
// derived from name but stored so the unique (agency_id, slug) index catches
// duplicates case-insensitively without requiring a collation change.

class ReferralDirectoryCategory {
  static async findAllForAgency(agencyId, { includeInactive = false } = {}) {
    const params = [agencyId];
    let where = 'agency_id = ?';
    if (!includeInactive) where += ' AND is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT * FROM referral_directory_categories
       WHERE ${where}
       ORDER BY order_index ASC, name ASC, id ASC`,
      params
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM referral_directory_categories WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findBySlugForAgency(agencyId, slug) {
    const [rows] = await pool.execute(
      'SELECT * FROM referral_directory_categories WHERE agency_id = ? AND slug = ? LIMIT 1',
      [agencyId, slug]
    );
    return rows[0] || null;
  }

  static generateSlug(name) {
    return String(name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 140);
  }

  static async create({ agencyId, name, orderIndex = 0, createdByUserId = null }) {
    const label = String(name || '').trim();
    if (!label) throw new Error('Category name is required');
    const slug = this.generateSlug(label);
    if (!slug) throw new Error('Category name must contain alphanumeric characters');
    const existing = await this.findBySlugForAgency(agencyId, slug);
    if (existing) return existing;
    const [ins] = await pool.execute(
      `INSERT INTO referral_directory_categories
        (agency_id, name, slug, order_index, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, label, slug, orderIndex, createdByUserId]
    );
    return this.findById(ins.insertId);
  }

  static async update(id, { name, orderIndex, isActive } = {}) {
    const updates = [];
    const values = [];
    if (name !== undefined) {
      const label = String(name || '').trim();
      if (!label) throw new Error('Category name is required');
      updates.push('name = ?');
      values.push(label);
      updates.push('slug = ?');
      values.push(this.generateSlug(label));
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(Number(orderIndex) || 0);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE referral_directory_categories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [r] = await pool.execute(
      'DELETE FROM referral_directory_categories WHERE id = ?',
      [id]
    );
    return r.affectedRows > 0;
  }

  // Seed a sensible default set on first access for an agency. Idempotent via
  // the unique (agency_id, slug) index — calling repeatedly is safe.
  static DEFAULT_SEEDS = [
    'Psychiatry',
    'Psychology',
    'Counseling / Therapy',
    'Occupational Therapy',
    'Physical Therapy',
    'Speech Therapy',
    'School-based Services',
    'Advocacy / Legal',
    'Crisis / Emergency',
    'Primary Care',
    'Specialty Medical',
    'Community Resources'
  ];

  static async seedDefaultsForAgency(agencyId, { createdByUserId = null } = {}) {
    const existing = await this.findAllForAgency(agencyId, { includeInactive: true });
    if (existing.length > 0) return existing;
    for (let i = 0; i < this.DEFAULT_SEEDS.length; i += 1) {
      const name = this.DEFAULT_SEEDS[i];
      try {
        await this.create({ agencyId, name, orderIndex: i, createdByUserId });
      } catch {
        // A parallel request may have inserted; unique index handles de-dup.
      }
    }
    return this.findAllForAgency(agencyId, { includeInactive: true });
  }
}

export default ReferralDirectoryCategory;
