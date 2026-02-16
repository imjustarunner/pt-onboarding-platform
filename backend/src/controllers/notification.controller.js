import Notification from '../models/Notification.model.js';
import NotificationService from '../services/notification.service.js';
import User from '../models/User.model.js';
import NotificationSmsLog from '../models/NotificationSmsLog.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationDispatcherService from '../services/notificationDispatcher.service.js';
import ProgramReminderService from '../services/programReminder.service.js';
import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function viewerAudienceKey(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'supervisor') return 'supervisor';
  if (r === 'clinical_practice_assistant') return 'clinicalPracticeAssistant';
  // Treat internal staff as admin-like for notification audiences.
  if (r === 'admin' || r === 'super_admin' || r === 'support' || r === 'staff') return 'admin';
  return 'provider';
}

function audienceAllows(notification, userRole) {
  const aud = parseJsonMaybe(notification?.audience_json);
  if (!aud || typeof aud !== 'object') return true; // default: visible to all (backward compatible)
  const key = viewerAudienceKey(userRole);
  const v = aud[key];
  // If the audience map doesn't mention this role, treat as allowed (backward compatible).
  if (v === undefined) return true;
  return v !== false;
}

function resolveTriggerSetting(trigger, setting) {
  const enabled =
    setting?.enabled === null || setting?.enabled === undefined
      ? !!trigger.defaultEnabled
      : !!setting.enabled;

  const channels =
    setting?.channels && typeof setting.channels === 'object'
      ? setting.channels
      : (trigger.defaultChannels && typeof trigger.defaultChannels === 'object' ? trigger.defaultChannels : { inApp: true, sms: false, email: false });

  const recipients =
    setting?.recipients && typeof setting.recipients === 'object'
      ? setting.recipients
      : (trigger.defaultRecipients && typeof trigger.defaultRecipients === 'object' ? trigger.defaultRecipients : { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true });

  return { enabled, channels, recipients };
}

// Message-related notification types must never be visible cross-user.
const MESSAGE_PRIVATE_TYPES = new Set(['chat_message', 'inbound_client_message', 'support_safety_net_alert']);

function filterNotificationsForViewer(notifications, viewerUserId, viewerRole) {
  const uid = Number(viewerUserId);
  return (notifications || [])
    .filter((n) => audienceAllows(n, viewerRole))
    .filter((n) => {
      const t = String(n?.type || '');
      if (!MESSAGE_PRIVATE_TYPES.has(t)) return true;
      return Number(n?.user_id) === uid;
    });
}

function isUnmuted(notification) {
  const raw = notification?._muted_until_for_viewer ?? notification?.muted_until;
  if (!raw) return true;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return true; // best-effort: don't hide if unparsable
  return t <= Date.now();
}

const PERSONAL_ONLY_ROLES = new Set(['provider', 'staff', 'intern', 'facilitator']);

async function appendNotificationContext(notifications) {
  const list = Array.isArray(notifications) ? notifications : [];
  if (list.length === 0) return list;

  const agencyIds = Array.from(
    new Set(list.map((n) => Number(n?.agency_id || 0)).filter((v) => Number.isFinite(v) && v > 0))
  );
  const agencyNameById = new Map();
  if (agencyIds.length) {
    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, name
       FROM agencies
       WHERE id IN (${placeholders})`,
      agencyIds
    );
    for (const r of rows || []) {
      agencyNameById.set(Number(r.id), String(r.name || '').trim());
    }
  }

  const clientIds = Array.from(
    new Set(
      list
        .filter((n) => String(n?.related_entity_type || '').toLowerCase() === 'client')
        .map((n) => Number(n?.related_entity_id || 0))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );
  const clientById = new Map();
  if (clientIds.length) {
    const placeholders = clientIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT c.id,
              c.initials,
              c.identifier_code,
              MIN(a.name) AS organization_name
       FROM clients c
       LEFT JOIN client_organization_assignments coa
         ON coa.client_id = c.id
        AND coa.is_active = TRUE
       LEFT JOIN agencies a ON a.id = coa.organization_id
       WHERE c.id IN (${placeholders})
       GROUP BY c.id`,
      clientIds
    );
    for (const r of rows || []) {
      clientById.set(Number(r.id), {
        initials: String(r.initials || '').trim(),
        code: String(r.identifier_code || '').trim(),
        organization_name: String(r.organization_name || '').trim()
      });
    }
  }

    for (const n of list) {
      const agencyName = agencyNameById.get(Number(n?.agency_id || 0)) || '';
      if (agencyName) n.agency_name = agencyName;
      if (String(n?.related_entity_type || '').toLowerCase() === 'client') {
        const info = clientById.get(Number(n?.related_entity_id || 0));
        if (info) {
          n.client_initials = info.initials || '';
          n.client_identifier_code = info.code || '';
          if (info.organization_name) n.organization_name = info.organization_name;
        }
      }
      // Per-user read state: expose as is_read for frontend compatibility
      if (n._is_read_for_viewer !== undefined) {
        n.is_read = n._is_read_for_viewer;
      }
      if (n._muted_until_for_viewer !== undefined) {
        n.muted_until = n._muted_until_for_viewer;
      }
    }

  return list;
}

