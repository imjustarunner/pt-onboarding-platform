import pool from '../config/database.js';

class UserInfoFieldDefinition {
  static async findAll(filters = {}) {
    const { isPlatformTemplate, agencyId, includeInactive } = filters;
    let query = 'SELECT * FROM user_info_field_definitions WHERE 1=1';
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
    const [rows] = await pool.execute(
      'SELECT * FROM user_info_field_definitions WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByAgency(agencyId) {
    // Get platform templates
    const platformTemplates = await this.findAll({ isPlatformTemplate: true });
    
    // Get agency-specific fields (overrides and custom)
    const agencyFields = await this.findAll({ agencyId });
    
    // Combine and return
    return {
      platformTemplates,
      agencyFields,
      allFields: [...platformTemplates, ...agencyFields]
    };
  }

  static async findPlatformTemplates() {
    return this.findAll({ isPlatformTemplate: true });
  }

  static async create(fieldData) {
    const {
      fieldKey,
      fieldLabel,
      fieldType,
      options,
      isRequired,
      isPlatformTemplate,
      agencyId,
      parentFieldId,
      orderIndex,
      createdByUserId
    } = fieldData;

    const [result] = await pool.execute(
      'INSERT INTO user_info_field_definitions (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        fieldKey,
        fieldLabel,
        fieldType,
        options ? JSON.stringify(options) : null,
        isRequired !== undefined ? isRequired : false,
        isPlatformTemplate !== undefined ? isPlatformTemplate : false,
        agencyId || null,
        parentFieldId || null,
        orderIndex || 0,
        createdByUserId || null
      ]
    );
    
    return this.findById(result.insertId);
  }

  static async update(id, fieldData) {
    const {
      fieldKey,
      fieldLabel,
      fieldType,
      options,
      isRequired,
      isPlatformTemplate,
      agencyId,
      parentFieldId,
      orderIndex
    } = fieldData;
    
    const updates = [];
    const values = [];

    if (fieldKey !== undefined) {
      updates.push('field_key = ?');
      values.push(fieldKey);
    }
    if (fieldLabel !== undefined) {
      updates.push('field_label = ?');
      values.push(fieldLabel);
    }
    if (fieldType !== undefined) {
      updates.push('field_type = ?');
      values.push(fieldType);
    }
    if (options !== undefined) {
      updates.push('options = ?');
      values.push(options ? JSON.stringify(options) : null);
    }
    if (isRequired !== undefined) {
      updates.push('is_required = ?');
      values.push(isRequired);
    }
    if (isPlatformTemplate !== undefined) {
      updates.push('is_platform_template = ?');
      values.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }
    if (parentFieldId !== undefined) {
      updates.push('parent_field_id = ?');
      values.push(parentFieldId);
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE user_info_field_definitions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_info_field_definitions WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async pushToAgency(fieldId, targetAgencyId) {
    const sourceField = await this.findById(fieldId);
    if (!sourceField) {
      throw new Error('Field definition not found');
    }

    if (!sourceField.is_platform_template) {
      throw new Error('Only platform templates can be pushed to agencies');
    }

    // Create agency-specific version (override)
    const newField = await this.create({
      fieldKey: sourceField.field_key,
      fieldLabel: sourceField.field_label,
      fieldType: sourceField.field_type,
      options: sourceField.options ? JSON.parse(sourceField.options) : null,
      isRequired: sourceField.is_required,
      isPlatformTemplate: false,
      agencyId: targetAgencyId,
      parentFieldId: sourceField.id,
      orderIndex: sourceField.order_index,
      createdByUserId: sourceField.created_by_user_id
    });

    return newField;
  }

  static async generateFieldKey(label) {
    // Convert label to field_key format (lowercase, underscores, alphanumeric)
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

export default UserInfoFieldDefinition;

