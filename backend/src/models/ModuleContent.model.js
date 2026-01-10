import pool from '../config/database.js';

class ModuleContent {
  static async findByModuleId(moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_content WHERE module_id = ? ORDER BY order_index ASC',
      [moduleId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_content WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(contentData) {
    const { moduleId, contentType, contentData: data, orderIndex } = contentData;
    const [result] = await pool.execute(
      'INSERT INTO module_content (module_id, content_type, content_data, order_index) VALUES (?, ?, ?, ?)',
      [moduleId, contentType, JSON.stringify(data), orderIndex || 0]
    );
    return this.findById(result.insertId);
  }

  static async update(id, contentData) {
    const { contentType, contentData: data, orderIndex } = contentData;
    const updates = [];
    const values = [];

    if (contentType !== undefined) {
      updates.push('content_type = ?');
      values.push(contentType);
    }
    if (data !== undefined) {
      updates.push('content_data = ?');
      values.push(JSON.stringify(data));
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE module_content SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM module_content WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
  
  static async deleteByModuleId(moduleId) {
    const [result] = await pool.execute(
      'DELETE FROM module_content WHERE module_id = ?',
      [moduleId]
    );
    return result.affectedRows > 0;
  }
  
  static async copyContent(sourceModuleId, targetModuleId, variableSubstitutions = {}) {
    // Get all content from source module
    const sourceContent = await this.findByModuleId(sourceModuleId);
    const copiedContent = [];
    
    for (const content of sourceContent) {
      let contentData = content.content_data;
      
      // Apply variable substitutions to content_data
      if (typeof contentData === 'string') {
        contentData = JSON.parse(contentData);
      }
      
      // Recursively replace variables in content data
      const substitutedData = this.substituteVariables(contentData, variableSubstitutions);
      
      const newContent = await this.create({
        moduleId: targetModuleId,
        contentType: content.content_type,
        contentData: substitutedData,
        orderIndex: content.order_index
      });
      
      copiedContent.push(newContent);
    }
    
    return copiedContent;
  }
  
  static substituteVariables(obj, substitutions) {
    if (typeof obj === 'string') {
      let result = obj;
      for (const [key, value] of Object.entries(substitutions)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariables(item, substitutions));
    } else if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariables(value, substitutions);
      }
      return result;
    }
    return obj;
  }
}

export default ModuleContent;

