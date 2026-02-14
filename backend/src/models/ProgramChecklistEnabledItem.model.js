import pool from '../config/database.js';

class ProgramChecklistEnabledItem {
  static async findByProgramId(programId) {
    const [rows] = await pool.execute(
      `SELECT 
        pcei.*,
        cci.item_key,
        cci.item_label,
        cci.description,
        cci.is_platform_template,
        cci.order_index
      FROM program_checklist_enabled_items pcei
      JOIN custom_checklist_items cci ON pcei.checklist_item_id = cci.id
      WHERE pcei.program_id = ?
      ORDER BY cci.order_index ASC, cci.created_at ASC`,
      [programId]
    );
    return rows;
  }

  static async isEnabled(programId, checklistItemId) {
    const [rows] = await pool.execute(
      'SELECT enabled FROM program_checklist_enabled_items WHERE program_id = ? AND checklist_item_id = ?',
      [programId, checklistItemId]
    );
    return rows.length > 0 ? (rows[0].enabled === 1 || rows[0].enabled === true) : null;
  }

  static async toggleItem(programId, checklistItemId, enabled) {
    const [existing] = await pool.execute(
      'SELECT id FROM program_checklist_enabled_items WHERE program_id = ? AND checklist_item_id = ?',
      [programId, checklistItemId]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE program_checklist_enabled_items SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE program_id = ? AND checklist_item_id = ?',
        [enabled, programId, checklistItemId]
      );
    } else {
      await pool.execute(
        'INSERT INTO program_checklist_enabled_items (program_id, checklist_item_id, enabled) VALUES (?, ?, ?)',
        [programId, checklistItemId, enabled]
      );
    }

    return this.isEnabled(programId, checklistItemId);
  }

  static async getEnabledItemIdsForProgram(programId) {
    const [rows] = await pool.execute(
      `SELECT checklist_item_id 
       FROM program_checklist_enabled_items 
       WHERE program_id = ? AND enabled = TRUE`,
      [programId]
    );
    return rows.map((row) => row.checklist_item_id);
  }
}

export default ProgramChecklistEnabledItem;
