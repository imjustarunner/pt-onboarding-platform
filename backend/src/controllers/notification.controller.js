import Notification from '../models/Notification.model.js';
import NotificationService from '../services/notification.service.js';
import User from '../models/User.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import NotificationSmsLog from '../models/NotificationSmsLog.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationDispatcherService from '../services/notificationDispatcher.service.js';
import ProgramReminderService from '../services/programReminder.service.js';
import pool from '../config/database.js';
import NotificationTypePreference from '../models/NotificationTypePreference.model.js';
import AgencyNotificationPreferences from '../models/AgencyNotificationPreferences.model.js';
import {
  NOTIFICATION_CATEGORIES,
  getNotificationCatalogEntry,
  listNotificationCatalog
} from '../services/notificationCatalog.service.js';
import {
  loadNotificationPreferenceContext,
  resolveNotificationTypePreference,
  listEffectiveNotificationPreferences
} from '../services/notificationPreferences.service.js';

// Guardians should not see the full internal staff notification feed.
// They only need a narrow, family-facing set: announcements/reminders and
// updates tied to their child(ren) (documents / paperwork).
//
// NOTE: We enforce this in the notification listing + counts endpoints so
// guardians don't accumulate "33 internal notifications" and get confused.
const GUARDIAN_ALLOWED_NOTIFICATION_TYPES = new Set([
  // Family-facing announcements / reminders
  'emergency_broadcast',
  'program_reminder',
  // Child account postings / paperwork status
  'paperwork_received',
  'new_packet_uploaded',
  'client_checklist_updated'
]);
const GUARDIAN_ANNOUNCEMENT_TYPES = new Set(['emergency_broadcast', 'program_reminder']);

function isGuardianRole(role) {
  const r = String(role || '').trim().toLowerCase();
  // Legacy naming: guardians are stored as `client_guardian` in `users.role`.
  return r === 'client_guardian' || r === 'guardian';
}

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

const IN_APP_CATEGORY_BY_TYPE = {
  client_checklist_updated: 'clients_checklist_updates',
  client_became_current: 'clients_checklist_updates',
  paperwork_received: 'clients_new_intakes',
  new_packet_uploaded: 'clients_new_intakes',
  company_event_registration_submitted: 'clients_new_intakes',
  school_availability_request_pending: 'scheduling_schedule_changes',
  school_provider_availability_confirmed: 'school_portal_provider_slots',
  school_provider_availability_updated: 'school_portal_provider_slots',
  school_provider_slot_verification_requested: 'school_portal_provider_slots',
  school_provider_slot_verification_completed: 'school_portal_provider_slots',
  client_school_roi_link_generated: 'clients_new_intakes',
  client_school_roi_link_copied: 'clients_new_intakes',
  client_school_roi_link_sent: 'clients_new_intakes',
  client_school_roi_completed: 'clients_new_intakes',
  client_school_roi_provider_reminder: 'clients_new_intakes'
};

function viewerAudienceKey(role) {
  const r = String(role || '').trim().toLowerCase();
  if (isGuardianRole(r)) return 'guardian';
  if (r === 'school_staff') return 'schoolStaff';
  if (r === 'supervisor') return 'supervisor';
  if (r === 'clinical_practice_assistant' || r === 'provider_plus') return 'clinicalPracticeAssistant';
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

const SELF_ACTIVITY_TYPES = new Set(['user_login', 'user_logout']);

function filterNotificationsForViewer(notifications, viewerUserId, viewerRole, opts = {}) {
  const uid = Number(viewerUserId);
  const {
    hasMedicalRecordsReleaseAccess = false,
    notificationCategories = null,
    guardianClientIds = null,
    guardianAgencyIds = null,
    hiddenNotificationTypes = null
  } = opts;

  // Guardian feed: strict allowlist + only items tied to this guardian or
  // to one of their linked clients. This is intentionally independent of
  // the staff/admin audience map, which was built for internal roles.
  if (isGuardianRole(viewerRole)) {
    const clientIdSet = guardianClientIds instanceof Set ? guardianClientIds : new Set();
    const agencyIdSet = guardianAgencyIds instanceof Set ? guardianAgencyIds : new Set();
    return (notifications || []).filter((n) => {
      const t = String(n?.type || '').trim().toLowerCase();
      if (!GUARDIAN_ALLOWED_NOTIFICATION_TYPES.has(t)) return false;

      // Never show another user's personal notifications.
      if (n?.user_id != null && Number(n.user_id) !== uid) return false;

      // Personal notifications to the guardian are allowed if on allowlist.
      if (Number(n?.user_id) === uid) return true;

      // Announcements/reminders: allow agency-scoped items for agencies where
      // the guardian has at least one linked client.
      if (GUARDIAN_ANNOUNCEMENT_TYPES.has(t)) {
        const aid = Number(n?.agency_id || 0);
        return !aid || agencyIdSet.size === 0 ? true : agencyIdSet.has(aid);
      }

      // Child-tied items: must point at a client the guardian is linked to.
      if (String(n?.related_entity_type || '').trim().toLowerCase() === 'client') {
        const cid = Number(n?.related_entity_id || 0);
        return cid && clientIdSet.has(cid);
      }

      return false;
    });
  }

  return (notifications || [])
    .filter((n) => !(hiddenNotificationTypes instanceof Set && hiddenNotificationTypes.has(String(n?.type || ''))))
    .filter((n) => {
      const key = IN_APP_CATEGORY_BY_TYPE[String(n?.type || '').toLowerCase()];
      if (!key) return true;
      if (!notificationCategories || typeof notificationCategories !== 'object') return true;
      return notificationCategories[key] !== false;
    })
    .filter((n) => audienceAllows(n, viewerRole))
    .filter((n) => {
      const t = String(n?.type || '');
      if (!MESSAGE_PRIVATE_TYPES.has(t)) return true;
      return Number(n?.user_id) === uid;
    })
    .filter((n) => {
      // Don't show users their own login/logout notifications
      if (SELF_ACTIVITY_TYPES.has(String(n?.type || '')) && Number(n?.user_id) === uid) return false;
      return true;
    })
    .filter((n) => {
      // Medical records release: only visible to users with has_medical_records_release_access (or super_admin)
      if (String(n?.type || '') === 'medical_records_release_submitted') {
        if (viewerRole === 'super_admin') return true;
        return !!hasMedicalRecordsReleaseAccess;
      }
      return true;
    });
}

function isUnmuted(notification) {
  const raw = notification?._muted_until_for_viewer ?? notification?.muted_until;
  if (!raw) return true;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return true; // best-effort: don't hide if unparsable
  return t <= Date.now();
}

function uniquePositiveIds(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );
}

