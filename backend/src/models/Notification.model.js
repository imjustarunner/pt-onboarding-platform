import pool from '../config/database.js';
import { NOTIFICATION_TYPES } from '../services/notificationCatalog.service.js';

const PRIVATE_CROSS_USER_TYPES = new Set([
  'chat_message',
  'inbound_client_message',
  'support_safety_net_alert'
]);

class Notification {
  // Valid notification types - enforced at application layer
  // This replaces ENUM validation which caused migration issues in Cloud SQL
  static VALID_TYPES = NOTIFICATION_TYPES;

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

    const ids = [...new Set((notifications || []).map((n) => Number(n?.id || 0)).filter(Boolean))];
    if (ids.length === 0) return notifications;
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT notification_id, is_read, read_at, muted_until, requires_follow_up, dismissed_at, snoozed_until
       FROM notification_user_reads
       WHERE notification_id IN (${placeholders}) AND user_id = ?`,
      [...ids, uid]
    );
    const byId = new Map();
    for (const r of rows || []) {
      byId.set(Number(r.notification_id), {
        is_read: !!r.is_read,
        read_at: r.read_at,
        muted_until: r.muted_until,
        requires_follow_up: !!r.requires_follow_up,
        dismissed_at: r.dismissed_at,
        snoozed_until: r.snoozed_until
      });
    }

    for (const n of notifications) {
      const nid = Number(n?.id || 0);
      const notificationOwnerId = Number(n?.user_id || 0);
      const isCrossUserPrivate = (
        n?.user_id != null &&
        notificationOwnerId !== uid &&
        PRIVATE_CROSS_USER_TYPES.has(String(n?.type || ''))
      );
      if (isCrossUserPrivate) {
        n._is_read_for_viewer = false;
        n._muted_until_for_viewer = null;
        continue;
      }

      const state = byId.get(nid);
      if (state) {
        n._user_read_state = state;
        n._is_read_for_viewer = !!state.is_read;
        n._muted_until_for_viewer = state.muted_until;
        n._requires_follow_up_for_viewer = !!state.requires_follow_up;
        n._dismissed_at_for_viewer = state.dismissed_at;
        n._snoozed_until_for_viewer = state.snoozed_until;
      } else if (n.user_id != null && notificationOwnerId === uid) {
        n._is_read_for_viewer = !!n.is_read;
        n._muted_until_for_viewer = n.muted_until;
        n._requires_follow_up_for_viewer = false;
        n._dismissed_at_for_viewer = null;
        n._snoozed_until_for_viewer = null;
      } else {
        n._is_read_for_viewer = false;
        n._muted_until_for_viewer = null;
        n._requires_follow_up_for_viewer = false;
        n._dismissed_at_for_viewer = null;
        n._snoozed_until_for_viewer = null;
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
    const [exists] = await pool.execute(
      'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
      [notificationId, uid]
    );
    if ((exists || []).length === 0 && Number(notification.user_id) === uid) {
      return (await this.markAsRead(notificationId, userId)) !== false;
    }
    if (
      notification.user_id != null &&
      Number(notification.user_id) !== uid &&
      PRIVATE_CROSS_USER_TYPES.has(String(notification.type || ''))
    ) {
      return false; // Cannot mark another user's personal notification
    }

    if ((exists || []).length > 0) {
      const [result] = await pool.execute(
        `UPDATE notification_user_reads
         SET is_read = TRUE, read_at = NOW(), muted_until = NULL, requires_follow_up = FALSE
         WHERE notification_id = ? AND user_id = ?`,
        [notificationId, uid]
      );
      return result.affectedRows > 0;
    }
    const [result] = await pool.execute(
      `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
       VALUES (?, ?, TRUE, NOW(), NULL)`,
      [notificationId, uid]
    );
    return result.affectedRows > 0;
  }

  static async isFollowUpForUser(notificationId, userId) {
    const uid = Number(userId);
    if (!uid) return false;
    const [rows] = await pool.execute(
      `SELECT requires_follow_up
       FROM notification_user_reads
       WHERE notification_id = ? AND user_id = ?
       LIMIT 1`,
      [notificationId, uid]
    );
    return !!rows?.[0]?.requires_follow_up;
  }

  static async setFollowUpForUser(notificationId, userId, enabled = true) {
    const notification = await this.findById(notificationId);
    if (!notification) return false;
    const uid = Number(userId);
    if (!uid) return false;
    if (
      notification.user_id != null &&
      Number(notification.user_id) !== uid &&
      PRIVATE_CROSS_USER_TYPES.has(String(notification.type || ''))
    ) {
      return false;
    }

    const shouldEnable = enabled === true;
    const [exists] = await pool.execute(
      'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
      [notificationId, uid]
    );

    if ((exists || []).length > 0) {
      const [result] = await pool.execute(
        `UPDATE notification_user_reads
         SET requires_follow_up = ?,
             is_read = CASE WHEN ? THEN FALSE ELSE is_read END,
             read_at = CASE WHEN ? THEN NULL ELSE read_at END,
             muted_until = CASE WHEN ? THEN NULL ELSE muted_until END
         WHERE notification_id = ? AND user_id = ?`,
        [shouldEnable ? 1 : 0, shouldEnable ? 1 : 0, shouldEnable ? 1 : 0, shouldEnable ? 1 : 0, notificationId, uid]
      );
      return result.affectedRows > 0;
    }

    const [result] = await pool.execute(
      `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until, requires_follow_up)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [notificationId, uid, shouldEnable ? 0 : 1, shouldEnable ? null : new Date(), null, shouldEnable ? 1 : 0]
    );
    return result.affectedRows > 0;
  }

  /**
   * Dismiss a notification for a specific viewer only.
   * Stores an explicit dismissed timestamp without deleting or closing it for anyone else.
   */
  static async dismissForUser(notificationId, userId) {
    const notification = await this.findById(notificationId);
    if (!notification) return false;
    const uid = Number(userId);
    if (!uid) return false;

    if (
      notification.user_id != null &&
      Number(notification.user_id) !== uid &&
      PRIVATE_CROSS_USER_TYPES.has(String(notification.type || ''))
    ) {
      return false;
    }

    const [exists] = await pool.execute(
      'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
      [notificationId, uid]
    );
    if ((exists || []).length > 0) {
      const [result] = await pool.execute(
        `UPDATE notification_user_reads
         SET is_read = TRUE, read_at = NOW(), muted_until = NULL, dismissed_at = NOW(), snoozed_until = NULL
         WHERE notification_id = ? AND user_id = ?`,
        [notificationId, uid]
      );
      return result.affectedRows > 0;
    }
    const [result] = await pool.execute(
      `INSERT INTO notification_user_reads
        (notification_id, user_id, is_read, read_at, muted_until, dismissed_at, snoozed_until)
       VALUES (?, ?, TRUE, NOW(), NULL, NOW(), NULL)`,
      [notificationId, uid]
    );
    return result.affectedRows > 0;
  }

  static async setViewerState(notificationId, userId, updates = {}) {
    const notification = await this.findById(notificationId);
    if (!notification) return false;
    const uid = Number(userId);
    if (!uid) return false;
    if (
      notification.user_id != null
      && Number(notification.user_id) !== uid
      && PRIVATE_CROSS_USER_TYPES.has(String(notification.type || ''))
    ) return false;

    const [existingRows] = await pool.execute(
      `SELECT is_read, read_at, requires_follow_up, dismissed_at, snoozed_until
       FROM notification_user_reads WHERE notification_id = ? AND user_id = ? LIMIT 1`,
      [notificationId, uid]
    );
    const existing = existingRows?.[0] || {};
    let isRead = updates.read === undefined ? !!existing.is_read : !!updates.read;
    let followUp = updates.followUp === undefined ? !!existing.requires_follow_up : !!updates.followUp;
    let dismissedAt = existing.dismissed_at || null;
    let snoozedUntil = existing.snoozed_until || null;
    if (updates.dismissed === true) {
      if (followUp) return false;
      dismissedAt = new Date();
      snoozedUntil = null;
      isRead = true;
    } else if (updates.dismissed === false) {
      dismissedAt = null;
    }
    if (updates.snoozedUntil !== undefined) {
      snoozedUntil = updates.snoozedUntil ? new Date(updates.snoozedUntil) : null;
      if (snoozedUntil && !Number.isFinite(snoozedUntil.getTime())) return false;
    }
    if (followUp) {
      isRead = false;
      dismissedAt = null;
      snoozedUntil = null;
    }
    await pool.execute(
      `INSERT INTO notification_user_reads
        (notification_id, user_id, is_read, read_at, muted_until, requires_follow_up, dismissed_at, snoozed_until)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_read = VALUES(is_read), read_at = VALUES(read_at), muted_until = NULL,
         requires_follow_up = VALUES(requires_follow_up), dismissed_at = VALUES(dismissed_at),
         snoozed_until = VALUES(snoozed_until)`,
      [notificationId, uid, isRead ? 1 : 0, isRead ? new Date() : null, followUp ? 1 : 0, dismissedAt, snoozedUntil]
    );
    if (Number(notification.user_id) === uid) {
      await pool.execute(
        `UPDATE notifications SET is_read = ?, read_at = ?, muted_until = NULL WHERE id = ?`,
        [isRead ? 1 : 0, isRead ? new Date() : null, notificationId]
      );
    }
    return true;
  }

  static async bulkSetViewerState(notificationIds, userId, action) {
    const uid = Number(userId);
    const ids = [...new Set((notificationIds || []).map(Number).filter(Boolean))];
    if (!uid || !ids.length) return 0;
    if (!['mark_read', 'mark_unread', 'dismiss', 'restore'].includes(action)) return 0;
    let affected = 0;
    const chunkSize = 500;
    for (let start = 0; start < ids.length; start += chunkSize) {
      const chunk = ids.slice(start, start + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT n.id, n.user_id, n.is_read AS personal_is_read, n.read_at AS personal_read_at,
                nur.is_read, nur.read_at, nur.requires_follow_up, nur.dismissed_at, nur.snoozed_until
         FROM notifications n
         LEFT JOIN notification_user_reads nur ON nur.notification_id = n.id AND nur.user_id = ?
         WHERE n.id IN (${placeholders})`,
        [uid, ...chunk]
      );
      const values = [];
      const now = new Date();
      for (const row of rows || []) {
        const followUp = !!row.requires_follow_up;
        if (action === 'dismiss' && followUp) continue;
        let isRead = row.is_read == null
          ? (Number(row.user_id) === uid ? !!row.personal_is_read : false)
          : !!row.is_read;
        let readAt = row.read_at || (Number(row.user_id) === uid ? row.personal_read_at : null);
        let dismissedAt = row.dismissed_at || null;
        let snoozedUntil = row.snoozed_until || null;
        if (action === 'mark_read' && !followUp) {
          isRead = true;
          readAt = now;
        } else if (action === 'mark_unread') {
          isRead = false;
          readAt = null;
        } else if (action === 'dismiss') {
          isRead = true;
          readAt = now;
          dismissedAt = now;
          snoozedUntil = null;
        } else if (action === 'restore') {
          dismissedAt = null;
        }
        values.push([Number(row.id), uid, isRead ? 1 : 0, readAt, followUp ? 1 : 0, dismissedAt, snoozedUntil]);
      }
      if (!values.length) continue;
      const valueSql = values.map(() => '(?, ?, ?, ?, NULL, ?, ?, ?)').join(',');
      await pool.execute(
        `INSERT INTO notification_user_reads
          (notification_id, user_id, is_read, read_at, muted_until, requires_follow_up, dismissed_at, snoozed_until)
         VALUES ${valueSql}
         ON DUPLICATE KEY UPDATE
           is_read = VALUES(is_read), read_at = VALUES(read_at), muted_until = NULL,
           requires_follow_up = VALUES(requires_follow_up), dismissed_at = VALUES(dismissed_at),
           snoozed_until = VALUES(snoozed_until)`,
        values.flat()
      );
      const affectedIds = values.map((value) => value[0]);
      await pool.execute(
        `UPDATE notifications n
         JOIN notification_user_reads nur ON nur.notification_id = n.id AND nur.user_id = ?
         SET n.is_read = nur.is_read, n.read_at = nur.read_at, n.muted_until = NULL
         WHERE n.user_id = ? AND n.id IN (${affectedIds.map(() => '?').join(',')})`,
        [uid, uid, ...affectedIds]
      );
      affected += values.length;
    }
    return affected;
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
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = NULL
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
    let agencyWideCount = 0;
    for (const r of agencyWide || []) {
      const nid = r.id;
      const [exists] = await pool.execute(
        'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
        [nid, uid]
      );
      if ((exists || []).length > 0) {
        await pool.execute(
          `UPDATE notification_user_reads
           SET is_read = TRUE, read_at = NOW(), muted_until = NULL, requires_follow_up = FALSE
           WHERE notification_id = ? AND user_id = ?`,
          [nid, uid]
        );
      } else {
        await pool.execute(
          `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
           VALUES (?, ?, TRUE, NOW(), NULL)`,
          [nid, uid]
        );
      }
      agencyWideCount += 1;
    }

    // Cross-user notifications: admins/support/etc can mark as read for themselves using notification_user_reads.
    // Keep message-private items excluded from cross-user mark-read.
    const [agencyViewable] = await pool.execute(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_user_reads nur ON n.id = nur.notification_id AND nur.user_id = ?
       WHERE n.agency_id = ? AND n.user_id IS NOT NULL AND n.user_id != ?
       AND n.type NOT IN ('chat_message','inbound_client_message','support_safety_net_alert')
       AND n.is_resolved = FALSE
       AND (nur.notification_id IS NULL OR (nur.is_read = FALSE AND (nur.muted_until IS NULL OR nur.muted_until <= NOW())))`,
      [uid, agencyId, uid]
    );
    for (const r of agencyViewable || []) {
      const nid = r.id;
      const [exists] = await pool.execute(
        'SELECT 1 FROM notification_user_reads WHERE notification_id = ? AND user_id = ?',
        [nid, uid]
      );
      if ((exists || []).length > 0) {
        await pool.execute(
          `UPDATE notification_user_reads
           SET is_read = TRUE, read_at = NOW(), muted_until = NULL, requires_follow_up = FALSE
           WHERE notification_id = ? AND user_id = ?`,
          [nid, uid]
        );
      } else {
        await pool.execute(
          `INSERT INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
           VALUES (?, ?, TRUE, NOW(), NULL)`,
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

    const [agencyViewable] = await pool.execute(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_user_reads nur ON n.id = nur.notification_id AND nur.user_id = ?
       WHERE n.agency_id = ? AND n.user_id IS NOT NULL AND n.user_id != ?
       AND n.type NOT IN ('chat_message','inbound_client_message','support_safety_net_alert')
       AND n.is_resolved = FALSE
       AND (nur.notification_id IS NULL OR (nur.is_read = FALSE AND (nur.muted_until IS NULL OR nur.muted_until <= NOW())))`,
      [uid, agencyId, uid]
    );
    const v = (agencyViewable || []).length;

    return p + a + v;
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
    // Compatibility path: read state no longer implies a temporary mute.
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = NULL
       WHERE id = ?`,
      [userId, notificationId]
    );
    return result.affectedRows > 0;
  }

  static async markAsResolvedByRelatedEntity(agencyId, relatedEntityType, relatedEntityId) {
    const [result] = await pool.execute(
      `UPDATE notifications
       SET is_resolved = TRUE, resolved_at = NOW()
       WHERE agency_id = ? AND related_entity_type = ? AND related_entity_id = ? AND is_resolved = FALSE`,
      [agencyId, relatedEntityType, relatedEntityId]
    );
    return result.affectedRows;
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
    // Compatibility path: mark read without hiding the notifications.
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = ?, muted_until = NULL
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
      `SELECT n.*
       FROM notifications n
       LEFT JOIN notification_user_reads nur
         ON nur.notification_id = n.id
        AND nur.user_id = ?
       WHERE n.user_id = ?
         AND n.agency_id IN (${placeholders})
         AND n.is_resolved = FALSE
         AND (
           (nur.notification_id IS NOT NULL AND nur.is_read = FALSE AND (nur.muted_until IS NULL OR nur.muted_until <= NOW()))
           OR
           (nur.notification_id IS NULL AND n.is_read = FALSE AND (n.muted_until IS NULL OR n.muted_until <= NOW()))
         )
       ORDER BY n.created_at DESC`,
      [uid, ...params]
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
