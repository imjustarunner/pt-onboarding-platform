import pool from '../config/database.js';
import { normalizeContentType } from '../constants/trainingContentTypes.js';

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

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
    const {
      moduleId,
      contentType,
      contentData: data,
      orderIndex,
      title,
      settings
    } = contentData;
    const normalizedType = normalizeContentType(contentType, data);
    const [result] = await pool.execute(
      `INSERT INTO module_content
        (module_id, content_type, title, content_data, settings, order_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        moduleId,
        normalizedType,
        title || null,
        JSON.stringify(data ?? {}),
        settings != null ? JSON.stringify(settings) : null,
        orderIndex || 0
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, contentData) {
    const {
      contentType,
      contentData: data,
      orderIndex,
      title,
      settings
    } = contentData;
    const updates = [];
    const values = [];

    if (contentType !== undefined || data !== undefined) {
      const existing = await this.findById(id);
      const nextData = data !== undefined ? data : parseJsonField(existing?.content_data) || {};
      const nextType = contentType !== undefined
        ? normalizeContentType(contentType, nextData)
        : normalizeContentType(existing?.content_type, nextData);
      updates.push('content_type = ?');
      values.push(nextType);
      if (data !== undefined) {
        updates.push('content_data = ?');
        values.push(JSON.stringify(data));
      }
    } else if (contentType !== undefined) {
      updates.push('content_type = ?');
      values.push(normalizeContentType(contentType, {}));
    }

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (settings !== undefined) {
      updates.push('settings = ?');
      values.push(settings == null ? null : JSON.stringify(settings));
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
    const sourceContent = await this.findByModuleId(sourceModuleId);
    const copiedContent = [];

    for (const content of sourceContent) {
      let contentData = content.content_data;
      if (typeof contentData === 'string') {
        contentData = JSON.parse(contentData);
      }
      const settings = parseJsonField(content.settings);

      const substitutedData = this.substituteVariables(contentData, variableSubstitutions);

      const newContent = await this.create({
        moduleId: targetModuleId,
        contentType: content.content_type,
        contentData: substitutedData,
        orderIndex: content.order_index,
        title: content.title || null,
        settings
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
      return obj.map((item) => this.substituteVariables(item, substitutions));
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