function dedupeNotificationsById(notifications) {
  const seen = new Set();
  const out = [];
  for (const n of notifications || []) {
    const id = Number(n?.id || 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(n);
  }
  return out;
}

function notificationEquivalenceKey(notification) {
  const n = notification || {};
  const t = new Date(n.created_at || 0);
  const sec = Number.isFinite(t.getTime()) ? Math.floor(t.getTime() / 1000) : 0;
  return [
    String(n.type || '').trim().toLowerCase(),
    Number(n.agency_id || 0) || 0,
    String(n.related_entity_type || '').trim().toLowerCase(),
    Number(n.related_entity_id || 0) || 0,
    String(n.title || '').trim(),
    String(n.message || '').trim(),
    Number(n.actor_user_id || 0) || 0,
    String(n.actor_source || '').trim(),
    sec
  ].join('|');
}

function collapseEquivalentNotifications(notifications) {
  const seen = new Set();
  const out = [];
  for (const n of notifications || []) {
    const key = notificationEquivalenceKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

const PERSONAL_ONLY_ROLES = new Set(['provider', 'staff', 'intern', 'facilitator']);
const EVENT_REGISTRATION_SCOPED_ROLES = new Set([
  'provider', 'provider_plus', 'intern', 'intern_plus', 'facilitator', 'clinician'
]);

async function loadGuardianClientAccess({ guardianUserId }) {
  const uid = Number(guardianUserId);
  if (!uid) return { clientIds: [], agencyIds: [] };
  const [rows] = await pool.execute(
    `SELECT DISTINCT c.id AS client_id, c.agency_id
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
      WHERE cg.guardian_user_id = ?
        AND (cg.access_enabled = 1 OR cg.access_enabled IS NULL)`,
    [uid]
  ).catch(() => [[]]);
  const clientIds = uniquePositiveIds((rows || []).map((r) => r.client_id));
  const agencyIds = uniquePositiveIds((rows || []).map((r) => r.agency_id));
  return { clientIds, agencyIds };
}

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

  const actorUserIds = Array.from(
    new Set(
      list
        .map((n) => Number(n?.actor_user_id || 0))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );
  const recipientUserIds = Array.from(
    new Set(
      list
        .map((n) => Number(n?.user_id || 0))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );
  const allUserIds = Array.from(new Set([...actorUserIds, ...recipientUserIds]));
  const userNameById = new Map();
  if (allUserIds.length) {
    const placeholders = allUserIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE id IN (${placeholders})`,
      allUserIds
    );
    for (const r of rows || []) {
      const name = [String(r.first_name || '').trim(), String(r.last_name || '').trim()].filter(Boolean).join(' ').trim();
      userNameById.set(Number(r.id), name || String(r.email || '').trim() || null);
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
    if (n.actor_user_id) {
      n.actor_display_name = userNameById.get(Number(n.actor_user_id)) || null;
    } else if (n.actor_source) {
      n.actor_display_name = String(n.actor_source).trim() || null;
    }
    if (n.user_id) {
      n.recipient_display_name = userNameById.get(Number(n.user_id)) || null;
    }
    // Per-user read state: expose as is_read for frontend compatibility
    if (n._is_read_for_viewer !== undefined) {
      n.is_read = n._is_read_for_viewer;
    }
    if (n._muted_until_for_viewer !== undefined) {
      n.muted_until = n._muted_until_for_viewer;
    }
    n.dismissed_at = n._dismissed_at_for_viewer || null;
    n.snoozed_until = n._snoozed_until_for_viewer || null;
  }

  return list;
}

async function getViewerNotificationCategories(userId) {
  const prefs = await UserPreferences.findByUserId(Number(userId));
  const categories = parseJsonMaybe(prefs?.notification_categories) || prefs?.notification_categories || {};
  return categories && typeof categories === 'object' ? categories : {};
}

async function getViewerHiddenNotificationTypes(userId, userRole) {
  try {
    const context = await loadNotificationPreferenceContext({ userId, userRole });
    return new Set(
      listNotificationCatalog()
        .map((entry) => resolveNotificationTypePreference(entry.type, context))
        .filter((resolved) => resolved?.effective?.inApp === false)
        .map((resolved) => resolved.type)
    );
  } catch {
    return new Set(['user_login', 'user_logout']);
  }
}

export const getNotifications = async (req, res, next) => {
  try {
    const { agencyId, type, isRead, isResolved, limit: limitParam } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const fullUser = await User.findById(userId);
    const hasMedicalRecordsReleaseAccess = !!(fullUser?.has_medical_records_release_access === 1 || fullUser?.has_medical_records_release_access === true);
    const notificationCategories = await getViewerNotificationCategories(userId);
    const hiddenNotificationTypes = await getViewerHiddenNotificationTypes(userId, userRole);
    const filterOpts = { hasMedicalRecordsReleaseAccess, notificationCategories, hiddenNotificationTypes };

    // Guardian portal: limit notifications to a small family-facing set.
    if (isGuardianRole(userRole)) {
      const { clientIds, agencyIds } = await loadGuardianClientAccess({ guardianUserId: userId });
      // Optional agency filter: guardians can only scope to agencies where they
      // have linked clients.
      if (agencyId) {
        const requestedAgencyId = Number.parseInt(String(agencyId || ''), 10);
        if (requestedAgencyId && agencyIds.length && !agencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
      }
      const effectiveAgencyIds = agencyId ? [Number.parseInt(String(agencyId), 10)] : agencyIds;
      const allowedType = String(type || '').trim().toLowerCase();
      if (allowedType && !GUARDIAN_ALLOWED_NOTIFICATION_TYPES.has(allowedType)) {
        // Explicitly requested a type guardians can't see.
        return res.json([]);
      }

      // Fetch any matching notifications for the guardian's agencies.
      // We rely on filterNotificationsForViewer to enforce client binding for
      // client-related items and allow only the strict allowlist.
      const baseTypes = allowedType ? [allowedType] : Array.from(GUARDIAN_ALLOWED_NOTIFICATION_TYPES);
      const typePlaceholders = baseTypes.map(() => '?').join(',');
      const agencyPlaceholders = (effectiveAgencyIds || []).map(() => '?').join(',');
      const clientPlaceholders = clientIds.map(() => '?').join(',');

      let sql = `SELECT * FROM notifications WHERE 1=1`;
      const params = [];
      if (baseTypes.length) {
        sql += ` AND LOWER(type) IN (${typePlaceholders})`;
        params.push(...baseTypes);
      }
      if (effectiveAgencyIds && effectiveAgencyIds.length) {
        sql += ` AND agency_id IN (${agencyPlaceholders})`;
        params.push(...effectiveAgencyIds);
      }
      // Personal-to-guardian OR client-tied OR agency announcements.
      sql += ` AND (user_id = ?`;
      params.push(Number(userId));
      if (clientIds.length) {
        sql += ` OR (LOWER(COALESCE(related_entity_type,'')) = 'client' AND related_entity_id IN (${clientPlaceholders}))`;
        params.push(...clientIds);
      }
      sql += ` OR (user_id IS NULL AND LOWER(type) IN ('emergency_broadcast','program_reminder'))`;
      sql += ` )`;

      if (isResolved !== undefined) {
        sql += ' AND is_resolved = ?';
        params.push(isResolved === 'true' ? 1 : 0);
      }
      sql += ' ORDER BY created_at DESC';

      // Limit is a validated integer; do not bind LIMIT ? (mysql2 prepared-statement quirk).
      const limitNum = limitParam ? Number.parseInt(String(limitParam || ''), 10) : 0;
      const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(500, limitNum) : 0;
      if (safeLimit) sql += ` LIMIT ${safeLimit}`;

      const [rows] = await pool.execute(sql, params).catch(() => [[]]);
      const list = dedupeNotificationsById(rows || []);
      await Notification.applyReadStateForViewer(list, userId);
      filterOpts.guardianClientIds = new Set(clientIds);
      filterOpts.guardianAgencyIds = new Set(effectiveAgencyIds || []);
      let filtered = filterNotificationsForViewer(list, userId, userRole, filterOpts);
      if (isRead !== undefined) {
        const wantRead = isRead === 'true';
        filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
      }
      filtered = filtered.filter(isUnmuted);
      filtered = collapseEquivalentNotifications(filtered);
      await appendNotificationContext(filtered);
      return res.json(filtered);
    }

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
      accessibleAgencyIds = uniquePositiveIds(accessibleAgencyIds);

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

      const dedupedNotifications = dedupeNotificationsById(allNotifications);
      await Notification.applyReadStateForViewer(dedupedNotifications, userId);
      // Sort by created_at descending
      dedupedNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      let filtered = filterNotificationsForViewer(dedupedNotifications, userId, userRole, filterOpts);
      if (isRead !== undefined) {
        const wantRead = isRead === 'true';
        filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
      }
      filtered = filtered.filter(isUnmuted);
      filtered = collapseEquivalentNotifications(filtered);
      await appendNotificationContext(filtered);
      const limitNum = limitParam ? parseInt(limitParam, 10) : 0;
      if (Number.isFinite(limitNum) && limitNum > 0) filtered = filtered.slice(0, limitNum);
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
      accessibleAgencyIds = uniquePositiveIds(accessibleAgencyIds);

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

      const dedupedNotifications = dedupeNotificationsById(allNotifications);
      await Notification.applyReadStateForViewer(dedupedNotifications, userId);
      let filtered = filterNotificationsForViewer(dedupedNotifications, userId, userRole, filterOpts);
      if (isRead !== undefined) {
        const wantRead = isRead === 'true';
        filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
      }
      filtered = filtered.filter(isUnmuted);
      filtered = collapseEquivalentNotifications(filtered);
      await appendNotificationContext(filtered);
      const limitNumCpa = limitParam ? parseInt(limitParam, 10) : 0;
      if (Number.isFinite(limitNumCpa) && limitNumCpa > 0) filtered = filtered.slice(0, limitNumCpa);
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
      accessibleAgencyIds = uniquePositiveIds(accessibleAgencyIds);

      const personal = await Notification.findByUser(userId, {
        type: type || undefined,
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
      });
      const scoped = agencyId ? (personal || []).filter((n) => Number(n.agency_id) === Number(agencyId)) : (personal || []);
      await Notification.applyReadStateForViewer(scoped, userId);
      let filtered = filterNotificationsForViewer(scoped, userId, userRole, filterOpts);
      if (isRead !== undefined) {
        const wantRead = isRead === 'true';
        filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
      }
      filtered = filtered.filter(isUnmuted);
      await appendNotificationContext(filtered);
      const limitNumPersonal = limitParam ? parseInt(limitParam, 10) : 0;
      if (Number.isFinite(limitNumPersonal) && limitNumPersonal > 0) filtered = filtered.slice(0, limitNumPersonal);
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

    accessibleAgencyIds = uniquePositiveIds(accessibleAgencyIds);
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

    const dedupedNotifications = dedupeNotificationsById(allNotifications);
    await Notification.applyReadStateForViewer(dedupedNotifications, userId);
    let filtered = filterNotificationsForViewer(dedupedNotifications, userId, userRole, filterOpts);
    if (isRead !== undefined) {
      const wantRead = isRead === 'true';
      filtered = filtered.filter((n) => (n._is_read_for_viewer === wantRead));
    }
    filtered = filtered.filter(isUnmuted);
    filtered = collapseEquivalentNotifications(filtered);
    await appendNotificationContext(filtered);
    const limitNum = limitParam ? parseInt(limitParam, 10) : 0;
    if (Number.isFinite(limitNum) && limitNum > 0) {
      filtered = filtered.slice(0, limitNum);
    }
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

    // Compatibility endpoint: delegate badge counts to the same indexed visibility,
    // preference, and viewer-state query used by the v2 inbox. `legacy=1` remains
    // available for one transition release while older clients are phased out.
    if (String(req.query?.legacy || '') !== '1') {
      const originalQuery = req.query;
      try {
        req.query = {
          status: 'unread',
          page: 1,
          pageSize: 1,
          scope: requestedScope === 'managed_feed' ? 'managed' : (requestedScope || 'inbox')
        };
        const result = await queryNotificationFeed(req);
        const counts = {};
        for (const facet of result.facets.agencies || []) counts[facet.agencyId] = facet.unread;
        return res.json(counts);
      } finally {
        req.query = originalQuery;
      }
    }

    const fullUser = await User.findById(userId);
    const hasMedicalRecordsReleaseAccess = !!(fullUser?.has_medical_records_release_access === 1 || fullUser?.has_medical_records_release_access === true);
    const notificationCategories = await getViewerNotificationCategories(userId);
    const hiddenNotificationTypes = await getViewerHiddenNotificationTypes(userId, userRole);
    const filterOpts = { hasMedicalRecordsReleaseAccess, notificationCategories, hiddenNotificationTypes };

    // Guardian counts: only count the guardian-allowed subset across the agencies
    // where the guardian has linked clients.
    if (isGuardianRole(userRole)) {
      const { clientIds, agencyIds } = await loadGuardianClientAccess({ guardianUserId: userId });
      if (!agencyIds.length) return res.json({});
      const agencyIdSet = new Set(agencyIds);
      const clientIdSet = new Set(clientIds);
      filterOpts.guardianAgencyIds = agencyIdSet;
      filterOpts.guardianClientIds = clientIdSet;

      // Fetch unresolved notifications for these agencies for counting; apply per-user read state
      const placeholders = agencyIds.map(() => '?').join(',');
      const typeList = Array.from(GUARDIAN_ALLOWED_NOTIFICATION_TYPES);
      const typePlaceholders = typeList.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT * FROM notifications
          WHERE agency_id IN (${placeholders})
            AND is_resolved = 0
            AND LOWER(type) IN (${typePlaceholders})`,
        [...agencyIds, ...typeList]
      ).catch(() => [[]]);
      const list = dedupeNotificationsById(rows || []);
      await Notification.applyReadStateForViewer(list, userId);
      const visible = filterNotificationsForViewer(list, userId, userRole, filterOpts).filter(isUnmuted);
      const collapsed = collapseEquivalentNotifications(visible);
      const counts = {};
      for (const aid of agencyIds) counts[aid] = 0;
      for (const n of collapsed) {
        const aid = Number(n?.agency_id || 0);
        if (!aid) continue;
        if (n._is_read_for_viewer) continue;
        if (n.is_resolved) continue;
        counts[aid] = (counts[aid] || 0) + 1;
      }
      return res.json(counts);
    }

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
        const visible = filterNotificationsForViewer(notifications, userId, userRole, filterOpts).filter(isUnmuted);
        const collapsed = collapseEquivalentNotifications(visible);
        counts[aid] = collapsed.filter((n) => !n._is_read_for_viewer && !n.is_resolved).length;
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
          isResolved: false
        });
        const filteredNotifications = notifications.filter(n =>
          n.user_id && allSuperviseeIds.includes(n.user_id)
        );
        await Notification.applyReadStateForViewer(filteredNotifications, userId);
        const visible = filterNotificationsForViewer(filteredNotifications, userId, userRole, filterOpts).filter(isUnmuted);
        const collapsed = collapseEquivalentNotifications(visible);
        filteredCounts[agencyId] = collapsed.filter((n) => !n._is_read_for_viewer && !n.is_resolved).length;
      }
      
      return res.json(filteredCounts);
    } else if (userRole === 'clinical_practice_assistant') {
      // CPAs see their own per-user counts (agency-wide + any personal to them)
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
      if (agencyIds.length > 0) {
        const counts = {};
        for (const aid of agencyIds) {
          const notifications = await Notification.findByAgency(aid, {
            isResolved: false
          });
          await Notification.applyReadStateForViewer(notifications, userId);
          const visible = filterNotificationsForViewer(notifications, userId, userRole, filterOpts).filter(isUnmuted);
          const collapsed = collapseEquivalentNotifications(visible);
          counts[aid] = collapsed.filter((n) => !n._is_read_for_viewer && !n.is_resolved).length;
        }
        return res.json(counts);
      }
    } else if (PERSONAL_ONLY_ROLES.has(String(userRole || '').toLowerCase())) {
      // Providers/staff/intern/facilitator: counts should be for *their* unread notifications only.
      const userAgencies = await User.getAgencies(userId);
      agencyIds = (userAgencies || []).map((a) => a.id);

      if (agencyIds.length === 0) return res.json({});

      const unread = await Notification.findUnreadUnmutedByUserAcrossAgencies(userId, agencyIds);
      const filtered = filterNotificationsForViewer(unread, userId, userRole, filterOpts);
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

    // Per-user counts should align with feed visibility/read-state filters.
    const counts = {};
    for (const aid of agencyIds) {
      const notifications = await Notification.findByAgency(aid, {
        isResolved: false
      });
      await Notification.applyReadStateForViewer(notifications, userId);
      const visible = filterNotificationsForViewer(notifications, userId, userRole, filterOpts).filter(isUnmuted);
      const collapsed = collapseEquivalentNotifications(visible);
      counts[aid] = collapsed.filter((n) => !n._is_read_for_viewer && !n.is_resolved).length;
    }
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
    // For non-private notification types, mark-as-read is per-viewer (notification_user_reads),
    // so users with agency access can clear visible agency-feed items for themselves.

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

    const followUpLocked = await Notification.isFollowUpForUser(id, userId);
    if (followUpLocked) {
      return res.status(409).json({ error: { message: 'Marked as needs follow-up. Clear follow-up before dismissing.' } });
    }

    const ok = await Notification.dismissForUser(id, userId);
    if (!ok) {
      return res.status(403).json({ error: { message: 'Unable to dismiss notification for this user' } });
    }
    res.json({ message: 'Notification dismissed for current user' });
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
      // Exclude private cross-user message types from bulk mark-read.
      filtered = filtered.filter((n) => (
        Number(n.user_id) === Number(userId)
        || !MESSAGE_PRIVATE_TYPES.has(String(n?.type || ''))
      ));
      // Mark each filtered notification as read for current user only
      for (const notification of filtered) {
        await Notification.markAsReadForUser(notification.id, userId);
      }
      count = filtered.length;
    } else {
      count = await Notification.markAllAsReadForAgencyForUser(parseInt(agencyId), userId);
    }
    
    res.json({ message: `${count} notifications marked as read` });
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

    const followUpLocked = await Notification.isFollowUpForUser(id, userId);
    if (followUpLocked) {
      return res.status(409).json({ error: { message: 'Marked as needs follow-up. Clear follow-up before deleting.' } });
    }

    const ok = await Notification.dismissForUser(id, userId);
    if (!ok) {
      return res.status(403).json({ error: { message: 'Unable to delete notification for this user' } });
    }
    res.json({ message: 'Notification deleted for current user' });
  } catch (error) {
    next(error);
  }
};