export const getNotifications = async (req, res, next) => {
  try {
    const { agencyId, type, isRead, isResolved } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine which agencies the user can access
    let accessibleAgencyIds = [];
    
    if (userRole === 'super_admin') {
      // Super admin can see all agencies
      if (agencyId) {
        accessibleAgencyIds = [parseInt(agencyId)];
      } else {
        // Get all agencies
        const pool = (await import('../config/database.js')).default;
        const [agencies] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
        accessibleAgencyIds = agencies.map(a => a.id);
      }
    } else if (userRole === 'supervisor') {
      // Supervisors can only see notifications for their assigned supervisees
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }

      if (accessibleAgencyIds.length === 0) {
        return res.json([]);
      }

      // Get all supervisee IDs across all agencies
      const allSuperviseeIds = [];
      for (const agencyId of accessibleAgencyIds) {
        const superviseeIds = await SupervisorAssignment.getSuperviseeIds(userId, agencyId);
        allSuperviseeIds.push(...superviseeIds);
      }

      // Get notifications for all accessible agencies, then filter by supervisee IDs
      const allNotifications = [];
      for (const agencyId of accessibleAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          type: type || undefined,
          isRead: isRead !== undefined ? isRead === 'true' : undefined,
          isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
        });
        // Filter to only notifications for assigned supervisees
        const filteredNotifications = notifications.filter(n => 
          n.user_id && allSuperviseeIds.includes(n.user_id)
        );
        allNotifications.push(...filteredNotifications);
      }

      // Sort by created_at descending
      allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const filtered = filterNotificationsForViewer(allNotifications, userId, userRole);
      await appendNotificationContext(filtered);
      return res.json(filtered);
    } else if (userRole === 'clinical_practice_assistant') {
      // CPAs can see all notifications for all users in their agencies
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }

      if (accessibleAgencyIds.length === 0) {
        return res.json([]);
      }

      // Get notifications for all accessible agencies (CPAs see all; per-user read state)
      const allNotifications = [];
      for (const agencyId of accessibleAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          type: type || undefined,
          isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
        });
        allNotifications.push(...notifications);
      }

      await Notification.applyReadStateForViewer(allNotifications, userId);
      let filtered = filterNotificationsForViewer(allNotifications, userId, userRole);
      if (isRead !== undefined) {
        const wantRead = isRead === 'true';
        filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
      }
      filtered = filtered.filter(isUnmuted);
      await appendNotificationContext(filtered);
      return res.json(filtered);
    } else if (PERSONAL_ONLY_ROLES.has(String(userRole || '').toLowerCase())) {
      // Providers/staff/intern/facilitator: personal notifications only (target user_id).
      // They can optionally scope by agencyId but must have membership.
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = (userAgencies || []).map((a) => a.id);
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
      }

      const personal = await Notification.findByUser(userId, {
        type: type || undefined,
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
      });
      const scoped = agencyId ? (personal || []).filter((n) => Number(n.agency_id) === Number(agencyId)) : (personal || []);
      const filtered = filterNotificationsForViewer(scoped, userId, userRole);
      await appendNotificationContext(filtered);
      return res.json(filtered);
    } else {
      // Admin/support (and other privileged/legacy roles): agency-scoped feed
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }
    }

    if (accessibleAgencyIds.length === 0) {
      return res.json([]);
    }

    // Get notifications for all accessible agencies (admin/support; per-user read state)
    const allNotifications = [];
    for (const agencyId of accessibleAgencyIds) {
      const notifications = await Notification.findByAgency(agencyId, {
        type: type || undefined,
        isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
      });
      allNotifications.push(...notifications);
    }

    await Notification.applyReadStateForViewer(allNotifications, userId);
    let filtered = filterNotificationsForViewer(allNotifications, userId, userRole);
    if (isRead !== undefined) {
      const wantRead = isRead === 'true';
      filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
    }
    filtered = filtered.filter(isUnmuted);
    await appendNotificationContext(filtered);
    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

