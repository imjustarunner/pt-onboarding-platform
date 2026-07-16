import pool from '../../config/database.js';
import ReferralDirectoryEntry from '../../models/ReferralDirectoryEntry.model.js';
import User from '../../models/User.model.js';
import Task from '../../models/Task.model.js';
import HiringProfile from '../../models/HiringProfile.model.js';
import HiringNote from '../../models/HiringNote.model.js';
import ProviderSearchIndex from '../../models/ProviderSearchIndex.model.js';
import ProviderAvailabilityService from '../providerAvailability.service.js';
import ProviderScheduleEvent from '../../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../../models/ProviderScheduleEventAttendee.model.js';
import {
  cancelOneMeeting,
  cancelTodaysRemaining,
  listRemainingMeetingsForToday,
  rescheduleOneMeeting,
  pushTodaysRemaining,
  findMyMeetings,
  sendMeetingInviteEmail
} from '../meetingCancellation.service.js';
import UserActivityLog from '../../models/UserActivityLog.model.js';
import auditActionRegistry from '../../config/auditActionRegistry.js';
import { getUserCapabilities } from '../../utils/capabilities.js';
import { searchTrainingKnowledgeBase } from '../trainingKnowledgeBase.service.js';

function str(v, maxLen = 2000) {
  const s = String(v ?? '').trim();
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureAgencyAccess(reqUser, agencyId) {
  if (!agencyId) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }
  if (reqUser?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function ensureCandidateInAgency(candidateUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_agencies
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [candidateUserId, agencyId]
  );
  return rows.length > 0;
}

async function ensureUserInAgency(userId, agencyId) {
  const uid = intOrNull(userId);
  const aid = intOrNull(agencyId);
  if (!uid || !aid) {
    const err = new Error('userId and agencyId are required');
    err.status = 400;
    throw err;
  }
  const ok = await ensureCandidateInAgency(uid, aid);
  if (!ok) {
    const err = new Error('User not found in this agency');
    err.status = 404;
    throw err;
  }
  return true;
}

function assertBackofficeAdmin(reqUser) {
  if (!reqUser) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  if (reqUser.role !== 'admin' && reqUser.role !== 'super_admin' && reqUser.role !== 'support') {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
}

async function assertCanManageHiring(reqUser) {
  if (!reqUser?.id) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  const userRow = await User.findById(reqUser.id);
  const caps = getUserCapabilities(userRow);
  if (!caps?.canManageHiring) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Ask Assistant (v1) — navigation + entity search tools.
//
// These are intentionally separate from the hiring/provider-search tools above
// so we can role-gate each one independently. Every tool below operates inside
// the requester's current agency (req.user.agencyId) or refuses; super_admin
// can cross agencies via an explicit agencyId argument.
// ---------------------------------------------------------------------------

// Keep My Account deep-links + routeNames aligned with frontend
// `frontend/src/navigation/quickNavCatalog.js` (Overview search + assistant navigate).
const NAVIGATION_ROUTE_WHITELIST = {
  // Dashboards / core (match frontend router paths)
  Dashboard: { path: '/dashboard', roles: null },
  Schedule: { path: '/dashboard?tab=my_schedule', roles: null },
  AccountInfo: { path: '/dashboard?tab=my&my=account', roles: null },
  Preferences: { path: '/dashboard?tab=my&my=preferences', roles: null },
  Credentials: { path: '/dashboard?tab=my&my=credentials', roles: null },
  MyPayroll: { path: '/dashboard?tab=my&my=payroll', roles: null },
  MyCompensation: { path: '/dashboard?tab=my&my=compensation', roles: null },
  MyBenefits: { path: '/dashboard?tab=my&my=benefits', roles: null },
  MyKudos: { path: '/dashboard?tab=my&my=kudos', roles: null },
  MyDocuments: { path: '/dashboard?tab=my&my=documents', roles: null },
  LifeBalance: { path: '/dashboard?tab=my&my=life-balance', roles: null },
  Notifications: { path: '/dashboard?tab=notifications', roles: null },

  // Admin surfaces (gated via requiresRole in router; tool checks role too)
  ClientManagement: { path: '/admin/clients', roles: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] },
  ReferralDirectory: { path: '/admin/referral-directory', roles: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] },
  UserManager: { path: '/admin/users', roles: ['admin', 'super_admin', 'support', 'staff'] },
  SchoolPortalsHub: { path: '/admin/school-portals-hub', roles: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'] },
  SkillBuildersProgramsEvents: { path: '/admin/program-events', roles: ['admin', 'staff', 'support', 'super_admin', 'provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'] },
  ProviderDirectory: { path: '/admin/provider-directory', roles: ['admin', 'support', 'staff', 'super_admin'] },
  HiringCandidates: { path: '/admin/hiring-candidates', roles: ['admin', 'super_admin'] },
  AuditCenter: { path: '/admin/audit-center', roles: ['admin', 'support', 'super_admin'] },
  NoteAid: { path: '/admin/note-aid', roles: ['admin', 'support', 'staff', 'provider', 'super_admin'] },
  ComplianceCorner: { path: '/admin/compliance-corner', roles: ['admin', 'super_admin'] },
  PresenceTeamBoard: { path: '/admin/presence', roles: ['admin', 'super_admin'] },
  AdminPayroll: { path: '/admin/payroll', roles: ['admin', 'super_admin', 'support', 'staff'] },
  GearInventory: { path: '/admin/gear-inventory', roles: ['admin', 'super_admin', 'support', 'staff'] },
  // Module Manager → Training Reference Docs modal (handbook / policies Google Doc link)
  ModuleManager: { path: '/admin/modules', roles: ['admin', 'support', 'super_admin'] },
  TrainingKnowledgeBase: {
    path: '/admin/modules?trainingKb=1',
    roles: ['admin', 'support', 'super_admin']
  }
};

const ENTITY_KINDS = new Set(['school', 'event', 'user']);

// Same audience as ReferralDirectory route + navigateTo whitelist.
const REFERRAL_DIRECTORY_TOOL_ROLES = ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'];

// Keep in sync with router `SKILL_BUILDERS_PROGRAM_EVENTS_ROLES` + executeToolCall searchEvents gate.
const PROGRAM_EVENTS_SEARCH_ROLES = [
  'admin',
  'staff',
  'support',
  'super_admin',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant'
];

const SCHOOL_PORTAL_SEARCH_ROLES = ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'];

const BACKOFFICE_USER_ENUM_ROLES = ['admin', 'super_admin', 'support'];

const PROVIDER_DIRECTORY_TOOL_ROLES = ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'];

const PAYROLL_SUMMARY_TOOL_ROLES = [
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'supervisor'
];

const HIRING_AGENT_TOOL_ROLES = ['admin', 'super_admin', 'support'];

// Roles that may use the tutoring standards crosswalk tool. Tutors/providers need
// real-time standards lookups during a virtual tutoring session; admins/support
// may inspect mappings while reviewing session recaps or building homework.
const LEARNING_STANDARDS_TOOL_ROLES = [
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'supervisor'
];

// Only admin-tier roles can search across other users' activity in the
// agency audit log. Individual users can always see their own recent
// activity via listMyRecentActivity (no role gate).
const AUDIT_SEARCH_TOOL_ROLES = ['admin', 'super_admin', 'support'];

// Restricted whitelist of action types the assistant will accept as filters.
// Anything outside this list is dropped before it hits the DB — prevents
// the LLM (or a caller) from crafting weird SQL-ish values or enumerating
// internal-only audit events.
const ASSISTANT_AUDIT_ACTION_TYPES = new Set([
  'login', 'logout', 'timeout', 'password_change', 'password_reset_link_sent',
  'dashboard_view', 'admin_dashboard_view', 'admin_page_view', 'audit_center_viewed',
  'module_start', 'module_end', 'module_complete',
  'intake_approval', 'public_intake_login_help',
  'note_aid_execute', 'agent_assist', 'agent_assist_feedback', 'agent_tool_execute',
  'hiring_reference_event',
  'demo_switch_view',
  'sms_sent', 'sms_send_failed', 'sms_inbound_received',
  'sms_opt_in', 'sms_opt_out',
  'sms_thread_deleted', 'sms_message_deleted', 'sms_thread_forwarded_to_support',
  'outbound_call_started', 'outbound_call_failed', 'voicemail_listened',
  'conference_call_started', 'call_transferred', 'call_held', 'call_resumed',
  'smart_school_roi_permissions_applied',
  'client_school_staff_roi_access_updated', 'client_school_roi_expiration_updated',
  'client_school_roi_revoked', 'school_roi_signing_config_updated',
  'client_school_roi_signing_link_issued', 'client_school_roi_signing_text_sent',
  'client_school_roi_signing_email_sent',
  'school_portal_roster_viewed', 'school_portal_comments_viewed',
  'school_portal_comment_posted',
  'school_portal_waitlist_viewed', 'school_portal_waitlist_updated',
  'school_portal_school_staff_added', 'school_portal_school_staff_updated',
  'school_portal_school_staff_removed', 'school_portal_school_staff_password_reset_sent',
  'school_portal_school_staff_role_flags_updated',
  'school_portal_school_admin_assigned', 'school_portal_school_admin_forfeited',
  'school_portal_bulk_announcements_created', 'school_portal_bulk_announcements_updated',
  'school_portal_bulk_announcements_deleted',
  'school_provider_availability_updated_by_provider',
  'school_provider_slot_verification_pushed', 'school_provider_slot_verification_cancelled'
]);

function clipForAssistant(s, maxLen) {
  const t = String(s ?? '').trim();
  if (!maxLen) return t;
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function clipMetadataForAssistant(raw) {
  if (raw == null) return null;
  let stringified;
  try {
    stringified = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch {
    return null;
  }
  if (!stringified) return null;
  return clipForAssistant(stringified, 240) || null;
}

function shapeActivityRow(row) {
  if (!row) return null;
  const actionType = String(row.action_type || '').trim();
  const firstName = row.user_first_name || '';
  const lastName = row.user_last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: Number(row.id),
    actionType,
    actionLabel: auditActionRegistry.getActionLabel(actionType),
    category: auditActionRegistry.getActionCategory(actionType),
    userId: row.user_id ?? null,
    userEmail: row.user_email || null,
    userName: fullName || null,
    agencyId: row.agency_id ?? null,
    ipAddress: row.ip_address || null,
    moduleId: row.module_id ?? null,
    moduleTitle: row.module_title || null,
    durationSeconds:
      row.duration_seconds == null ? null : Number(row.duration_seconds),
    metadata: clipMetadataForAssistant(row.metadata),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : null
  };
}

function parseIsoOrNull(s) {
  if (!s) return null;
  const str_ = String(s).trim().slice(0, 40);
  if (!str_) return null;
  const ymd = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(str_);
  if (ymd) return ymd[1];
  const d = new Date(str_);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shapeReferralDirectoryRow(r) {
  return {
    id: Number(r.id),
    name: r.name || null,
    organizationName: r.organization_name || null,
    category: r.category_name || null,
    phone: r.phone || null,
    email: r.email || null,
    website: r.website || null,
    address: r.address || null,
    specialties: clipForAssistant(r.specialties, 420) || null,
    insurancesAccepted: clipForAssistant(r.insurances_accepted, 220) || null,
    notes: clipForAssistant(r.notes, 420) || null
  };
}

/**
 * OR-style search: full phrase plus each token so "pediatrics psychiatry" finds
 * rows that match either specialty term.
 */
async function searchReferralDirectoryEntriesForTool(agencyId, rawQuery, limitCap) {
  const lim = Math.min(Math.max(1, intOrNull(limitCap) || 20), 40);
  const q = String(rawQuery || '').trim();
  if (!q) return [];
  const tokens = q
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 10);
  const uniq = new Map();
  const ingest = async (search) => {
    const needle = String(search || '').trim();
    if (!needle) return;
    const rows = await ReferralDirectoryEntry.listForAgency(agencyId, { search: needle, limit: 150 });
    for (const row of rows || []) {
      if (row?.id != null) uniq.set(Number(row.id), row);
    }
  };
  await ingest(q);
  for (const tok of tokens) {
    if (tok !== q) await ingest(tok);
  }
  return Array.from(uniq.values())
    .slice(0, lim)
    .map(shapeReferralDirectoryRow);
}

function requireAuthed(req) {
  if (!req?.user?.id) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
}

function roleAllowed(reqUser, allowedRoles) {
  if (!allowedRoles || !allowedRoles.length) return true;
  if (reqUser?.role === 'super_admin') return true;
  return allowedRoles.includes(String(reqUser?.role || '').toLowerCase());
}

function currentAgencyId(req, fallbackArg) {
  const fromUser = intOrNull(req?.user?.agencyId);
  if (fromUser) return fromUser;
  // super_admin users have no fixed agencyId in their JWT.
  // Accept it from the request context (always sent by the frontend) or an explicit fallback arg.
  if (req?.user?.role === 'super_admin') {
    const fromContext = intOrNull(req.body?.context?.agencyId);
    if (fromContext) return fromContext;
    const fromArg = intOrNull(fallbackArg);
    if (fromArg) return fromArg;
  }
  return null;
}

async function resolveSchoolPortalPath(agencyIdScope, schoolId) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.slug
     FROM agency_schools asx
     JOIN agencies a ON a.id = asx.school_organization_id
     WHERE asx.agency_id = ?
       AND asx.is_active = TRUE
       AND asx.school_organization_id = ?
     LIMIT 1`,
    [agencyIdScope, schoolId]
  );
  const row = rows?.[0];
  if (!row?.slug) return null;
  return { slug: row.slug, name: row.name, path: `/${row.slug}/admin/school-portals` };
}

const SCHOOL_NAME_GENERIC_TOKENS = new Set([
  'school', 'schools', 'elementary', 'middle', 'high', 'upper', 'lower',
  'academy', 'charter', 'institute', 'the', 'and', 'or', 'of', 'portal',
  'portals', 'hub', 'program', 'programs', 'learning'
]);

/** Search affiliated school orgs by name (agency_schools). */
async function searchAffiliatedSchoolsByName(agencyId, query, limit = 10) {
  const q = String(query || '').trim();
  const lim = Math.min(Math.max(1, Number(limit) || 10), 25);
  if (!q) return [];

  const runQuery = async (likeArg) => {
    const [rs] = await pool.execute(
      `SELECT a.id, a.name, a.slug, a.organization_type
       FROM agency_schools asx
       JOIN agencies a ON a.id = asx.school_organization_id
       WHERE asx.agency_id = ?
         AND asx.is_active = TRUE
         AND a.is_active = TRUE
         AND a.name LIKE ?
       ORDER BY a.name ASC
       LIMIT ${lim}`,
      [agencyId, likeArg]
    );
    return rs || [];
  };

  let rows = await runQuery(`%${q}%`);
  if (!rows.length && q.includes(' ')) {
    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !SCHOOL_NAME_GENERIC_TOKENS.has(t));
    if (tokens.length) {
      rows = await runQuery(`%${tokens.join(' ')}%`);
      if (!rows.length && tokens.length > 1) {
        rows = await runQuery(`%${tokens[0]}%`);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    organizationType: r.organization_type || null,
    portalPath: r.slug ? `/${r.slug}/admin/school-portals` : null
  }));
}

/**
 * Roster counts for school orgs — same status buckets as School Overview.
 * Prefers client_organization_assignments; falls back to clients.organization_id.
 */
async function loadClientRosterCountsBySchoolIds(schoolIds) {
  const ids = (schoolIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  const empty = () => ({
    clientsCurrent: 0,
    clientsPacket: 0,
    clientsScreener: 0,
    clientsWaitlist: 0,
    clientsOnRoster: 0
  });
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const byId = new Map(ids.map((id) => [id, empty()]));

  try {
    const [rows] = await pool.execute(
      `SELECT
         coa.organization_id AS school_id,
         SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
         SUM(CASE WHEN cs.status_key = 'packet' THEN 1 ELSE 0 END) AS clients_packet,
         SUM(CASE WHEN cs.status_key = 'screener' THEN 1 ELSE 0 END) AS clients_screener,
         SUM(CASE WHEN cs.status_key = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count,
         COUNT(DISTINCT c.id) AS clients_on_roster
       FROM client_organization_assignments coa
       JOIN clients c ON c.id = coa.client_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE coa.is_active = TRUE
         AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
         AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
         AND coa.organization_id IN (${placeholders})
       GROUP BY coa.organization_id`,
      ids
    );
    for (const r of rows || []) {
      const sid = Number(r.school_id);
      if (!byId.has(sid)) continue;
      byId.set(sid, {
        clientsCurrent: Number(r.clients_current || 0),
        clientsPacket: Number(r.clients_packet || 0),
        clientsScreener: Number(r.clients_screener || 0),
        clientsWaitlist: Number(r.waitlist_count || 0),
        clientsOnRoster: Number(r.clients_on_roster || 0)
      });
    }
    return byId;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  const [rows] = await pool.execute(
    `SELECT
       c.organization_id AS school_id,
       SUM(CASE WHEN cs.status_key = 'current' THEN 1 ELSE 0 END) AS clients_current,
       SUM(CASE WHEN cs.status_key = 'packet' THEN 1 ELSE 0 END) AS clients_packet,
       SUM(CASE WHEN cs.status_key = 'screener' THEN 1 ELSE 0 END) AS clients_screener,
       SUM(CASE WHEN cs.status_key = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count,
       COUNT(DISTINCT c.id) AS clients_on_roster
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
       AND (cs.status_key IS NULL OR LOWER(cs.status_key) <> 'archived')
       AND c.organization_id IN (${placeholders})
     GROUP BY c.organization_id`,
    ids
  );
  for (const r of rows || []) {
    const sid = Number(r.school_id);
    if (!byId.has(sid)) continue;
    byId.set(sid, {
      clientsCurrent: Number(r.clients_current || 0),
      clientsPacket: Number(r.clients_packet || 0),
      clientsScreener: Number(r.clients_screener || 0),
      clientsWaitlist: Number(r.waitlist_count || 0),
      clientsOnRoster: Number(r.clients_on_roster || 0)
    });
  }
  return byId;
}

/** Route names this user may use with navigateTo (matches NAVIGATION_ROUTE_WHITELIST role gates). */
export function navigableRouteNamesForUser(reqUser) {
  if (!reqUser) return [];
  const names = [];
  for (const routeName of Object.keys(NAVIGATION_ROUTE_WHITELIST)) {
    const entry = NAVIGATION_ROUTE_WHITELIST[routeName];
    if (roleAllowed(reqUser, entry.roles)) names.push(routeName);
  }
  return names;
}

function buildNavigateToSchemaForUser(reqUser) {
  const names = navigableRouteNamesForUser(reqUser);
  const enumNames = names.length ? names : ['Dashboard'];
  return {
    name: 'navigateTo',
    description: 'Navigate the current user to a whitelisted named route. Server resolves the path.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        routeName: {
          type: 'string',
          enum: enumNames
        }
      },
      required: ['routeName']
    }
  };
}

/**
 * Tool schemas exposed to the LLM for this user. Prevents the model from planning tools
 * the caller cannot execute; intersects optional agentConfig.allowedTools (cannot expand access).
 */
export function getToolSchemasForUser(reqUser, agentConfig = null) {
  if (!reqUser?.id) return [];
  const baseList = getToolSchemas().filter((t) => t.name !== 'navigateTo');
  const withNav = [buildNavigateToSchemaForUser(reqUser), ...baseList];

  const canSeeTool = (name) => {
    switch (name) {
      case 'navigateTo':
        return navigableRouteNamesForUser(reqUser).length > 0;
      case 'getMyPayrollSummary':
        return roleAllowed(reqUser, PAYROLL_SUMMARY_TOOL_ROLES);
      case 'searchReferralDirectory':
        return roleAllowed(reqUser, REFERRAL_DIRECTORY_TOOL_ROLES);
      case 'listMyRecentActivity':
        // Anyone authenticated can see their own activity log.
        return true;
      case 'searchAgencyActivity':
      case 'getAgencyActivityStats':
        return roleAllowed(reqUser, AUDIT_SEARCH_TOOL_ROLES);
      case 'searchSchools':
      case 'getSchoolClientStats':
        return roleAllowed(reqUser, SCHOOL_PORTAL_SEARCH_ROLES);
      case 'searchEvents':
        return roleAllowed(reqUser, PROGRAM_EVENTS_SEARCH_ROLES);
      case 'searchUsers':
        return roleAllowed(reqUser, BACKOFFICE_USER_ENUM_ROLES);
      case 'openEntity':
        return (
          roleAllowed(reqUser, SCHOOL_PORTAL_SEARCH_ROLES) ||
          roleAllowed(reqUser, PROGRAM_EVENTS_SEARCH_ROLES) ||
          roleAllowed(reqUser, BACKOFFICE_USER_ENUM_ROLES)
        );
      case 'createTask':
        return roleAllowed(reqUser, BACKOFFICE_USER_ENUM_ROLES);
      case 'createHiringCandidate':
      case 'addHiringNote':
      case 'setHiringStage':
        return roleAllowed(reqUser, HIRING_AGENT_TOOL_ROLES);
      case 'searchProviders':
      case 'getProviderProfileFields':
      case 'getProviderIntakeAvailability':
      case 'findIntakeOpenings':
        return roleAllowed(reqUser, PROVIDER_DIRECTORY_TOOL_ROLES);
      case 'getEventResponses':
        return roleAllowed(reqUser, PROGRAM_EVENTS_SEARCH_ROLES);
      case 'getOfficeSchedule':
        return roleAllowed(reqUser, ['admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant']);
      case 'findProvidersByApproach':
        // Anyone provider+ can ask "who uses CBT" for internal-referral purposes.
        return roleAllowed(reqUser, [
          ...PROVIDER_DIRECTORY_TOOL_ROLES,
          'provider',
          'supervisor'
        ]);
      case 'startMeeting':
      case 'cancelMeeting':
      case 'cancelTodaysRemainingMeetings':
      case 'findNextMeeting':
      case 'findMyMeetings':
      case 'rescheduleMeeting':
      case 'pushTodaysRemainingMeetings':
        return roleAllowed(reqUser, ['admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant']);
      case 'openTodaysWorkspace':
      case 'openWorkspaceEvent':
        // Anyone signed in: returns whatever events the actor is part of today.
        return true;
      case 'searchTrainingKnowledgeBase':
        // Agency handbook / policies — available to signed-in staff (not guardians/clients).
        return roleAllowed(reqUser, [
          'admin',
          'super_admin',
          'support',
          'staff',
          'provider',
          'provider_plus',
          'supervisor',
          'clinical_practice_assistant',
          'intern',
          'intern_plus'
        ]);
      case 'lookupStandardCrosswalk':
        return roleAllowed(reqUser, LEARNING_STANDARDS_TOOL_ROLES);
      default:
        return false;
    }
  };

  let out = withNav.filter((s) => canSeeTool(s.name));
  const cfgSet = Array.isArray(agentConfig?.allowedTools)
    ? new Set(agentConfig.allowedTools.map((t) => String(t || '').trim()).filter(Boolean))
    : null;
  if (cfgSet?.size) {
    out = out.filter((s) => cfgSet.has(s.name));
  }
  return out;
}

export function getToolSchemas() {
  return [
    {
      name: 'navigateTo',
      description: 'Navigate the current user to a whitelisted named route. Server resolves the path.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          routeName: {
            type: 'string',
            enum: Object.keys(NAVIGATION_ROUTE_WHITELIST)
          }
        },
        required: ['routeName']
      }
    },
    {
      name: 'getMyPayrollSummary',
      description:
        "Fetch the signed-in user's payroll summary for their current agency: last posted paycheck (period dates, total pay), unpaid documentation counts (NO_NOTE rows and non-payable DRAFT rows in the last period), prior unpaid buckets, and delinquency score. Use for questions like last paycheck amount, how many no-notes, or unpaid documentation.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    },
    {
      name: 'listMyRecentActivity',
      description:
        "List the signed-in user's own most recent activity log rows (logins, page views, SMS sent by them, password changes, module progress, etc.). Use for questions like 'when did I last log in?', 'what did I do today?', 'how many logins did I have this week?'. Never returns other users' activity.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 15, max 50).' },
          since: {
            type: 'string',
            description: 'Optional ISO date (YYYY-MM-DD) — only return rows on or after this date.'
          },
          actionType: {
            type: 'string',
            description: 'Optional narrow filter to a single action_type (e.g. "login", "sms_sent").'
          }
        }
      }
    },
    {
      name: 'searchAgencyActivity',
      description:
        "Admin-only. Search this agency's audit log (user_activity_log) by action type, user email/name, date range, and free-text. Use for questions like 'who logged in from a new IP yesterday?', 'how many SMS did we send this week?', 'who accessed the school portal roster today?', 'which admins sent password reset links in the last 7 days?'. Always scoped to the signed-in user's current agency.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          actionTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'One or more action_type strings to filter by (e.g. ["login","timeout"]). Unknown/non-whitelisted values are ignored.'
          },
          search: {
            type: 'string',
            description: 'Free-text match against user email, user name, action_type, metadata, ip_address, or session_id.'
          },
          userEmail: {
            type: 'string',
            description: 'Narrow to a single user in the agency by exact email.'
          },
          startDate: { type: 'string', description: 'YYYY-MM-DD or ISO (inclusive).' },
          endDate: { type: 'string', description: 'YYYY-MM-DD or ISO (inclusive).' },
          limit: { type: 'integer', description: 'Max rows to return (default 25, max 100).' }
        }
      }
    },
    {
      name: 'getAgencyActivityStats',
      description:
        "Admin-only. Return top action_type counts for this agency in a date range. Use for questions like 'what are people doing most this week?', 'how many logins yesterday?', 'how many SMS we sent last month?'. Returns an ordered breakdown by count.",
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          startDate: {
            type: 'string',
            description: 'YYYY-MM-DD or ISO. Defaults to 7 days ago.'
          },
          endDate: {
            type: 'string',
            description: 'YYYY-MM-DD or ISO. Defaults to now.'
          },
          topN: {
            type: 'integer',
            description: 'Max distinct action_types to return (default 20, max 50).'
          },
          userEmail: {
            type: 'string',
            description: 'Optional: narrow stats to a single user in the agency by exact email.'
          }
        }
      }
    },
    {
      name: 'searchReferralDirectory',
      description:
        'Search this agency\'s referral directory (approved external providers/resources). Use when the user needs referrals for a client — e.g. pediatrics, psychiatry, speech, OT — or asks who to refer to for a specialty. Returns names, organizations, phones, specialties, categories. After listing, you may suggest navigateTo ReferralDirectory if they want the full editable list.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            description: 'Specialty, discipline, provider type, organization name fragment, or comma/space-separated terms (e.g. "pediatric psychiatry").'
          },
          limit: { type: 'integer', description: 'Max rows to return (default 20, max 40)' }
        },
        required: ['query']
      }
    },
    {
      name: 'lookupStandardCrosswalk',
      description:
        'Look up learning standard crosswalks across frameworks: Colorado Academic Standards (CAS), Common Core (CCSS), Next Generation Science Standards (NGSS), and US Department of Education (NAEP) domains. Use during a virtual tutoring session to ground hints, strengths, and homework in codes a family or school recognizes. Returns mapped codes with mapping quality (exact/close/partial/related).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: {
            type: 'string',
            description: 'A CAS code (e.g. "MATH.A.1"), CCSS code (e.g. "CCSS.MATH.CONTENT.6.EE.B.7"), or free text to match against standard titles.'
          },
          subject: {
            type: 'string',
            description: 'Optional subject hint to narrow matches (e.g. "Math", "ELA", "Science").'
          },
          limit: { type: 'integer', description: 'Max source standards to return (default 5, max 15).' }
        },
        required: ['code']
      }
    },
    {
      name: 'searchSchools',
      description: 'Search school organizations linked to the current agency by name. Returns id, name, and a portalPath to open the school portal.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' }
        },
        required: ['query']
      }
    },
    {
      name: 'getSchoolClientStats',
      description:
        'Look up affiliated school (or program/learning) orgs by name and return live roster counts: current/active students, waitlist, packet, screener, and total on roster. Use for “how many clients/students are active at [school]?” — not handbook search.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'School / affiliate name fragment (e.g. "Rudy Elementary").' },
          limit: { type: 'integer', description: 'Max matching schools (default 10, max 25).' }
        },
        required: ['query']
      }
    },
    {
      name: 'searchEvents',
      description: 'Search program events (company_events) in the current agency by title. Optionally filter by start date range.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          startsAfter: { type: 'string', description: 'ISO date/time; events starting at or after this time' },
          startsBefore: { type: 'string', description: 'ISO date/time; events starting at or before this time' },
          limit: { type: 'integer' }
        },
        required: ['query']
      }
    },
    {
      name: 'searchUsers',
      description: 'Search users in the current agency by name or email. Admin-only: providers cannot enumerate users.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' }
        },
        required: ['query']
      }
    },
    {
      name: 'openEntity',
      description: 'Given a resolved entity kind and id from a searchXxx tool, return navigate uiCommand to open it.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['school', 'event', 'user'] },
          id: { type: 'integer' }
        },
        required: ['kind', 'id']
      }
    },
    {
      name: 'createTask',
      description: 'Create a training or document task (admin-only).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskType: { type: 'string', enum: ['training', 'document'] },
          title: { type: 'string' },
          description: { type: 'string' },
          assignedToUserId: { type: 'integer' },
          assignedToRole: {
            type: 'string',
            enum: [
              'super_admin',
              'admin',
              'support',
              'supervisor',
              'clinical_practice_assistant',
              'staff',
              'provider',
              'school_staff',
              'facilitator',
              'intern'
            ]
          },
          assignedToAgencyId: { type: 'integer' },
          dueDate: { type: 'string', description: 'ISO 8601 date/time string' },
          referenceId: { type: 'integer' },
          documentActionType: { type: 'string', enum: ['signature', 'review'] }
        },
        required: ['taskType', 'title']
      }
    },
    {
      name: 'createHiringCandidate',
      description: 'Create a prospective hiring candidate (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          personalEmail: { type: 'string' },
          phoneNumber: { type: 'string' },
          appliedRole: { type: 'string' },
          source: { type: 'string' },
          stage: { type: 'string' },
          role: { type: 'string' }
        },
        required: ['agencyId', 'lastName', 'personalEmail']
      }
    },
    {
      name: 'addHiringNote',
      description: 'Add an internal hiring note for a candidate (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          candidateUserId: { type: 'integer' },
          message: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 }
        },
        required: ['agencyId', 'candidateUserId', 'message']
      }
    },
    {
      name: 'setHiringStage',
      description: 'Update a candidate hiring stage (requires canManageHiring).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          candidateUserId: { type: 'integer' },
          stage: { type: 'string' }
        },
        required: ['agencyId', 'candidateUserId', 'stage']
      }
    },
    {
      name: 'searchProviders',
      description: 'Search providers in an agency by structured filters or free text.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          textQuery: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fieldKey: { type: 'string' },
                op: { type: 'string', enum: ['hasOption', 'textContains', 'equals'] },
                value: { type: 'string' }
              },
              required: ['fieldKey', 'op', 'value']
            }
          },
          limit: { type: 'integer' },
          offset: { type: 'integer' }
        },
        required: ['agencyId']
      }
    },
    {
      name: 'getProviderProfileFields',
      description: 'Fetch provider profile fields and values (Provider Info tab).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          providerId: { type: 'integer' },
          fieldKeys: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['agencyId', 'providerId']
      }
    },
    {
      name: 'getProviderIntakeAvailability',
      description: 'Fetch provider intake availability (virtual + in-person slots).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agencyId: { type: 'integer' },
          providerId: { type: 'integer' },
          weekStartYmd: { type: 'string', description: 'YYYY-MM-DD (week start; Monday)' },
          includeGoogleBusy: { type: 'boolean' },
          slotMinutes: { type: 'integer' },
          modality: { type: 'string', enum: ['VIRTUAL', 'IN_PERSON', 'ALL'] }
        },
        required: ['agencyId', 'providerId']
      }
    },
    {
      name: 'findIntakeOpenings',
      description:
        'Find ALL providers in the agency who have at least one open intake slot on a given date. Use for questions like "who has an opening for an intake today" or "anyone available for an intake on Friday". Returns one row per provider with the count and earliest start of their open slots that day.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dateYmd: {
            type: 'string',
            description: 'YYYY-MM-DD. Defaults to today in the agency timezone.'
          },
          modality: {
            type: 'string',
            enum: ['VIRTUAL', 'IN_PERSON', 'ALL'],
            description: 'Filter slots by modality. Default ALL.'
          }
        }
      }
    },
    {
      name: 'getEventResponses',
      description:
        'List who RSVP\'d / responded to a company (program) event. Use for questions like "who rsvp\'d for Friday\'s event" or "who said yes to the staff meeting". Provide either eventId, or a date hint (e.g. "this Friday") and we will resolve it to the closest event.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          eventId: { type: 'integer', description: 'Specific company_events.id when known.' },
          eventQuery: { type: 'string', description: 'Free-text title fragment to find the event.' },
          dateYmd: {
            type: 'string',
            description: 'YYYY-MM-DD. If provided, picks the nearest event within ±3 days.'
          },
          responseKey: {
            type: 'string',
            description: 'Optional filter: yes, no, maybe, attended, etc.'
          },
          limit: { type: 'integer' }
        }
      }
    },
    {
      name: 'findProvidersByApproach',
      description:
        'Find providers in the agency who use a particular treatment approach, modality, or specialty. Use for questions like "who uses CBT", "who does EMDR", "anyone who does play therapy", "who specializes in trauma". Searches across modality, treatment preferences, specialties, and age-specialty fields. Returns one row per provider with the matching field/option.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          approach: {
            type: 'string',
            description: 'The approach / modality / specialty term to search for (e.g. "CBT", "DBT", "EMDR", "trauma", "play therapy"). Required.'
          },
          limit: {
            type: 'integer',
            description: 'Max providers to return. Default 25.'
          }
        },
        required: ['approach']
      }
    },
    {
      name: 'cancelMeeting',
      description:
        'Cancel a single TEAM_MEETING / HUDDLE by event id. Sets status=CANCELLED, best-effort removes the Google Calendar event, and emails the host + attendees via the meeting_cancelled trigger. WRITE action — always confirmed before it runs. Use when the user clicks "Cancel" on a meeting card or asks "cancel my next meeting" / "cancel the meeting with X".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          eventId: { type: 'integer' },
          reason: {
            type: 'string',
            description: 'Optional short reason included in the cancellation email (e.g. "running over with a client").'
          }
        },
        required: ['eventId']
      }
    },
    {
      name: 'cancelTodaysRemainingMeetings',
      description:
        'Cancel ALL of the signed-in user\'s remaining TEAM_MEETING / HUDDLE events for the rest of today (only those they host). Each cancellation emails the attendees + host. WRITE action — always confirmed before it runs. Use for "cancel the rest of my day", "cancel all my remaining meetings", "I\'m sick — cancel everything today".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', description: 'Optional short reason included in the cancellation emails.' }
        }
      }
    },
    {
      name: 'findNextMeeting',
      description:
        'Find the signed-in user\'s next TEAM_MEETING / HUDDLE that is still scheduled (status != CANCELLED) and starts at or after now. Read-only. Used by the "cancel my next meeting" flow to resolve which event id to cancel.',
      parameters: { type: 'object', additionalProperties: false, properties: {} }
    },
    {
      name: 'findMyMeetings',
      description:
        'Find the signed-in user\'s active TEAM_MEETING / HUDDLE rows for the rest of today, optionally narrowed by attendee name and/or start time (HH:MM 24h). Includes meetings where the user is host OR attendee. Read-only. Used by "cancel the meeting with X" / "move my 3pm to 4pm".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          withName: { type: 'string', description: 'Substring of attendee/host name or email to match.' },
          atTimeHm: { type: 'string', description: 'Start time HH:MM (24h) to filter by, today.' }
        }
      }
    },
    {
      name: 'rescheduleMeeting',
      description:
        'Reschedule one TEAM_MEETING / HUDDLE to a new wall-clock start time. Duration is preserved unless newEndAt is supplied. Best-effort updates the host\'s Google Calendar event time and emails the host + every attendee via the meeting_rescheduled trigger. WRITE action — always confirmed before it runs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          eventId: { type: 'integer' },
          newStartAt: { type: 'string', description: 'ISO 8601 or "YYYY-MM-DD HH:MM[:SS]" wall-clock string.' },
          newEndAt: { type: 'string', description: 'Optional. Defaults to newStartAt + original duration.' },
          reason: { type: 'string', description: 'Optional short reason included in the email.' }
        },
        required: ['eventId', 'newStartAt']
      }
    },
    {
      name: 'pushTodaysRemainingMeetings',
      description:
        'Shift ALL of the signed-in user\'s remaining TEAM_MEETING / HUDDLE rows today by N minutes (positive = later, negative = earlier). Uses rescheduleMeeting under the hood, so each one emails attendees + host. WRITE action — always confirmed.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shiftMinutes: { type: 'integer', description: 'Non-zero. Positive = push later, negative = pull earlier.' },
          reason: { type: 'string' }
        },
        required: ['shiftMinutes']
      }
    },
    {
      name: 'startMeeting',
      description:
        'Start an ad-hoc 1:1 video meeting between the signed-in user and one other person, similar to starting a Google Meet. Creates a TEAM_MEETING schedule event with the actor as host and the other person as attendee, provisions a Twilio room, and returns a join URL. WRITE action — always confirmed before it runs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          withUserId: {
            type: 'integer',
            description: 'User id of the person to meet with. Required at execution time.'
          },
          title: {
            type: 'string',
            description: 'Meeting title. Defaults to "Quick meeting with <name>".'
          },
          durationMinutes: {
            type: 'integer',
            description: 'Length of the meeting in minutes. Default 30.'
          }
        },
        required: ['withUserId']
      }
    },
    {
      name: 'openWorkspaceEvent',
      description:
        'Open a single workspace event (TEAM_MEETING / HUDDLE / SCHEDULE_HOLD / etc.) by id. Used as the click target on workspace cards. Returns the appropriate UI command (join URL for meetings, schedule view for holds).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          eventId: { type: 'integer' }
        },
        required: ['eventId']
      }
    },
    {
      name: 'openTodaysWorkspace',
      description:
        'List the signed-in user\'s active events for today (meetings, holds, sessions). Use for "open my workspace for today", "what\'s active right now", "what am I in today". Returns one row per event so the user can pick when there are several; the assistant auto-opens when there is exactly one.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dateYmd: {
            type: 'string',
            description: 'YYYY-MM-DD. Defaults to today.'
          },
          activeOnly: {
            type: 'boolean',
            description: 'If true, only events currently happening or starting within the next 30 minutes. Default false (return all of today).'
          }
        }
      }
    },
    {
      name: 'getOfficeSchedule',
      description:
        'List which physical office locations have any sessions scheduled on a given date, and the count of booked vs released slots per office. Use for questions like "what offices are open today", "any sessions at the Boca office tomorrow", or "is anyone using the office on Saturday".',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dateYmd: {
            type: 'string',
            description: 'YYYY-MM-DD. Defaults to today.'
          },
          locationQuery: {
            type: 'string',
            description: 'Optional name fragment to filter offices.'
          }
        }
      }
    },
    {
      name: 'searchTrainingKnowledgeBase',
      description:
        'Search this agency\'s uploaded workplace handbook and policy documents (Training Knowledge Base). Use for questions about PTO, vacation, sick leave, benefits, dress code, remote work, holiday pay, code of conduct, or anything covered by the employee handbook / HR policies. Returns relevant excerpts with source file names.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            description: 'Natural-language question or topic (e.g. "PTO policy", "sick leave", "remote work").'
          },
          limit: {
            type: 'integer',
            description: 'Max documents to return. Default 5.'
          }
        },
        required: ['query']
      }
    }
  ];
}

export async function executeToolCall({ req, toolCall }) {
  const name = str(toolCall?.name || toolCall?.tool || '', 120);
  const args = toolCall?.args && typeof toolCall.args === 'object' ? toolCall.args : {};

  if (!name) {
    const err = new Error('Invalid tool call');
    err.status = 400;
    throw err;
  }

  // -----------------------------------------------------------------------
  // Ask Assistant: navigation and entity-search tools (role-gated, scoped to
  // the requester's current agency unless super_admin explicitly crosses).
  // -----------------------------------------------------------------------

  if (name === 'navigateTo') {
    requireAuthed(req);
    const routeName = str(args.routeName, 120);
    const entry = NAVIGATION_ROUTE_WHITELIST[routeName];
    if (!entry) {
      const err = new Error(`Route "${routeName}" is not on the navigation whitelist`);
      err.status = 400;
      throw err;
    }
    if (!roleAllowed(req.user, entry.roles)) {
      const err = new Error('You do not have access to that page');
      err.status = 403;
      throw err;
    }
    return {
      ok: true,
      tool: name,
      result: { routeName, path: entry.path },
      uiCommands: [{ type: 'navigate', to: entry.path }]
    };
  }

  // ---------------------------------------------------------------------
  // searchTrainingKnowledgeBase — handbook + policies uploaded in Training KB
  // ---------------------------------------------------------------------
  if (name === 'searchTrainingKnowledgeBase') {
    requireAuthed(req);
    if (!roleAllowed(req.user, [
      'admin',
      'super_admin',
      'support',
      'staff',
      'provider',
      'provider_plus',
      'supervisor',
      'clinical_practice_assistant',
      'intern',
      'intern_plus'
    ])) {
      const err = new Error('Workplace handbook search is not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const query = str(args.query, 240).trim();
    if (!query) {
      const err = new Error('query is required');
      err.status = 400;
      throw err;
    }
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 5), 10);
    let search;
    try {
      search = await searchTrainingKnowledgeBase({
        agencyId,
        query,
        maxDocs: limit,
        maxSnippetsPerDoc: 3,
        snippetChars: 750,
        folders: ['handbook', 'policies']
      });
    } catch (e) {
      const err = new Error(e?.message || 'Knowledge base search failed');
      err.status = 500;
      throw err;
    }

    return {
      ok: true,
      tool: name,
      result: {
        query,
        totalDocuments: search.totalDocuments || 0,
        folders: search.folders || ['handbook', 'policies'],
        hits: (search.hits || []).map((h) => ({
          name: h.name,
          folder: h.folder,
          score: h.score,
          snippets: h.snippets || [],
          preview: h.preview || null
        }))
      }
    };
  }

  if (name === 'getMyPayrollSummary') {
    requireAuthed(req);
    const { buildAssistantPayrollMeSummary } = await import('../../controllers/payroll.controller.js');
    const result = await buildAssistantPayrollMeSummary(req);
    return { ok: true, tool: name, result };
  }

  if (name === 'searchReferralDirectory') {
    requireAuthed(req);
    if (!roleAllowed(req.user, REFERRAL_DIRECTORY_TOOL_ROLES)) {
      const err = new Error('Referral directory search is not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const query = str(args.query, 400);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 20), 40);
    const entries = await searchReferralDirectoryEntriesForTool(agencyId, query, limit);
    return { ok: true, tool: name, result: { entries } };
  }

  if (name === 'lookupStandardCrosswalk') {
    requireAuthed(req);
    if (!roleAllowed(req.user, LEARNING_STANDARDS_TOOL_ROLES)) {
      const err = new Error('Standards crosswalk lookup is not available for your role');
      err.status = 403;
      throw err;
    }
    const code = str(args.code, 128);
    if (!code) {
      const err = new Error('code is required');
      err.status = 400;
      throw err;
    }
    const subject = str(args.subject, 64);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 5), 15);

    // Match either a source standard (learning_standards.code / title) OR a
    // target code already in the crosswalk (CCSS / NGSS / USDoE code / title).
    const like = `%${code}%`;
    const subjectLike = subject ? `%${subject}%` : null;
    const [rows] = await pool.query(
      `SELECT ls.id AS standard_id,
              ls.code AS source_code,
              ls.title AS source_title,
              ls.source_framework AS source_framework,
              ls.grade_band AS grade_band,
              ls.description AS source_description
         FROM learning_standards ls
         LEFT JOIN learning_standard_crosswalks sc ON sc.from_standard_id = ls.id AND sc.is_active = 1
        WHERE ls.is_active = 1
          AND (
            ls.code LIKE ? OR ls.title LIKE ?
            OR sc.to_code LIKE ? OR sc.to_title LIKE ?
          )
          ${subjectLike ? 'AND (ls.code LIKE ? OR ls.title LIKE ?)' : ''}
        GROUP BY ls.id
        ORDER BY CASE WHEN ls.code = ? THEN 0 ELSE 1 END, ls.code
        LIMIT ?`,
      subjectLike
        ? [like, like, like, like, subjectLike, subjectLike, code, limit]
        : [like, like, like, like, code, limit]
    );

    const results = [];
    for (const r of rows) {
      const [cw] = await pool.query(
        `SELECT to_framework, to_code, to_title, mapping_quality, notes
           FROM learning_standard_crosswalks
          WHERE from_standard_id = ? AND is_active = 1
          ORDER BY FIELD(mapping_quality,'exact','close','partial','related'), to_framework`,
        [r.standard_id]
      );
      results.push({
        standardId: r.standard_id,
        cas: {
          code: r.source_code,
          title: r.source_title,
          framework: r.source_framework,
          gradeBand: r.grade_band,
          description: clipForAssistant(r.source_description, 400)
        },
        equivalents: cw.map((c) => ({
          framework: c.to_framework,
          code: c.to_code,
          title: c.to_title,
          quality: c.mapping_quality,
          notes: clipForAssistant(c.notes, 240)
        }))
      });
    }

    return {
      ok: true,
      tool: name,
      result: {
        query: code,
        subject: subject || null,
        totalMatches: results.length,
        standards: results
      }
    };
  }

  if (name === 'listMyRecentActivity') {
    requireAuthed(req);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 15), 50);
    const sinceYmd = parseIsoOrNull(args.since);
    const wantedAction = str(args.actionType, 100);
    const filterAction =
      wantedAction && ASSISTANT_AUDIT_ACTION_TYPES.has(wantedAction) ? wantedAction : null;

    const rows = await UserActivityLog.getActivityForUser(req.user.id, {
      limit,
      startDate: sinceYmd,
      actionType: filterAction
    });
    const shaped = (rows || []).map(shapeActivityRow).filter(Boolean);
    return {
      ok: true,
      tool: name,
      result: {
        total: shaped.length,
        since: sinceYmd,
        actionType: filterAction,
        rows: shaped
      }
    };
  }

  if (name === 'searchAgencyActivity') {
    requireAuthed(req);
    if (!roleAllowed(req.user, AUDIT_SEARCH_TOOL_ROLES)) {
      const err = new Error('Audit log search is only available to admins');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }

    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 25), 100);
    const startDate = parseIsoOrNull(args.startDate);
    const endDate = parseIsoOrNull(args.endDate);
    const search = str(args.search, 200);

    let actionTypes = Array.isArray(args.actionTypes)
      ? args.actionTypes
          .map((a) => str(a, 100))
          .filter((a) => a && ASSISTANT_AUDIT_ACTION_TYPES.has(a))
      : [];
    if (actionTypes.length > 25) actionTypes = actionTypes.slice(0, 25);

    // Resolve optional userEmail → userId. Avoid cross-agency enumeration:
    // require the target user to share the caller's agency.
    let targetUserId = null;
    if (args.userEmail) {
      const email = str(args.userEmail, 254).toLowerCase();
      if (email) {
        const [urows] = await pool.execute(
          `SELECT u.id
           FROM users u
           JOIN user_agencies ua ON ua.user_id = u.id
           WHERE LOWER(u.email) = ? AND ua.agency_id = ?
           LIMIT 1`,
          [email, agencyId]
        );
        if (urows?.[0]?.id) {
          targetUserId = Number(urows[0].id);
        } else {
          return {
            ok: true,
            tool: name,
            result: {
              total: 0,
              rows: [],
              note: `No user with email ${email} in this agency.`
            }
          };
        }
      }
    }

    const [rows, total] = await Promise.all([
      UserActivityLog.getAgencyActivityLog({
        agencyId,
        userId: targetUserId,
        actionTypes: actionTypes.length ? actionTypes : null,
        startDate,
        endDate,
        search: search || null,
        limit,
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      }),
      UserActivityLog.countAgencyActivityLog({
        agencyId,
        userId: targetUserId,
        actionTypes: actionTypes.length ? actionTypes : null,
        startDate,
        endDate,
        search: search || null
      }).catch(() => null)
    ]);

    const shaped = (rows || []).map(shapeActivityRow).filter(Boolean);
    return {
      ok: true,
      tool: name,
      result: {
        agencyId,
        total: total == null ? shaped.length : Number(total),
        returned: shaped.length,
        startDate,
        endDate,
        filters: {
          actionTypes: actionTypes.length ? actionTypes : null,
          userEmail: args.userEmail ? String(args.userEmail).toLowerCase() : null,
          search: search || null
        },
        rows: shaped
      }
    };
  }

  if (name === 'getAgencyActivityStats') {
    requireAuthed(req);
    if (!roleAllowed(req.user, AUDIT_SEARCH_TOOL_ROLES)) {
      const err = new Error('Audit stats are only available to admins');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }

    const topN = Math.min(Math.max(1, intOrNull(args.topN) || 20), 50);

    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startYmd = parseIsoOrNull(args.startDate) || defaultStart.toISOString().slice(0, 10);
    const endYmd = parseIsoOrNull(args.endDate) || defaultEnd.toISOString().slice(0, 10);

    let userFilterSql = '';
    const params = [agencyId, `${startYmd} 00:00:00`, `${endYmd} 23:59:59`];
    if (args.userEmail) {
      const email = str(args.userEmail, 254).toLowerCase();
      if (email) {
        const [urows] = await pool.execute(
          `SELECT u.id
           FROM users u
           JOIN user_agencies ua ON ua.user_id = u.id
           WHERE LOWER(u.email) = ? AND ua.agency_id = ?
           LIMIT 1`,
          [email, agencyId]
        );
        if (!urows?.[0]?.id) {
          return {
            ok: true,
            tool: name,
            result: {
              agencyId,
              startDate: startYmd,
              endDate: endYmd,
              total: 0,
              actions: [],
              note: `No user with email ${email} in this agency.`
            }
          };
        }
        userFilterSql = ' AND user_id = ?';
        params.push(Number(urows[0].id));
      }
    }

    const [rows] = await pool.execute(
      `SELECT action_type, COUNT(*) AS cnt
       FROM user_activity_log
       WHERE agency_id = ?
         AND created_at >= ?
         AND created_at <= ?
         ${userFilterSql}
       GROUP BY action_type
       ORDER BY cnt DESC, action_type ASC
       LIMIT ${topN}`,
      params
    );

    const actions = (rows || []).map((r) => {
      const at = String(r.action_type || '').trim();
      return {
        actionType: at,
        actionLabel: auditActionRegistry.getActionLabel(at),
        category: auditActionRegistry.getActionCategory(at),
        count: Number(r.cnt || 0)
      };
    });
    const total = actions.reduce((sum, a) => sum + a.count, 0);
    return {
      ok: true,
      tool: name,
      result: {
        agencyId,
        startDate: startYmd,
        endDate: endYmd,
        userEmail: args.userEmail ? String(args.userEmail).toLowerCase() : null,
        total,
        actions
      }
    };
  }

  if (name === 'searchSchools') {
    requireAuthed(req);
    if (!roleAllowed(req.user, SCHOOL_PORTAL_SEARCH_ROLES)) {
      const err = new Error('School portals are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const query = str(args.query, 200);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 10), 25);
    if (!query) return { ok: true, tool: name, result: { results: [] } };
    const results = await searchAffiliatedSchoolsByName(agencyId, query, limit);
    return { ok: true, tool: name, result: { results } };
  }

  if (name === 'getSchoolClientStats') {
    requireAuthed(req);
    if (!roleAllowed(req.user, SCHOOL_PORTAL_SEARCH_ROLES)) {
      const err = new Error('School portals are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const query = str(args.query, 200);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 10), 25);
    if (!query) return { ok: true, tool: name, result: { query: '', results: [] } };

    const schools = await searchAffiliatedSchoolsByName(agencyId, query, limit);
    const countsById = await loadClientRosterCountsBySchoolIds(schools.map((s) => s.id));
    const results = schools.map((s) => {
      const counts = countsById.get(Number(s.id)) || {
        clientsCurrent: 0,
        clientsPacket: 0,
        clientsScreener: 0,
        clientsWaitlist: 0,
        clientsOnRoster: 0
      };
      return {
        ...s,
        ...counts,
        // "Active" in staff language ≈ Current status on School Overview.
        clientsActive: counts.clientsCurrent
      };
    });
    return { ok: true, tool: name, result: { query, results } };
  }

  if (name === 'searchEvents') {
    requireAuthed(req);
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    if (!roleAllowed(req.user, PROGRAM_EVENTS_SEARCH_ROLES)) {
      const err = new Error('Program events are not available for your role');
      err.status = 403;
      throw err;
    }
    const query = str(args.query, 200);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 10), 25);
    const startsAfter = args.startsAfter ? String(args.startsAfter).slice(0, 40) : null;
    const startsBefore = args.startsBefore ? String(args.startsBefore).slice(0, 40) : null;

    const baseWhere = ['agency_id = ?', 'is_active = TRUE'];
    const baseParams = [agencyId];
    if (startsAfter) { baseWhere.push('starts_at >= ?'); baseParams.push(startsAfter); }
    if (startsBefore) { baseWhere.push('starts_at <= ?'); baseParams.push(startsBefore); }

    const runQuery = async (likeArg) => {
      const where = [...baseWhere];
      const params = [...baseParams];
      if (likeArg != null) {
        where.push('title LIKE ?');
        params.push(likeArg);
      }
      const [rs] = await pool.execute(
        `SELECT id, title, starts_at, ends_at, timezone
         FROM company_events
         WHERE ${where.join(' AND ')}
         ORDER BY starts_at DESC
         LIMIT ${limit}`,
        params
      );
      return rs || [];
    };

    let rows = await runQuery(query ? `%${query}%` : null);

    // Tokenized fallback for multi-word event names that don't match verbatim.
    if (!rows.length && query && query.includes(' ')) {
      const GENERIC = new Set([
        'event', 'events', 'program', 'programs', 'session', 'sessions',
        'workshop', 'workshops', 'the', 'and', 'or', 'of', 'a', 'an'
      ]);
      const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3 && !GENERIC.has(t));
      if (tokens.length) {
        rows = await runQuery(`%${tokens.join(' ')}%`);
        if (!rows.length && tokens.length > 1) rows = await runQuery(`%${tokens[0]}%`);
      }
    }

    const results = rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAtIso: r.starts_at ? new Date(r.starts_at).toISOString() : null,
      endsAtIso: r.ends_at ? new Date(r.ends_at).toISOString() : null,
      timezone: r.timezone || null,
      url: `/admin/program-events?eventId=${r.id}`
    }));
    return { ok: true, tool: name, result: { results } };
  }

  if (name === 'searchUsers') {
    // Back-office admin only — mirrors the aiQueryUsers middleware policy.
    assertBackofficeAdmin(req.user);
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const query = str(args.query, 200);
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 10), 25);
    if (!query) return { ok: true, tool: name, result: { results: [] } };

    const runQuery = async (likeArg) => {
      const [rs] = await pool.execute(
        `SELECT u.id,
                u.first_name AS firstName,
                u.last_name  AS lastName,
                u.email,
                u.role,
                u.profile_photo_path AS profilePhotoPath
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?
                OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?)
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
         ORDER BY u.last_name, u.first_name
         LIMIT ${limit}`,
        [agencyId, likeArg, likeArg, likeArg, likeArg]
      );
      return rs || [];
    };

    let rows = await runQuery(`%${query}%`);

    // Multi-word fallback: try just the most distinctive token (e.g. last name).
    if (!rows.length && query.includes(' ')) {
      const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
      if (tokens.length > 1) {
        // Try the last token first (typically a surname).
        rows = await runQuery(`%${tokens[tokens.length - 1]}%`);
        if (!rows.length) rows = await runQuery(`%${tokens[0]}%`);
      }
    }

    const results = rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email,
      role: r.role,
      email: r.email,
      profilePath: `/admin/users/${r.id}`
    }));
    return { ok: true, tool: name, result: { results } };
  }

  if (name === 'openEntity') {
    requireAuthed(req);
    const kind = str(args.kind, 40);
    const id = intOrNull(args.id);
    if (!ENTITY_KINDS.has(kind) || !id) {
      const err = new Error('openEntity requires valid kind and id');
      err.status = 400;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }

    if (kind === 'school') {
      if (!roleAllowed(req.user, SCHOOL_PORTAL_SEARCH_ROLES)) {
        const err = new Error('School portals are not available for your role');
        err.status = 403;
        throw err;
      }
      const resolved = await resolveSchoolPortalPath(agencyId, id);
      if (!resolved) {
        const err = new Error('School not found in your agency');
        err.status = 404;
        throw err;
      }
      return {
        ok: true,
        tool: name,
        result: { kind, id, name: resolved.name, path: resolved.path },
        uiCommands: [{ type: 'navigate', to: resolved.path }]
      };
    }

    if (kind === 'event') {
      if (!roleAllowed(req.user, PROGRAM_EVENTS_SEARCH_ROLES)) {
        const err = new Error('Program events are not available for your role');
        err.status = 403;
        throw err;
      }
      const [rows] = await pool.execute(
        `SELECT id, title FROM company_events
         WHERE agency_id = ? AND id = ? AND is_active = TRUE LIMIT 1`,
        [agencyId, id]
      );
      const row = rows?.[0];
      if (!row) {
        const err = new Error('Event not found in your agency');
        err.status = 404;
        throw err;
      }
      const path = `/admin/program-events?eventId=${row.id}`;
      return {
        ok: true,
        tool: name,
        result: { kind, id, title: row.title, path },
        uiCommands: [{ type: 'navigate', to: path }]
      };
    }

    if (kind === 'user') {
      assertBackofficeAdmin(req.user);
      const inAgency = await ensureCandidateInAgency(id, agencyId);
      if (!inAgency) {
        const err = new Error('User not found in your agency');
        err.status = 404;
        throw err;
      }
      const path = `/admin/users/${id}`;
      return {
        ok: true,
        tool: name,
        result: { kind, id, path },
        uiCommands: [{ type: 'navigate', to: path }]
      };
    }
  }

  if (name === 'createTask') {
    assertBackofficeAdmin(req.user);
    const taskType = str(args.taskType, 40);
    const title = str(args.title, 240);
    const description = args.description == null ? null : str(args.description, 8000);
    const assignedToUserId = intOrNull(args.assignedToUserId);
    const assignedToRole = args.assignedToRole == null ? null : str(args.assignedToRole, 40);
    const assignedToAgencyId = intOrNull(args.assignedToAgencyId);
    const dueDate = args.dueDate == null ? null : String(args.dueDate);
    const referenceId = intOrNull(args.referenceId);
    const documentActionType = args.documentActionType == null ? null : str(args.documentActionType, 40);

    if (taskType !== 'training' && taskType !== 'document') {
      const err = new Error('taskType must be training or document');
      err.status = 400;
      throw err;
    }
    if (!title) {
      const err = new Error('title is required');
      err.status = 400;
      throw err;
    }

    // Agency scoping: non-super admins can only create tasks within their agencies.
    if (assignedToAgencyId && req.user.role !== 'super_admin') {
      await ensureAgencyAccess(req.user, assignedToAgencyId);
    }

    const created = await Task.create({
      taskType,
      title,
      description,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId: req.user.id,
      dueDate,
      referenceId,
      documentActionType
    });

    return { ok: true, tool: name, result: { id: created?.id || null } };
  }

  if (name === 'createHiringCandidate') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    await ensureAgencyAccess(req.user, agencyId);

    const firstName = args.firstName == null ? null : str(args.firstName, 120);
    const lastName = str(args.lastName, 120);
    const personalEmail = str(args.personalEmail, 220);
    const phoneNumber = args.phoneNumber == null ? null : str(args.phoneNumber, 80);
    const appliedRole = args.appliedRole == null ? null : str(args.appliedRole, 120);
    const source = args.source == null ? null : str(args.source, 120);
    const stage = args.stage == null ? 'applied' : str(args.stage, 80);
    const role = args.role == null ? 'provider' : str(args.role, 80);

    if (!lastName) {
      const err = new Error('lastName is required');
      err.status = 400;
      throw err;
    }
    if (!personalEmail) {
      const err = new Error('personalEmail is required');
      err.status = 400;
      throw err;
    }

    const user = await User.create({
      email: personalEmail,
      passwordHash: null,
      firstName,
      lastName,
      phoneNumber,
      personalEmail,
      role,
      status: 'PROSPECTIVE'
    });
    await User.assignToAgency(user.id, agencyId);
    const profile = await HiringProfile.upsert({
      candidateUserId: user.id,
      stage,
      appliedRole: appliedRole || null,
      source: source || null
    });

    return { ok: true, tool: name, result: { candidateUserId: user?.id || null, profile } };
  }

  if (name === 'addHiringNote') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    const candidateUserId = intOrNull(args.candidateUserId);
    await ensureAgencyAccess(req.user, agencyId);
    if (!candidateUserId) {
      const err = new Error('candidateUserId is required');
      err.status = 400;
      throw err;
    }
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) {
      const err = new Error('Candidate not found in this agency');
      err.status = 404;
      throw err;
    }
    const message = str(args.message, 6000);
    if (!message) {
      const err = new Error('message is required');
      err.status = 400;
      throw err;
    }
    const ratingRaw = args.rating;
    const rating = ratingRaw === null || ratingRaw === undefined || ratingRaw === '' ? null : intOrNull(ratingRaw);

    const note = await HiringNote.create({
      candidateUserId,
      authorUserId: req.user.id,
      message,
      rating: Number.isFinite(rating) ? rating : null
    });
    return { ok: true, tool: name, result: { id: note?.id || null } };
  }

  if (name === 'setHiringStage') {
    await assertCanManageHiring(req.user);
    const agencyId = intOrNull(args.agencyId);
    const candidateUserId = intOrNull(args.candidateUserId);
    const stage = str(args.stage, 80);
    await ensureAgencyAccess(req.user, agencyId);
    if (!candidateUserId) {
      const err = new Error('candidateUserId is required');
      err.status = 400;
      throw err;
    }
    if (!stage) {
      const err = new Error('stage is required');
      err.status = 400;
      throw err;
    }
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) {
      const err = new Error('Candidate not found in this agency');
      err.status = 404;
      throw err;
    }
    const profile = await HiringProfile.upsert({ candidateUserId, stage });
    return { ok: true, tool: name, result: { profile } };
  }

  if (name === 'searchProviders') {
    requireAuthed(req);
    if (!roleAllowed(req.user, PROVIDER_DIRECTORY_TOOL_ROLES)) {
      const err = new Error('Provider directory tools are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = intOrNull(args.agencyId);
    await ensureAgencyAccess(req.user, agencyId);
    const textQuery = args.textQuery == null ? '' : str(args.textQuery, 500);
    const filters = Array.isArray(args.filters) ? args.filters : [];
    const limitRaw = intOrNull(args.limit);
    const offsetRaw = intOrNull(args.offset);
    const limit = Math.min(Math.max(1, Number(limitRaw || 50)), 100);
    const offset = Math.max(0, Number(offsetRaw || 0));
    const out = await ProviderSearchIndex.search({
      agencyId,
      filters,
      limit,
      offset,
      textQuery
    });
    return { ok: true, tool: name, result: out };
  }

  if (name === 'getProviderProfileFields') {
    requireAuthed(req);
    if (!roleAllowed(req.user, PROVIDER_DIRECTORY_TOOL_ROLES)) {
      const err = new Error('Provider directory tools are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = intOrNull(args.agencyId);
    const providerId = intOrNull(args.providerId);
    await ensureAgencyAccess(req.user, agencyId);
    await ensureUserInAgency(providerId, agencyId);

    const fieldKeys = Array.isArray(args.fieldKeys)
      ? args.fieldKeys.map((k) => str(k, 191)).filter(Boolean).slice(0, 80)
      : [];
    const whereKeysSql = fieldKeys.length ? ` AND uifd.field_key IN (${fieldKeys.map(() => '?').join(',')})` : '';

    const [rows] = await pool.execute(
      `SELECT
         uiv.value,
         uifd.field_key,
         uifd.field_label,
         uifd.field_type,
         uifd.options
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       WHERE uiv.user_id = ?${whereKeysSql}
       ORDER BY uifd.field_key ASC`,
      fieldKeys.length ? [providerId, ...fieldKeys] : [providerId]
    );

    return { ok: true, tool: name, result: { providerId, fields: rows || [] } };
  }

  if (name === 'getProviderIntakeAvailability') {
    requireAuthed(req);
    if (!roleAllowed(req.user, PROVIDER_DIRECTORY_TOOL_ROLES)) {
      const err = new Error('Provider directory tools are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = intOrNull(args.agencyId);
    const providerId = intOrNull(args.providerId);
    await ensureAgencyAccess(req.user, agencyId);
    await ensureUserInAgency(providerId, agencyId);

    const weekStartYmd = str(args.weekStartYmd || new Date().toISOString().slice(0, 10), 10);
    const includeGoogleBusy =
      args.includeGoogleBusy === true || args.includeGoogleBusy === 1 || args.includeGoogleBusy === '1';
    const slotMinutesRaw = intOrNull(args.slotMinutes);
    const slotMinutes = Math.min(Math.max(15, Number(slotMinutesRaw || 60)), 180);
    const modality = String(args.modality || 'ALL').trim().toUpperCase();

    const availability = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd,
      includeGoogleBusy,
      externalCalendarIds: [],
      slotMinutes,
      intakeOnly: true
    });

    const result = {
      ok: true,
      agencyId,
      providerId,
      weekStart: availability.weekStart,
      weekEnd: availability.weekEnd,
      timeZone: availability.timeZone,
      slotMinutes: availability.slotMinutes,
      virtualSlots: availability.virtualSlots || [],
      inPersonSlots: availability.inPersonSlots || []
    };

    if (modality === 'VIRTUAL') result.inPersonSlots = [];
    if (modality === 'IN_PERSON') result.virtualSlots = [];

    return { ok: true, tool: name, result };
  }

  // ---------------------------------------------------------------------
  // findIntakeOpenings — fan-out across providers in the agency, return
  // those with at least one open intake slot on the given date.
  // ---------------------------------------------------------------------
  if (name === 'findIntakeOpenings') {
    requireAuthed(req);
    if (!roleAllowed(req.user, PROVIDER_DIRECTORY_TOOL_ROLES)) {
      const err = new Error('Provider directory tools are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const dateYmd = str(args.dateYmd || new Date().toISOString().slice(0, 10), 10);
    const modality = String(args.modality || 'ALL').trim().toUpperCase();

    // Use Monday of the requested week so we can lean on existing service.
    const d = new Date(`${dateYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      const err = new Error('Invalid dateYmd');
      err.status = 400;
      throw err;
    }
    const dayOfWeek = d.getDay(); // 0 Sun .. 6 Sat
    const daysToMonday = ((dayOfWeek + 6) % 7); // Mon=0
    d.setDate(d.getDate() - daysToMonday);
    const weekStartYmd = d.toISOString().slice(0, 10);

    const [providerRows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
         AND (
           u.role IN ('provider', 'supervisor', 'clinical_practice_assistant', 'provider_plus')
           OR u.has_provider_access = TRUE
         )
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT 60`,
      [agencyId]
    );

    const providers = (providerRows || []).map((r) => ({
      id: Number(r.id),
      firstName: String(r.first_name || '').trim(),
      lastName: String(r.last_name || '').trim()
    }));

    const queue = [...providers];
    const results = [];
    const concurrency = 6;
    const slotMatchesDay = (slot) => {
      const startStr = String(slot?.startAt || '');
      return startStr.startsWith(dateYmd);
    };

    const workers = Array.from({ length: concurrency }).map(async () => {
      while (queue.length) {
        const p = queue.shift();
        if (!p) break;
        try {
          // eslint-disable-next-line no-await-in-loop
          const avail = await ProviderAvailabilityService.computeWeekAvailability({
            agencyId,
            providerId: p.id,
            weekStartYmd,
            includeGoogleBusy: false,
            includeExternalBusy: false,
            externalCalendarIds: [],
            slotMinutes: 60,
            intakeOnly: true,
            materializeOfficeEvents: false
          });
          let inPerson = (avail?.inPersonSlots || []).filter(slotMatchesDay);
          let virtual = (avail?.virtualSlots || []).filter(slotMatchesDay);
          if (modality === 'VIRTUAL') inPerson = [];
          if (modality === 'IN_PERSON') virtual = [];
          if (!inPerson.length && !virtual.length) continue;

          const earliestVirtual = virtual[0]?.startAt || null;
          const earliestInPerson = inPerson[0]?.startAt || null;
          const earliest = [earliestVirtual, earliestInPerson]
            .filter(Boolean)
            .sort()[0] || null;

          results.push({
            providerId: p.id,
            name: [p.firstName, p.lastName].filter(Boolean).join(' ').trim(),
            virtualSlotCount: virtual.length,
            inPersonSlotCount: inPerson.length,
            earliestStartIso: earliest,
            sampleSlots: [...virtual.slice(0, 3), ...inPerson.slice(0, 3)].map((s) => ({
              startAt: s.startAt,
              endAt: s.endAt,
              modality: s.buildingId == null && s.roomId == null ? 'VIRTUAL' : 'IN_PERSON'
            }))
          });
        } catch {
          // skip provider-level failures
        }
      }
    });
    await Promise.all(workers);

    results.sort((a, b) => String(a.earliestStartIso || '').localeCompare(String(b.earliestStartIso || '')));

    return {
      ok: true,
      tool: name,
      result: {
        dateYmd,
        modality,
        totalCandidates: providers.length,
        providersWithOpenings: results.length,
        results
      }
    };
  }

  // ---------------------------------------------------------------------
  // getEventResponses — RSVPs for a company event.
  // ---------------------------------------------------------------------
  if (name === 'getEventResponses') {
    requireAuthed(req);
    if (!roleAllowed(req.user, PROGRAM_EVENTS_SEARCH_ROLES)) {
      const err = new Error('Program events are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    let eventId = intOrNull(args.eventId);
    const eventQuery = str(args.eventQuery, 200);
    const dateYmd = args.dateYmd ? String(args.dateYmd).slice(0, 10) : null;
    const responseKey = args.responseKey ? String(args.responseKey).toLowerCase().slice(0, 32) : null;
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 50), 200);

    // Resolve event if not passed by id.
    if (!eventId) {
      const where = ['agency_id = ?', 'is_active = TRUE'];
      const params = [agencyId];
      if (eventQuery) {
        where.push('title LIKE ?');
        params.push(`%${eventQuery}%`);
      }
      if (dateYmd) {
        where.push('starts_at >= ? AND starts_at < ?');
        params.push(`${dateYmd} 00:00:00`, `${dateYmd} 23:59:59`);
      }
      const [eventRows] = await pool.execute(
        `SELECT id, title, starts_at FROM company_events WHERE ${where.join(' AND ')} ORDER BY ABS(TIMESTAMPDIFF(HOUR, starts_at, NOW())) ASC LIMIT 5`,
        params
      );
      if (!eventRows || !eventRows.length) {
        return { ok: true, tool: name, result: { event: null, responses: [], note: 'No matching event found.' } };
      }
      if (eventRows.length > 1) {
        return {
          ok: true,
          tool: name,
          result: {
            event: null,
            ambiguousEvents: eventRows.map((r) => ({ id: Number(r.id), title: r.title, startsAt: r.starts_at })),
            responses: [],
            note: 'Multiple events match; pass an eventId to disambiguate.'
          }
        };
      }
      eventId = Number(eventRows[0].id);
    }

    // Fetch event details (also enforces agency scoping).
    const [evRows] = await pool.execute(
      `SELECT id, title, starts_at, ends_at FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    if (!evRows || !evRows.length) {
      const err = new Error('Event not found in your agency');
      err.status = 404;
      throw err;
    }
    const event = {
      id: Number(evRows[0].id),
      title: evRows[0].title,
      startsAt: evRows[0].starts_at,
      endsAt: evRows[0].ends_at
    };

    const respWhere = ['r.company_event_id = ?'];
    const respParams = [eventId];
    if (responseKey) {
      respWhere.push('LOWER(r.response_key) = ?');
      respParams.push(responseKey);
    }
    const [respRows] = await pool.execute(
      `SELECT r.id,
              r.response_key,
              r.response_label,
              r.received_at,
              r.source,
              u.id   AS user_id,
              u.first_name,
              u.last_name,
              u.email,
              u.role
       FROM company_event_responses r
       JOIN users u ON u.id = r.user_id
       WHERE ${respWhere.join(' AND ')}
       ORDER BY r.received_at DESC
       LIMIT ${limit}`,
      respParams
    );

    const counts = {};
    const responses = (respRows || []).map((r) => {
      const key = String(r.response_key || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
      return {
        userId: Number(r.user_id),
        name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email,
        email: r.email,
        role: r.role,
        responseKey: r.response_key,
        responseLabel: r.response_label,
        receivedAt: r.received_at,
        source: r.source
      };
    });

    return { ok: true, tool: name, result: { event, counts, totalResponses: responses.length, responses } };
  }

  // ---------------------------------------------------------------------
  // getOfficeSchedule — what offices have sessions on a given date.
  // ---------------------------------------------------------------------
  if (name === 'getOfficeSchedule') {
    requireAuthed(req);
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const dateYmd = str(args.dateYmd || new Date().toISOString().slice(0, 10), 10);
    const locationQuery = args.locationQuery ? String(args.locationQuery).slice(0, 100) : '';

    const dayStart = `${dateYmd} 00:00:00`;
    const dayEnd = `${dateYmd} 23:59:59`;

    // Pull office locations available to this agency.
    const locWhere = ['ola.agency_id = ?', 'ol.is_active = TRUE'];
    const locParams = [agencyId];
    if (locationQuery) {
      locWhere.push('ol.name LIKE ?');
      locParams.push(`%${locationQuery}%`);
    }
    const [locRows] = await pool.execute(
      `SELECT DISTINCT ol.id, ol.name, ol.timezone
       FROM office_locations ol
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       WHERE ${locWhere.join(' AND ')}
       ORDER BY ol.name ASC
       LIMIT 25`,
      locParams
    );

    if (!locRows.length) {
      return { ok: true, tool: name, result: { dateYmd, offices: [], note: 'No office locations found for your agency.' } };
    }

    const officeIds = locRows.map((r) => Number(r.id));

    // Aggregate event counts per office for the day.
    const placeholders = officeIds.map(() => '?').join(',');
    const [evRows] = await pool.execute(
      `SELECT office_location_id,
              status,
              COUNT(*) AS cnt,
              MIN(start_at) AS first_start,
              MAX(end_at)   AS last_end
       FROM office_events
       WHERE office_location_id IN (${placeholders})
         AND start_at >= ?
         AND start_at <= ?
       GROUP BY office_location_id, status`,
      [...officeIds, dayStart, dayEnd]
    );

    const byOffice = new Map();
    for (const row of evRows || []) {
      const oid = Number(row.office_location_id);
      if (!byOffice.has(oid)) byOffice.set(oid, { booked: 0, released: 0, cancelled: 0, firstStart: null, lastEnd: null });
      const rec = byOffice.get(oid);
      const status = String(row.status || '').toUpperCase();
      const cnt = Number(row.cnt || 0);
      if (status === 'BOOKED') rec.booked += cnt;
      else if (status === 'RELEASED') rec.released += cnt;
      else if (status === 'CANCELLED') rec.cancelled += cnt;
      if (row.first_start && (!rec.firstStart || row.first_start < rec.firstStart)) rec.firstStart = row.first_start;
      if (row.last_end && (!rec.lastEnd || row.last_end > rec.lastEnd)) rec.lastEnd = row.last_end;
    }

    const offices = locRows.map((r) => {
      const stats = byOffice.get(Number(r.id)) || { booked: 0, released: 0, cancelled: 0, firstStart: null, lastEnd: null };
      const totalActive = stats.booked + stats.released;
      return {
        id: Number(r.id),
        name: r.name,
        timezone: r.timezone || null,
        isOpen: totalActive > 0,
        bookedSlots: stats.booked,
        availableSlots: stats.released,
        cancelledSlots: stats.cancelled,
        firstStart: stats.firstStart,
        lastEnd: stats.lastEnd
      };
    });

    offices.sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name));

    return {
      ok: true,
      tool: name,
      result: { dateYmd, totalOffices: offices.length, openOffices: offices.filter((o) => o.isOpen).length, offices }
    };
  }

  // ---------------------------------------------------------------------
  // findProvidersByApproach — "who uses CBT?" / "who does EMDR?"
  // Searches multi_select option values across modality, treatment prefs,
  // specialties, and age-specialty fields.
  // ---------------------------------------------------------------------
  if (name === 'findProvidersByApproach') {
    requireAuthed(req);
    if (!roleAllowed(req.user, [...PROVIDER_DIRECTORY_TOOL_ROLES, 'provider', 'supervisor'])) {
      const err = new Error('Provider directory tools are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const approach = str(args.approach, 80).trim();
    if (!approach) {
      const err = new Error('approach is required');
      err.status = 400;
      throw err;
    }
    const limit = Math.min(Math.max(1, intOrNull(args.limit) || 25), 100);

    // All 9 clinical multi_select fields relevant to provider matching
    const FIELD_KEYS = [
      'modality',
      'treatment_prefs_max15',
      'pt_specialties_max25',
      'specialties_general',
      'age_specialty',
      'mental_health',
      'other_issues',
      'sexuality',
      'groups'
    ];
    const fieldKeyLabel = {
      modality:               'Treatment modality',
      treatment_prefs_max15:  'Treatment preference',
      pt_specialties_max25:   'Specialty',
      specialties_general:    'General specialty',
      age_specialty:          'Age specialty',
      mental_health:          'Mental health focus',
      other_issues:           'Other issues',
      sexuality:              'Sexuality specialty',
      groups:                 'Population groups'
    };

    // Textarea fields used as secondary fallback search
    const TEXTAREA_FALLBACK_FIELDS = [
      'ideal_client_general',
      'ideal_client_clinical',
      'provider_clinician_notes'
    ];

    const placeholders = FIELD_KEYS.map(() => '?').join(',');
    const likeArg = `%${approach}%`;
    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT
           psi.user_id,
           psi.field_key,
           psi.value_option,
           u.first_name,
           u.last_name,
           u.email,
           u.role
         FROM provider_search_index psi
         JOIN users u ON u.id = psi.user_id
         WHERE psi.agency_id = ?
           AND psi.field_type = 'multi_select'
           AND psi.field_key IN (${placeholders})
           AND (
             LOWER(psi.value_option) = LOWER(?)
             OR LOWER(psi.value_option) LIKE LOWER(?)
           )
           AND (u.is_archived IS NULL OR u.is_archived = FALSE)
           AND (u.is_active IS NULL OR u.is_active = TRUE)
           AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
         ORDER BY
           CASE WHEN LOWER(psi.value_option) = LOWER(?) THEN 0 ELSE 1 END,
           CASE psi.field_key
             WHEN 'modality' THEN 0
             WHEN 'treatment_prefs_max15' THEN 1
             WHEN 'pt_specialties_max25' THEN 2
             WHEN 'specialties_general' THEN 3
             WHEN 'age_specialty' THEN 4
             WHEN 'mental_health' THEN 5
             WHEN 'other_issues' THEN 6
             WHEN 'sexuality' THEN 7
             WHEN 'groups' THEN 8
             ELSE 9
           END,
           u.last_name, u.first_name
         LIMIT 200`,
        [agencyId, ...FIELD_KEYS, approach, likeArg, approach]
      );
      rows = r || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: true, tool: name, result: { approach, providers: [], total: 0 } };
      throw e;
    }

    // Secondary pass: if no multi_select matches found, fall back to LIKE search
    // across key textarea/text fields so descriptive profiles are still surfaced.
    if (rows.length === 0) {
      try {
        const tbPlaceholders = TEXTAREA_FALLBACK_FIELDS.map(() => '?').join(',');
        const [tbRows] = await pool.execute(
          `SELECT
             psi.user_id,
             psi.field_key,
             psi.value_text AS value_option,
             u.first_name,
             u.last_name,
             u.email,
             u.role
           FROM provider_search_index psi
           JOIN users u ON u.id = psi.user_id
           WHERE psi.agency_id = ?
             AND psi.field_key IN (${tbPlaceholders})
             AND LOWER(psi.value_text) LIKE LOWER(?)
             AND (u.is_archived IS NULL OR u.is_archived = FALSE)
             AND (u.is_active IS NULL OR u.is_active = TRUE)
             AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'))
           ORDER BY u.last_name, u.first_name
           LIMIT 200`,
          [agencyId, ...TEXTAREA_FALLBACK_FIELDS, likeArg]
        );
        rows = tbRows || [];
      } catch { /* ignore secondary pass errors */ }
    }

    // Group by user, keeping the strongest match (first row per user wins
    // because of the ORDER BY).
    const byUser = new Map();
    for (const r of rows) {
      const uid = Number(r.user_id);
      if (!uid) continue;
      if (byUser.has(uid)) continue;
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email;
      const textareaLabels = {
        ideal_client_general: 'Ideal client description',
        ideal_client_clinical: 'Clinical profile notes',
        provider_clinician_notes: 'Clinician notes'
      };
      byUser.set(uid, {
        id: uid,
        name: fullName,
        email: r.email,
        role: r.role,
        matchedField: r.field_key,
        matchedFieldLabel: fieldKeyLabel[r.field_key] || textareaLabels[r.field_key] || r.field_key,
        matchedOption: r.value_option
      });
    }

    const providers = Array.from(byUser.values()).slice(0, limit);
    return {
      ok: true,
      tool: name,
      result: { approach, total: providers.length, providers }
    };
  }

  // ---------------------------------------------------------------------
  // findNextMeeting — read-only: returns the signed-in user's next active
  // meeting (host) so the cancel-meeting flow can resolve an event id.
  // ---------------------------------------------------------------------
  if (name === 'findNextMeeting') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const agencyId = currentAgencyId(req);
    const meetings = await listRemainingMeetingsForToday({ actorUserId: actorId, agencyId });
    const next = meetings[0] || null;
    if (!next) return { ok: true, tool: name, result: { meeting: null } };

    const attendees = await ProviderScheduleEventAttendee.listByEventId(next.id);
    return {
      ok: true,
      tool: name,
      result: {
        meeting: {
          id: Number(next.id),
          title: next.title,
          kind: next.kind,
          startAt: next.start_at,
          endAt: next.end_at,
          attendees: attendees.map((a) => ({
            id: Number(a.user_id),
            name: [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email,
            email: a.email
          }))
        }
      }
    };
  }

  // ---------------------------------------------------------------------
  // cancelMeeting — single TEAM_MEETING / HUDDLE.
  // ---------------------------------------------------------------------
  if (name === 'cancelMeeting') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const eventId = intOrNull(args.eventId);
    if (!eventId) {
      const err = new Error('eventId is required');
      err.status = 400;
      throw err;
    }
    const reason = args.reason ? str(args.reason, 240).trim() : null;

    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event) {
      const err = new Error('Meeting not found');
      err.status = 404;
      throw err;
    }
    const kind = String(event.kind || '').toUpperCase();
    if (kind !== 'TEAM_MEETING' && kind !== 'HUDDLE') {
      const err = new Error('Only meetings and huddles can be cancelled here');
      err.status = 400;
      throw err;
    }

    // Access: host, attendee, or admin-tier in same agency.
    const isHost = Number(event.provider_id) === actorId;
    let canCancel = isHost;
    if (!canCancel) {
      const attendees = await ProviderScheduleEventAttendee.listUserIdsByEventId(eventId);
      canCancel = attendees.includes(actorId);
    }
    if (!canCancel) {
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminTier = ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
      const agencies = await User.getAgencies(actorId);
      const inAgency = (agencies || []).some((a) => Number(a?.id) === Number(event.agency_id));
      if (!(isAdminTier && inAgency)) {
        const err = new Error('You do not have permission to cancel this meeting');
        err.status = 403;
        throw err;
      }
    }

    const out = await cancelOneMeeting({ eventId, actorUserId: actorId, reason });
    return { ok: true, tool: name, result: out };
  }

  // ---------------------------------------------------------------------
  // cancelTodaysRemainingMeetings — bulk cancel everything left today.
  // ---------------------------------------------------------------------
  if (name === 'cancelTodaysRemainingMeetings') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const agencyId = currentAgencyId(req);
    const reason = args.reason ? str(args.reason, 240).trim() : null;

    const out = await cancelTodaysRemaining({ actorUserId: actorId, agencyId, reason });
    return { ok: true, tool: name, result: out };
  }

  // ---------------------------------------------------------------------
  // findMyMeetings — search the actor's active meetings (today, forward only)
  // by attendee name and/or start time HH:MM. Read-only.
  // ---------------------------------------------------------------------
  if (name === 'findMyMeetings') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const agencyId = currentAgencyId(req);
    const withName = args.withName ? str(args.withName, 120).trim() : null;
    const atTimeHm = args.atTimeHm ? str(args.atTimeHm, 8).trim() : null;
    const rows = await findMyMeetings({ actorUserId: actorId, agencyId, withName, atTimeHm });

    const meetings = rows.map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      startAt: m.start_at,
      endAt: m.end_at,
      isHost: Number(m.provider_id) === actorId
    }));
    return { ok: true, tool: name, result: { meetings, totalFound: meetings.length } };
  }

  // ---------------------------------------------------------------------
  // rescheduleMeeting — move one meeting to a new start time (preserves
  // duration unless newEndAt is provided). Emails attendees + host.
  // ---------------------------------------------------------------------
  if (name === 'rescheduleMeeting') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const eventId = intOrNull(args.eventId);
    if (!eventId) {
      const err = new Error('eventId is required');
      err.status = 400;
      throw err;
    }
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event) {
      const err = new Error('Meeting not found');
      err.status = 404;
      throw err;
    }
    const isHost = Number(event.provider_id) === actorId;
    const isAdminTier = roleAllowed(req.user, ['admin', 'super_admin', 'support', 'staff']);
    if (!isHost && !isAdminTier) {
      const attendees = await ProviderScheduleEventAttendee.listByEventId(eventId);
      const isAttendee = attendees.some((a) => Number(a.user_id) === actorId);
      if (!isAttendee) {
        const err = new Error('You can only reschedule meetings you host or attend.');
        err.status = 403;
        throw err;
      }
    }

    const newStartAt = args.newStartAt ? new Date(String(args.newStartAt)) : null;
    if (!newStartAt || isNaN(newStartAt.getTime())) {
      const err = new Error('newStartAt is required and must be a valid date');
      err.status = 400;
      throw err;
    }
    const newEndAt = args.newEndAt ? new Date(String(args.newEndAt)) : null;
    const reason = args.reason ? str(args.reason, 240).trim() : null;

    const out = await rescheduleOneMeeting({
      eventId,
      newStartAt,
      newEndAt: newEndAt && !isNaN(newEndAt.getTime()) ? newEndAt : null,
      reason,
      actorUserId: actorId
    });
    return { ok: true, tool: name, result: out };
  }

  // ---------------------------------------------------------------------
  // pushTodaysRemainingMeetings — bulk shift everything today by N minutes.
  // ---------------------------------------------------------------------
  if (name === 'pushTodaysRemainingMeetings') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const agencyId = currentAgencyId(req);
    const shiftMinutes = Math.trunc(Number(args.shiftMinutes));
    if (!Number.isFinite(shiftMinutes) || shiftMinutes === 0) {
      const err = new Error('shiftMinutes must be a non-zero integer');
      err.status = 400;
      throw err;
    }
    const reason = args.reason ? str(args.reason, 240).trim() : null;
    const out = await pushTodaysRemaining({ actorUserId: actorId, agencyId, shiftMinutes, reason });
    return { ok: true, tool: name, result: out };
  }

  // ---------------------------------------------------------------------
  // startMeeting — create an ad-hoc 1:1 TEAM_MEETING for the actor + target,
  // return a join URL that the assistant will open via uiCommands.
  // ---------------------------------------------------------------------
  if (name === 'startMeeting') {
    requireAuthed(req);
    if (!roleAllowed(req.user, ['admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant'])) {
      const err = new Error('Meetings are not available for your role');
      err.status = 403;
      throw err;
    }
    const agencyId = currentAgencyId(req);
    if (!agencyId) {
      const err = new Error('Your session has no agency context');
      err.status = 400;
      throw err;
    }
    const actorId = Number(req.user?.id || 0);
    const withUserId = intOrNull(args.withUserId);
    if (!withUserId) {
      const err = new Error('withUserId is required');
      err.status = 400;
      throw err;
    }
    if (withUserId === actorId) {
      const err = new Error('You cannot start a meeting with yourself');
      err.status = 400;
      throw err;
    }
    // Verify the target user is in the same agency.
    const inAgency = await ensureCandidateInAgency(withUserId, agencyId);
    if (!inAgency) {
      const err = new Error('That person is not in your agency');
      err.status = 404;
      throw err;
    }
    const target = await User.findById(withUserId);
    if (!target) {
      const err = new Error('Person not found');
      err.status = 404;
      throw err;
    }

    const targetName = [target.first_name, target.last_name].filter(Boolean).join(' ').trim() || target.email;
    const title = (args.title && String(args.title).trim().slice(0, 200)) || `Quick meeting with ${targetName}`;
    const durationMinutes = Math.min(Math.max(5, intOrNull(args.durationMinutes) || 30), 240);

    // Round start time up to next 5-minute boundary so the slot looks tidy.
    const now = new Date();
    const ms = now.getTime();
    const roundedMs = Math.ceil(ms / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const startAt = new Date(roundedMs);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
    const toMysqlLocal = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const created = await ProviderScheduleEvent.create({
      agencyId,
      providerId: actorId,
      kind: 'TEAM_MEETING',
      title,
      description: `Ad-hoc meeting started from the assistant.`,
      isPrivate: false,
      allDay: false,
      startAt: toMysqlLocal(startAt),
      endAt: toMysqlLocal(endAt),
      createdByUserId: actorId
    });

    if (!created?.id) {
      const err = new Error('Failed to create meeting');
      err.status = 500;
      throw err;
    }

    await ProviderScheduleEventAttendee.upsertForEvent(created.id, [withUserId]);

    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const joinPath = `/join/team-meeting/${created.id}`;
    const joinUrl = frontendUrl ? `${frontendUrl}${joinPath}` : joinPath;

    // Best-effort: email the attendee that they've been invited.
    let inviteEmailed = false;
    try {
      const host = await User.findById(actorId);
      inviteEmailed = await sendMeetingInviteEmail({
        agencyId,
        attendeeUser: { id: withUserId, email: target.email },
        hostUser: host,
        meetingTitle: title,
        meetingStartAt: startAt,
        meetingEndAt: endAt,
        joinUrl
      });
    } catch {
      /* noop — invite email is best-effort, never blocks meeting creation */
    }

    return {
      ok: true,
      tool: name,
      result: {
        eventId: created.id,
        title,
        startAt: toMysqlLocal(startAt),
        endAt: toMysqlLocal(endAt),
        durationMinutes,
        withUser: {
          id: withUserId,
          name: targetName,
          email: target.email
        },
        joinUrl,
        joinPath,
        inviteEmailed
      }
      // Note: no auto-navigate. The controller renders a "Meeting ready" card
      // with the join URL so the host can copy/share it before joining.
    };
  }

  // ---------------------------------------------------------------------
  // openWorkspaceEvent — return the right UI command for one event id.
  // ---------------------------------------------------------------------
  if (name === 'openWorkspaceEvent') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const eventId = intOrNull(args.eventId);
    if (!eventId) {
      const err = new Error('eventId is required');
      err.status = 400;
      throw err;
    }
    const row = await ProviderScheduleEvent.findById(eventId);
    if (!row) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }
    // Access check: actor is host, attendee, or admin-tier in same agency.
    const isHost = Number(row.provider_id) === actorId;
    let canAccess = isHost;
    if (!canAccess) {
      const attendees = await ProviderScheduleEventAttendee.listUserIdsByEventId(eventId);
      canAccess = attendees.includes(actorId);
    }
    if (!canAccess) {
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminTier = ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
      const agencies = await User.getAgencies(actorId);
      const inAgency = (agencies || []).some((a) => Number(a?.id) === Number(row.agency_id));
      if (!(isAdminTier && inAgency)) {
        const err = new Error('You do not have access to this event');
        err.status = 403;
        throw err;
      }
    }

    const kind = String(row.kind || '').toUpperCase();
    const isMeeting = kind === 'TEAM_MEETING' || kind === 'HUDDLE';
    const path = isMeeting ? `/join/team-meeting/${eventId}` : '/schedule';

    return {
      ok: true,
      tool: name,
      result: { eventId, kind, title: row.title, path },
      uiCommands: [{ type: 'navigate', to: path }]
    };
  }

  // ---------------------------------------------------------------------
  // openTodaysWorkspace — list today's events for the actor.
  // ---------------------------------------------------------------------
  if (name === 'openTodaysWorkspace') {
    requireAuthed(req);
    const actorId = Number(req.user?.id || 0);
    const agencyId = currentAgencyId(req); // may be null for super_admin without ctx
    const dateYmd = str(args.dateYmd || new Date().toISOString().slice(0, 10), 10);
    const activeOnly = args.activeOnly === true;

    const dayStart = `${dateYmd} 00:00:00`;
    const dayEnd = `${dateYmd} 23:59:59`;

    let rows = [];
    try {
      rows = await ProviderScheduleEvent.listForUserInWindow({
        agencyId: agencyId || 0,
        providerId: actorId,
        windowStart: dayStart,
        windowEnd: dayEnd
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const now = new Date();
    const inHalfHour = new Date(now.getTime() + 30 * 60 * 1000);

    const isActive = (r) => {
      if (Number(r.all_day) === 1) return true;
      const startMs = r.start_at ? new Date(r.start_at).getTime() : 0;
      const endMs = r.end_at ? new Date(r.end_at).getTime() : 0;
      // currently happening OR starting within the next 30 min
      return (endMs > now.getTime() && startMs < inHalfHour.getTime());
    };

    const filtered = activeOnly ? rows.filter(isActive) : rows;

    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const events = filtered.map((r) => {
      const kind = String(r.kind || '').toUpperCase();
      const isMeeting = kind === 'TEAM_MEETING' || kind === 'HUDDLE';
      const joinPath = isMeeting ? `/join/team-meeting/${Number(r.id)}` : '/schedule';
      return {
        id: Number(r.id),
        kind,
        title: r.title,
        startAt: r.start_at,
        endAt: r.end_at,
        allDay: Number(r.all_day) === 1,
        active: isActive(r),
        joinPath,
        joinUrl: frontendUrl ? `${frontendUrl}${joinPath}` : joinPath
      };
    });

    return {
      ok: true,
      tool: name,
      result: { dateYmd, totalEvents: events.length, events }
    };
  }

  const err = new Error(`Unknown tool: ${name}`);
  err.status = 400;
  throw err;
}

