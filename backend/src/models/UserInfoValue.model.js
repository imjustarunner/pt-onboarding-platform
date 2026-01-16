import pool from '../config/database.js';

class UserInfoValue {
  static async findByUserId(userId, agencyId = null) {
    let query = `
      SELECT 
        uiv.*,
        uifd.field_key,
        uifd.field_label,
        uifd.field_type,
        uifd.options,
        uifd.is_required,
        uifd.is_platform_template,
        uifd.agency_id,
        uifd.order_index
      FROM user_info_values uiv
      JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
      WHERE uiv.user_id = ?
    `;
    const params = [userId];

    if (agencyId !== null) {
      query += ' AND (uifd.agency_id = ? OR uifd.agency_id IS NULL)';
      params.push(agencyId);
    }

    query += ' ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC';
    
    const [rows] = await pool.execute(query, params);
    
    // Parse JSON options
    return rows.map(row => ({
      ...row,
      options: row.options ? JSON.parse(row.options) : null
    }));
  }

  static async findByUserAndField(userId, fieldDefinitionId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_info_values WHERE user_id = ? AND field_definition_id = ?',
      [userId, fieldDefinitionId]
    );
    return rows[0] || null;
  }

  static async findByUserAndFieldIds(userId, fieldDefinitionIds) {
    if (!fieldDefinitionIds || fieldDefinitionIds.length === 0) return [];
    const placeholders = fieldDefinitionIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM user_info_values WHERE user_id = ? AND field_definition_id IN (${placeholders})`,
      [userId, ...fieldDefinitionIds]
    );
    return rows;
  }

  static async createOrUpdate(userId, fieldDefinitionId, value) {
    // Check if value exists
    const existing = await this.findByUserAndField(userId, fieldDefinitionId);
    
    if (existing) {
      // Update
      await pool.execute(
        'UPDATE user_info_values SET value = ? WHERE user_id = ? AND field_definition_id = ?',
        [value, userId, fieldDefinitionId]
      );
      return this.findByUserAndField(userId, fieldDefinitionId);
    } else {
      // Create
      const [result] = await pool.execute(
        'INSERT INTO user_info_values (user_id, field_definition_id, value) VALUES (?, ?, ?)',
        [userId, fieldDefinitionId, value]
      );
      
      const [rows] = await pool.execute(
        'SELECT * FROM user_info_values WHERE id = ?',
        [result.insertId]
      );
      return rows[0];
    }
  }

  static async delete(userId, fieldDefinitionId) {
    const [result] = await pool.execute(
      'DELETE FROM user_info_values WHERE user_id = ? AND field_definition_id = ?',
      [userId, fieldDefinitionId]
    );
    return result.affectedRows > 0;
  }

  static async getUserInfoSummary(userId, agencyId = null) {
    // Get all field definitions for user's agencies
    const User = (await import('./User.model.js')).default;
    const UserInfoFieldDefinition = (await import('./UserInfoFieldDefinition.model.js')).default;
    
    let fieldDefinitions = [];
    
    if (agencyId) {
      const agencyFields = await UserInfoFieldDefinition.findByAgency(agencyId);
      fieldDefinitions = agencyFields.allFields;
    } else {
      // Get all agencies user belongs to
      const userAgencies = await User.getAgencies(userId);
      
      // Get platform templates
      const platformTemplates = await UserInfoFieldDefinition.findPlatformTemplates();
      fieldDefinitions = [...platformTemplates];
      
      // Get agency-specific fields for each agency
      for (const agency of userAgencies) {
        const agencyFields = await UserInfoFieldDefinition.findAll({ agencyId: agency.id });
        // Add agency name to each field
        const fieldsWithAgency = agencyFields.map(f => ({
          ...f,
          agency_name: agency.name
        }));
        fieldDefinitions = [...fieldDefinitions, ...fieldsWithAgency];
      }
    }
    
    // Get all values for user
    const values = await this.findByUserId(userId, agencyId);
    const valuesMap = new Map(values.map(v => [v.field_definition_id, v.value]));
    
    // Combine fields with values and parse options
    return fieldDefinitions.map(field => {
      const fieldWithValue = {
        ...field,
        value: valuesMap.get(field.id) || null,
        hasValue: valuesMap.has(field.id)
      };
      
      // Parse JSON options if present
      if (fieldWithValue.options && typeof fieldWithValue.options === 'string') {
        try {
          fieldWithValue.options = JSON.parse(fieldWithValue.options);
        } catch (e) {
          fieldWithValue.options = null;
        }
      }
      
      return fieldWithValue;
    });
  }

  static async bulkUpdate(userId, values) {
    // values is an array of { fieldDefinitionId, value }
    const results = [];
    
    for (const item of values) {
      const result = await this.createOrUpdate(userId, item.fieldDefinitionId, item.value);
      results.push(result);
    }
    
    return results;
  }
}

export default UserInfoValue;

