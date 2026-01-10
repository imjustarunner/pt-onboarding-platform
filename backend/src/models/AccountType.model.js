import pool from '../config/database.js';

class AccountType {
  static async findAll(filters = {}) {
    const { isPlatformTemplate, agencyId, includeInactive } = filters;
    let query = 'SELECT * FROM account_types WHERE 1=1';
    const params = [];

    if (isPlatformTemplate !== undefined) {
      query += ' AND is_platform_template = ?';
      params.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }

    query += ' ORDER BY is_platform_template DESC, name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM account_types WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(typeData) {
    const { name, description, isPlatformTemplate, agencyId, createdByUserId } = typeData;
    const [result] = await pool.execute(
      'INSERT INTO account_types (name, description, is_platform_template, agency_id, created_by_user_id) VALUES (?, ?, ?, ?, ?)',
      [name, description || null, isPlatformTemplate !== undefined ? isPlatformTemplate : false, agencyId || null, createdByUserId || null]
    );
    return this.findById(result.insertId);
  }

  static async update(id, typeData) {
    const { name, description, isPlatformTemplate, agencyId } = typeData;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (isPlatformTemplate !== undefined) {
      updates.push('is_platform_template = ?');
      values.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE account_types SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM account_types WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async pushToAgency(accountTypeId, targetAgencyId) {
    const sourceType = await this.findById(accountTypeId);
    if (!sourceType) {
      throw new Error('Account type not found');
    }

    // Create a copy for the agency
    const newType = await this.create({
      name: sourceType.name,
      description: sourceType.description,
      isPlatformTemplate: false,
      agencyId: targetAgencyId,
      createdByUserId: sourceType.created_by_user_id
    });

    return newType;
  }
}

export default AccountType;

