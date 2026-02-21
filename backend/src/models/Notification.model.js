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
    // School portal ticketing
    'support_ticket_created',
    // Client pipeline automation
    'paperwork_received',
    'client_became_current',
    'client_checklist_updated',
    'client_assigned',
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
    // Payroll: reminder when period is posted and notes still need attention
    'payroll_missing_notes_reminder',
    // Payroll: supervisor reminders (unsigned draft notes)
    'payroll_unsigned_draft_notes',
    // Payroll: Direct/Indirect ratio yellow or red (hourly workers)
    'payroll_direct_indirect_ratio_alert',
    // Office scheduling
    'office_schedule_biweekly_review',
    'office_schedule_booking_confirm_6_weeks',
    'office_schedule_unbooked_forfeit',
    // Supervision tracking
    'supervision_individual_50_reached',
    'supervision_total_100_reached',
    'supervision_supervisee_completed',
    'supervision_presenter_reminder',
    // Payroll: home address changes (mileage / compliance workflow)
    'payroll_home_address_updated',
    // Custom program reminders
    'program_reminder',
    // Presence: nudge when Out Quick return time has passed
    'presence_return_overdue_nudge',
    // Agency announcement automation
    'birthday_announcement',
    'anniversary_announcement',
    // Platform activity (admin/staff/provider_plus/super_admin visibility)
    'user_login',
    'user_logout'
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
      relatedEntityId,
      actorUserId,
      actorSource
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
       (type, severity, title, message, audience_json, user_id, agency_id, related_entity_type, related_entity_id, actor_user_id, actor_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        severity,
        title,
        message,
        audienceJson ? JSON.stringify(audienceJson) : null,
        userId,
        agencyId,
        relatedEntityType,
        relatedEntityId,
        actorUserId || null,
        actorSource ? String(actorSource).trim().slice(0, 100) : null
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

    // For backward compat: when no viewerUserId, use legacy is_read on notification row.
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

  /**
   * Determine if a notification is read for a specific user.
   * - Personal notifications (user_id set): use notifications.is_read.
   * - Agency-wide (user_id null): use notification_user_reads.
   */
  static isReadForUser(notification, userId) {
    const uid = Number(userId);
    const n = notification;
    if (!n) return false;
    if (Number(n.user_id) === uid) {
      return !!n.is_read;
    }
    if (n.user_id != null) return false; // Other user's personal notification
    return !!n._user_read_state?.is_read;
  }

  /**
   * Apply per-user read state to agency-wide notifications.
   * Mutates notifications in place: adds _user_read_state and _is_read_for_viewer.
   */
  static async applyReadStateForViewer(notifications, viewerUserId) {
    const uid = Number(viewerUserId);
    if (!uid || !Array.isArray(notifications) || notifications.length === 0) return notifications;

    const agencyWide = notifications.filter((n) => n.user_id == null);
    if (agencyWide.length === 0) return notifications;

    const ids = agencyWide.map((n) => n.id).filter(Boolean);
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT notification_id, is_read, read_at, muted_until
       FROM notification_user_reads
       WHERE notification_id IN (${placeholders}) AND user_id = ?`,
      [...ids, uid]
    );
    const byId = new Map();
    for (const r of rows || []) {
      byId.set(Number(r.notification_id), {
        is_read: !!r.is_read,
        read_at: r.read_at,
        muted_until: r.muted_until
      });
    }

    for (const n of agencyWide) {
      const state = byId.get(Number(n.id)) || { is_read: false };
      n._user_read_state = state;
      n._is_read_for_viewer = state.is_read;
      n._muted_until_for_viewer = state.muted_until;
    }
    for (const n of notifications) {
      if (n.user_id != null) {
        n._is_read_for_viewer = Number(n.user_id) === uid ? !!n.is_read : false;
        n._muted_until_for_viewer = n.muted_until;
      }
    }
    return notifications;
  }

  /**
   * Mark a notification as read for a specific user only.
   * - Personal (user_id = userId): update notifications row.
   * - Agency-wide (user_id null): insert/update notification_user_reads.
   */
  static async markAsReadForUser(notificationId, userId) {
    const notification = await this.findById(notificationId);
    if (!notification) return false;

    const uid = Number(userId);
    if (Number(notification.user_id) === uid) {
      return (await this.markAsRead(notificationId, userId)) !== false;
    }
    if (notification.user_id != null) return false; // Cannot mark another user's personal notification

    const [exists] = await pool.execute(
      'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
      [notificationId, uid]
    );
    const mutedUntil = new Date();
    mutedUntil.setHours(mutedUntil.getHours() + 48);
    if ((exists || []).length > 0) {
      const [result] = await pool.execute(
        `UPDATE notification_user_reads
         SET is_read = TRUE, read_at = NOW(), muted_until = DATE_ADD(NOW(), INTERVAL 48 HOUR)
         WHERE notification_id = ? AND user_id = ?`,
        [notificationId, uid]
      );
      return result.affectedRows > 0;
    }
    const [result] = await pool.execute(
      `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
       VALUES (?, ?, TRUE, NOW(), DATE_ADD(NOW(), INTERVAL 48 HOUR))`,
      [notificationId, uid]
    );
    return result.affectedRows > 0;
  }

  /**
   * Mark all agency notifications as read for a specific user only.
   * - Personal notifications: only those where user_id = userId.
   * - Agency-wide: insert into notification_user_reads for each visible notification.
   */
  static async markAllAsReadForAgencyForUser(agencyId, userId) {
    const uid = Number(userId);
    const [personal] = await pool.execute(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = DATE_ADD(NOW(), INTERVAL 48 HOUR)
       WHERE agency_id = ? AND user_id = ? AND is_read = FALSE AND is_resolved = FALSE`,
      [uid, agencyId, uid]
    );
    let personalCount = personal.affectedRows || 0;

    const [agencyWide] = await pool.execute(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_user_reads nur ON n.id = nur.notification_id AND nur.user_id = ?
       WHERE n.agency_id = ? AND n.user_id IS NULL AND n.is_resolved = FALSE
       AND (nur.notification_id IS NULL OR (nur.is_read = FALSE AND (nur.muted_until IS NULL OR nur.muted_until <= NOW())))`,
      [uid, agencyId]
    );
    const ids = (agencyWide || []).map((r) => r.id);
    let agencyWideCount = 0;
    for (const nid of ids) {
      const [exists] = await pool.execute(
        'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
        [nid, uid]
      );
      if ((exists || []).length > 0) {
        await pool.execute(
          `UPDATE notification_user_reads
           SET is_read = TRUE, read_at = NOW(), muted_until = DATE_ADD(NOW(), INTERVAL 48 HOUR)
           WHERE notification_id = ? AND user_id = ?`,
          [nid, uid]
        );
      } else {
        await pool.execute(
          `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
           VALUES (?, ?, TRUE, NOW(), DATE_ADD(NOW(), INTERVAL 48 HOUR))`,
          [nid, uid]
        );
      }
      agencyWideCount += 1;
    }
    return personalCount + agencyWideCount;
  }

  /**
   * Get unread count for a specific user (per-user read state for agency-wide notifications).
   */
  static async getUnreadCountForUser(agencyId, userId) {
    const uid = Number(userId);
    const [personal] = await pool.execute(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE agency_id = ? AND user_id = ? AND is_read = FALSE AND is_resolved = FALSE
       AND (muted_until IS NULL OR muted_until <= NOW())`,
      [agencyId, uid]
    );
    const p = (personal || [])[0]?.c || 0;

    const [agencyWide] = await pool.execute(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_user_reads nur ON n.id = nur.notification_id AND nur.user_id = ?
       WHERE n.agency_id = ? AND n.user_id IS NULL AND n.is_resolved = FALSE
       AND (nur.notification_id IS NULL OR (nur.is_read = FALSE AND (nur.muted_until IS NULL OR nur.muted_until <= NOW())))`,
      [uid, agencyId]
    );
    const a = (agencyWide || []).length;
    return p + a;
  }

  /**
   * Get unread counts by agency for a specific user (per-user read state).
   */
  static async getCountsByAgencyForUser(agencyIds, userId) {
    if (!agencyIds || agencyIds.length === 0) return {};
    const uid = Number(userId);
    const counts = {};
    for (const aid of agencyIds) {
      counts[aid] = await this.getUnreadCountForUser(aid, uid);
    }
    return counts;
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

  static async purgeByAgency(agencyId) {
    const [result] = await pool.execute('DELETE FROM notifications WHERE agency_id = ?', [agencyId]);
    return result.affectedRows || 0;
  }

  static async purgeAll() {
    const [result] = await pool.execute('DELETE FROM notifications');
    return result.affectedRows || 0;
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

  /**
   * Fetch unread + unresolved + unmuted notifications for a user,
   * scoped to a set of agencies.
   *
   * Used for navbar/count badges so providers don't get agency-wide counts.
   */
  static async findUnreadUnmutedByUserAcrossAgencies(userId, agencyIds) {
    const uid = Number(userId);
    if (!uid) return [];
    if (!agencyIds || agencyIds.length === 0) return [];

    const placeholders = agencyIds.map(() => '?').join(',');
    const params = [uid, ...agencyIds];
    const [rows] = await pool.execute(
      `SELECT *
       FROM notifications
       WHERE user_id = ?
         AND agency_id IN (${placeholders})
         AND is_read = FALSE
         AND is_resolved = FALSE
         AND (muted_until IS NULL OR muted_until <= NOW())
       ORDER BY created_at DESC`,
      params
    );
    return rows || [];
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
