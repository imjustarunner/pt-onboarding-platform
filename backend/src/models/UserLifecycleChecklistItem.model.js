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
  static async toggle(userId, definitionId, completed, completedByUserId, completedAtStr = null) {
    let now = null;
    if (completed) {
      if (completedAtStr) {
        now = new Date(completedAtStr);
        if (isNaN(now.getTime())) now = new Date();
      } else {
        now = new Date();
      }
    }
    
    await pool.execute(
      `INSERT INTO user_lifecycle_checklist_items
         (user_id, definition_id, is_completed, completed_at, completed_by_user_id, completion_method, manually_overridden,
          is_not_applicable, not_applicable_at, not_applicable_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'manual', 1, 0, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         is_completed = VALUES(is_completed),
         completed_at = VALUES(completed_at),
         completed_by_user_id = VALUES(completed_by_user_id),
         completion_method = 'manual',
         manually_overridden = 1,
         is_not_applicable = 0,
         not_applicable_at = NULL,
         not_applicable_by_user_id = NULL`,
      [userId, definitionId, completed ? 1 : 0, now, completedByUserId]
    );
    return this.findByUserAndDefinition(userId, definitionId);
  }

  /**
   * Mark an item not needed for this person (or restore it).
   * Not-applicable items are excluded from completion progress.
   */
  static async setNotApplicable(userId, definitionId, notApplicable, byUserId) {
    const now = notApplicable ? new Date() : null;
    await pool.execute(
      `INSERT INTO user_lifecycle_checklist_items
         (user_id, definition_id, is_completed, completed_at, completed_by_user_id, completion_method, manually_overridden,
          is_not_applicable, not_applicable_at, not_applicable_by_user_id)
       VALUES (?, ?, 0, NULL, NULL, 'manual', 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_not_applicable = VALUES(is_not_applicable),
         not_applicable_at = VALUES(not_applicable_at),
         not_applicable_by_user_id = VALUES(not_applicable_by_user_id),
         is_completed = CASE WHEN VALUES(is_not_applicable) = 1 THEN 0 ELSE is_completed END,
         completed_at = CASE WHEN VALUES(is_not_applicable) = 1 THEN NULL ELSE completed_at END,
         completed_by_user_id = CASE WHEN VALUES(is_not_applicable) = 1 THEN NULL ELSE completed_by_user_id END,
         manually_overridden = CASE WHEN VALUES(is_not_applicable) = 1 THEN 1 ELSE manually_overridden END`,
      [
        userId,
        definitionId,
        notApplicable ? 1 : 0,
        now,
        notApplicable ? (byUserId || null) : null
      ]
    );
    return this.findByUserAndDefinition(userId, definitionId);
  }

  static async setAttachment(userId, definitionId, attachment, { markComplete = true, completedByUserId = null } = {}) {
    const {
      storagePath,
      originalName,
      mimeType,
      uploadedAt,
      uploadedByUserId,
      isEncrypted,
      encryptionKeyId,
      encryptionWrappedKeyB64,
      encryptionIvB64,
      encryptionAuthTagB64,
      encryptionAlg,
      encryptionAad,
    } = attachment;

    await pool.execute(
      `INSERT INTO user_lifecycle_checklist_items
         (user_id, definition_id, is_completed, completed_at, completed_by_user_id, completion_method, manually_overridden,
          attachment_storage_path, attachment_original_name, attachment_mime_type,
          attachment_uploaded_at, attachment_uploaded_by_user_id, attachment_is_encrypted,
          attachment_encryption_key_id, attachment_encryption_wrapped_key_b64,
          attachment_encryption_iv_b64, attachment_encryption_auth_tag_b64,
          attachment_encryption_alg, attachment_encryption_aad)
       VALUES (?, ?, ?, ?, ?, 'manual', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         attachment_storage_path = VALUES(attachment_storage_path),
         attachment_original_name = VALUES(attachment_original_name),
         attachment_mime_type = VALUES(attachment_mime_type),
         attachment_uploaded_at = VALUES(attachment_uploaded_at),
         attachment_uploaded_by_user_id = VALUES(attachment_uploaded_by_user_id),
         attachment_is_encrypted = VALUES(attachment_is_encrypted),
         attachment_encryption_key_id = VALUES(attachment_encryption_key_id),
         attachment_encryption_wrapped_key_b64 = VALUES(attachment_encryption_wrapped_key_b64),
         attachment_encryption_iv_b64 = VALUES(attachment_encryption_iv_b64),
         attachment_encryption_auth_tag_b64 = VALUES(attachment_encryption_auth_tag_b64),
         attachment_encryption_alg = VALUES(attachment_encryption_alg),
         attachment_encryption_aad = VALUES(attachment_encryption_aad),
         is_completed = CASE WHEN ? THEN 1 ELSE is_completed END,
         completed_at = CASE WHEN ? THEN COALESCE(completed_at, VALUES(completed_at)) ELSE completed_at END,
         completed_by_user_id = CASE WHEN ? THEN COALESCE(completed_by_user_id, VALUES(completed_by_user_id)) ELSE completed_by_user_id END,
         completion_method = CASE WHEN ? THEN 'manual' ELSE completion_method END`,
      [
        userId,
        definitionId,
        markComplete ? 1 : 0,
        markComplete ? (uploadedAt || new Date()) : null,
        markComplete ? completedByUserId : null,
        storagePath,
        originalName,
        mimeType,
        uploadedAt || new Date(),
        uploadedByUserId,
        isEncrypted ? 1 : 0,
        encryptionKeyId || null,
        encryptionWrappedKeyB64 || null,
        encryptionIvB64 || null,
        encryptionAuthTagB64 || null,
        encryptionAlg || null,
        encryptionAad || null,
        markComplete ? 1 : 0,
        markComplete ? 1 : 0,
        markComplete ? 1 : 0,
        markComplete ? 1 : 0,
      ]
    );

    return this.findByUserAndDefinition(userId, definitionId);
  }

  static async clearAttachment(userId, definitionId) {
    await pool.execute(
      `UPDATE user_lifecycle_checklist_items
       SET attachment_storage_path = NULL,
           attachment_original_name = NULL,
           attachment_mime_type = NULL,
           attachment_uploaded_at = NULL,
           attachment_uploaded_by_user_id = NULL,
           attachment_is_encrypted = 0,
           attachment_encryption_key_id = NULL,
           attachment_encryption_wrapped_key_b64 = NULL,
           attachment_encryption_iv_b64 = NULL,
           attachment_encryption_auth_tag_b64 = NULL,
           attachment_encryption_alg = NULL,
           attachment_encryption_aad = NULL
       WHERE user_id = ? AND definition_id = ?`,
      [userId, definitionId]
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
           is_completed = CASE
             WHEN manually_overridden = 1 OR is_not_applicable = 1 THEN is_completed
             ELSE 1
           END,
           completed_at = CASE
             WHEN manually_overridden = 1 OR is_not_applicable = 1 THEN completed_at
             ELSE VALUES(completed_at)
           END,
           completion_method = CASE
             WHEN manually_overridden = 1 OR is_not_applicable = 1 THEN completion_method
             ELSE 'auto'
           END`,
        [userId, definitionId, ts]
      );
    } else {
      await pool.execute(
        `UPDATE user_lifecycle_checklist_items
         SET is_completed = 0, completed_at = NULL, completion_method = 'auto'
         WHERE user_id = ? AND definition_id = ? AND manually_overridden = 0 AND is_not_applicable = 0`,
        [userId, definitionId]
      );
    }
  }
}

export default UserLifecycleChecklistItem;
