import pool from '../config/database.js';

class UserInfoCategory {
  static async findAll(filters = {}) {
    const { isPlatformTemplate, agencyId } = filters;
    let query = 'SELECT * FROM user_info_categories WHERE 1=1';
    const params = [];

    if (isPlatformTemplate !== undefined) {
      query += ' AND is_platform_template = ?';
      params.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }

    query += ' ORDER BY is_platform_template DESC, order_index ASC, created_at ASC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM user_info_categories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findPlatformTemplates() {
    return this.findAll({ isPlatformTemplate: true });
  }

  static async create(categoryData) {
    const {
      categoryKey,
      categoryLabel,
      isPlatformTemplate,
      agencyId,
      orderIndex,
      createdByUserId
    } = categoryData;

    const [result] = await pool.execute(
      'INSERT INTO user_info_categories (category_key, category_label, is_platform_template, agency_id, order_index, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        categoryKey,
        categoryLabel,
        isPlatformTemplate !== undefined ? isPlatformTemplate : false,
        agencyId || null,
        orderIndex || 0,
        createdByUserId || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async update(id, categoryData) {
    const { categoryKey, categoryLabel, isPlatformTemplate, agencyId, orderIndex } = categoryData;

    const updates = [];
    const values = [];

    if (categoryKey !== undefined) {
      updates.push('category_key = ?');
      values.push(categoryKey);
    }
    if (categoryLabel !== undefined) {
      updates.push('category_label = ?');
      values.push(categoryLabel);
    }
    if (isPlatformTemplate !== undefined) {
      updates.push('is_platform_template = ?');
      values.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(`UPDATE user_info_categories SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM user_info_categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async generateCategoryKey(label) {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

export default UserInfoCategory;

