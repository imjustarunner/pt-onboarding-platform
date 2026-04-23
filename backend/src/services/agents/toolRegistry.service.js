import pool from '../../config/database.js';
import ReferralDirectoryEntry from '../../models/ReferralDirectoryEntry.model.js';
import User from '../../models/User.model.js';
import Task from '../../models/Task.model.js';
import HiringProfile from '../../models/HiringProfile.model.js';
import HiringNote from '../../models/HiringNote.model.js';
import ProviderSearchIndex from '../../models/ProviderSearchIndex.model.js';
import ProviderAvailabilityService from '../providerAvailability.service.js';
import UserActivityLog from '../../models/UserActivityLog.model.js';
import auditActionRegistry from '../../config/auditActionRegistry.js';
import { getUserCapabilities } from '../../utils/capabilities.js';

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

const NAVIGATION_ROUTE_WHITELIST = {
  // Dashboards / core (match frontend router paths)
  Dashboard: { path: '/dashboard', roles: null },
  Schedule: { path: '/schedule', roles: null },
  AccountInfo: { path: '/account-info', roles: null },
  Preferences: { path: '/preferences', roles: null },
  Credentials: { path: '/credentials', roles: null },
  Notifications: { path: '/admin/notifications', roles: null },

  // Admin surfaces (gated via requiresRole in router; tool checks role too)
  ClientManagement: { path: '/admin/clients', roles: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] },
  ReferralDirectory: { path: '/admin/referral-directory', roles: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] },
  UserManager: { path: '/admin/users', roles: ['admin', 'super_admin', 'support', 'staff'] },
  SchoolPortalsHub: { path: '/admin/school-portals-hub', roles: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'] },
  SkillBuildersProgramsEvents: { path: '/admin/program-events', roles: ['admin', 'staff', 'support', 'super_admin', 'provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'] },
  ProviderDirectory: { path: '/admin/provider-directory', roles: ['admin', 'support', 'staff', 'super_admin'] },
  HiringCandidates: { path: '/admin/hiring-candidates', roles: ['admin', 'super_admin'] },
  AuditCenter: { path: '/admin/audit-center', roles: ['admin', 'support', 'super_admin'] }
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
  'note_aid_execute', 'agent_assist', 'agent_tool_execute',
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
        return roleAllowed(reqUser, PROVIDER_DIRECTORY_TOOL_ROLES);
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

    const runQuery = async (likeArg) => {
      const [rs] = await pool.execute(
        `SELECT a.id, a.name, a.slug
         FROM agency_schools asx
         JOIN agencies a ON a.id = asx.school_organization_id
         WHERE asx.agency_id = ?
           AND asx.is_active = TRUE
           AND a.is_active = TRUE
           AND a.name LIKE ?
         ORDER BY a.name ASC
         LIMIT ${limit}`,
        [agencyId, likeArg]
      );
      return rs || [];
    };

    // Try the full phrase first.
    let rows = await runQuery(`%${query}%`);

    // If nothing found and the query is multi-word, retry with just the most
    // distinctive token (skipping generic education words) so that e.g.
    // "Twain Elementary School" still matches "Twain Elementary".
    if (!rows.length && query.includes(' ')) {
      const GENERIC = new Set([
        'school', 'schools', 'elementary', 'middle', 'high', 'upper', 'lower',
        'academy', 'charter', 'institute', 'the', 'and', 'or', 'of', 'portal',
        'portals', 'hub'
      ]);
      const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !GENERIC.has(t));
      if (tokens.length) {
        rows = await runQuery(`%${tokens.join(' ')}%`);
        // If the joined tokens still return nothing, try just the first token.
        if (!rows.length && tokens.length > 1) {
          rows = await runQuery(`%${tokens[0]}%`);
        }
      }
    }

    const results = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      portalPath: r.slug ? `/${r.slug}/admin/school-portals` : null
    }));
    return { ok: true, tool: name, result: { results } };
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

    const where = ['agency_id = ?', 'is_active = TRUE'];
    const params = [agencyId];
    if (query) {
      where.push('title LIKE ?');
      params.push(`%${query}%`);
    }
    if (startsAfter) { where.push('starts_at >= ?'); params.push(startsAfter); }
    if (startsBefore) { where.push('starts_at <= ?'); params.push(startsBefore); }

    const [rows] = await pool.execute(
      `SELECT id, title, starts_at, ends_at, timezone
       FROM company_events
       WHERE ${where.join(' AND ')}
       ORDER BY starts_at DESC
       LIMIT ${limit}`,
      params
    );
    const results = (rows || []).map((r) => ({
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
    const like = `%${query}%`;
    const [rows] = await pool.execute(
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
       ORDER BY u.last_name, u.first_name
       LIMIT ${limit}`,
      [agencyId, like, like, like, like]
    );
    const results = (rows || []).map((r) => ({
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

  const err = new Error(`Unknown tool: ${name}`);
  err.status = 400;
  throw err;
}