/**
 * Create custom program reminder notifications (in-app + optional SMS).
 * POST /api/notifications/program-reminder
 * body: { agencyId, title, message, recipients?, channels? }
 */
export const createProgramReminder = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.body?.agencyId || '', 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const title = String(req.body?.title || '').trim() || 'Program reminder';
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const requestedRecipients = req.body?.recipients && typeof req.body.recipients === 'object' ? req.body.recipients : null;
    const requestedChannels = req.body?.channels && typeof req.body.channels === 'object' ? req.body.channels : null;
    const result = await ProgramReminderService.dispatchReminder({
      agencyId,
      title,
      message,
      recipientsOverride: requestedRecipients,
      channelsOverride: requestedChannels
    });
    if (result?.skipped) {
      return res.status(403).json({ error: { message: 'Program reminder trigger is disabled' } });
    }
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

export const getNotificationCounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const requestedScope = String(req.query?.scope || '').trim().toLowerCase();

    let agencyIds = [];

    // Managed-feed counts: align with admin Notifications page unread logic.
    // This includes all unread, unresolved, unmuted items visible in the agency feed.
    if (
      requestedScope === 'managed_feed'
      && (userRole === 'super_admin' || userRole === 'admin' || userRole === 'support')
    ) {
      if (userRole === 'super_admin') {
        const pool = (await import('../config/database.js')).default;
        const [agencies] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
        agencyIds = agencies.map((a) => a.id);
      } else {
        const userAgencies = await User.getAgencies(userId);
        agencyIds = userAgencies.map((a) => a.id);
      }

      if (agencyIds.length === 0) return res.json({});

      const counts = {};
      for (const aid of agencyIds) {
        const notifications = await Notification.findByAgency(aid, {
          isResolved: false
        });
        await Notification.applyReadStateForViewer(notifications, userId);
        const visible = filterNotificationsForViewer(notifications, userId, userRole).filter(isUnmuted);
        counts[aid] = visible.filter((n) => !n._is_read_for_viewer && !n.is_resolved).length;
      }
      return res.json(counts);
    }
    
    if (userRole === 'super_admin') {
      // Super admin can see all agencies
      const pool = (await import('../config/database.js')).default;
      const [agencies] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
      agencyIds = agencies.map(a => a.id);
    } else if (userRole === 'supervisor') {
      // Supervisors can only see notification counts for their assigned supervisees
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(userId);
      const allAgencyIds = userAgencies.map(a => a.id);
      
      // Get all supervisee IDs across all agencies
      const allSuperviseeIds = [];
      for (const agencyId of allAgencyIds) {
        const superviseeIds = await SupervisorAssignment.getSuperviseeIds(userId, agencyId);
        allSuperviseeIds.push(...superviseeIds);
      }

      // Get counts for all agencies, then filter by supervisee IDs
      const allCounts = await Notification.getCountsByAgency(allAgencyIds);
      
      // Filter counts to only include notifications for assigned supervisees
      const filteredCounts = {};
      for (const agencyId of allAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          isRead: false,
          isResolved: false
        });
        const filteredNotifications = notifications.filter(n => 
          n.user_id && allSuperviseeIds.includes(n.user_id)
        );
        filteredCounts[agencyId] = filterNotificationsForViewer(filteredNotifications, userId, userRole).length;
      }
      
      return res.json(filteredCounts);
    } else if (userRole === 'clinical_practice_assistant') {
      // CPAs see their own per-user counts (agency-wide + any personal to them)
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
      if (agencyIds.length > 0) {
        const counts = await Notification.getCountsByAgencyForUser(agencyIds, userId);
        return res.json(counts);
      }
    } else if (PERSONAL_ONLY_ROLES.has(String(userRole || '').toLowerCase())) {
      // Providers/staff/intern/facilitator: counts should be for *their* unread notifications only.
      const userAgencies = await User.getAgencies(userId);
      agencyIds = (userAgencies || []).map((a) => a.id);

      if (agencyIds.length === 0) return res.json({});

      const unread = await Notification.findUnreadUnmutedByUserAcrossAgencies(userId, agencyIds);
      const filtered = filterNotificationsForViewer(unread, userId, userRole);
      const counts = {};
      for (const aid of agencyIds) counts[aid] = 0;
      for (const n of filtered || []) {
        const aid = Number(n?.agency_id || 0);
        if (!aid) continue;
        counts[aid] = (counts[aid] || 0) + 1;
      }
      return res.json(counts);
    } else {
      // Admin/support see their own per-user counts
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
    }

    if (agencyIds.length === 0) {
      return res.json({});
    }

    // Per-user counts: each user sees only their own unread notifications
    const counts = await Notification.getCountsByAgencyForUser(agencyIds, userId);
    res.json(counts);
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }
    if (MESSAGE_PRIVATE_TYPES.has(String(notification.type || '')) && Number(notification.user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // User-specific: only the recipient can mark personal notifications; agency-wide can be marked by anyone with access
    if (notification.user_id != null && Number(notification.user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'You can only mark your own notifications as read' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const ok = await Notification.markAsReadForUser(id, userId);
    if (!ok) {
      return res.status(403).json({ error: { message: 'Unable to mark notification as read' } });
    }
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

export const markAsResolved = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }
    if (MESSAGE_PRIVATE_TYPES.has(String(notification.type || '')) && Number(notification.user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    await Notification.markAsResolved(id);
    res.json({ message: 'Notification marked as resolved' });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const { agencyId, filters } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Verify user has access to this agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    let count;
    if (filters && (filters.type || filters.userId || filters.relatedEntityType)) {
      // Mark filtered notifications as read (user-specific: only current user's read state)
      const allNotifications = await Notification.findByAgency(parseInt(agencyId), {
        type: filters.type,
        isResolved: false
      });
      await Notification.applyReadStateForViewer(allNotifications, userId);
      let filtered = allNotifications.filter((n) => !n._is_read_for_viewer);
      if (filters.userId) {
        filtered = filtered.filter(n => n.user_id === parseInt(filters.userId));
      }
      if (filters.relatedEntityType && filters.relatedEntityId) {
        filtered = filtered.filter(n => 
          n.related_entity_type === filters.relatedEntityType && 
          n.related_entity_id === parseInt(filters.relatedEntityId)
        );
      }
      // Only mark notifications the current user can mark (personal to them or agency-wide)
      filtered = filtered.filter((n) => n.user_id == null || Number(n.user_id) === Number(userId));
      
      // Mark each filtered notification as read for current user only
      for (const notification of filtered) {
        await Notification.markAsReadForUser(notification.id, userId);
      }
      count = filtered.length;
    } else {
      count = await Notification.markAllAsReadForAgencyForUser(parseInt(agencyId), userId);
    }
    
    res.json({ message: `${count} notifications marked as read (muted for 48 hours)` });
  } catch (error) {
    next(error);
  }
};

export const markAllAsResolved = async (req, res, next) => {
  try {
    const { agencyId, filters } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Verify user has access to this agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    let count;
    if (filters && (filters.type || filters.userId || filters.relatedEntityType)) {
      count = await Notification.markAllAsResolvedForFilter(parseInt(agencyId), filters);
    } else {
      count = await Notification.markAllAsResolvedForAgency(parseInt(agencyId));
    }
    
    res.json({ message: `${count} notifications marked as resolved` });
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }
    if (MESSAGE_PRIVATE_TYPES.has(String(notification.type || '')) && Number(notification.user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    await Notification.delete(id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

export const purgeNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const agencyIdFromQuery = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const agencyIdFromBody = req.body?.agencyId ? parseInt(req.body.agencyId) : null;
    const agencyId = agencyIdFromQuery || agencyIdFromBody || null;
    const includeSmsLogs = req.query.includeSmsLogs !== undefined
      ? String(req.query.includeSmsLogs) !== 'false'
      : (req.body?.includeSmsLogs !== undefined ? !!req.body.includeSmsLogs : true);

    if (userRole !== 'super_admin') {
      if (!agencyId) {
        return res.status(400).json({
          error: { message: 'agencyId is required (only super_admin can purge globally)' }
        });
      }
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    // IMPORTANT: Use a single connection for the whole transaction.
    const conn = await pool.getConnection();
    let deletedSmsLogs = 0;
    let deletedNotifications = 0;
    let smsLogsSkipped = false;
    let smsLogsSkipReason = null;

    try {
      await conn.beginTransaction();

      // Delete SMS logs first (FK notification_id -> notifications.id).
      if (includeSmsLogs) {
        try {
          if (agencyId) {
            const [r] = await conn.execute('DELETE FROM notification_sms_logs WHERE agency_id = ?', [agencyId]);
            deletedSmsLogs = r.affectedRows || 0;
          } else {
            const [r] = await conn.execute('DELETE FROM notification_sms_logs');
            deletedSmsLogs = r.affectedRows || 0;
          }
        } catch (e) {
          // In some environments the table may not exist yet (migration not applied).
          const errno = e?.errno;
          const code = e?.code;
          if (errno === 1146 || code === 'ER_NO_SUCH_TABLE') {
            smsLogsSkipped = true;
            smsLogsSkipReason = 'notification_sms_logs table not found (migration may not be applied)';
          } else {
            throw e;
          }
        }
      }

      // Delete notifications
      if (agencyId) {
        const [r] = await conn.execute('DELETE FROM notifications WHERE agency_id = ?', [agencyId]);
        deletedNotifications = r.affectedRows || 0;
      } else {
        const [r] = await conn.execute('DELETE FROM notifications');
        deletedNotifications = r.affectedRows || 0;
      }

      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }

    res.json({
      scope: agencyId ? 'agency' : 'all',
      agencyId: agencyId || null,
      includeSmsLogs,
      deleted: {
        notifications: deletedNotifications,
        smsLogs: deletedSmsLogs
      },
      ...(smsLogsSkipped ? { smsLogsSkipped, smsLogsSkipReason } : {})
    });
  } catch (error) {
    next(error);
  }
};

export const getSupervisorNotifications = async (req, res, next) => {
  try {
    // Allow both supervisors and CPAs
    // Check if requesting user is a supervisor using boolean as source of truth
    const User = (await import('../models/User.model.js')).default;
    const requestingUser = await User.findById(req.user.id);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    
    if (!isSupervisor && req.user.role !== 'clinical_practice_assistant') {
      return res.status(403).json({ error: { message: 'Access denied. Supervisor or Clinical Practice Assistant role required.' } });
    }

    const { agencyId } = req.query;
    const supervisorUserId = req.user.id;

    try {
      const notifications = await NotificationService.getSupervisorNotifications(
        supervisorUserId,
        agencyId ? parseInt(agencyId) : null
      );

      res.json(notifications);
    } catch (serviceError) {
      console.error('Error in NotificationService.getSupervisorNotifications:', serviceError);
      // Return empty array instead of error if service fails
      res.json([]);
    }
  } catch (error) {
    console.error('Error in getSupervisorNotifications controller:', error);
    next(error);
  }
};

export const syncNotifications = async (req, res, next) => {
  try {
    // Only allow super_admin or admin to trigger sync
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const { agencyId } = req.query;

    if (agencyId) {
      // Sync specific agency
      const notifications = await NotificationService.generateNotificationsForAgency(parseInt(agencyId));
      res.json({ 
        message: `Generated ${notifications.length} notifications for agency ${agencyId}`,
        notifications: notifications.length
      });
    } else {
      // Sync all agencies
      const results = await NotificationService.syncNotifications();
      res.json({ 
        message: 'Notifications synced for all agencies',
        results 
      });
    }
  } catch (error) {
    next(error);
  }
};
