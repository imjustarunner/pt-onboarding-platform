import pool from '../config/database.js';

class UserLifecycleChecklistItem {
  static async findByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT ulci.*, lcd.item_key, lcd.item_label, lcd.label_template, lcd.phase,
              lcd.category, lcd.order_index, lcd.is_required, lcd.applies_to,
              lcd.integration_type, lcd.integration_ref
       FROM user_lifecycle_checklist_items ulci
       JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
       WHERE ulci.user_id = ?
       ORDER BY lcd.phase ASC, lcd.category ASC, lcd.order_index ASC`,
      [userId]
    );
    return rows;
  }

  static async findByUserAndDefinition(userId, definitionId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_lifecycle_checklist_items WHERE user_id = ? AND definition_id = ?',
      [userId, definitionId]
    );
    return rows[0] || null;
  }

  /**
   * Ensure a checklist row exists for every applicable definition for this user.
   * idempotent — safe to call on every tab load.
   */
  static async ensureRows(userId, definitionIds) {
    if (!definitionIds.length) return;
    const placeholders = definitionIds.map(() => '(?, ?, 0)').join(', ');
    const params = definitionIds.flatMap((defId) => [userId, defId]);
    await pool.execute(
      `INSERT IGNORE INTO user_lifecycle_checklist_items (user_id, definition_id, is_completed)
       VALUES ${placeholders}`,
      params
    );
  }

  /**
   * Toggle an item. HR can always manually check/uncheck.
   * Setting manually_overridden prevents auto-sync from re-checking.
   */
  static async toggle(userId, definitionId, completed, completedByUserId) {
    const now = completed ? new Date() : null;
    await pool.execute(
      `INSERT INTO user_lifecycle_checklist_items
         (user_id, definition_id, is_completed, completed_at, completed_by_user_id, completion_method, manually_overridden)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)
       ON DUPLICATE KEY UPDATE
         is_completed = VALUES(is_completed),
         completed_at = VALUES(completed_at),
         completed_by_user_id = VALUES(completed_by_user_id),
         completion_method = 'manual',
         manually_overridden = VALUES(manually_overridden)`,
      [userId, definitionId, completed ? 1 : 0, now, completedByUserId, completed ? 0 : 1]
    );
    return this.findByUserAndDefinition(userId, definitionId);
  }

  /**
   * Auto-complete an item (from sync). Does not overwrite a manually_overridden=1 row
   * when trying to mark complete.
   */
  static async autoComplete(userId, definitionId, completed, completedAt = null) {
    const ts = completedAt || (completed ? new Date() : null);
    if (completed) {
      await pool.execute(
        `INSERT INTO user_lifecycle_checklist_items
           (user_id, definition_id, is_completed, completed_at, completion_method, manually_overridden)
         VALUES (?, ?, 1, ?, 'auto', 0)
         ON DUPLICATE KEY UPDATE
           is_completed = CASE WHEN manually_overridden = 1 THEN is_completed ELSE 1 END,
           completed_at = CASE WHEN manually_overridden = 1 THEN completed_at ELSE VALUES(completed_at) END,
           completion_method = CASE WHEN manually_overridden = 1 THEN completion_method ELSE 'auto' END`,
        [userId, definitionId, ts]
      );
    } else {
      await pool.execute(
        `UPDATE user_lifecycle_checklist_items
         SET is_completed = 0, completed_at = NULL, completion_method = 'auto'
         WHERE user_id = ? AND definition_id = ? AND manually_overridden = 0`,
        [userId, definitionId]
      );
    }
  }
}

export default UserLifecycleChecklistItem;
