import pool from '../config/database.js';

class UserSpecificDocument {
  static async create(documentData) {
    const {
      userId,
      taskId,
      name,
      description,
      templateType,
      filePath,
      htmlContent,
      documentActionType,
      iconId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage,
      fieldDefinitions,
      createdByUserId
    } = documentData;

    const [result] = await pool.execute(
      `INSERT INTO user_specific_documents (
        user_id, task_id, name, description, template_type,
        file_path, html_content, document_action_type,
        icon_id, signature_x, signature_y, signature_width,
        signature_height, signature_page, field_definitions,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        taskId,
        name,
        description || null,
        templateType,
        filePath || null,
        htmlContent || null,
        documentActionType || 'signature',
        iconId || null,
        signatureX || null,
        signatureY || null,
        signatureWidth || null,
        signatureHeight || null,
        signaturePage || null,
        fieldDefinitions ? JSON.stringify(fieldDefinitions) : null,
        createdByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_specific_documents WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_specific_documents WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async findByTask(taskId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_specific_documents WHERE task_id = ?',
      [taskId]
    );
    return rows[0] || null;
  }

  static async update(id, updateData) {
    const updates = [];
    const values = [];

    if (updateData.name !== undefined) {
      updates.push('name = ?');
      values.push(updateData.name);
    }
    if (updateData.description !== undefined) {
      updates.push('description = ?');
      values.push(updateData.description);
    }
    if (updateData.templateType !== undefined) {
      updates.push('template_type = ?');
      values.push(updateData.templateType);
    }
    if (updateData.filePath !== undefined) {
      updates.push('file_path = ?');
      values.push(updateData.filePath);
    }
    if (updateData.htmlContent !== undefined) {
      updates.push('html_content = ?');
      values.push(updateData.htmlContent);
    }
    if (updateData.documentActionType !== undefined) {
      updates.push('document_action_type = ?');
      values.push(updateData.documentActionType);
    }
    if (updateData.iconId !== undefined) {
      updates.push('icon_id = ?');
      values.push(updateData.iconId);
    }
    if (updateData.signatureX !== undefined) {
      updates.push('signature_x = ?');
      values.push(updateData.signatureX);
    }
    if (updateData.signatureY !== undefined) {
      updates.push('signature_y = ?');
      values.push(updateData.signatureY);
    }
    if (updateData.signatureWidth !== undefined) {
      updates.push('signature_width = ?');
      values.push(updateData.signatureWidth);
    }
    if (updateData.signatureHeight !== undefined) {
      updates.push('signature_height = ?');
      values.push(updateData.signatureHeight);
    }
    if (updateData.signaturePage !== undefined) {
      updates.push('signature_page = ?');
      values.push(updateData.signaturePage);
    }
    if (updateData.fieldDefinitions !== undefined) {
      updates.push('field_definitions = ?');
      const serialized = updateData.fieldDefinitions ? JSON.stringify(updateData.fieldDefinitions) : null;
      values.push(serialized);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(
      `UPDATE user_specific_documents SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_specific_documents WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default UserSpecificDocument;