export const setNotificationFollowUp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const enabled = req.body?.enabled !== false;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }
    if (MESSAGE_PRIVATE_TYPES.has(String(notification.type || '')) && Number(notification.user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const ok = await Notification.setFollowUpForUser(id, userId, enabled);
    if (!ok) {
      return res.status(403).json({ error: { message: 'Unable to update follow-up state' } });
    }
    res.json({ ok: true, enabled });
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

const FEED_PRIVATE_TYPES = ['chat_message', 'inbound_client_message', 'support_safety_net_alert'];

async function getFeedAccess(req, requestedAgencyId = null, requestedScope = 'inbox') {
  const uid = Number(req.user.id);
  const role = String(req.user.role || '').toLowerCase();
  if (requestedScope === 'managed' && !['super_admin', 'admin', 'support', 'clinical_practice_assistant'].includes(role)) {
    const error = new Error('Managed notification scope is not available for this role');
    error.status = 403;
    throw error;
  }
  let agencyIds = [];
  if (role === 'super_admin') {
    const [rows] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
    agencyIds = (rows || []).map((r) => Number(r.id)).filter(Boolean);
  } else {
    agencyIds = (await User.getAgencies(uid) || []).map((a) => Number(a.id)).filter(Boolean);
  }
  if (requestedAgencyId) {
    const aid = Number(requestedAgencyId);
    if (!aid || (role !== 'super_admin' && !agencyIds.includes(aid))) {
      const error = new Error('Access denied to this agency');
      error.status = 403;
      throw error;
    }
    agencyIds = [aid];
  }

  let superviseeIds = [];
  if (requestedScope === 'team') {
    if (!['supervisor', 'clinical_practice_assistant', 'provider_plus'].includes(role)) {
      const error = new Error('Team notification scope is not available for this role');
      error.status = 403;
      throw error;
    }
    const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
    for (const agencyId of agencyIds) {
      superviseeIds.push(...await SupervisorAssignment.getSuperviseeIds(uid, agencyId));
    }
    superviseeIds = uniquePositiveIds(superviseeIds);
  }

  let guardianClientIds = [];
  if (isGuardianRole(role)) {
    const access = await loadGuardianClientAccess({ guardianUserId: uid });
    guardianClientIds = access.clientIds;
    agencyIds = requestedAgencyId ? agencyIds : access.agencyIds;
  }
  return { uid, role, agencyIds: uniquePositiveIds(agencyIds), superviseeIds, guardianClientIds };
}

function buildFeedWhere({ req, access, visibilityPolicy, applyFilters = true, includeAfterId = false }) {
  const params = [];
  const clauses = ['n.is_resolved = FALSE'];
  if (access.agencyIds.length) {
    clauses.push(`n.agency_id IN (${access.agencyIds.map(() => '?').join(',')})`);
    params.push(...access.agencyIds);
    // Historical first-login notifications were fanned out once per agency.
    // Keep the audit rows, but expose one account-level event to each viewer.
    clauses.push(`(
      n.type NOT IN ('first_login', 'first_login_pending')
      OR n.id = (
        SELECT n2.id
        FROM notifications n2
        LEFT JOIN organization_affiliations oa2
          ON oa2.organization_id = n2.agency_id AND oa2.is_active = TRUE
        LEFT JOIN agency_schools axs2
          ON axs2.school_organization_id = n2.agency_id AND axs2.is_active = TRUE
        WHERE n2.type IN ('first_login', 'first_login_pending')
          AND COALESCE(n2.related_entity_id, n2.user_id) = COALESCE(n.related_entity_id, n.user_id)
          AND n2.agency_id IN (${access.agencyIds.map(() => '?').join(',')})
        ORDER BY CASE
          WHEN oa2.organization_id IS NULL AND axs2.school_organization_id IS NULL THEN 0
          ELSE 1
        END, n2.agency_id ASC, n2.id ASC
        LIMIT 1
      )
    )`);
    params.push(...access.agencyIds);
  } else {
    clauses.push('1 = 0');
  }

  if (isGuardianRole(access.role)) {
    clauses.push(`n.type IN (${Array.from(GUARDIAN_ALLOWED_NOTIFICATION_TYPES).map(() => '?').join(',')})`);
    params.push(...Array.from(GUARDIAN_ALLOWED_NOTIFICATION_TYPES));
    const guardianParts = ['n.user_id = ?'];
    params.push(access.uid);
    if (access.guardianClientIds.length) {
      guardianParts.push(`(LOWER(COALESCE(n.related_entity_type, '')) = 'client' AND n.related_entity_id IN (${access.guardianClientIds.map(() => '?').join(',')}))`);
      params.push(...access.guardianClientIds);
    }
    guardianParts.push(`(n.user_id IS NULL AND n.type IN ('emergency_broadcast', 'program_reminder'))`);
    clauses.push(`(${guardianParts.join(' OR ')})`);
  } else if (access.superviseeIds.length || String(req.query.scope || '') === 'team') {
    if (access.superviseeIds.length) {
      clauses.push(`n.user_id IN (${access.superviseeIds.map(() => '?').join(',')})`);
      params.push(...access.superviseeIds);
    } else {
      clauses.push('1 = 0');
    }
  } else if (PERSONAL_ONLY_ROLES.has(access.role)) {
    clauses.push('n.user_id = ?');
    params.push(access.uid);
  } else {
    clauses.push(`(n.user_id = ? OR n.type NOT IN (${FEED_PRIVATE_TYPES.map(() => '?').join(',')}))`);
    params.push(access.uid, ...FEED_PRIVATE_TYPES);
  }

  // Registration activity is relevant to clinical users only when they are
  // attached to the owning program or directly assigned to the event. This
  // also prevents historically over-broadcast personal records from affecting
  // their feed or badge while retaining the underlying audit rows.
  if (EVENT_REGISTRATION_SCOPED_ROLES.has(access.role)) {
    clauses.push(`(
      n.type <> 'company_event_registration_submitted'
      OR LOWER(COALESCE(n.related_entity_type, '')) <> 'company_event'
      OR EXISTS (
        SELECT 1
        FROM company_events ce_access
        WHERE ce_access.id = n.related_entity_id
          AND (
            ce_access.created_by_user_id = ?
            OR EXISTS (
              SELECT 1 FROM user_agencies ua_access
              WHERE ua_access.user_id = ?
                AND ua_access.agency_id = ce_access.organization_id
                AND ua_access.is_active = TRUE
            )
            OR EXISTS (
              SELECT 1 FROM company_event_provider_assignments cepa_access
              WHERE cepa_access.company_event_id = ce_access.id
                AND cepa_access.provider_user_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM company_event_session_providers cesp_access
              WHERE cesp_access.company_event_id = ce_access.id
                AND cesp_access.provider_user_id = ?
                AND cesp_access.assignment_status IN ('tentative', 'finalized')
            )
          )
      )
    )`);
    params.push(access.uid, access.uid, access.uid, access.uid);
  }

  const audienceKey = viewerAudienceKey(access.role);
  clauses.push(`(
    n.audience_json IS NULL
    OR JSON_EXTRACT(n.audience_json, '$.${audienceKey}') IS NULL
    OR JSON_EXTRACT(n.audience_json, '$.${audienceKey}') = TRUE
  )`);
  if (access.role !== 'super_admin' && !req._feedHasMedicalAccess) {
    clauses.push("n.type <> 'medical_records_release_submitted'");
  }
  const baseHidden = visibilityPolicy?.baseHidden || [];
  const agencyOverrides = visibilityPolicy?.agencyOverrides || [];
  if (baseHidden.length) {
    const visibleParts = [`n.type NOT IN (${baseHidden.map(() => '?').join(',')})`];
    params.push(...baseHidden);
    for (const override of agencyOverrides.filter((item) => item.unhidden.length)) {
      visibleParts.push(`(n.agency_id = ? AND n.type IN (${override.unhidden.map(() => '?').join(',')}))`);
      params.push(override.agencyId, ...override.unhidden);
    }
    clauses.push(`(${visibleParts.join(' OR ')})`);
  }
  for (const override of agencyOverrides.filter((item) => item.extraHidden.length)) {
    clauses.push(`NOT (n.agency_id = ? AND n.type IN (${override.extraHidden.map(() => '?').join(',')}))`);
    params.push(override.agencyId, ...override.extraHidden);
  }
  if (includeAfterId && Number(req.query.afterId || 0) > 0) {
    clauses.push('n.id > ?');
    params.push(Number(req.query.afterId));
  }

  const search = String(req.query.search || '').trim();
  if (search) {
    const like = `%${search.slice(0, 120)}%`;
    clauses.push(`(
      n.title LIKE ? OR n.message LIKE ? OR n.actor_source LIKE ? OR a.name LIKE ?
      OR CONCAT_WS(' ', au.first_name, au.last_name) LIKE ? OR au.email LIKE ?
      OR c.identifier_code LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like);
  }

  const readExpr = `COALESCE(nur.is_read, CASE WHEN n.user_id = ${access.uid} THEN n.is_read ELSE FALSE END)`;
  if (applyFilters) {
    const type = String(req.query.type || '').trim();
    if (type && getNotificationCatalogEntry(type)) {
      clauses.push('n.type = ?');
      params.push(type);
    }
    const category = String(req.query.category || '').trim();
    if (category && NOTIFICATION_CATEGORIES[category]) {
      const types = listNotificationCatalog().filter((entry) => entry.category === category).map((entry) => entry.type);
      clauses.push(`n.type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    const status = String(req.query.status || 'unread').toLowerCase();
    if (status === 'read') {
      clauses.push(`${readExpr} = TRUE AND nur.dismissed_at IS NULL AND (nur.snoozed_until IS NULL OR nur.snoozed_until <= NOW())`);
    } else if (status === 'follow_up') {
      clauses.push('COALESCE(nur.requires_follow_up, FALSE) = TRUE');
    } else if (status === 'high_priority') {
      clauses.push("n.severity = 'urgent' AND nur.dismissed_at IS NULL AND (nur.snoozed_until IS NULL OR nur.snoozed_until <= NOW())");
    } else if (status === 'snoozed') {
      clauses.push('nur.snoozed_until > NOW() AND nur.dismissed_at IS NULL');
    } else if (status === 'dismissed') {
      clauses.push('nur.dismissed_at IS NOT NULL');
    } else if (status === 'all') {
      clauses.push('nur.dismissed_at IS NULL AND (nur.snoozed_until IS NULL OR nur.snoozed_until <= NOW())');
    } else {
      clauses.push(`${readExpr} = FALSE AND nur.dismissed_at IS NULL AND (nur.snoozed_until IS NULL OR nur.snoozed_until <= NOW())`);
    }
  }
  return { sql: clauses.join(' AND '), params, readExpr };
}

async function queryNotificationFeed(req, { forcePageSize = null, includeAfterId = false } = {}) {
  const requestedAgencyId = req.query.agencyId ? Number(req.query.agencyId) : null;
  const scope = String(req.query.scope || 'inbox').toLowerCase();
  const access = await getFeedAccess(req, requestedAgencyId, scope);
  const fullUser = await User.findById(access.uid);
  req._feedHasMedicalAccess = !!(fullUser?.has_medical_records_release_access === 1 || fullUser?.has_medical_records_release_access === true);
  const preferenceContext = await loadNotificationPreferenceContext({ userId: access.uid, userRole: access.role });
  const agencyPolicies = await AgencyNotificationPreferences.listByAgencyIds(access.agencyIds);
  const contextByAgency = new Map(agencyPolicies.map((policy) => [
    Number(policy.agencyId),
    { ...preferenceContext, agencyPreferences: policy }
  ]));
  const effectivePreferences = listNotificationCatalog()
    .map((entry) => resolveNotificationTypePreference(entry.type, preferenceContext));
  const baseHidden = effectivePreferences.filter((item) => item?.effective?.inApp === false).map((item) => item.type);
  const baseHiddenSet = new Set(baseHidden);
  const agencyOverrides = agencyPolicies.map((policy) => {
    const agencyHidden = listNotificationCatalog()
      .map((entry) => resolveNotificationTypePreference(entry.type, contextByAgency.get(Number(policy.agencyId))))
      .filter((item) => item?.effective?.inApp === false)
      .map((item) => item.type);
    const agencyHiddenSet = new Set(agencyHidden);
    return {
      agencyId: Number(policy.agencyId),
      unhidden: baseHidden.filter((type) => !agencyHiddenSet.has(type)),
      extraHidden: agencyHidden.filter((type) => !baseHiddenSet.has(type))
    };
  });
  const visibilityPolicy = { baseHidden, agencyOverrides };
  const current = buildFeedWhere({ req, access, visibilityPolicy, applyFilters: true, includeAfterId });
  const requestedStatus = String(req.query.status || 'unread').toLowerCase();
  const unreadMatch = requestedStatus === 'unread'
    ? current
    : buildFeedWhere({
        req: { ...req, query: { ...req.query, status: 'unread' } },
        access,
        visibilityPolicy,
        applyFilters: true,
        includeAfterId
      });
  const facetBase = buildFeedWhere({ req, access, visibilityPolicy, applyFilters: false, includeAfterId: false });
  const categoryFacetQuery = { ...req.query };
  delete categoryFacetQuery.type;
  delete categoryFacetQuery.category;
  const categoryFacetBase = buildFeedWhere({
    req: { ...req, query: categoryFacetQuery },
    access,
    visibilityPolicy,
    applyFilters: true,
    includeAfterId: false
  });
  const typeFacetQuery = { ...req.query };
  delete typeFacetQuery.type;
  const typeFacetBase = buildFeedWhere({
    req: { ...req, query: typeFacetQuery },
    access,
    visibilityPolicy,
    applyFilters: true,
    includeAfterId: false
  });
  const joins = `
    FROM notifications n
    LEFT JOIN notification_user_reads nur ON nur.notification_id = n.id AND nur.user_id = ${access.uid}
    LEFT JOIN agencies a ON a.id = n.agency_id
    LEFT JOIN users au ON au.id = n.actor_user_id
    LEFT JOIN clients c ON LOWER(COALESCE(n.related_entity_type, '')) = 'client' AND c.id = n.related_entity_id`;
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const requestedSize = forcePageSize || Number.parseInt(req.query.pageSize || '25', 10) || 25;
  const pageSize = Math.max(1, Math.min(forcePageSize ? 10000 : 100, requestedSize));
  const offset = (page - 1) * pageSize;
  const sort = String(req.query.sort || 'newest').toLowerCase();
  const orderBy = sort === 'oldest'
    ? 'n.created_at ASC, n.id ASC'
    : sort === 'priority'
      ? "FIELD(n.severity, 'urgent', 'warning', 'info') ASC, n.created_at DESC, n.id DESC"
      : 'n.created_at DESC, n.id DESC';

  const [[countRow], [rows], [facetRows], [categoryFacetRows], [typeFacetRows], [unreadCountRows]] = await Promise.all([
    pool.execute(`SELECT COUNT(*) AS total ${joins} WHERE ${current.sql}`, current.params),
    pool.execute(
      `SELECT n.*, ${current.readExpr} AS _is_read_for_viewer,
        COALESCE(nur.requires_follow_up, FALSE) AS _requires_follow_up_for_viewer,
        nur.dismissed_at AS _dismissed_at_for_viewer,
        nur.snoozed_until AS _snoozed_until_for_viewer,
        a.name AS agency_name,
        NULLIF(TRIM(CONCAT_WS(' ', au.first_name, au.last_name)), '') AS actor_display_name
       ${joins}
       WHERE ${current.sql}
       ORDER BY ${orderBy}
       LIMIT ${pageSize} OFFSET ${offset}`,
      current.params
    ),
    pool.execute(
      `SELECT n.agency_id, n.type, n.severity, ${facetBase.readExpr} AS viewer_is_read,
        COALESCE(nur.requires_follow_up, FALSE) AS viewer_follow_up,
        (nur.dismissed_at IS NOT NULL) AS viewer_dismissed,
        (nur.snoozed_until > NOW()) AS viewer_snoozed,
        COUNT(*) AS count
       ${joins}
       WHERE ${facetBase.sql}
       GROUP BY n.agency_id, n.type, n.severity, viewer_is_read, viewer_follow_up, viewer_dismissed, viewer_snoozed`,
      facetBase.params
    ),
    pool.execute(
      `SELECT n.type, COUNT(*) AS count
       ${joins}
       WHERE ${categoryFacetBase.sql}
       GROUP BY n.type`,
      categoryFacetBase.params
    ),
    pool.execute(
      `SELECT n.type, COUNT(*) AS count
       ${joins}
       WHERE ${typeFacetBase.sql}
       GROUP BY n.type`,
      typeFacetBase.params
    ),
    requestedStatus === 'unread'
      ? Promise.resolve([[{ total: null }]])
      : pool.execute(`SELECT COUNT(*) AS total ${joins} WHERE ${unreadMatch.sql}`, unreadMatch.params)
  ]);

  const items = rows || [];
  for (const item of items) {
    item.is_read = !!item._is_read_for_viewer;
    item._requires_follow_up_for_viewer = !!item._requires_follow_up_for_viewer;
    item.dismissed_at = item._dismissed_at_for_viewer || null;
    item.snoozed_until = item._snoozed_until_for_viewer || null;
    const catalog = getNotificationCatalogEntry(item.type);
    if (catalog) item.catalog = catalog;
    const itemContext = contextByAgency.get(Number(item.agency_id)) || preferenceContext;
    item.notification_preference = resolveNotificationTypePreference(item.type, itemContext)?.effective || null;
  }
  await appendNotificationContext(items);

  const statusCounts = { unread: 0, read: 0, follow_up: 0, high_priority: 0, snoozed: 0, dismissed: 0 };
  const typeMap = new Map();
  const categoryMap = new Map();
  const agencyMap = new Map();
  for (const row of facetRows || []) {
    const count = Number(row.count || 0);
    if (row.viewer_dismissed) statusCounts.dismissed += count;
    else if (row.viewer_snoozed) statusCounts.snoozed += count;
    else if (row.viewer_is_read) statusCounts.read += count;
    else {
      statusCounts.unread += count;
      const agencyKey = Number(row.agency_id);
      if (agencyKey) agencyMap.set(agencyKey, (agencyMap.get(agencyKey) || 0) + count);
    }
    if (row.viewer_follow_up) statusCounts.follow_up += count;
    if (row.severity === 'urgent' && !row.viewer_dismissed && !row.viewer_snoozed) statusCounts.high_priority += count;
  }
  let categoryTotal = 0;
  for (const row of categoryFacetRows || []) {
    const count = Number(row.count || 0);
    const entry = getNotificationCatalogEntry(row.type);
    categoryTotal += count;
    if (entry) categoryMap.set(entry.category, (categoryMap.get(entry.category) || 0) + count);
  }
  let matchingTotal = 0;
  for (const row of typeFacetRows || []) {
    const count = Number(row.count || 0);
    matchingTotal += count;
    typeMap.set(row.type, (typeMap.get(row.type) || 0) + count);
  }
  const total = Number(countRow?.[0]?.total || 0);
  const matchingUnreadCount = requestedStatus === 'unread'
    ? total
    : Number(unreadCountRows?.[0]?.total || 0);
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    facets: {
      statuses: statusCounts,
      matchingTotal,
      categoryTotal,
      agencies: Array.from(agencyMap.entries()).map(([agencyId, unread]) => ({ agencyId, unread })),
      categories: Object.entries(NOTIFICATION_CATEGORIES).map(([key, meta]) => ({ key, ...meta, count: categoryMap.get(key) || 0 })),
      types: Array.from(typeMap.entries())
        .map(([type, count]) => ({ type, count, ...(getNotificationCatalogEntry(type) || {}) }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    },
    scopes: {
      inbox: true,
      team: ['supervisor', 'clinical_practice_assistant', 'provider_plus'].includes(access.role),
      managed: ['super_admin', 'admin', 'support', 'clinical_practice_assistant'].includes(access.role)
    },
    unreadCount: matchingUnreadCount
  };
}

export const getNotificationFeed = async (req, res, next) => {
  try {
    res.json(await queryNotificationFeed(req));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};

export const getNotificationCatalog = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? Number(req.query.agencyId) : null;
    if (agencyId) await getFeedAccess(req, agencyId, 'inbox');
    const preferences = await listEffectiveNotificationPreferences({
      userId: req.user.id,
      userRole: req.user.role,
      agencyId
    });
    const globalPreferences = await UserPreferences.findByUserId(Number(req.user.id)) || {};
    const userAgencies = await User.getAgencies(Number(req.user.id));
    const agencyPolicies = await AgencyNotificationPreferences.listByAgencyIds((userAgencies || []).map((item) => item.id));
    const agencyNameById = new Map((userAgencies || []).map((item) => [Number(item.id), item.name || `Agency ${item.id}`]));
    res.json({
      categories: Object.entries(NOTIFICATION_CATEGORIES).map(([key, value]) => ({ key, ...value })),
      types: preferences,
      global: {
        email: globalPreferences.email_enabled !== false,
        sms: globalPreferences.sms_enabled === true,
        push: globalPreferences.push_notifications_enabled === true,
        sound: globalPreferences.notification_sound_enabled !== false,
        digestEmail: globalPreferences.daily_digest_enabled === true,
        digestTime: globalPreferences.daily_digest_time || '07:00',
        timezone: globalPreferences.timezone || null
      },
      agencyPolicies: agencyPolicies.map((policy) => ({
        agencyId: policy.agencyId,
        agencyName: agencyNameById.get(Number(policy.agencyId)) || `Agency ${policy.agencyId}`,
        userEditable: policy.userEditable,
        enforceDefaults: policy.enforceDefaults
      }))
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};

export const updateNotificationTypePreference = async (req, res, next) => {
  try {
    const type = String(req.params.type || '').trim();
    const entry = getNotificationCatalogEntry(type);
    if (!entry) return res.status(404).json({ error: { message: 'Unknown notification type' } });
    const allowed = ['inApp', 'toast', 'sound', 'push', 'email', 'sms', 'digest', 'toastDurationMode', 'toastDurationSeconds'];
    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) updates[key] = req.body[key];
    }
    for (const channel of ['inApp', 'toast', 'sound', 'push', 'email', 'sms', 'digest']) {
      if (updates[channel] !== undefined && updates[channel] !== null && typeof updates[channel] !== 'boolean') {
        return res.status(400).json({ error: { message: `${channel} must be true, false, or null` } });
      }
      if (updates[channel] === true && entry.capabilities[channel] !== true) {
        return res.status(400).json({ error: { message: `${channel} is not available for this notification type` } });
      }
    }
    if (entry.required && updates.inApp === false) {
      return res.status(409).json({ error: { message: 'This safety notification is required in-app' } });
    }
    if (entry.digestOnly && (
      updates.inApp === true || updates.toast === true || updates.sound === true
      || updates.push === true || updates.email === true || updates.sms === true
      || updates.digest === false
    )) {
      return res.status(409).json({ error: { message: 'High-volume account activity is delivered only through the daily digest' } });
    }
    if (updates.toastDurationMode != null && !['timed', 'dismissable'].includes(String(updates.toastDurationMode))) {
      return res.status(400).json({ error: { message: 'toastDurationMode must be timed or dismissable' } });
    }
    if (updates.toastDurationSeconds != null) {
      const seconds = Number(updates.toastDurationSeconds);
      if (!Number.isFinite(seconds) || seconds < 3 || seconds > 120) {
        return res.status(400).json({ error: { message: 'Toast duration must be between 3 and 120 seconds' } });
      }
      updates.toastDurationSeconds = Math.round(seconds);
    }
    if (req.body?.reset === true) {
      await NotificationTypePreference.reset(req.user.id, type);
    } else {
      await NotificationTypePreference.upsert(req.user.id, type, updates);
    }
    const context = await loadNotificationPreferenceContext({ userId: req.user.id, userRole: req.user.role });
    res.json(resolveNotificationTypePreference(type, context));
  } catch (error) {
    next(error);
  }
};

export const applyRecommendedNotificationPreferences = async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM user_notification_type_preferences WHERE user_id = ?', [Number(req.user.id)]);
    for (const type of ['user_login', 'user_logout']) {
      await NotificationTypePreference.upsert(req.user.id, type, {
        inApp: false, toast: false, sound: false, push: false, email: false, sms: false, digest: true,
        toastDurationMode: 'timed', toastDurationSeconds: 8
      });
    }
    res.json({ ok: true, types: await listEffectiveNotificationPreferences({ userId: req.user.id, userRole: req.user.role }) });
  } catch (error) {
    next(error);
  }
};

async function verifyNotificationViewerAccess(req, notification) {
  if (!notification) return false;
  if (MESSAGE_PRIVATE_TYPES.has(String(notification.type || '')) && Number(notification.user_id) !== Number(req.user.id)) return false;
  if (req.user.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return (agencies || []).some((agency) => Number(agency.id) === Number(notification.agency_id));
}

export const updateNotificationState = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ error: { message: 'Notification not found' } });
    if (!await verifyNotificationViewerAccess(req, notification)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updates = {};
    for (const key of ['read', 'followUp', 'dismissed', 'snoozedUntil']) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) updates[key] = req.body[key];
    }
    for (const key of ['read', 'followUp', 'dismissed']) {
      if (updates[key] !== undefined && typeof updates[key] !== 'boolean') {
        return res.status(400).json({ error: { message: `${key} must be true or false` } });
      }
    }
    if (updates.snoozedUntil !== undefined && updates.snoozedUntil !== null) {
      const parsed = new Date(updates.snoozedUntil);
      if (!Number.isFinite(parsed.getTime())) {
        return res.status(400).json({ error: { message: 'snoozedUntil must be a valid timestamp or null' } });
      }
      updates.snoozedUntil = parsed;
    }
    const ok = await Notification.setViewerState(notification.id, req.user.id, updates);
    if (!ok) return res.status(409).json({ error: { message: 'Unable to update notification state; clear follow-up before dismissing' } });
    const list = [notification];
    await Notification.applyReadStateForViewer(list, req.user.id);
    await appendNotificationContext(list);
    res.json(list[0]);
  } catch (error) {
    next(error);
  }
};

