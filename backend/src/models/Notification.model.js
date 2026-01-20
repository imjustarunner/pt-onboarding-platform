import pool from '../config/database.js';

class Notification {
  // Valid notification types - enforced at application layer
  // This replaces ENUM validation which caused migration issues in Cloud SQL
  static VALID_TYPES = [
    'status_expired',
    'temp_password_expired',
    'task_overdue',
    'onboarding_completed',
    'invitation_expired',
    'first_login_pending',
    'first_login',
    'password_changed',
    'passwordless_token_expired',
    'pending_completed',
    'checklist_incomplete',
    // Documents / credentials compliance
    'credential_expiring',
    'credential_expired_blocking',
    // Communications (Twilio messaging)
    'inbound_client_message',
    'support_safety_net_alert',
    // Kiosk
    'kiosk_checkin',
    'survey_completed',
    // Emergency broadcasts
    'emergency_broadcast',
    // Client chat / notes
    'client_note',
    // Platform chat (internal DM)
    'chat_message',
    // Client pipeline automation
    'paperwork_received',
    'client_became_current',
    // Background check automation
    'background_check_reimbursement_due',
    'background_check_renewal_due',
    // Payroll claims
    'mileage_claim_approved',
    'mileage_claim_rejected',
    'mileage_claim_returned',
    'medcancel_claim_approved',
    'medcancel_claim_rejected',
    'medcancel_claim_returned',
    // Payroll: documentation aging
    'payroll_unpaid_notes_2_periods_old',
    // Payroll: supervisor reminders (unsigned draft notes)
    'payroll_unsigned_draft_notes',
    // Supervision tracking
    'supervision_individual_50_reached',
    'supervision_total_100_reached',
    'supervision_supervisee_completed'
  ];

  static async create(notificationData) {
    const {
      type,
      severity = 'warning',
      title,
      message,
      audienceJson,
      userId,
      agencyId,
      relatedEntityType,
      relatedEntityId
    } = notificationData;

    // Validate notification type at application layer
    if (!type) {
      throw new Error('Notification type is required');
    }

    if (!this.VALID_TYPES.includes(type)) {
      throw new Error(
        `Invalid notification type: ${type}. Valid types are: ${this.VALID_TYPES.join(', ')}`
      );
    }

    const [result] = await pool.execute(
      `INSERT INTO notifications 
       (type, severity, title, message, audience_json, user_id, agency_id, related_entity_type, related_entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        severity,
        title,
        message,
        audienceJson ? JSON.stringify(audienceJson) : null,
        userId,
        agencyId,
        relatedEntityType,
        relatedEntityId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByAgency(agencyId, filters = {}) {
    const { type, isRead, isResolved, limit, offset } = filters;
    
    let query = 'SELECT * FROM notifications WHERE agency_id = ?';
    const params = [agencyId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (isRead !== undefined) {
      query += ' AND is_read = ?';
      params.push(isRead);
    }

    if (isResolved !== undefined) {
      query += ' AND is_resolved = ?';
      params.push(isResolved);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
      if (offset) {
        query += ' OFFSET ?';
        params.push(offset);
      }
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findByUser(userId, filters = {}) {
    const { type, isRead, isResolved } = filters;
    
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (isRead !== undefined) {
      query += ' AND is_read = ?';
      params.push(isRead);
    }

    if (isResolved !== undefined) {
      query += ' AND is_resolved = ?';
      params.push(isResolved);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async markAsRead(notificationId, userId) {
    // Mute notification for 48 hours from now
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = DATE_ADD(NOW(), INTERVAL 48 HOUR)
       WHERE id = ?`,
      [userId, notificationId]
    );
    return result.affectedRows > 0;
  }

  static async markAsResolved(notificationId) {
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_resolved = TRUE, resolved_at = NOW()
       WHERE id = ?`,
      [notificationId]
    );
    return result.affectedRows > 0;
  }

  static async delete(notificationId) {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );
    return result.affectedRows > 0;
  }

  static async markAllAsReadForAgency(agencyId, userId) {
    // Mute all notifications for 48 hours
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = DATE_ADD(NOW(), INTERVAL 48 HOUR)
       WHERE agency_id = ? AND is_read = FALSE AND is_resolved = FALSE`,
      [userId, agencyId]
    );
    return result.affectedRows;
  }

  static async markAllAsResolvedForAgency(agencyId) {
    // Mark all unresolved notifications as resolved
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_resolved = TRUE, resolved_at = NOW()
       WHERE agency_id = ? AND is_resolved = FALSE`,
      [agencyId]
    );
    return result.affectedRows;
  }

  static async markAllAsResolvedForFilter(agencyId, filters = {}) {
    // Mark notifications as resolved based on filters
    let query = `UPDATE notifications 
                 SET is_resolved = TRUE, resolved_at = NOW()
                 WHERE agency_id = ? AND is_resolved = FALSE`;
    const params = [agencyId];

    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.relatedEntityType && filters.relatedEntityId) {
      query += ' AND related_entity_type = ? AND related_entity_id = ?';
      params.push(filters.relatedEntityType, filters.relatedEntityId);
    }

    const [result] = await pool.execute(query, params);
    return result.affectedRows;
  }

  static async getUnreadCount(agencyId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE agency_id = ? 
       AND is_read = FALSE 
       AND is_resolved = FALSE
       AND (muted_until IS NULL OR muted_until <= NOW())`,
      [agencyId]
    );
    return rows[0]?.count || 0;
  }

  static async getCountsByAgency(agencyIds) {
    if (!agencyIds || agencyIds.length === 0) {
      return {};
    }

    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT agency_id, COUNT(*) as count 
       FROM notifications 
       WHERE agency_id IN (${placeholders}) 
       AND is_read = FALSE 
       AND is_resolved = FALSE
       AND (muted_until IS NULL OR muted_until <= NOW())
       GROUP BY agency_id`,
      agencyIds
    );

    const counts = {};
    rows.forEach(row => {
      counts[row.agency_id] = parseInt(row.count);
    });

    // Ensure all agencies have a count (even if 0)
    agencyIds.forEach(id => {
      if (!counts[id]) {
        counts[id] = 0;
      }
    });

    return counts;
  }

  static async deleteOldResolved(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE is_resolved = TRUE AND resolved_at < ?',
      [cutoffDate]
    );
    return result.affectedRows;
  }

  static async deleteByRelatedEntity(entityType, entityId) {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE related_entity_type = ? AND related_entity_id = ?',
      [entityType, entityId]
    );
    return result.affectedRows;
  }
}

export default Notification;
