import pool from '../config/database.js';

class TrainingFocusStep {
  static async findByFocusId(trainingFocusId) {
    const [rows] = await pool.execute(
      `SELECT tfs.*,
              m.title AS module_title,
              cci.item_label AS checklist_title,
              dt.name AS document_title
       FROM training_focus_steps tfs
       LEFT JOIN modules m ON tfs.step_type = 'module' AND m.id = tfs.reference_id
       LEFT JOIN custom_checklist_items cci ON tfs.step_type = 'checklist_item' AND cci.id = tfs.reference_id
       LEFT JOIN document_templates dt ON tfs.step_type = 'document' AND dt.id = tfs.reference_id
       WHERE tfs.training_focus_id = ?
       ORDER BY tfs.order_index ASC, tfs.id ASC`,
      [trainingFocusId]
    );
    return rows.map((row) => this._normalize(row));
  }

  static async findById(stepId) {
    const [rows] = await pool.execute(
      `SELECT tfs.*,
              m.title AS module_title,
              cci.item_label AS checklist_title,
              dt.name AS document_title
       FROM training_focus_steps tfs
       LEFT JOIN modules m ON tfs.step_type = 'module' AND m.id = tfs.reference_id
       LEFT JOIN custom_checklist_items cci ON tfs.step_type = 'checklist_item' AND cci.id = tfs.reference_id
       LEFT JOIN document_templates dt ON tfs.step_type = 'document' AND dt.id = tfs.reference_id
       WHERE tfs.id = ?
       LIMIT 1`,
      [stepId]
    );
    return rows[0] ? this._normalize(rows[0]) : null;
  }

  static _normalize(row) {
    const title =
      row.title_override ||
      row.module_title ||
      row.checklist_title ||
      row.document_title ||
      `${row.step_type} #${row.reference_id}`;
    return {
      id: row.id,
      trainingFocusId: row.training_focus_id,
      stepType: row.step_type,
      referenceId: row.reference_id,
      orderIndex: row.order_index,
      documentActionType: row.document_action_type,
      dueDateDays: row.due_date_days,
      titleOverride: row.title_override,
      title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static async getNextOrderIndex(trainingFocusId) {
    const [rows] = await pool.execute(
      'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM training_focus_steps WHERE training_focus_id = ?',
      [trainingFocusId]
    );
    return rows[0]?.next_order ?? 0;
  }

  static async create({
    trainingFocusId,
    stepType,
    referenceId,
    orderIndex,
    documentActionType = null,
    dueDateDays = null,
    titleOverride = null
  }) {
    const order =
      orderIndex !== undefined && orderIndex !== null
        ? orderIndex
        : await this.getNextOrderIndex(trainingFocusId);
    const [result] = await pool.execute(
      `INSERT INTO training_focus_steps
       (training_focus_id, step_type, reference_id, order_index, document_action_type, due_date_days, title_override)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        trainingFocusId,
        stepType,
        referenceId,
        order,
        documentActionType,
        dueDateDays,
        titleOverride
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(stepId, data) {
    const updates = [];
    const values = [];
    const fields = {
      orderIndex: 'order_index',
      documentActionType: 'document_action_type',
      dueDateDays: 'due_date_days',
      titleOverride: 'title_override'
    };
    for (const [key, col] of Object.entries(fields)) {
      if (data[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(data[key]);
      }
    }
    if (!updates.length) return this.findById(stepId);
    values.push(stepId);
    await pool.execute(`UPDATE training_focus_steps SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(stepId);
  }

  static async delete(stepId) {
    const [result] = await pool.execute('DELETE FROM training_focus_steps WHERE id = ?', [stepId]);
    return result.affectedRows > 0;
  }

  static async reorder(trainingFocusId, stepIdsInOrder) {
    if (!Array.isArray(stepIdsInOrder) || !stepIdsInOrder.length) return [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < stepIdsInOrder.length; i++) {
        await conn.execute(
          'UPDATE training_focus_steps SET order_index = ? WHERE id = ? AND training_focus_id = ?',
          [i, stepIdsInOrder[i], trainingFocusId]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return this.findByFocusId(trainingFocusId);
  }
}

export default TrainingFocusStep;