export const bulkNotificationActions = async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').trim();
    const allowed = ['mark_read', 'mark_unread', 'dismiss', 'restore'];
    if (!allowed.includes(action)) return res.status(400).json({ error: { message: 'Unsupported bulk action' } });
    const originalQuery = req.query;
    const targetIds = [];
    try {
      req.query = { ...(req.body?.filters || {}), page: 1, pageSize: 10000 };
      let result = await queryNotificationFeed(req, { forcePageSize: 10000 });
      targetIds.push(...result.items.map((item) => Number(item.id)).filter(Boolean));
      for (let page = 2; page <= result.pagination.totalPages; page += 1) {
        req.query.page = page;
        result = await queryNotificationFeed(req, { forcePageSize: 10000 });
        targetIds.push(...result.items.map((item) => Number(item.id)).filter(Boolean));
      }
    } finally {
      req.query = originalQuery;
    }
    const affected = await Notification.bulkSetViewerState(targetIds, req.user.id, action);
    res.json({ ok: true, affected });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};

export const getNotificationUpdates = async (req, res, next) => {
  try {
    const initialize = String(req.query.initialize || '') === '1';
    req.query = { ...req.query, status: 'all', sort: initialize ? 'newest' : 'oldest', page: 1, pageSize: initialize ? 1 : 50 };
    const result = await queryNotificationFeed(req, { includeAfterId: !initialize });
    res.json({
      items: result.items,
      unreadCount: result.unreadCount,
      latestId: Math.max(Number(req.query.afterId || 0), ...result.items.map((item) => Number(item.id || 0))),
      hasMore: !initialize && result.pagination.total > result.items.length
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};

export const getNotificationDigestEvents = async (req, res, next) => {
  try {
    const digestId = Number(req.params.id);
    const [digestRows] = await pool.execute(
      `SELECT * FROM notification_activity_digests WHERE id = ? AND user_id = ? LIMIT 1`,
      [digestId, Number(req.user.id)]
    );
    const digest = digestRows?.[0];
    if (!digest) return res.status(404).json({ error: { message: 'Activity digest not found' } });
    const access = await getFeedAccess(req, req.query.agencyId ? Number(req.query.agencyId) : null, 'inbox');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize || 25)));
    const offset = (page - 1) * pageSize;
    if (!access.agencyIds.length) {
      return res.json({ digest, items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
    }
    const placeholders = access.agencyIds.map(() => '?').join(',');
    const params = [...access.agencyIds, digest.period_start, digest.period_end];
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM notifications
       WHERE agency_id IN (${placeholders}) AND type IN ('user_login', 'user_logout')
         AND created_at >= ? AND created_at < ?`,
      params
    );
    const [events] = await pool.execute(
      `SELECT * FROM notifications
       WHERE agency_id IN (${placeholders}) AND type IN ('user_login', 'user_logout')
         AND created_at >= ? AND created_at < ?
       ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );
    await appendNotificationContext(events);
    const total = Number(countRows?.[0]?.total || 0);
    res.json({ digest, items: events, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (error) {
    next(error);
  }
};
