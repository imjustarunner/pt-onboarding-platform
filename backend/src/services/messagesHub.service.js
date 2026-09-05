/**
 * People-first Messaging Hub: search, method availability, timeline merge, send dispatch helpers.
 */
import pool from '../config/database.js';
import { searchCommunicationDirectory, listCommunicationDirectoryByKind } from './communicationDirectory.service.js';
import { findPersonalInbox, ensurePersonalMailbox } from './personalMailbox.service.js';
import {
  shouldDefaultToSecureMessage,
  isSecureMessageClientType,
  isActiveClientStatusKey
} from './secureMessagingPolicy.service.js';
import { composeNewEmail } from './unifiedInbox.service.js';
import { findOrCreateDirectThread, findExistingDirectThreadBetweenUsers } from '../controllers/chat.controller.js';
import { decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

const TEAM_ROLES = new Set([
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'schedule_manager',
  'supervisor',
  'intern'
]);

function likeParam(q) {
  return `%${String(q || '').trim().replace(/[%_]/g, '')}%`;
}

function normalizeSearchText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9@+.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Substring + ordered-char fuzzy score (higher = better). */
export function scoreNameMatch(haystack, needle) {
  const hay = normalizeSearchText(haystack);
  const n = normalizeSearchText(needle);
  if (!n || !hay) return 0;
  if (hay === n) return 100;
  if (hay.includes(n)) return 80;
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return 70;
  const compactHay = hay.replace(/\s+/g, '');
  const compactN = n.replace(/\s+/g, '');
  if (compactN.length < 2) return 0;
  let i = 0;
  for (const ch of compactHay) {
    if (ch === compactN[i]) i += 1;
    if (i >= compactN.length) {
      // reward shorter gaps
      return Math.max(25, 55 - Math.abs(compactHay.length - compactN.length));
    }
  }
  // allow one missing char for typos (len >= 4)
  if (compactN.length >= 4) {
    for (let skip = 0; skip < compactN.length; skip += 1) {
      const variant = compactN.slice(0, skip) + compactN.slice(skip + 1);
      if (compactHay.includes(variant)) return 40;
    }
  }
  return 0;
}

function rankPeopleByQuery(people, q) {
  const scored = (people || [])
    .map((p) => {
      const blob = `${p.displayName || ''} ${p.relationshipMeta || ''} ${p.email || ''} ${p.phone || ''}`;
      return { p, score: scoreNameMatch(blob, q) };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || String(a.p.displayName).localeCompare(String(b.p.displayName)));
  return scored.map((x) => x.p);
}

export function parsePersonKey(personKey) {
  const raw = String(personKey || '').trim();
  // user:123@2 | client:45@2 | contact:67@2  (agency-scoped)
  const scoped = raw.match(/^(user|client|contact):(\d+)@(\d+)$/i);
  if (scoped) {
    const type = scoped[1].toLowerCase();
    const id = Number(scoped[2]);
    const agencyId = Number(scoped[3]);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(agencyId) || agencyId <= 0) return null;
    return { type, id, value: String(id), agencyId };
  }
  const m = raw.match(/^(user|client|contact|email|phone):(.+)$/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const value = m[2].trim();
  if (type === 'user' || type === 'client' || type === 'contact') {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { type, id, value, agencyId: null };
  }
  return { type, id: null, value, agencyId: null };
}

export function formatPersonKey(type, idOrValue, agencyId = null) {
  const t = String(type || '').toLowerCase();
  if (t === 'email' || t === 'phone') {
    return `${t}:${idOrValue}`;
  }
  const id = Number(idOrValue);
  if (agencyId) return `${t}:${id}@${agencyId}`;
  return `${t}:${id}`;
}

async function loadAgencyNameMap(agencyIds) {
  const ids = [...new Set((agencyIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const { resolveOrgLogoUrl } = await import('./publicFormBranding.service.js');
  const baseUrl = String(
    process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      process.env.BACKEND_PUBLIC_URL ||
      ''
  )
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, organization_type, logo_url, logo_path FROM agencies WHERE id IN (${ph})`,
      ids
    );
    return new Map(
      (rows || []).map((r) => [
        Number(r.id),
        {
          name: r.name || `Agency #${r.id}`,
          organizationType: String(r.organization_type || '').toLowerCase(),
          iconUrl: resolveOrgLogoUrl(r, { baseUrl }) || r.logo_url || null
        }
      ])
    );
  } catch {
    try {
      const [rows] = await pool.execute(
        `SELECT id, name, organization_type FROM agencies WHERE id IN (${ph})`,
        ids
      );
      return new Map(
        (rows || []).map((r) => [
          Number(r.id),
          {
            name: r.name || `Agency #${r.id}`,
            organizationType: String(r.organization_type || '').toLowerCase(),
            iconUrl: null
          }
        ])
      );
    } catch {
      return new Map();
    }
  }
}

function agencyDisplayName(nameMap, agencyId) {
  const v = nameMap.get(Number(agencyId));
  if (!v) return null;
  return typeof v === 'string' ? v : v.name || null;
}

function agencyIconUrl(nameMap, agencyId) {
  const v = nameMap.get(Number(agencyId));
  if (!v || typeof v === 'string') return null;
  return v.iconUrl || null;
}

/**
 * School-staff browse: only school orgs the viewer is assigned to
 * (provider_school_assignments + school-type user_agencies). Never parent agency.
 */
async function resolveAssignedSchoolAgencyIds(userId, hubAgencyIds = []) {
  const assigned = new Set();
  if (!userId) return [];

  try {
    const [psa] = await pool.execute(
      `SELECT DISTINCT school_organization_id AS org_id
       FROM provider_school_assignments
       WHERE provider_user_id = ?
         AND school_organization_id IS NOT NULL
         AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)`,
      [userId]
    );
    for (const r of psa || []) {
      const id = Number(r.org_id);
      if (id > 0) assigned.add(id);
    }
  } catch {
    /* ignore */
  }

  try {
    const [rows] = await pool.execute(
      `SELECT a.id
       FROM user_agencies ua
       JOIN agencies a ON a.id = ua.agency_id
       WHERE ua.user_id = ?
         AND (ua.is_active = 1 OR ua.is_active IS NULL)
         AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'district')`,
      [userId]
    );
    for (const r of rows || []) {
      const id = Number(r.id);
      if (id > 0) assigned.add(id);
    }
  } catch {
    /* ignore */
  }

  // Assigned schools are authoritative (PSA + school memberships).
  // Do not require parent-agency hub membership — that incorrectly listed
  // every school_staff on ITSCO for people who only share the parent agency.
  return [...assigned];
}

/** Platform SMS outbound is not live yet — keep the channel visible but unavailable. */
const HUB_SMS_PLATFORM_READY = false;

function method(id, available, reason, recommended = false) {
  return { id, available: !!available, reason: reason || null, recommended: !!recommended };
}

function isPendingPortalSetupStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  return s === 'PENDING_SETUP' || s === 'PENDING' || s === 'INVITED';
}

/** Active portal = linked with access + finished/initiated account (not pending setup). */
function hasActivePortalAccess({ portalAccess = false, userStatus = null, hasUserId = false } = {}) {
  if (!portalAccess || !hasUserId) return false;
  if (isPendingPortalSetupStatus(userStatus)) return false;
  return true;
}

function buildMethods({
  kinds = [],
  hasUserId = false,
  hasPhone = false,
  smsOk = false,
  hasEmail = false,
  hasAppInbox = false,
  clientStatusKey = null,
  clientType = null,
  portalAccess = false,
  userStatus = null
}) {
  const isClientish = kinds.includes('client') || kinds.includes('guardian');
  const isSchoolStaff = kinds.includes('school_staff');
  const isStaffish =
    kinds.includes('employee') || kinds.includes('staff') || isSchoolStaff || kinds.includes('team');
  const isExternal = kinds.includes('external') || kinds.includes('school_contact');

  const activeSecureClient = shouldDefaultToSecureMessage({
    clientStatusKey,
    clientType,
    isClientOrGuardian: isClientish
  });

  const portalReady =
    isStaffish || isSchoolStaff
      ? !!hasUserId
      : hasActivePortalAccess({ portalAccess, userStatus, hasUserId });

  const secureOk = isSchoolStaff
    ? !!hasUserId
    : isClientish
      ? portalReady && activeSecureClient
      : false;

  const internalAvailable = hasUserId && (isStaffish || isSchoolStaff);
  const internalForGuardian = portalReady && kinds.includes('guardian');
  // SMS: platform not shipping yet — always unavailable with clear copy.
  const smsAvailable =
    HUB_SMS_PLATFORM_READY && hasPhone && smsOk && (isClientish || isExternal || kinds.includes('contact'));
  const emailAvailable = hasEmail;

  let preferred = null;
  if (isClientish && secureOk) preferred = 'secure';
  else if (isClientish && emailAvailable) preferred = 'email';
  else if (isSchoolStaff && emailAvailable) preferred = 'email';
  else if (isSchoolStaff && secureOk) preferred = 'secure';
  else if (isSchoolStaff && internalAvailable) preferred = 'internal';
  else if (isStaffish && internalAvailable) preferred = 'internal';
  else if (smsAvailable) preferred = 'sms';
  else if (emailAvailable) preferred = 'email';
  else if (secureOk) preferred = 'secure';
  else if (internalAvailable || internalForGuardian) preferred = 'internal';

  let secureReason;
  if (secureOk) {
    secureReason = 'Secure portal message (default for active clients — turn off by choosing Email)';
  } else if (isClientish && hasUserId && isPendingPortalSetupStatus(userStatus)) {
    secureReason = 'Portal invite sent / setup not finished yet';
  } else if (isClientish && !portalReady) {
    secureReason = 'No portal yet — send a portal invitation';
  } else if (isClientish && hasUserId && isSecureMessageClientType(clientType) && !isActiveClientStatusKey(clientStatusKey)) {
    secureReason = 'Secure is for active clients — use Email until they are active';
  } else if (isClientish && hasUserId && !isSecureMessageClientType(clientType)) {
    secureReason = 'Secure is for clinical/school clients — use Email';
  } else {
    secureReason = 'Needs an active portal account';
  }

  const smsReason = !HUB_SMS_PLATFORM_READY
    ? 'SMS isn’t available in the app yet'
    : smsAvailable
      ? 'SMS to their phone'
      : !hasPhone
        ? 'No phone on file'
        : 'SMS not available (opt-in / permissions)';

  const emailReason = !emailAvailable
    ? kinds.includes('client')
      ? 'No email on the client record — message a guardian, or add email on the client profile'
      : 'No email on file'
    : isSchoolStaff
      ? 'Email via messages@ — they can reply by email or respond in the app'
      : 'Regular email via messages@ (looks like normal email — reply as usual)';

  const internalReason =
    internalAvailable || internalForGuardian
      ? isSchoolStaff
        ? 'Internal app chat — they can also use Email to reply from outside'
        : 'Internal encrypted team chat'
      : 'Internal chat requires a staff/school user';

  const canInviteToPortal =
    isClientish &&
    emailAvailable &&
    !secureOk &&
    (!portalReady || isPendingPortalSetupStatus(userStatus));

  return {
    methods: [
      method('secure', secureOk, secureReason, preferred === 'secure'),
      method('sms', smsAvailable, smsReason, preferred === 'sms'),
      method(
        'email',
        emailAvailable,
        emailReason,
        preferred === 'email' || (isSchoolStaff && emailAvailable)
      ),
      method(
        'internal',
        internalAvailable || internalForGuardian,
        internalReason,
        preferred === 'internal'
      )
    ],
    preferredMethod: preferred,
    secureDefault: preferred === 'secure',
    isActiveClient: activeSecureClient,
    canInviteToPortal,
    portalReady
  };
}

async function actorHasAppInbox(agencyId, userId) {
  try {
    let inbox = await findPersonalInbox({ agencyId, userId });
    if (!inbox) {
      inbox = await ensurePersonalMailbox({ agencyId, userId });
    }
    return !!inbox?.id;
  } catch {
    return false;
  }
}

const CASELOAD_CLIENT_SQL = `
  (
    c.provider_id = ?
    OR EXISTS (
      SELECT 1 FROM client_provider_assignments cpa
      WHERE cpa.client_id = c.id
        AND cpa.provider_user_id = ?
        AND (cpa.is_active = 1 OR cpa.is_active IS TRUE)
    )
  )
`;

async function listGuardians({ agencyId, limit, q = '', viewerUserId = null, caseloadOnly = true } = {}) {
  const query = String(q || '').trim();
  const like = query.length >= 2 ? likeParam(query) : null;
  try {
    const searchClause = like
      ? `AND (
           u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?
           OR COALESCE(u.phone_number, u.personal_phone, u.work_phone) LIKE ?
           OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
           OR c.full_name LIKE ? OR c.initials LIKE ?
         )`
      : '';
    const searchParams = like ? [like, like, like, like, like, like, like] : [];
    const caseloadClause =
      caseloadOnly && viewerUserId
        ? `AND ${CASELOAD_CLIENT_SQL}`
        : '';
    const caseloadParams = caseloadOnly && viewerUserId ? [viewerUserId, viewerUserId] : [];
    // Include all linked guardians (portal on or off). Messaging needs parents
    // even when they have no portal access yet.
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
              COALESCE(u.phone_number, u.personal_phone, u.work_phone) AS phone,
              u.role,
              cg.access_enabled AS portal_access,
              cg.relationship_type, cg.relationship_title,
              c.id AS client_id, c.full_name AS client_name, c.initials AS client_initials,
              c.client_type, cs.status_key AS client_status_key
       FROM users u
       INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id
       INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE COALESCE(u.is_archived, 0) = 0
         AND UPPER(COALESCE(u.status, '')) NOT IN (
           'ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'TERMINATED_PENDING', 'DELETED'
         )
         AND (
           LOWER(COALESCE(u.role, '')) IN ('client_guardian', 'guardian')
           OR cg.guardian_user_id IS NOT NULL
         )
         ${caseloadClause}
         ${searchClause}
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT ${limit}`,
      [agencyId, ...caseloadParams, ...searchParams]
    );
    return rows || [];
  } catch {
    return [];
  }
}

async function searchGuardians({ agencyId, q, limit, viewerUserId = null }) {
  // Search stays broader (agency-wide) so staff can still find guardians outside caseload.
  return listGuardians({ agencyId, limit, q, viewerUserId, caseloadOnly: false });
}

async function searchClients({ agencyId, q, limit }) {
  const like = likeParam(q);
  try {
    const [rows] = await pool.execute(
      `SELECT ${CLIENT_SELECT_ONE}, c.provider_id
       ${CLIENT_FROM_JOIN}
       WHERE c.agency_id = ?
         AND (
           c.full_name LIKE ? OR c.initials LIKE ? OR c.identifier_code LIKE ?
           OR c.contact_phone LIKE ? OR c.email LIKE ?
         )
       ORDER BY c.full_name ASC
       LIMIT ${limit}`,
      [agencyId, like, like, like, like, like]
    );
    return rows || [];
  } catch {
    return [];
  }
}

async function searchContacts({ agencyId, q, limit }) {
  const like = likeParam(q);
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, client_id
       FROM agency_contacts
       WHERE agency_id = ? AND is_active = TRUE
         AND (
           full_name LIKE ?
           OR email LIKE ?
           OR COALESCE(email_alt, '') LIKE ?
           OR phone LIKE ?
         )
       ORDER BY full_name ASC
       LIMIT ${limit}`,
      [agencyId, like, like, like, like]
    );
    return rows || [];
  } catch (e) {
    if (!String(e?.message || '').includes('email_alt')) return [];
    try {
      const [rows] = await pool.execute(
        `SELECT id, full_name, email, phone, client_id
         FROM agency_contacts
         WHERE agency_id = ? AND is_active = TRUE
           AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ORDER BY full_name ASC
         LIMIT ${limit}`,
        [agencyId, like, like, like]
      );
      return rows || [];
    } catch {
      return [];
    }
  }
}

function upsertPerson(map, key, patch) {
  const existing = map.get(key) || {
    personKey: key,
    displayName: '',
    kinds: [],
    userId: null,
    clientId: null,
    contactId: null,
    email: null,
    phone: null,
    relationshipMeta: null,
    portalAccess: false,
    smsOptIn: false,
    agencyId: null,
    agencyName: null,
    clientStatusKey: null,
    clientType: null,
    userStatus: null
  };
  const kinds = new Set([...(existing.kinds || []), ...(patch.kinds || [])]);
  map.set(key, {
    ...existing,
    ...patch,
    kinds: [...kinds],
    displayName: patch.displayName || existing.displayName,
    userId: patch.userId ?? existing.userId,
    clientId: patch.clientId ?? existing.clientId,
    contactId: patch.contactId ?? existing.contactId,
    email: patch.email || existing.email,
    phone: patch.phone || existing.phone,
    relationshipMeta: patch.relationshipMeta || existing.relationshipMeta,
    portalAccess: !!(patch.portalAccess || existing.portalAccess),
    smsOptIn: !!(patch.smsOptIn || existing.smsOptIn),
    agencyId: patch.agencyId ?? existing.agencyId,
    agencyName: patch.agencyName || existing.agencyName,
    clientStatusKey: patch.clientStatusKey ?? existing.clientStatusKey,
    clientType: patch.clientType ?? existing.clientType,
    userStatus: patch.userStatus || existing.userStatus || null
  });
}

function clientDisplayName(c) {
  return c.full_name || c.initials || `Client #${c.id}`;
}

function clientGuardianAccessLabel(c) {
  const self =
    Number(c.self_portal_count) > 0 ||
    !!(c.user_id && Number(c.user_id) > 0);
  const guardianLinks = Number(c.guardian_link_count) || 0;
  const portalGuardians = Number(c.portal_guardian_count) || 0;
  if (self && portalGuardians > 0) return 'Self + guardian portal';
  if (self) return 'Self account';
  if (portalGuardians > 0) {
    return portalGuardians === 1 ? 'Guardian portal' : `${portalGuardians} guardian portals`;
  }
  if (guardianLinks > 0) {
    return guardianLinks === 1 ? 'Guardian linked' : `${guardianLinks} guardians linked`;
  }
  return 'No guardian yet';
}

function clientMeta(c) {
  const bits = [];
  if (c.school_name) bits.push(String(c.school_name).trim());
  else if (c.initials) bits.push(String(c.initials).trim());
  bits.push(clientGuardianAccessLabel(c));
  return bits.filter(Boolean).join(' · ') || 'Client';
}

function upsertClientRow(map, c, agencyId, agencyName, agencyIcon = null) {
  const smsDenied = c.session_sms_opt_in === 0 || c.session_sms_opt_in === false;
  const smsOk = !!c.contact_phone && !smsDenied;
  const key = formatPersonKey('client', c.id, agencyId);
  upsertPerson(map, key, {
    displayName: clientDisplayName(c),
    kinds: ['client'],
    clientId: c.id,
    email: c.email,
    phone: c.contact_phone,
    relationshipMeta: clientMeta(c),
    schoolName: c.school_name || null,
    guardianAccessLabel: clientGuardianAccessLabel(c),
    portalAccess: !!(c.user_id || c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
    guardianPortalEnabled: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
    smsOptIn: smsOk,
    occurredAt: c.last_at || null,
    agencyId,
    agencyName,
    agencyIconUrl: agencyIcon || null,
    clientStatusKey: c.client_status_key || null,
    clientType: c.client_type || null,
    userId: c.user_id || null
  });
}

async function finalizePeople(map, inboxByAgency, lim, { sortRecent = false } = {}) {
  const people = [];
  const userIds = [...new Set([...map.values()].map((p) => Number(p.userId)).filter((n) => n > 0))];
  const photoByUser = new Map();
  if (userIds.length) {
    try {
      const ph = userIds.map(() => '?').join(',');
      const [photoRows] = await pool.execute(
        `SELECT id, profile_photo_path, title FROM users WHERE id IN (${ph})`,
        userIds
      );
      const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
      for (const r of photoRows || []) {
        photoByUser.set(Number(r.id), {
          photoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path) || null,
          title: r.title || null
        });
      }
    } catch {
      /* ignore */
    }
  }

  for (const person of map.values()) {
    const aid = person.agencyId;
    const hasAppInbox = aid ? !!inboxByAgency.get(Number(aid)) : [...inboxByAgency.values()].some(Boolean);
    const { methods, preferredMethod, secureDefault, isActiveClient, canInviteToPortal, portalReady } =
      buildMethods({
      kinds: person.kinds,
      hasUserId: !!person.userId,
      hasPhone: !!person.phone,
      smsOk: person.smsOptIn || (person.kinds.includes('contact') && !!person.phone),
      hasEmail: !!person.email,
      hasAppInbox,
      clientStatusKey: person.clientStatusKey,
      clientType: person.clientType,
      portalAccess: !!person.portalAccess,
      userStatus: person.userStatus || null
    });
    const photoMeta = person.userId ? photoByUser.get(Number(person.userId)) : null;
    people.push({
      ...person,
      methods,
      preferredMethod,
      secureDefault,
      isActiveClient,
      canInviteToPortal,
      portalReady,
      photoUrl: person.photoUrl || photoMeta?.photoUrl || null,
      title: person.title || photoMeta?.title || null,
      agencyNames: person.agencyNames || (person.agencyName ? [person.agencyName] : [])
    });
  }
  if (sortRecent) {
    people.sort((a, b) => {
      const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  } else {
    people.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }
  const sliced = dedupePeopleByUser(people).slice(0, lim);
  return enrichPeopleWithTalkingTo(sliced);
}

/** One row per user across agencies — keep newest activity, list all agency names. */
function dedupePeopleByUser(people) {
  const byUser = new Map();
  const rest = [];
  for (const p of people || []) {
    const uid = Number(p.userId || 0);
    if (!uid) {
      rest.push(p);
      continue;
    }
    const existing = byUser.get(uid);
    if (!existing) {
      byUser.set(uid, {
        ...p,
        agencyNames: [...new Set([...(p.agencyNames || []), p.agencyName].filter(Boolean))]
      });
      continue;
    }
    const names = new Set([
      ...(existing.agencyNames || []),
      ...(p.agencyNames || []),
      existing.agencyName,
      p.agencyName
    ].filter(Boolean));
    const existingTs = existing.occurredAt ? new Date(existing.occurredAt).getTime() : 0;
    const nextTs = p.occurredAt ? new Date(p.occurredAt).getTime() : 0;
    const keepNewer = nextTs > existingTs ? p : existing;
    const keepOlder = nextTs > existingTs ? existing : p;
    byUser.set(uid, {
      ...keepNewer,
      kinds: [...new Set([...(keepNewer.kinds || []), ...(keepOlder.kinds || [])])],
      agencyNames: [...names],
      agencyName: keepNewer.agencyName || keepOlder.agencyName || [...names][0] || null,
      photoUrl: keepNewer.photoUrl || keepOlder.photoUrl || null,
      title: keepNewer.title || keepOlder.title || null,
      email: keepNewer.email || keepOlder.email || null,
      phone: keepNewer.phone || keepOlder.phone || null
    });
  }
  return [...byUser.values(), ...rest];
}

async function buildInboxMap(agencyIds, userId) {
  const map = new Map();
  await Promise.all(
    (agencyIds || []).map(async (aid) => {
      map.set(Number(aid), await actorHasAppInbox(aid, userId));
    })
  );
  return map;
}

/**
 * Linked guardians + client portal flags for client-centric Hub threads.
 */
export async function buildClientThreadContext({
  clientId,
  agencyId,
  actorUserId,
  clientSeed = null
} = {}) {
  const cid = Number(clientId);
  const aid = Number(agencyId);
  if (!cid || !aid) {
    return {
      linkedGuardians: [],
      portalGuardians: [],
      clientParticipant: null,
      clientHasPortal: false,
      clientNoPortalBanner: true,
      defaultTalkingToPersonKey: null
    };
  }

  const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;
  const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
  const rows = await ClientGuardian.listForClient(cid);
  const hasAppInbox = actorUserId ? await actorHasAppInbox(aid, actorUserId) : false;

  const linkedGuardians = [];
  for (const r of rows || []) {
    const uid = Number(r.guardian_user_id);
    if (!uid) continue;
    const relType = ClientGuardian.normalizeRelationshipType(r.relationship_type);
    const portalAccess = r.access_enabled === 1 || r.access_enabled === true;
    const displayName =
      [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || `User #${uid}`;
    const kinds = relType === 'self' ? ['guardian', 'client'] : ['guardian'];
    const { methods, preferredMethod, secureDefault, isActiveClient, canInviteToPortal, portalReady } =
      buildMethods({
      kinds: ['guardian'],
      hasUserId: true,
      hasPhone: !!r.phone,
      smsOk: !!r.phone,
      hasEmail: !!r.email,
      hasAppInbox,
      clientStatusKey: clientSeed?.clientStatusKey || null,
      clientType: clientSeed?.clientType || null,
      portalAccess,
      userStatus: r.status || null
    });
    linkedGuardians.push({
      personKey: formatPersonKey('user', uid, aid),
      userId: uid,
      displayName,
      email: r.email || null,
      phone: r.phone || null,
      relationshipType: relType,
      relationshipTitle: r.relationship_title || (relType === 'self' ? 'Self' : 'Guardian'),
      portalAccess: portalReady,
      portalAccessEnabled: portalAccess,
      userStatus: r.status || null,
      canInviteToPortal,
      isSelf: relType === 'self',
      photoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path) || null,
      methods,
      preferredMethod,
      secureDefault,
      isActiveClient
    });
  }

  const portalGuardians = linkedGuardians.filter((g) => g.portalAccess && !g.isSelf);
  const selfPortal = linkedGuardians.find((g) => g.isSelf && g.portalAccess) || null;
  const clientHasOwnUser = !!(clientSeed?.userId);
  const clientHasPortal = !!(clientHasOwnUser || selfPortal);

  let clientParticipant = null;
  if (clientSeed) {
    const clientPersonKey = clientHasOwnUser
      ? formatPersonKey('user', clientSeed.userId, aid)
      : selfPortal?.personKey || formatPersonKey('client', cid, aid);
    const { methods, preferredMethod, secureDefault, isActiveClient, canInviteToPortal, portalReady } =
      buildMethods({
      kinds: ['client'],
      hasUserId: clientHasOwnUser || !!selfPortal,
      hasPhone: !!clientSeed.phone,
      smsOk: !!clientSeed.smsOptIn,
      hasEmail: !!clientSeed.email,
      hasAppInbox,
      clientStatusKey: clientSeed.clientStatusKey || null,
      clientType: clientSeed.clientType || null,
      portalAccess: clientHasPortal,
      userStatus: clientSeed.userStatus || selfPortal?.userStatus || null
    });
    clientParticipant = {
      personKey: clientPersonKey,
      userId: clientSeed.userId || selfPortal?.userId || null,
      displayName: clientSeed.displayName || 'Client',
      email: clientSeed.email || selfPortal?.email || null,
      phone: clientSeed.phone || null,
      portalAccess: portalReady,
      canInviteToPortal,
      isClient: true,
      isSelf: !!selfPortal,
      methods,
      preferredMethod,
      secureDefault,
      isActiveClient
    };
  }

  const defaultTalkingToPersonKey =
    portalGuardians.find((g) => g.email)?.personKey ||
    portalGuardians[0]?.personKey ||
    linkedGuardians.find((g) => g.email)?.personKey ||
    linkedGuardians.find((g) => g.portalAccess)?.personKey ||
    linkedGuardians[0]?.personKey ||
    (clientHasPortal ? clientParticipant?.personKey : null) ||
    null;

  return {
    linkedGuardians,
    portalGuardians,
    clientParticipant,
    clientHasPortal,
    clientNoPortalBanner: !clientHasPortal,
    defaultTalkingToPersonKey,
    talkingToName:
      linkedGuardians.find((g) => g.personKey === defaultTalkingToPersonKey)?.displayName ||
      (clientHasPortal ? clientParticipant?.displayName : null) ||
      null
  };
}

async function enrichPeopleWithTalkingTo(people = []) {
  const clients = (people || []).filter((p) => (p.kinds || []).includes('client') && p.clientId);
  if (!clients.length) return people;
  try {
    const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;
    const byClient = await ClientGuardian.primaryTalkingToByClientIds(clients.map((p) => p.clientId));
    return (people || []).map((p) => {
      if (!(p.kinds || []).includes('client') || !p.clientId) return p;
      const hint = byClient.get(Number(p.clientId));
      if (!hint) return { ...p, talkingToName: null };
      return {
        ...p,
        talkingToName: hint.displayName,
        talkingToUserId: hint.userId,
        talkingToPortalAccess: hint.portalAccess
      };
    });
  } catch (e) {
    console.warn('[enrichPeopleWithTalkingTo]', e?.message || e);
    return people;
  }
}

const CLIENT_SELECT_CORE = `c.id, c.agency_id, c.organization_id, c.full_name, c.initials, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled, c.client_type,
                org.name AS school_name,
                (
                  SELECT cg.guardian_user_id
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
                  LIMIT 1
                ) AS user_id,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                ) AS guardian_link_count,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
                ) AS self_portal_count,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) <> 'self'
                ) AS portal_guardian_count,
                cs.status_key AS client_status_key`;
const CLIENT_SELECT_ONE = `c.id, c.agency_id, c.organization_id, c.full_name, c.initials, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled, c.client_type,
                org.name AS school_name,
                (
                  SELECT cg.guardian_user_id
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
                  LIMIT 1
                ) AS user_id,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                ) AS guardian_link_count,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
                ) AS self_portal_count,
                (
                  SELECT COUNT(*)
                  FROM client_guardians cg
                  WHERE cg.client_id = c.id
                    AND cg.access_enabled = 1
                    AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) <> 'self'
                ) AS portal_guardian_count,
                cs.status_key AS client_status_key`;
const CLIENT_FROM_JOIN = `FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         LEFT JOIN agencies org ON org.id = c.organization_id`;

/**
 * Browse people without knowing a name: caseload and/or recent activity.
 * Supports multiple agencies so staff see DMs/clients across every tenant they belong to.
 * browse: 'caseload' | 'recent' | 'suggested' | 'sent' | 'staff' | 'school_staff' | 'guardians'
 */
export async function browseHubPeople({
  agencyId,
  agencyIds = null,
  userId,
  browse = 'suggested',
  limit = 30,
  q = '',
  viewerRole = null
} = {}) {
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 80);
  const mode = String(browse || 'suggested').toLowerCase();
  const role = String(viewerRole || '').toLowerCase();
  const agencyWidePeople = ['admin', 'super_admin', 'support'].includes(role);
  const nameMap = await loadAgencyNameMap(ids);
  const inboxByAgency = await buildInboxMap(ids, userId);
  const map = new Map();
  const ph = ids.map(() => '?').join(',');
  const query = String(q || '').trim();

  if (mode === 'staff' || mode === 'school_staff') {
    const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
    let browseIds = ids;
    if (mode === 'school_staff') {
      // Only school orgs the viewer is assigned to — never parent agency memberships
      // (avoids ITSCO-wide school_staff like duplicate Emmie accounts appearing for everyone).
      browseIds = await resolveAssignedSchoolAgencyIds(userId, ids);
      if (!browseIds.length) {
        return [];
      }
    }
    const schoolNameMap = mode === 'school_staff' ? await loadAgencyNameMap(browseIds) : nameMap;
    for (const aid of browseIds) {
      const agencyName = agencyDisplayName(schoolNameMap, aid);
      const rows = await listCommunicationDirectoryByKind({
        agencyId: aid,
        kind: mode,
        limit: lim,
        q: query
      });
      for (const d of rows || []) {
        if (d.id === userId) continue;
        const kinds = mode === 'school_staff' ? ['school_staff'] : ['employee', 'staff', 'team'];
        const roleMeta = mode === 'school_staff'
          ? (agencyName ? `School staff · ${agencyName}` : 'School staff')
          : (d.meta || d.role || null);
        upsertPerson(map, formatPersonKey('user', d.id, aid), {
          displayName: d.name,
          kinds,
          userId: d.id,
          email: d.email,
          relationshipMeta: roleMeta,
          title: d.title || null,
          photoUrl: publicUploadsUrlFromStoredPath(d.profilePhotoPath) || null,
          portalAccess: true,
          agencyId: aid,
          agencyName
        });
      }
    }
    const people = await finalizePeople(map, inboxByAgency, lim, { sortRecent: false });
    return query.length >= 2 ? rankPeopleByQuery(people, query).slice(0, lim) : people;
  }

  if (mode === 'guardians') {
    for (const aid of ids) {
      const agencyName = agencyDisplayName(nameMap, aid);
      const rows = await listGuardians({
        agencyId: aid,
        limit: lim,
        q: query,
        viewerUserId: userId,
        caseloadOnly: !agencyWidePeople
      });
      for (const g of rows || []) {
        const clientLabel = g.client_name || g.client_initials || `Client #${g.client_id}`;
        const portalOn = g.portal_access === 1 || g.portal_access === true;
        upsertPerson(map, formatPersonKey('user', g.id, aid), {
          displayName: [g.first_name, g.last_name].filter(Boolean).join(' ') || g.email,
          kinds: ['guardian'],
          userId: g.id,
          clientId: g.client_id,
          email: g.email,
          phone: g.phone,
          relationshipMeta: `Guardian of ${clientLabel}${portalOn ? '' : ' · no portal'}`,
          portalAccess: portalOn,
          userStatus: g.status || null,
          smsOptIn: !!g.phone,
          agencyId: aid,
          agencyName,
          clientStatusKey: g.client_status_key || null,
          clientType: g.client_type || null
        });
      }
    }
    const people = await finalizePeople(map, inboxByAgency, lim, { sortRecent: false });
    return query.length >= 2 ? rankPeopleByQuery(people, query).slice(0, lim) : people;
  }

  const wantCaseload = mode === 'caseload' || mode === 'suggested';
  const wantRecent = mode === 'recent' || mode === 'suggested';
  const wantSent = mode === 'sent';

  if (wantSent) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.agency_id,
                LOWER(COALESCE(p.email, '')) AS email,
                COALESCE(p.display_name, p.email) AS display_name,
                MAX(COALESCE(m.sent_at, m.scheduled_send_at, m.created_at)) AS last_at
         FROM communication_messages m
         JOIN communication_conversations c ON c.id = m.conversation_id
         JOIN communication_participants p ON p.conversation_id = c.id AND p.is_primary = 1
         WHERE c.agency_id IN (${ph})
           AND c.channel = 'email'
           AND m.direction = 'outbound'
           AND m.author_user_id = ?
           AND COALESCE(m.is_internal_note, 0) = 0
           AND COALESCE(m.send_status, 'sent') IN ('sent', 'scheduled')
           AND COALESCE(p.email, '') <> ''
         GROUP BY c.agency_id, LOWER(COALESCE(p.email, '')), COALESCE(p.display_name, p.email)
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [...ids, userId]
      );
      for (const r of rows || []) {
        const email = String(r.email || '').trim().toLowerCase();
        if (!email) continue;
        const aid = Number(r.agency_id);
        const agencyName = agencyDisplayName(nameMap, aid);
        let matched = false;
        try {
          const [users] = await pool.execute(
            `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.profile_photo_path, u.title
             FROM users u
             JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
             WHERE LOWER(u.email) = ?
             LIMIT 1`,
            [aid, email]
          );
          const u = users?.[0];
          if (u) {
            const role = String(u.role || '').toLowerCase();
            const kinds =
              role === 'school_staff'
                ? ['school_staff']
                : role === 'client_guardian'
                  ? ['guardian']
                  : ['employee', 'staff', 'team'];
            const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
            upsertPerson(map, formatPersonKey('user', u.id, aid), {
              displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
              kinds,
              userId: u.id,
              email: u.email,
              relationshipMeta: role || null,
              title: u.title || null,
              photoUrl: publicUploadsUrlFromStoredPath(u.profile_photo_path) || null,
              portalAccess: true,
              occurredAt: r.last_at,
              agencyId: aid,
              agencyName
            });
            matched = true;
          }
        } catch {
          /* ignore */
        }
        if (!matched) {
          upsertPerson(map, `email:${email}@${aid}`, {
            displayName: r.display_name || email,
            kinds: ['external'],
            email,
            relationshipMeta: 'Sent email',
            occurredAt: r.last_at,
            agencyId: aid,
            agencyName
          });
        }
      }
    } catch (e) {
      console.warn('[browseHubPeople] sent:', e?.message || e);
    }

    // Also include internal/secure chat recipients you messaged recently.
    try {
      const [chatRows] = await pool.execute(
        `SELECT t.agency_id,
                p_other.user_id AS other_user_id,
                MAX(m.created_at) AS last_at
         FROM chat_messages m
         JOIN chat_threads t ON t.id = m.thread_id AND t.thread_type = 'direct'
         JOIN chat_thread_participants p_me
           ON p_me.thread_id = t.id AND p_me.user_id = ?
         JOIN chat_thread_participants p_other
           ON p_other.thread_id = t.id AND p_other.user_id <> ?
         WHERE m.sender_user_id = ?
           AND t.agency_id IN (${ph})
         GROUP BY t.agency_id, p_other.user_id
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [userId, userId, userId, ...ids]
      );
      for (const r of chatRows || []) {
        const otherId = Number(r.other_user_id);
        const aid = Number(r.agency_id);
        if (!otherId || !aid) continue;
        const [users] = await pool.execute(
          `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.profile_photo_path, u.title
           FROM users u WHERE u.id = ? LIMIT 1`,
          [otherId]
        );
        const u = users?.[0];
        if (!u) continue;
        const role = String(u.role || '').toLowerCase();
        const kinds =
          role === 'school_staff'
            ? ['school_staff']
            : role === 'client_guardian'
              ? ['guardian']
              : role === 'client'
                ? ['client']
                : ['employee', 'staff', 'team'];
        const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
        upsertPerson(map, formatPersonKey('user', u.id, aid), {
          displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
          kinds,
          userId: u.id,
          email: u.email,
          relationshipMeta: 'Internal message',
          title: u.title || null,
          photoUrl: publicUploadsUrlFromStoredPath(u.profile_photo_path) || null,
          portalAccess: true,
          occurredAt: r.last_at,
          agencyId: aid,
          agencyName: agencyDisplayName(nameMap, aid)
        });
      }
    } catch (e) {
      console.warn('[browseHubPeople] sent chat:', e?.message || e);
    }

    return finalizePeople(map, inboxByAgency, lim, { sortRecent: true });
  }

  if (wantCaseload) {
    try {
      const caseloadFilter = agencyWidePeople
        ? ''
        : `AND (
             c.provider_id = ?
             OR EXISTS (
               SELECT 1 FROM client_provider_assignments cpa
               WHERE cpa.client_id = c.id
                 AND cpa.provider_user_id = ?
                 AND cpa.is_active = 1
             )
           )`;
      const [rows] = await pool.execute(
        `SELECT ${CLIENT_SELECT_CORE}
         ${CLIENT_FROM_JOIN}
         WHERE c.agency_id IN (${ph})
           AND (c.compliance_archived_at IS NULL)
           ${caseloadFilter}
           ORDER BY COALESCE(c.full_name, c.initials) ASC
           LIMIT ${lim}`,
          agencyWidePeople ? [...ids] : [...ids, userId, userId]
        );
        for (const c of rows || []) {
          const aid = Number(c.agency_id);
          upsertClientRow(map, c, aid, agencyDisplayName(nameMap, aid), agencyIconUrl(nameMap, aid));
        }
    } catch {
      try {
        const fallbackFilter = agencyWidePeople
          ? ''
          : `AND (
               c.provider_id = ?
               OR EXISTS (
                 SELECT 1 FROM client_provider_assignments cpa
                 WHERE cpa.client_id = c.id
                   AND cpa.provider_user_id = ?
                   AND (cpa.is_active = 1 OR cpa.is_active IS TRUE)
               )
             )`;
        const [rows] = await pool.execute(
          `SELECT ${CLIENT_SELECT_CORE}
           ${CLIENT_FROM_JOIN}
           WHERE c.agency_id IN (${ph})
             ${fallbackFilter}
           ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
           LIMIT ${lim}`,
          agencyWidePeople ? [...ids] : [...ids, userId, userId]
        );
        for (const c of rows || []) {
          const aid = Number(c.agency_id);
          upsertClientRow(map, c, aid, agencyDisplayName(nameMap, aid), agencyIconUrl(nameMap, aid));
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (wantRecent) {
    try {
      const [smsRows] = await pool.execute(
        `SELECT ml.client_id, ml.agency_contact_id, ml.agency_id, MAX(ml.created_at) AS last_at
         FROM message_logs ml
         WHERE ml.agency_id IN (${ph})
           AND (ml.user_id = ? OR ml.assigned_user_id = ?)
           AND (ml.client_id IS NOT NULL OR ml.agency_contact_id IS NOT NULL)
         GROUP BY ml.client_id, ml.agency_contact_id, ml.agency_id
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [...ids, userId, userId]
      );
      for (const r of smsRows || []) {
        const aid = Number(r.agency_id);
        const agencyName = agencyDisplayName(nameMap, aid);
        if (r.client_id) {
          const [clients] = await pool.execute(
            `SELECT ${CLIENT_SELECT_ONE}
             ${CLIENT_FROM_JOIN}
             WHERE c.id = ? AND c.agency_id = ? LIMIT 1`,
            [r.client_id, aid]
          );
          if (clients?.[0]) {
            upsertClientRow(
              map,
              { ...clients[0], last_at: r.last_at },
              aid,
              agencyName,
              agencyIconUrl(nameMap, aid)
            );
          }
        } else if (r.agency_contact_id) {
          const [contacts] = await pool.execute(
            `SELECT id, full_name, email, phone, client_id FROM agency_contacts
             WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
            [r.agency_contact_id, aid]
          );
          const c = contacts?.[0];
          if (c) {
            upsertPerson(map, formatPersonKey('contact', c.id, aid), {
              displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
              kinds: ['contact', 'external'],
              contactId: c.id,
              clientId: c.client_id || null,
              email: c.email,
              phone: c.phone,
              relationshipMeta: 'Agency contact',
              smsOptIn: !!c.phone,
              occurredAt: r.last_at,
              agencyId: aid,
              agencyName
            });
          }
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const [dmRows] = await pool.execute(
        `SELECT other.user_id AS other_user_id, t.agency_id, MAX(lm.created_at) AS last_at
         FROM chat_threads t
         INNER JOIN chat_thread_participants me ON me.thread_id = t.id AND me.user_id = ?
         INNER JOIN chat_thread_participants other ON other.thread_id = t.id AND other.user_id <> ?
         LEFT JOIN chat_messages lm ON lm.id = (
           SELECT m.id FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1
         )
         WHERE t.agency_id IN (${ph}) AND t.thread_type = 'direct'
         GROUP BY other.user_id, t.agency_id
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [userId, userId, ...ids]
      );
      for (const r of dmRows || []) {
        if (!r.other_user_id) continue;
        const aid = Number(r.agency_id);
        const person = await resolveHubPerson({
          agencyId: aid,
          userId,
          personKey: formatPersonKey('user', r.other_user_id, aid)
        });
        if (person) {
          map.set(person.personKey, {
            ...person,
            occurredAt: r.last_at,
            agencyId: aid,
            agencyName: agencyDisplayName(nameMap, aid) || person.agencyName || null
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return finalizePeople(map, inboxByAgency, lim, {
    sortRecent: mode === 'recent' || mode === 'suggested' || mode === 'sent'
  });
}

/**
 * Search people across directory, guardians, clients, contacts.
 * Matches name, initials, identifier code, email, phone.
 * When agencyIds is provided, searches every tenant the viewer belongs to.
 */
export async function searchHubPeople({ agencyId, agencyIds = null, userId, q, limit = 20 }) {
  const query = String(q || '').trim();
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length || query.length < 2) return [];

  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const nameMap = await loadAgencyNameMap(ids);
  const inboxByAgency = await buildInboxMap(ids, userId);
  const map = new Map();

  for (const aid of ids) {
    const agencyName = agencyDisplayName(nameMap, aid);
    const [dir, guardians, clients, contacts] = await Promise.all([
      searchCommunicationDirectory({ agencyId: aid, q: query, limit: lim }),
      searchGuardians({ agencyId: aid, q: query, limit: lim }),
      searchClients({ agencyId: aid, q: query, limit: lim }),
      searchContacts({ agencyId: aid, q: query, limit: lim })
    ]);

    for (const d of dir || []) {
      const kinds =
        d.kind === 'school_staff'
          ? ['school_staff']
          : d.kind === 'school_contact'
            ? ['external', 'school_contact']
            : ['employee', 'staff', 'team'];
      const key =
        d.kind === 'school_contact'
          ? `email:${String(d.email || '').toLowerCase()}@${aid}`
          : formatPersonKey('user', d.id, aid);
      upsertPerson(map, key, {
        displayName: d.name,
        kinds,
        userId: d.kind === 'school_contact' ? null : d.id,
        email: d.email,
        relationshipMeta: d.meta || d.role || null,
        portalAccess: d.kind !== 'school_contact',
        agencyId: aid,
        agencyName
      });
    }

    for (const g of guardians) {
      const clientLabel = g.client_name || g.client_initials || `Client #${g.client_id}`;
      upsertPerson(map, formatPersonKey('user', g.id, aid), {
        displayName: [g.first_name, g.last_name].filter(Boolean).join(' ') || g.email,
        kinds: ['guardian'],
        userId: g.id,
        clientId: g.client_id,
        email: g.email,
        phone: g.phone,
        relationshipMeta: `Guardian of ${clientLabel}`,
        portalAccess: true,
        smsOptIn: !!g.phone,
        agencyId: aid,
        agencyName,
        clientStatusKey: g.client_status_key || null,
        clientType: g.client_type || null
      });
    }

    for (const c of clients) {
      upsertClientRow(map, c, aid, agencyName, agencyIconUrl(nameMap, aid));
    }

    for (const c of contacts) {
      upsertPerson(map, formatPersonKey('contact', c.id, aid), {
        displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
        kinds: ['contact', 'external'],
        contactId: c.id,
        clientId: c.client_id || null,
        email: c.email,
        phone: c.phone,
        relationshipMeta: 'Agency contact',
        smsOptIn: !!c.phone,
        agencyId: aid,
        agencyName
      });
    }
  }

  return rankPeopleByQuery(await finalizePeople(map, inboxByAgency, lim * 2), query).slice(0, lim);
}

/**
 * Resolve a personKey to hydrated person + methods (for selection / send).
 */
export async function resolveHubPerson({ agencyId, userId, personKey }) {
  const parsed = parsePersonKey(personKey);
  if (!parsed) return null;
  const resolvedAgencyId = parsed.agencyId || agencyId;
  if (!resolvedAgencyId) return null;

  const nameMap = await loadAgencyNameMap([resolvedAgencyId]);
  const agencyName = agencyDisplayName(nameMap, resolvedAgencyId);
  const scopedKey =
    parsed.type === 'email' || parsed.type === 'phone'
      ? `${parsed.type}:${parsed.value}`
      : formatPersonKey(parsed.type, parsed.id, resolvedAgencyId);

  let seed = {
    personKey: scopedKey,
    displayName: '',
    kinds: [],
    userId: null,
    clientId: null,
    contactId: null,
    email: null,
    phone: null,
    relationshipMeta: null,
    portalAccess: false,
    smsOptIn: false,
    agencyId: resolvedAgencyId,
    agencyName
  };

  if (parsed.type === 'user') {
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, work_email,
              COALESCE(phone_number, personal_phone, work_phone) AS phone,
              role, status, is_archived
       FROM users WHERE id = ? LIMIT 1`,
      [parsed.id]
    );
    const u = rows?.[0];
    if (!u) return null;
    const status = String(u.status || '').toUpperCase();
    const archived =
      u.is_archived === 1 ||
      u.is_archived === true ||
      ['ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'TERMINATED_PENDING', 'DELETED'].includes(status) ||
      status.includes('ARCHIV') ||
      status.startsWith('INACTIVE');
    if (archived) return null;
    const role = String(u.role || '').toLowerCase();
    const kinds =
      role === 'client_guardian' || role === 'guardian'
        ? ['guardian']
        : role === 'client'
          ? ['client']
          : role === 'school_staff'
            ? ['school_staff']
            : TEAM_ROLES.has(role)
              ? ['employee', 'staff', 'team']
              : ['employee'];
    seed = {
      ...seed,
      displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
      kinds,
      userId: u.id,
      email: u.work_email || u.email,
      phone: u.phone,
      relationshipMeta:
        role === 'school_staff' && agencyName
          ? `School staff · ${agencyName}`
          : role,
      portalAccess: true
    };
    if (role === 'client') {
      try {
        const [links] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials, c.client_type, c.contact_phone, c.email AS client_email,
                  cs.status_key AS client_status_key
           FROM clients c
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           INNER JOIN client_guardians cg
             ON cg.client_id = c.id
            AND cg.guardian_user_id = ?
            AND cg.access_enabled = 1
            AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
           WHERE c.agency_id = ?
           LIMIT 1`,
          [u.id, resolvedAgencyId]
        );
        if (links?.[0]) {
          seed.clientId = links[0].id;
          seed.clientType = links[0].client_type || null;
          seed.clientStatusKey = links[0].client_status_key || null;
          seed.email = seed.email || links[0].client_email || null;
          seed.phone = seed.phone || links[0].contact_phone || null;
          seed.relationshipMeta = clientMeta(links[0]);
          seed.smsOptIn = !!seed.phone;
        }
      } catch {
        /* ignore */
      }
    } else if (role === 'client_guardian' || role === 'guardian') {
      try {
        const [links] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials, c.client_type, cs.status_key AS client_status_key,
                  cg.access_enabled
           FROM client_guardians cg
           INNER JOIN clients c ON c.id = cg.client_id
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           WHERE cg.guardian_user_id = ? AND c.agency_id = ?
           ORDER BY cg.access_enabled DESC, c.id ASC
           LIMIT 1`,
          [u.id, resolvedAgencyId]
        );
        if (links?.[0]) {
          seed.clientId = links[0].id;
          seed.clientType = links[0].client_type || null;
          seed.clientStatusKey = links[0].client_status_key || null;
          seed.portalAccess = links[0].access_enabled === 1 || links[0].access_enabled === true;
          seed.relationshipMeta = `Guardian of ${links[0].full_name || links[0].initials || links[0].id}`;
        }
      } catch {
        /* ignore */
      }
      seed.smsOptIn = !!seed.phone;
    }
  } else if (parsed.type === 'client') {
    const [rows] = await pool.execute(
      `SELECT ${CLIENT_SELECT_ONE}
       ${CLIENT_FROM_JOIN}
       WHERE c.id = ? AND c.agency_id = ? LIMIT 1`,
      [parsed.id, resolvedAgencyId]
    );
    const c = rows?.[0];
    if (!c) return null;
    const smsDenied = c.session_sms_opt_in === 0 || c.session_sms_opt_in === false;
    seed = {
      ...seed,
      displayName: clientDisplayName(c),
      kinds: ['client'],
      clientId: c.id,
      userId: c.user_id || null,
      email: c.email,
      phone: c.contact_phone,
      relationshipMeta: clientMeta(c),
      schoolName: c.school_name || null,
      guardianAccessLabel: clientGuardianAccessLabel(c),
      agencyIconUrl: agencyIconUrl(nameMap, resolvedAgencyId),
      portalAccess: !!(c.user_id || c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
      guardianPortalEnabled: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
      smsOptIn: !!c.contact_phone && !smsDenied,
      clientStatusKey: c.client_status_key || null,
      clientType: c.client_type || null
    };
  } else if (parsed.type === 'contact') {
    let c = null;
    try {
      const [rows] = await pool.execute(
        `SELECT id, full_name, email, phone, client_id, relationship_type FROM agency_contacts
         WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
        [parsed.id, resolvedAgencyId]
      );
      c = rows?.[0] || null;
    } catch {
      const [rows] = await pool.execute(
        `SELECT id, full_name, email, phone, client_id FROM agency_contacts
         WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
        [parsed.id, resolvedAgencyId]
      );
      c = rows?.[0] || null;
    }
    if (!c) return null;
    seed = {
      ...seed,
      displayName: c.full_name || c.email || c.phone,
      kinds: ['contact', 'external'],
      contactId: c.id,
      clientId: c.client_id,
      email: c.email,
      phone: c.phone,
      relationshipMeta: c.relationship_type
        ? `Contact · ${String(c.relationship_type).replace(/_/g, ' ')}`
        : 'Agency contact',
      smsOptIn: !!c.phone
    };
  } else if (parsed.type === 'email') {
    seed = {
      ...seed,
      displayName: parsed.value,
      kinds: ['external'],
      email: parsed.value,
      relationshipMeta: 'External email'
    };
  } else if (parsed.type === 'phone') {
    seed = {
      ...seed,
      displayName: parsed.value,
      kinds: ['external'],
      phone: parsed.value,
      relationshipMeta: 'External phone',
      smsOptIn: true
    };
  }

  let photoUrl = null;
  let title = seed.title || null;
  if (seed.userId) {
    try {
      const [pr] = await pool.execute(
        `SELECT profile_photo_path, title, status FROM users WHERE id = ? LIMIT 1`,
        [seed.userId]
      );
      const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
      photoUrl = publicUploadsUrlFromStoredPath(pr?.[0]?.profile_photo_path) || null;
      title = title || pr?.[0]?.title || null;
      if (pr?.[0]?.status) seed.userStatus = pr[0].status;
    } catch {
      /* ignore */
    }
  }

  const hasAppInbox = await actorHasAppInbox(resolvedAgencyId, userId);
  const { methods, preferredMethod, secureDefault, isActiveClient, canInviteToPortal, portalReady } =
    buildMethods({
    kinds: seed.kinds,
    hasUserId: !!seed.userId,
    hasPhone: !!seed.phone,
    smsOk: seed.smsOptIn,
    hasEmail: !!seed.email,
    hasAppInbox,
    clientStatusKey: seed.clientStatusKey,
    clientType: seed.clientType,
    portalAccess: !!seed.portalAccess,
    userStatus: seed.userStatus || null
  });

  let deliveryGate = null;
  const kindsForGate = seed.kinds || [];
  const recipientIsStaffish = (kindsForGate || []).some((k) =>
    ['employee', 'staff', 'team', 'school_staff'].includes(String(k).toLowerCase())
  );
  // Guardians / clients / external contacts receive email whenever we send —
  // availability hours apply to staff recipients only.
  if (seed.userId && recipientIsStaffish) {
    try {
      const { resolveRecipientDeliveryGate } = await import('./hubRecipientDelivery.service.js');
      deliveryGate = await resolveRecipientDeliveryGate({
        agencyId: resolvedAgencyId,
        userId: seed.userId,
        displayName: seed.displayName
      });
    } catch (e) {
      console.warn('[resolveHubPerson] deliveryGate:', e?.message || e);
    }
  }

  let senderGate = null;
  try {
    const { resolveSenderDeliveryGate } = await import('./hubRecipientDelivery.service.js');
    senderGate = await resolveSenderDeliveryGate({
      agencyId: resolvedAgencyId,
      userId
    });
  } catch (e) {
    console.warn('[resolveHubPerson] senderGate:', e?.message || e);
  }

  let clientMessaging = null;
  if (seed.clientId) {
    try {
      clientMessaging = await loadClientMessagingContext({
        clientId: seed.clientId,
        agencyId: resolvedAgencyId,
        selectedUserId: (seed.kinds || []).includes('guardian') ? seed.userId || null : null
      });
    } catch (e) {
      console.warn('[resolveHubPerson] clientMessaging:', e?.message || e);
    }
  }

  return {
    ...seed,
    methods,
    preferredMethod,
    secureDefault,
    isActiveClient,
    canInviteToPortal,
    portalReady,
    photoUrl,
    title,
    deliveryGate,
    senderGate,
    clientMessaging
  };
}

async function loadClientMessagingContext({ clientId, agencyId, selectedUserId = null } = {}) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  const [clientRows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.full_name, c.initials, c.email, c.contact_phone, c.guardian_portal_enabled,
            c.client_type, c.session_sms_opt_in, cs.status_key AS client_status_key,
            (
              SELECT cg.guardian_user_id
              FROM client_guardians cg
              WHERE cg.client_id = c.id
                AND cg.access_enabled = 1
                AND LOWER(COALESCE(cg.relationship_type, cg.relationship_title, '')) = 'self'
              LIMIT 1
            ) AS user_id
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ? AND (? IS NULL OR c.agency_id = ?)
     LIMIT 1`,
    [cid, agencyId || null, agencyId || null]
  );
  const client = clientRows?.[0] || null;
  if (!client) return null;

  const resolvedAgencyId = Number(agencyId || client.agency_id) || null;
  const smsDenied = client.session_sms_opt_in === 0 || client.session_sms_opt_in === false;
  const thread = await buildClientThreadContext({
    clientId: cid,
    agencyId: resolvedAgencyId,
    actorUserId: null,
    clientSeed: {
      displayName: client.full_name || client.initials || `Client #${cid}`,
      userId: client.user_id || null,
      email: client.email || null,
      phone: client.contact_phone || null,
      smsOptIn: !!client.contact_phone && !smsDenied,
      portalAccess: !!(client.user_id || client.guardian_portal_enabled),
      clientStatusKey: client.client_status_key || null,
      clientType: client.client_type || null
    }
  });

  const guardians = thread.linkedGuardians || [];
  const portalGuardians = thread.portalGuardians || [];
  const selfPortal = guardians.find((g) => g.isSelf && g.portalAccess) || null;

  let talkingToUserId = selectedUserId ? Number(selectedUserId) : null;
  if (talkingToUserId && !guardians.some((g) => Number(g.userId) === talkingToUserId)) {
    talkingToUserId = null;
  }
  if (!talkingToUserId) {
    const fromKey = thread.defaultTalkingToPersonKey
      ? parsePersonKey(thread.defaultTalkingToPersonKey)
      : null;
    talkingToUserId =
      portalGuardians.find((g) => g.email)?.userId ||
      guardians.find((g) => g.email)?.userId ||
      (fromKey?.type === 'user' ? fromKey.id : null) ||
      portalGuardians[0]?.userId ||
      guardians[0]?.userId ||
      (thread.clientHasPortal ? Number(client.user_id) || selfPortal?.userId : null) ||
      null;
  }

  const talkingTo =
    guardians.find((g) => Number(g.userId) === Number(talkingToUserId)) ||
    (thread.clientParticipant && Number(thread.clientParticipant.userId) === Number(talkingToUserId)
      ? thread.clientParticipant
      : null);

  return {
    clientId: cid,
    clientName: client.full_name || client.initials || `Client #${cid}`,
    clientEmail: client.email || null,
    clientUserId: thread.clientParticipant?.userId || (client.user_id ? Number(client.user_id) : null),
    clientPersonKey:
      thread.clientParticipant?.personKey || formatPersonKey('client', cid, resolvedAgencyId),
    clientHasPortal: !!thread.clientHasPortal,
    clientNoPortalBanner: !!thread.clientNoPortalBanner,
    guardianPortalEnabled: !!(client.guardian_portal_enabled === 1 || client.guardian_portal_enabled === true),
    clientStatusKey: client.client_status_key || null,
    guardians,
    portalGuardians,
    selfPortal,
    clientParticipant: thread.clientParticipant,
    talkingToUserId,
    talkingToName: talkingTo?.displayName || thread.talkingToName || null,
    defaultTalkingToPersonKey: talkingTo?.personKey || thread.defaultTalkingToPersonKey || null
  };
}

async function loadChatTimeline({ agencyId, actorUserId, otherUserId, limit = 40 }) {
  if (!otherUserId) return [];
  try {
    // Merge across all direct threads between these two users. Hub send may create a
    // thread under person.agencyId while an older org-scoped thread still exists —
    // reading only one agency_id row drops new messages.
    const [threadRows] = await pool.execute(
      `SELECT t.id AS thread_id
       FROM chat_threads t
       INNER JOIN chat_thread_participants p_me
         ON p_me.thread_id = t.id AND p_me.user_id = ?
       INNER JOIN chat_thread_participants p_other
         ON p_other.thread_id = t.id AND p_other.user_id = ?
       WHERE t.thread_type = 'direct'
       ORDER BY COALESCE(
         (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.thread_id = t.id),
         t.updated_at,
         t.created_at
       ) DESC`,
      [actorUserId, otherUserId]
    );
    let threadIds = (threadRows || []).map((r) => Number(r.thread_id)).filter(Boolean);
    if (!threadIds.length && agencyId) {
      const [fallback] = await pool.execute(
        `SELECT tp.thread_id
         FROM chat_threads t
         JOIN chat_thread_participants tp ON tp.thread_id = t.id
         WHERE t.agency_id = ?
           AND t.thread_type = 'direct'
           AND tp.user_id IN (?, ?)
         GROUP BY tp.thread_id
         HAVING COUNT(DISTINCT tp.user_id) = 2
         LIMIT 1`,
        [agencyId, actorUserId, otherUserId]
      );
      threadIds = (fallback || []).map((r) => Number(r.thread_id)).filter(Boolean);
    }
    if (!threadIds.length) return [];

    const ph = threadIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT m.id, m.thread_id, m.body, m.body_ciphertext, m.body_iv, m.body_auth_tag, m.created_at, m.sender_user_id
       FROM chat_messages m
       WHERE m.thread_id IN (${ph})
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${Math.min(limit, 80)}`,
      threadIds
    );
    const messageIds = (rows || []).map((m) => Number(m.id)).filter(Boolean);
    const attachmentsByMessage = new Map();
    const reactionsByMessage = new Map();
    if (messageIds.length) {
      try {
        const placeholders = messageIds.map(() => '?').join(',');
        const [attRows] = await pool.execute(
          `SELECT id, message_id, file_path, mime_type, file_kind, width, height, byte_size, original_filename
           FROM chat_message_attachments
           WHERE message_id IN (${placeholders})
           ORDER BY id ASC`,
          messageIds
        );
        const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
        for (const r of attRows || []) {
          const mid = Number(r.message_id);
          const arr = attachmentsByMessage.get(mid) || [];
          arr.push({
            id: Number(r.id),
            file_path: r.file_path,
            file_url: `${baseUrl}/uploads/${r.file_path}`,
            mime_type: r.mime_type || null,
            file_kind: r.file_kind || 'file',
            original_filename: r.original_filename || null
          });
          attachmentsByMessage.set(mid, arr);
        }
      } catch {
        /* table may not exist on older deploys */
      }
      try {
        const placeholders = messageIds.map(() => '?').join(',');
        const [rxRows] = await pool.execute(
          `SELECT message_id, reaction_code, user_id
           FROM chat_message_reactions
           WHERE message_id IN (${placeholders})`,
          messageIds
        );
        const buckets = new Map();
        for (const r of rxRows || []) {
          const mid = Number(r.message_id);
          const code = String(r.reaction_code || '');
          if (!code) continue;
          let per = buckets.get(mid);
          if (!per) {
            per = new Map();
            buckets.set(mid, per);
          }
          let entry = per.get(code);
          if (!entry) {
            entry = { code, count: 0, mineActive: false };
            per.set(code, entry);
          }
          entry.count += 1;
          if (Number(r.user_id) === Number(actorUserId)) entry.mineActive = true;
        }
        for (const [mid, per] of buckets.entries()) {
          reactionsByMessage.set(mid, [...per.values()].sort((a, b) => b.count - a.count));
        }
      } catch {
        /* ignore */
      }
    }
    const items = [];
    for (const m of rows || []) {
      let body = m.body;
      if (!body && m.body_ciphertext && isChatEncryptionConfigured()) {
        try {
          body = decryptChatText({
            ciphertextB64: m.body_ciphertext,
            ivB64: m.body_iv,
            authTagB64: m.body_auth_tag
          });
        } catch {
          body = '[Encrypted message]';
        }
      }
      const mid = Number(m.id);
      items.push({
        id: `chat-${m.id}`,
        channel: 'secure',
        bodyPreview: String(body || '').slice(0, 400),
        createdAt: m.created_at,
        direction: Number(m.sender_user_id) === Number(actorUserId) ? 'outbound' : 'inbound',
        attachments: attachmentsByMessage.get(mid) || [],
        reactions: reactionsByMessage.get(mid) || [],
        meta: { threadId: Number(m.thread_id), messageId: mid }
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function loadSmsTimeline({ agencyId, actorUserId, clientId, contactId, limit = 40 }) {
  if (!clientId && !contactId) return [];
  try {
    let sql;
    let params;
    if (clientId) {
      sql = `SELECT id, body, direction, created_at
             FROM message_logs
             WHERE client_id = ?
               AND (agency_id = ? OR agency_id IS NULL)
             ORDER BY created_at DESC, id DESC
             LIMIT ${Math.min(limit, 80)}`;
      params = [clientId, agencyId];
    } else {
      sql = `SELECT id, body, direction, created_at
             FROM message_logs
             WHERE agency_contact_id = ?
               AND (agency_id = ? OR agency_id IS NULL)
             ORDER BY created_at DESC, id DESC
             LIMIT ${Math.min(limit, 80)}`;
      params = [contactId, agencyId];
    }
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map((r) => ({
      id: `sms-${r.id}`,
      channel: 'sms',
      bodyPreview: String(r.body || '').slice(0, 400),
      createdAt: r.created_at,
      direction: String(r.direction || '').toLowerCase().includes('in') ? 'inbound' : 'outbound',
      meta: { messageLogId: r.id, clientId, contactId }
    }));
  } catch {
    return [];
  }
}

async function loadEmailTimeline({ agencyId, actorUserId, email, limit = 40 }) {
  if (!email) return [];
  const normalized = String(email).trim().toLowerCase();
  try {
    // Hub sends via shared messages@ inbox (not personal App inbox). Include both.
    const [rows] = await pool.execute(
      `SELECT m.id AS message_id, m.conversation_id, m.direction, m.body_text, m.subject,
              m.sent_at, m.created_at, m.send_status, m.scheduled_send_at, m.undo_expires_at,
              c.subject AS conv_subject,
              c.starred AS conversation_starred,
              i.identity_key AS inbox_key,
              (
                SELECT uc.opened_at FROM user_communications uc
                WHERE uc.external_message_id = m.internet_message_id
                  AND m.internet_message_id IS NOT NULL
                ORDER BY uc.id DESC LIMIT 1
              ) AS opened_at,
              (
                SELECT uc.delivered_at FROM user_communications uc
                WHERE uc.external_message_id = m.internet_message_id
                  AND m.internet_message_id IS NOT NULL
                ORDER BY uc.id DESC LIMIT 1
              ) AS delivered_at,
              (
                SELECT uc.id FROM user_communications uc
                WHERE uc.external_message_id = m.internet_message_id
                  AND m.internet_message_id IS NOT NULL
                ORDER BY uc.id DESC LIMIT 1
              ) AS user_communication_id
       FROM communication_messages m
       JOIN communication_conversations c ON c.id = m.conversation_id
       LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
       WHERE c.agency_id = ?
         AND c.channel = 'email'
         AND EXISTS (
           SELECT 1 FROM communication_participants p
           WHERE p.conversation_id = c.id
             AND LOWER(COALESCE(p.email, '')) = ?
         )
         AND (
           c.owner_user_id = ?
           OR i.identity_key IN ('messages', 'secure_message')
           OR i.kind = 'shared'
         )
         AND COALESCE(m.is_internal_note, 0) = 0
         AND COALESCE(m.send_status, 'sent') <> 'cancelled'
       ORDER BY COALESCE(m.sent_at, m.scheduled_send_at, m.created_at) DESC, m.id DESC
       LIMIT ${Math.min(limit, 80)}`,
      [agencyId, normalized, actorUserId]
    );
    return (rows || []).map((r) => {
      const dir = String(r.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
      const preview = String(r.body_text || r.subject || r.conv_subject || '').slice(0, 400);
      const sendStatus = String(r.send_status || 'sent').toLowerCase();
      return {
        id: `email-msg-${r.message_id}`,
        channel: 'email',
        bodyPreview: preview,
        createdAt: r.sent_at || r.scheduled_send_at || r.created_at,
        direction: dir,
        meta: {
          conversationId: r.conversation_id,
          messageId: r.message_id,
          subject: r.subject || r.conv_subject,
          openedAt: r.opened_at || null,
          deliveredAt: r.delivered_at || null,
          userCommunicationId: r.user_communication_id || null,
          inboxKey: r.inbox_key || null,
          sendStatus,
          scheduledSendAt: r.scheduled_send_at || null,
          undoExpiresAt: r.undo_expires_at || null,
          starred: !!(r.conversation_starred === 1 || r.conversation_starred === true)
        }
      };
    });
  } catch (e) {
    console.warn('[loadEmailTimeline]', e?.message || e);
    return [];
  }
}

/**
 * Merge-on-read timeline for a person.
 */
export async function getHubPersonTimeline({ agencyId, userId, personKey, limit = 60 }) {
  const person = await resolveHubPerson({ agencyId, userId, personKey });
  if (!person) return { person: null, items: [] };
  const aid = person.agencyId || agencyId;

  const [chat, sms, email] = await Promise.all([
    loadChatTimeline({
      agencyId: aid,
      actorUserId: userId,
      otherUserId: person.userId,
      limit
    }),
    loadSmsTimeline({
      agencyId: aid,
      actorUserId: userId,
      clientId: person.clientId,
      contactId: person.contactId,
      limit
    }),
    loadEmailTimeline({
      agencyId: aid,
      actorUserId: userId,
      email: person.email,
      limit
    })
  ]);

  const isClientFacing = person.kinds.includes('guardian') || person.kinds.includes('client');
  const normalizedChat = chat.map((item) => ({
    ...item,
    channel: isClientFacing ? 'secure' : 'internal'
  }));

  const items = [...normalizedChat, ...sms, ...email].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { person, items };
}

/**
 * Recent files for a person — attachments from email messages + chat file markers.
 */
export async function getHubPersonFiles({ agencyId, userId, personKey, limit = 20 }) {
  const { person, items } = await getHubPersonTimeline({ agencyId, userId, personKey, limit: 80 });
  if (!person) return { person: null, files: [] };
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const files = [];
  const aid = person.agencyId || agencyId;

  // Pull attachments from communication_attachments for this person's email threads
  if (person.email) {
    try {
      const email = String(person.email).trim().toLowerCase();
      const [rows] = await pool.execute(
        `SELECT a.id, a.filename, a.storage_url, a.content_type, a.created_at, m.id AS message_id, m.subject
         FROM communication_attachments a
         JOIN communication_messages m ON m.id = a.message_id
         JOIN communication_conversations c ON c.id = m.conversation_id
         WHERE c.agency_id = ?
           AND c.channel = 'email'
           AND EXISTS (
             SELECT 1 FROM communication_participants p
             WHERE p.conversation_id = c.id
               AND LOWER(COALESCE(p.email, '')) = ?
           )
         ORDER BY COALESCE(a.created_at, m.created_at) DESC, a.id DESC
         LIMIT 40`,
        [aid, email]
      );
      for (const r of rows || []) {
        files.push({
          id: `att-${r.id}`,
          name: r.filename || 'Attachment',
          url: r.storage_url || null,
          channel: 'email',
          createdAt: r.created_at,
          subject: r.subject || null
        });
      }
    } catch (e) {
      console.warn('[getHubPersonFiles] attachments:', e?.message || e);
    }
  }

  // Real attachments from chat/internal timeline + email rows already collected above
  for (const item of items || []) {
    const channel = item.channel || 'internal';
    const atts = Array.isArray(item.attachments) ? item.attachments : [];
    for (const a of atts) {
      const name =
        a.original_filename ||
        a.filename ||
        (a.file_path ? String(a.file_path).split('/').pop() : null) ||
        'Attachment';
      files.push({
        id: `chat-att-${a.id || `${item.id}-${name}`}`,
        name,
        url: a.file_url || a.url || null,
        channel,
        createdAt: item.createdAt,
        mimeType: a.mime_type || a.content_type || null
      });
    }
    // Fallback heuristic only when timeline had no structured attachments
    if (atts.length) continue;
    const preview = String(item.bodyPreview || '');
    const fileLike =
      /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|zip)\b/i.test(preview) ||
      /uploaded|attachment|shared a file/i.test(preview);
    if (!fileLike) continue;
    files.push({
      id: `tl-${item.id}`,
      name: preview.slice(0, 80) || 'Shared file',
      url: null,
      channel,
      createdAt: item.createdAt
    });
  }

  // Dedupe by name+createdAt
  const seen = new Set();
  const out = [];
  for (const f of files) {
    const key = `${f.name}|${f.createdAt}|${f.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= lim) break;
  }
  return { person, files: out };
}

/**
 * Compact activity feed from the merged timeline.
 */
export async function getHubPersonActivity({ agencyId, userId, personKey, limit = 20 }) {
  const { person, items } = await getHubPersonTimeline({ agencyId, userId, personKey, limit: 60 });
  if (!person) return { person: null, activity: [] };
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const activity = (items || [])
    .slice()
    .reverse()
    .slice(0, lim)
    .map((item) => {
      const dir = item.direction === 'inbound' ? 'They' : 'You';
      const channel = item.channel || 'message';
      const opened = item.meta?.openedAt ? ' · Opened' : '';
      return {
        id: item.id,
        label: `${dir}: ${channel}${opened}`,
        channel,
        createdAt: item.createdAt,
        preview: String(item.bodyPreview || item.meta?.subject || '').slice(0, 120)
      };
    });
  return { person, activity };
}

/**
 * Send via the chosen method. Returns threadRef for UI refresh.
 * Chat/SMS actual posting is done by controller invoking existing handlers;
 * email is sent here via composeNewEmail.
 */
export async function prepareHubSend({ agencyId, userId, personKey, method }) {
  const person = await resolveHubPerson({ agencyId, userId, personKey });
  if (!person) {
    const err = new Error('Person not found');
    err.status = 404;
    throw err;
  }
  const m = (person.methods || []).find((x) => x.id === method);
  if (!m?.available) {
    const err = new Error(m?.reason || `Method ${method} is not available for this person`);
    err.status = 400;
    throw err;
  }
  return person;
}

export async function sendHubEmail({
  agencyId,
  userId,
  person,
  body,
  subject,
  cc = null,
  bcc = null,
  attachments = null,
  fromAliasIdentityId = null,
  schedulePreset = null,
  scheduledSendAt = null,
  undoDelaySeconds = null,
  sendDuringNextAvailable = false
}) {
  if (!person.email) {
    const err = new Error('Person has no email address');
    err.status = 400;
    throw err;
  }
  const aid = person.agencyId || agencyId;
  const { ensureTenantMessageMailboxes } = await import('./tenantMessageMailboxes.service.js');
  const { buildNormalOutboundEmailHtml } = await import('./hubBrandedEmail.service.js');
  const mailboxes = await ensureTenantMessageMailboxes(aid);
  let inbox = mailboxes.messagesInbox;
  if (fromAliasIdentityId && Number(fromAliasIdentityId) === Number(mailboxes.secure?.id)) {
    inbox = mailboxes.secureInbox;
  }
  if (!inbox?.id && mailboxes.messages?.id) {
    // Fallback: create minimal inbox row if ensure missed columns
    const [ins] = await pool.execute(
      `INSERT INTO communication_inboxes
        (agency_id, sender_identity_id, kind, identity_key, display_name, from_email, is_active)
       VALUES (?, ?, 'shared', 'messages', 'Messages', ?, 1)
       ON DUPLICATE KEY UPDATE sender_identity_id = VALUES(sender_identity_id), from_email = VALUES(from_email), is_active = 1`,
      [aid, mailboxes.messages.id, mailboxes.messages.from_email]
    );
    inbox = await (await import('../models/CommunicationInbox.model.js')).default.findById(
      ins.insertId ||
        (
          await pool.execute(
            `SELECT id FROM communication_inboxes WHERE agency_id = ? AND identity_key = 'messages' LIMIT 1`,
            [aid]
          )
        )[0]?.[0]?.id
    );
  }
  if (!inbox?.id) {
    const err = new Error('Could not provision messages@ mailbox for this agency');
    err.status = 400;
    throw err;
  }

  const [agencyRows] = await pool.execute(
    `SELECT name, logo_url, logo_path, color_palette FROM agencies WHERE id = ? LIMIT 1`,
    [aid]
  );
  const agency = agencyRows?.[0] || {};
  const agencyName = agency.name || person.agencyName || 'Your care team';
  let logoUrl = null;
  try {
    const { resolveOrgLogoUrl } = await import('./publicFormBranding.service.js');
    logoUrl = resolveOrgLogoUrl(agency);
  } catch {
    logoUrl = agency.logo_url || null;
  }
  const [senderRows] = await pool.execute(
    `SELECT first_name, last_name, title FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const su = senderRows?.[0] || {};
  const senderDisplayName = [su.first_name, su.last_name].filter(Boolean).join(' ') || 'Team member';
  const senderTitle = su.title || '';

  // User signature is appended after the agency identity signature in the send
  // pipeline (finalizeOutboundContent). Do not embed it here or it would appear first.
  const html = buildNormalOutboundEmailHtml({
    agencyName,
    senderDisplayName,
    senderTitle,
    bodyText: body,
    colorPalette: agency.color_palette,
    logoUrl
  });

  const normalizeList = (list) => {
    if (!list) return [];
    if (typeof list === 'string') {
      return list
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ email }));
    }
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (typeof item === 'string') return { email: item.trim() };
        if (item?.email) return { email: String(item.email).trim(), name: item.name || null };
        return null;
      })
      .filter((x) => x?.email);
  };

  // Stable Reply-To (messages@) — Google Groups often mishandle plus-addresses.
  // Token still stored so we can match; inbound also falls back by participant email.
  const crypto = await import('crypto');
  const replyRaw = crypto.randomBytes(24).toString('hex');
  const replyHash = crypto.createHash('sha256').update(replyRaw).digest('hex');
  const replyTo = String(mailboxes.messages?.from_email || '').trim() || null;

  let deliveryGate = person.deliveryGate || null;
  const recipientIsStaffish = (person.kinds || []).some((k) =>
    ['employee', 'staff', 'team', 'school_staff'].includes(String(k).toLowerCase())
  );
  if (!deliveryGate && person.userId && recipientIsStaffish) {
    try {
      const { resolveRecipientDeliveryGate } = await import('./hubRecipientDelivery.service.js');
      deliveryGate = await resolveRecipientDeliveryGate({
        agencyId: aid,
        userId: person.userId,
        displayName: person.displayName
      });
    } catch {
      deliveryGate = null;
    }
  } else if (!recipientIsStaffish) {
    deliveryGate = null;
  }

  let senderGate = person.senderGate || null;
  if (!senderGate) {
    try {
      const { resolveSenderDeliveryGate } = await import('./hubRecipientDelivery.service.js');
      senderGate = await resolveSenderDeliveryGate({ agencyId: aid, userId });
    } catch {
      senderGate = null;
    }
  }

  const resolvePresetDate = (preset) => {
    const p = String(preset || '').toLowerCase();
    if (!p) return null;
    const d = new Date();
    if (p === 'in_1_hour') {
      d.setHours(d.getHours() + 1);
      return d;
    }
    if (p === 'tomorrow_9am') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    if (p === 'monday_9am') {
      const day = d.getDay();
      const add = day === 1 ? 7 : (8 - day) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    return null;
  };

  // Explicit schedule vs undo delay (default 20s). Recipient hold / sender next-available win if later.
  let effectiveScheduledAt = null;
  let holdReason = null;
  if (scheduledSendAt) {
    const d = new Date(scheduledSendAt);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() + 5000) effectiveScheduledAt = d;
  }
  if (!effectiveScheduledAt && schedulePreset) {
    effectiveScheduledAt = resolvePresetDate(schedulePreset);
  }
  if (deliveryGate?.receiveAt) {
    const hold = new Date(deliveryGate.receiveAt);
    if (!Number.isNaN(hold.getTime())) {
      if (!effectiveScheduledAt || hold > effectiveScheduledAt) {
        effectiveScheduledAt = hold;
        holdReason = 'recipient';
      }
    }
  }
  const wantSenderHold =
    !!sendDuringNextAvailable ||
    String(schedulePreset || '').toLowerCase() === 'next_available';
  if (wantSenderHold && senderGate?.sendAt) {
    const hold = new Date(senderGate.sendAt);
    if (!Number.isNaN(hold.getTime())) {
      if (!effectiveScheduledAt || hold > effectiveScheduledAt) {
        effectiveScheduledAt = hold;
        holdReason = holdReason || 'sender';
      }
    }
  }

  const payload = {
    to: [{ email: person.email, name: person.displayName }],
    cc: normalizeList(cc),
    bcc: normalizeList(bcc),
    subject: subject || `Message from ${agencyName}`,
    text: body,
    html,
    attachments: Array.isArray(attachments) ? attachments : null,
    fromDisplayName: senderDisplayName,
    replyTo,
    clientId: person.clientId || null,
    templateType: 'hub_email'
  };

  if (effectiveScheduledAt) {
    payload.scheduledSendAt = effectiveScheduledAt.toISOString();
  } else {
    const secs =
      undoDelaySeconds != null && undoDelaySeconds !== ''
        ? Number(undoDelaySeconds)
        : 20;
    payload.undoDelaySeconds = Number.isFinite(secs) ? secs : 20;
  }

  const result = await composeNewEmail({
    agencyId: aid,
    inboxId: inbox.id,
    userId,
    payload
  });

  const conversationId = result?.id || result?.conversation?.id || null;
  if (conversationId && replyHash) {
    try {
      await pool.execute(
        `INSERT INTO hub_email_reply_tokens (token_hash, agency_id, conversation_id, person_key, created_by_user_id, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 180 DAY))`,
        [replyHash, aid, conversationId, person.personKey || null, userId]
      );
    } catch (e) {
      console.warn('[sendHubEmail] reply token:', e?.message || e);
    }
  }

  // Availability / next-available holds land in Snoozed until release (no notify while held).
  const shouldSnoozeHold =
    conversationId &&
    effectiveScheduledAt &&
    (deliveryGate?.receiveAt || wantSenderHold || holdReason);
  if (shouldSnoozeHold) {
    try {
      const CommunicationConversation = (await import('../models/CommunicationConversation.model.js')).default;
      await CommunicationConversation.update(conversationId, {
        snoozedUntil: effectiveScheduledAt,
        snoozeRestoreUnread: true
      });
    } catch (e) {
      console.warn('[sendHubEmail] snooze hold:', e?.message || e);
    }
  }

  return {
    channel: 'email',
    threadRef: { conversationId, messageId: result?.messageId || null },
    fromEmail: mailboxes.messages?.from_email || null,
    scheduled: !!result?.scheduled,
    scheduledSendAt: result?.scheduledSendAt || null,
    undoExpiresAt: result?.undoExpiresAt || null,
    messageId: result?.messageId || null,
    deliveryGate: deliveryGate || null,
    senderGate: senderGate || null,
    holdReason
  };
}

export async function listHubMessageAliases({ agencyId }) {
  const { listMessageAliasesForAgency } = await import('./tenantMessageMailboxes.service.js');
  return listMessageAliasesForAgency(agencyId);
}

/**
 * Emoji/like on a communication message; notify other party in-app + optional messages@ ping.
 */
export async function reactToHubMessage({
  agencyId,
  userId,
  conversationId,
  messageId = null,
  emoji = '❤️',
  notifyEmail = true
}) {
  const cid = Number(conversationId);
  if (!cid) {
    const err = new Error('conversationId is required');
    err.status = 400;
    throw err;
  }
  let mid = messageId ? Number(messageId) : null;
  if (!mid) {
    const [rows] = await pool.execute(
      `SELECT id FROM communication_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`,
      [cid]
    );
    mid = rows?.[0]?.id ? Number(rows[0].id) : null;
  }
  if (!mid) {
    const err = new Error('No message found to react to');
    err.status = 404;
    throw err;
  }

  const emojiSafe = String(emoji || '❤️').slice(0, 32);
  await pool.execute(
    `INSERT INTO communication_message_reactions (message_id, conversation_id, user_id, emoji)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
    [mid, cid, userId, emojiSafe]
  );

  const [msgRows] = await pool.execute(
    `SELECT m.*, c.agency_id, c.subject, c.client_id
     FROM communication_messages m
     JOIN communication_conversations c ON c.id = m.conversation_id
     WHERE m.id = ? AND m.conversation_id = ?
     LIMIT 1`,
    [mid, cid]
  );
  const msg = msgRows?.[0];
  if (!msg) return { ok: true, messageId: mid, conversationId: cid, emoji: emojiSafe };

  const aid = Number(msg.agency_id || agencyId);
  const [reactorRows] = await pool.execute(
    `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const reactorName =
    [reactorRows?.[0]?.first_name, reactorRows?.[0]?.last_name].filter(Boolean).join(' ') || 'Someone';

  // Skip notify while conversation is actively snoozed / availability-held.
  let activelySnoozed = false;
  try {
    const [snoozeRows] = await pool.execute(
      `SELECT snoozed_until FROM communication_conversations WHERE id = ? LIMIT 1`,
      [cid]
    );
    const until = snoozeRows?.[0]?.snoozed_until ? new Date(snoozeRows[0].snoozed_until) : null;
    activelySnoozed = !!(until && until.getTime() > Date.now());
  } catch {
    activelySnoozed = false;
  }

  // Email ping is the primary notify channel for reactions (in-app table types are constrained).
  if (notifyEmail && !activelySnoozed) {
    try {
      const { ensureTenantMessageMailboxes } = await import('./tenantMessageMailboxes.service.js');
      const { buildLikedMessageEmailHtml } = await import('./hubBrandedEmail.service.js');
      const mailboxes = await ensureTenantMessageMailboxes(aid);
      const [partRows] = await pool.execute(
        `SELECT email FROM communication_participants
         WHERE conversation_id = ? AND email IS NOT NULL AND TRIM(email) <> ''
         ORDER BY is_primary DESC, id ASC LIMIT 1`,
        [cid]
      );
      const toEmail = String(partRows?.[0]?.email || '').trim();
      if (toEmail && mailboxes.messages?.id) {
        const [agencyRows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [aid]);
        const agencyName = agencyRows?.[0]?.name || 'Your care team';
        const html = buildLikedMessageEmailHtml({
          agencyName,
          actorName: reactorName,
          preview: msg.body_text || msg.subject || '',
          appUrl: process.env.APP_PUBLIC_URL ? `${process.env.APP_PUBLIC_URL}/messages` : null
        });
        const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
        await sendEmailFromIdentity({
          senderIdentityId: mailboxes.messages.id,
          to: toEmail,
          subject: `${reactorName} liked your message`,
          html,
          text: `${reactorName} liked your message (${emojiSafe}). Open Messages in the app to reply.`,
          replyToOverride: mailboxes.messages.from_email,
          source: 'auto',
          generatedByUserId: userId,
          templateType: 'hub_message_reaction',
          clientId: msg.client_id || null
        });
      }
    } catch (e) {
      console.warn('[reactToHubMessage] email ping:', e?.message || e);
    }
  }

  return { ok: true, messageId: mid, conversationId: cid, emoji: emojiSafe };
}

export async function ensureHubChatThread({ agencyId, userId, otherUserId }) {
  if (!otherUserId) {
    const err = new Error('Chat requires a user account on the other person');
    err.status = 400;
    throw err;
  }
  if (Number(userId) === Number(otherUserId)) {
    const err = new Error('You cannot send an internal message to yourself');
    err.status = 400;
    throw err;
  }
  // Prefer an existing DM between these users (any agency) so hub timeline + Team chat stay in sync.
  const existing = await findExistingDirectThreadBetweenUsers(userId, otherUserId, {
    requestedAgencyId: agencyId
  });
  if (existing?.threadId) return existing.threadId;
  return findOrCreateDirectThread(agencyId, null, userId, otherUserId);
}

const HUB_CONTACT_RELATIONSHIPS = new Set([
  'parent',
  'school_staff',
  'case_manager',
  'referral_source',
  'other'
]);

function looksLikeEmail(q) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(q || '').trim());
}

function looksLikePhone(q) {
  const digits = String(q || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

async function listHubChatGroups({ agencyIds, userId, limit = 8, q = '' } = {}) {
  const ids = [...new Set((agencyIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 40);
  const query = String(q || '').trim();
  const like = query.length >= 2 ? likeParam(query) : null;
  try {
    const ph = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT t.id, t.name, t.agency_id, COUNT(DISTINCT p.user_id) AS member_count
       FROM chat_threads t
       INNER JOIN chat_thread_participants me ON me.thread_id = t.id AND me.user_id = ?
       LEFT JOIN chat_thread_participants p ON p.thread_id = t.id
       WHERE t.thread_type IN ('group', 'channel', 'team')
         AND t.archived_at IS NULL
         AND (t.agency_id IN (${ph}) OR t.agency_id IS NULL)
         ${like ? 'AND t.name LIKE ?' : ''}
       GROUP BY t.id, t.name, t.agency_id
       ORDER BY COALESCE(t.updated_at, t.created_at) DESC
       LIMIT ${lim}`,
      like ? [userId, ...ids, like] : [userId, ...ids]
    );
    return (rows || []).map((r) => ({
      personKey: `group:${r.id}@${r.agency_id || ids[0]}`,
      displayName: r.name || `Group #${r.id}`,
      kinds: ['group'],
      groupId: Number(r.id),
      agencyId: Number(r.agency_id) || ids[0],
      relationshipMeta: `${Number(r.member_count) || 0} members`,
      methods: [],
      preferredMethod: null
    }));
  } catch {
    return [];
  }
}

/**
 * People-first Start conversation directory: Recent + top N per category.
 * Category rows prioritize people you messaged recently within that kind.
 */
export async function getStartConversationDirectory({
  agencyId,
  agencyIds = null,
  userId,
  viewerRole = null,
  q = '',
  perSection = 3,
  recentLimit = 8
} = {}) {
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) {
    return { query: '', sections: {}, externalHint: null };
  }
  const query = String(q || '').trim();
  const n = Math.min(Math.max(Number(perSection) || 3, 1), 12);
  const recentN = Math.min(Math.max(Number(recentLimit) || 8, 1), 24);
  const fillN = Math.max(n * 4, 16);
  const common = { agencyId: ids[0], agencyIds: ids, userId, viewerRole, q: query };

  const isClient = (p) => (p.kinds || []).includes('client');
  const isGuardian = (p) => (p.kinds || []).includes('guardian');
  const isStaff = (p) =>
    (p.kinds || []).some((k) => ['employee', 'staff', 'team'].includes(k)) &&
    !(p.kinds || []).includes('school_staff');
  const isSchoolStaff = (p) => (p.kinds || []).includes('school_staff');

  function mergeRecentFirst(recentPool, fillPool, pred, limit) {
    const seen = new Set();
    const out = [];
    const push = (p) => {
      if (!p || !pred(p)) return;
      const key = p.personKey || `u:${p.userId}` || p.displayName;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    };
    for (const p of recentPool || []) {
      push(p);
      if (out.length >= limit) return out;
    }
    for (const p of fillPool || []) {
      push(p);
      if (out.length >= limit) break;
    }
    return out;
  }

  if (query.length >= 2) {
    const [people, groups] = await Promise.all([
      searchHubPeople({ ...common, limit: 40 }),
      listHubChatGroups({ agencyIds: ids, userId, limit: 12, q: query })
    ]);
    return {
      query,
      searching: true,
      sections: {
        recent: [],
        clients: people.filter(isClient).slice(0, n),
        guardians: people.filter(isGuardian).slice(0, n),
        staff: people.filter(isStaff).slice(0, n),
        school_staff: people.filter(isSchoolStaff).slice(0, n),
        groups: groups.slice(0, n),
        matches: people.slice(0, 25)
      },
      externalHint: looksLikeEmail(query)
        ? { channel: 'email', value: query.toLowerCase() }
        : looksLikePhone(query)
          ? { channel: 'sms', value: query }
          : null
    };
  }

  const [recent, clients, guardians, staff, schoolStaff, groups] = await Promise.all([
    browseHubPeople({ ...common, browse: 'recent', limit: Math.max(recentN, fillN) }),
    browseHubPeople({ ...common, browse: 'caseload', limit: fillN }),
    browseHubPeople({ ...common, browse: 'guardians', limit: fillN }),
    browseHubPeople({ ...common, browse: 'staff', limit: fillN }),
    browseHubPeople({ ...common, browse: 'school_staff', limit: fillN }),
    listHubChatGroups({ agencyIds: ids, userId, limit: Math.max(n, 12) })
  ]);

  const recentList = recent || [];

  return {
    query: '',
    searching: false,
    sections: {
      recent: recentList.slice(0, recentN),
      clients: mergeRecentFirst(recentList, clients, isClient, n),
      guardians: mergeRecentFirst(recentList, guardians, isGuardian, n),
      staff: mergeRecentFirst(recentList, staff, isStaff, n),
      school_staff: mergeRecentFirst(recentList, schoolStaff, isSchoolStaff, n),
      groups: (groups || []).slice(0, n)
    },
    externalHint: null
  };
}

/**
 * Contacts rail: search-first list of affiliated people + emailed recipients + saved contacts.
 */
export async function browseHubContacts({
  agencyId,
  agencyIds = null,
  userId,
  viewerRole = null,
  q = '',
  limit = 40
} = {}) {
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const query = String(q || '').trim();

  if (query.length >= 2) {
    const people = await searchHubPeople({
      agencyId: ids[0],
      agencyIds: ids,
      userId,
      q: query,
      limit: lim
    });
    return people;
  }

  const map = new Map();
  const push = (list) => {
    for (const p of list || []) {
      if (!p?.personKey || map.has(p.personKey)) continue;
      map.set(p.personKey, p);
    }
  };

  const [clients, guardians, staff, schoolStaff, sent, contacts] = await Promise.all([
    browseHubPeople({ agencyId: ids[0], agencyIds: ids, userId, viewerRole, browse: 'caseload', limit: 30 }),
    browseHubPeople({ agencyId: ids[0], agencyIds: ids, userId, viewerRole, browse: 'guardians', limit: 30 }),
    browseHubPeople({ agencyId: ids[0], agencyIds: ids, userId, viewerRole, browse: 'staff', limit: 20 }),
    browseHubPeople({ agencyId: ids[0], agencyIds: ids, userId, viewerRole, browse: 'school_staff', limit: 20 }),
    browseHubPeople({ agencyId: ids[0], agencyIds: ids, userId, viewerRole, browse: 'sent', limit: 30 }),
    listMyAgencyContactsAsPeople({ agencyIds: ids, userId, limit: 40 })
  ]);

  push(clients);
  push(guardians);
  push(staff);
  push(schoolStaff);
  push(sent);
  push(contacts);

  return [...map.values()].slice(0, lim);
}

async function listMyAgencyContactsAsPeople({ agencyIds, userId, limit = 40 } = {}) {
  const ids = [...new Set((agencyIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT ac.id, ac.agency_id, ac.full_name, ac.email, ac.phone, ac.client_id, ac.relationship_type
       FROM agency_contacts ac
       WHERE ac.agency_id IN (${ph})
         AND ac.is_active = TRUE
         AND (
           ac.created_by_user_id = ?
           OR ac.share_with_all = 1
           OR EXISTS (
             SELECT 1 FROM contact_provider_assignments cpa
             WHERE cpa.agency_contact_id = ac.id AND cpa.provider_user_id = ?
           )
         )
       ORDER BY COALESCE(ac.updated_at, ac.created_at) DESC
       LIMIT ${lim}`,
      [...ids, userId, userId]
    );
    return (rows || []).map((c) => ({
      personKey: formatPersonKey('contact', c.id, c.agency_id),
      displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
      kinds: ['contact', 'external'],
      contactId: Number(c.id),
      clientId: c.client_id ? Number(c.client_id) : null,
      email: c.email || null,
      phone: c.phone || null,
      relationshipMeta: c.relationship_type
        ? `Contact · ${String(c.relationship_type).replace(/_/g, ' ')}`
        : 'Saved contact',
      agencyId: Number(c.agency_id),
      methods: [],
      preferredMethod: c.email ? 'email' : c.phone ? 'sms' : null
    }));
  } catch {
    try {
      const [rows] = await pool.execute(
        `SELECT ac.id, ac.agency_id, ac.full_name, ac.email, ac.phone, ac.client_id
         FROM agency_contacts ac
         WHERE ac.agency_id IN (${ph})
           AND ac.is_active = TRUE
           AND (
             ac.created_by_user_id = ?
             OR ac.share_with_all = 1
             OR EXISTS (
               SELECT 1 FROM contact_provider_assignments cpa
               WHERE cpa.agency_contact_id = ac.id AND cpa.provider_user_id = ?
             )
           )
         ORDER BY COALESCE(ac.updated_at, ac.created_at) DESC
         LIMIT ${lim}`,
        [...ids, userId, userId]
      );
      return (rows || []).map((c) => ({
        personKey: formatPersonKey('contact', c.id, c.agency_id),
        displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
        kinds: ['contact', 'external'],
        contactId: Number(c.id),
        clientId: c.client_id ? Number(c.client_id) : null,
        email: c.email || null,
        phone: c.phone || null,
        relationshipMeta: 'Saved contact',
        agencyId: Number(c.agency_id),
        methods: [],
        preferredMethod: c.email ? 'email' : c.phone ? 'sms' : null
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Create or link an agency contact before external Hub email/SMS.
 * Providers may create contacts for themselves (assigned + owned).
 */
export async function ensureHubExternalContact({
  agencyId,
  userId,
  role = null,
  channel = 'email',
  email = null,
  phone = null,
  fullName = null,
  clientId = null,
  relationshipType = null,
  linkUserId = null,
  existingContactId = null
} = {}) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  if (!aid || !uid) {
    const err = new Error('agencyId and user are required');
    err.status = 400;
    throw err;
  }

  const AgencyContact = (await import('../models/AgencyContact.model.js')).default;
  const ch = String(channel || 'email').toLowerCase() === 'sms' ? 'sms' : 'email';
  const normEmail = email ? String(email).trim().toLowerCase() : null;
  const normPhone = phone ? AgencyContact.normalizePhone(phone) || String(phone).trim() : null;
  if (ch === 'email' && !normEmail && !existingContactId && !linkUserId) {
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }
  if (ch === 'sms' && !normPhone && !existingContactId && !linkUserId) {
    const err = new Error('Phone is required');
    err.status = 400;
    throw err;
  }

  const rel = HUB_CONTACT_RELATIONSHIPS.has(String(relationshipType || '').toLowerCase())
    ? String(relationshipType).toLowerCase()
    : relationshipType
      ? 'other'
      : null;

  // Link to an existing platform user → prefer messaging that user, also ensure a contact row
  if (linkUserId) {
    const linked = Number(linkUserId);
    const person = await resolveHubPerson({
      agencyId: aid,
      userId: uid,
      personKey: formatPersonKey('user', linked, aid)
    });
    if (!person) {
      const err = new Error('That user was not found in this agency');
      err.status = 404;
      throw err;
    }
    // Best-effort contact bookkeeping
    try {
      let contact =
        (normEmail && (await AgencyContact.findByEmail(normEmail, aid))) ||
        (normPhone && (await AgencyContact.findByPhone(normPhone, aid))) ||
        null;
      if (!contact) {
        contact = await AgencyContact.create({
          agencyId: aid,
          createdByUserId: uid,
          shareWithAll: false,
          clientId: clientId ? Number(clientId) : null,
          fullName: fullName || person.displayName,
          email: normEmail || person.email || null,
          phone: normPhone || person.phone || null,
          source: 'manual',
          relationshipType: rel
        });
      }
      if (contact?.id) {
        await AgencyContact.addProviderAssignment(contact.id, uid).catch(() => {});
      }
    } catch (e) {
      console.warn('[ensureHubExternalContact] link user contact:', e?.message || e);
    }
    return { person, created: false, linkedUser: true };
  }

  let contact = null;
  const { userCanSeeContact } = await import('./contactAccess.service.js');

  if (existingContactId) {
    contact = await AgencyContact.findById(Number(existingContactId));
    if (!contact || Number(contact.agency_id) !== aid || !contact.is_active) {
      const err = new Error('Contact not found');
      err.status = 404;
      throw err;
    }
    if (!(await userCanSeeContact(contact, uid, role))) {
      const err = new Error(
        'That contact is not available to you. Create a new personal contact instead.'
      );
      err.status = 403;
      throw err;
    }
  }

  let allowedClientId = null;
  if (clientId) {
    const { resolveClientRecordAccess } = await import('./clientRecordAccess.service.js');
    const access = await resolveClientRecordAccess({
      userId: uid,
      role,
      clientId: Number(clientId)
    });
    if (!access?.ok) {
      const err = new Error(
        access?.message || 'You do not have access to attach this contact to that client'
      );
      err.status = access?.status || 403;
      throw err;
    }
    allowedClientId = Number(clientId);
  }

  if (!contact) {
    const byEmail = normEmail ? await AgencyContact.findByEmail(normEmail, aid) : null;
    const byPhone = !byEmail && normPhone ? await AgencyContact.findByPhone(normPhone, aid) : null;
    const candidate = byEmail || byPhone;
    if (candidate && (await userCanSeeContact(candidate, uid, role))) {
      contact = candidate;
    }
    // Invisible agency match → create a personal duplicate below
  }

  let created = false;
  if (!contact) {
    contact = await AgencyContact.create({
      agencyId: aid,
      createdByUserId: uid,
      shareWithAll: false,
      clientId: allowedClientId,
      fullName: fullName || normEmail || normPhone,
      email: normEmail,
      phone: normPhone,
      source: 'manual',
      relationshipType: rel
    });
    created = true;
  } else {
    const patch = {};
    if (fullName && !contact.full_name) patch.full_name = fullName;
    if (allowedClientId && !contact.client_id) patch.client_id = allowedClientId;
    if (rel && !contact.relationship_type) patch.relationship_type = rel;
    if (Object.keys(patch).length) {
      try {
        contact = await AgencyContact.update(contact.id, patch);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    await AgencyContact.addProviderAssignment(contact.id, uid);
  } catch {
    /* ignore */
  }

  const person = await resolveHubPerson({
    agencyId: aid,
    userId: uid,
    personKey: formatPersonKey('contact', contact.id, aid)
  });
  if (!person) {
    const err = new Error('Could not resolve contact for messaging');
    err.status = 500;
    throw err;
  }
  // Prefer the channel they asked for
  if (ch === 'email' && person.methods?.some((m) => m.id === 'email' && m.available)) {
    person.preferredMethod = 'email';
  } else if (ch === 'sms' && person.methods?.some((m) => m.id === 'sms' && m.available)) {
    person.preferredMethod = 'sms';
  }
  return { person, created, contactId: contact.id };
}

/**
 * Find existing users/contacts matching an email or phone (for "Add to existing").
 */
export async function lookupHubExternalIdentity({
  agencyId,
  agencyIds = null,
  userId,
  email = null,
  phone = null
} = {}) {
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length) return { users: [], contacts: [] };
  const AgencyContact = (await import('../models/AgencyContact.model.js')).default;
  const normEmail = email ? String(email).trim().toLowerCase() : null;
  const normPhone = phone ? AgencyContact.normalizePhone(phone) || String(phone).trim() : null;
  const users = [];
  const contacts = [];

  if (normEmail) {
    try {
      const ph = ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.work_email, u.role, ua.agency_id
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${ph})
         WHERE LOWER(COALESCE(u.work_email, u.email, '')) = ?
            OR LOWER(COALESCE(u.email, '')) = ?
         LIMIT 10`,
        [...ids, normEmail, normEmail]
      );
      for (const u of rows || []) {
        users.push({
          userId: Number(u.id),
          agencyId: Number(u.agency_id),
          displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
          email: u.work_email || u.email,
          role: u.role,
          personKey: formatPersonKey('user', u.id, u.agency_id)
        });
      }
    } catch {
      /* ignore */
    }
    for (const aid of ids) {
      const c = await AgencyContact.findByEmail(normEmail, aid);
      if (c) {
        contacts.push({
          contactId: Number(c.id),
          agencyId: Number(c.agency_id),
          displayName: c.full_name || c.email,
          email: c.email,
          phone: c.phone,
          personKey: formatPersonKey('contact', c.id, c.agency_id)
        });
      }
    }
  }

  if (normPhone) {
    try {
      const digits = normPhone.replace(/\D/g, '');
      const ph = ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, ua.agency_id,
                COALESCE(u.phone_number, u.personal_phone, u.work_phone) AS phone
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${ph})
         WHERE REPLACE(REPLACE(REPLACE(COALESCE(u.phone_number, u.personal_phone, u.work_phone, ''), '+', ''), '-', ''), ' ', '') LIKE ?
         LIMIT 10`,
        [...ids, `%${digits.slice(-10)}`]
      );
      for (const u of rows || []) {
        users.push({
          userId: Number(u.id),
          agencyId: Number(u.agency_id),
          displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          personKey: formatPersonKey('user', u.id, u.agency_id)
        });
      }
    } catch {
      /* ignore */
    }
    for (const aid of ids) {
      const c = await AgencyContact.findByPhone(normPhone, aid);
      if (c) {
        contacts.push({
          contactId: Number(c.id),
          agencyId: Number(c.agency_id),
          displayName: c.full_name || c.phone,
          email: c.email,
          phone: c.phone,
          personKey: formatPersonKey('contact', c.id, c.agency_id)
        });
      }
    }
  }

  return { users, contacts };
}

/**
 * Send branded portal invitation from Messages Hub.
 * Enables guardian portal access, issues setup token, emails You’re Invited HTML.
 */
export async function sendHubPortalInvitation({
  agencyId,
  actorUserId,
  personKey = null,
  clientId = null,
  guardianUserId = null
} = {}) {
  const aid = Number(agencyId);
  const actorId = Number(actorUserId);
  if (!aid || !actorId) {
    const err = new Error('agencyId and user are required');
    err.status = 400;
    throw err;
  }

  let person = null;
  if (personKey) {
    person = await resolveHubPerson({ agencyId: aid, userId: actorId, personKey });
  }

  let cid = Number(clientId || person?.clientId || 0) || null;
  let uid = Number(guardianUserId || person?.userId || 0) || null;
  let email = person?.email || null;
  let firstName = null;
  let lastName = null;

  const Client = (await import('../models/Client.model.js')).default;
  const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;
  const User = (await import('../models/User.model.js')).default;
  const Agency = (await import('../models/Agency.model.js')).default;
  const { resolveClientRecordAccess } = await import('./clientRecordAccess.service.js');

  if (uid && !email) {
    const u = await User.findById(uid);
    if (u) {
      email = u.email || u.personal_email || null;
      firstName = u.first_name;
      lastName = u.last_name;
    }
  }

  if (!cid && uid) {
    const [linkRows] = await pool.execute(
      `SELECT cg.client_id
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       WHERE cg.guardian_user_id = ? AND c.agency_id = ?
       ORDER BY cg.access_enabled DESC, cg.created_at ASC
       LIMIT 1`,
      [uid, aid]
    );
    cid = linkRows?.[0]?.client_id || null;
  }

  if (!cid) {
    const err = new Error('Select a client or guardian to invite to the portal');
    err.status = 400;
    throw err;
  }

  const [actorRows] = await pool.execute(`SELECT role, first_name, last_name, title, credential FROM users WHERE id = ? LIMIT 1`, [actorId]);
  const access = await resolveClientRecordAccess({
    userId: actorId,
    role: actorRows?.[0]?.role,
    clientId: cid
  });
  if (!access?.ok) {
    const err = new Error(access?.message || 'You do not have access to this client');
    err.status = access?.status || 403;
    throw err;
  }

  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  let guardian = uid ? await User.findById(uid) : null;
  if (!guardian && email) {
    guardian = await User.findByEmail(email);
  }

  if (!guardian) {
    const nameParts = String(person?.displayName || '').trim().split(/\s+/).filter(Boolean);
    firstName = firstName || nameParts[0] || 'Portal';
    lastName = lastName || nameParts.slice(1).join(' ') || 'User';
    if (!email) {
      const err = new Error('An email address is required to send a portal invitation');
      err.status = 400;
      throw err;
    }
    guardian = await User.create({
      email,
      passwordHash: null,
      firstName,
      lastName,
      personalEmail: email,
      role: 'client_guardian',
      status: 'PENDING_SETUP'
    });
  } else {
    email = email || guardian.email || guardian.personal_email;
    firstName = guardian.first_name || firstName;
    lastName = guardian.last_name || lastName;
    const role = String(guardian.role || '').toLowerCase();
    if (!['client_guardian', 'guardian', 'client'].includes(role)) {
      const err = new Error('That email belongs to a staff account and cannot receive a guardian portal invite');
      err.status = 409;
      throw err;
    }
  }

  if (!email || !String(email).includes('@')) {
    const err = new Error('An email address is required to send a portal invitation');
    err.status = 400;
    throw err;
  }

  if (client.organization_id) {
    await User.assignToAgency(guardian.id, parseInt(client.organization_id, 10)).catch(() => {});
  }
  await User.assignToAgency(guardian.id, Number(client.agency_id || aid)).catch(() => {});

  const existingLink = (await ClientGuardian.listForClient(cid)).find(
    (g) => Number(g.guardian_user_id) === Number(guardian.id)
  );
  await ClientGuardian.upsertLink({
    clientId: cid,
    guardianUserId: guardian.id,
    relationshipType: ClientGuardian.normalizeRelationshipType(
      existingLink?.relationship_type || 'guardian'
    ),
    relationshipTitle: existingLink?.relationship_title || 'Guardian',
    accessEnabled: true,
    permissionsJson:
      existingLink?.permissions_json || {
        canViewDocs: true,
        canSignDocs: true,
        canViewLinks: true,
        canViewProgramMaterials: true,
        canViewProgress: true,
        canMessage: true
      },
    createdByUserId: actorId
  });

  try {
    if (client.guardian_portal_enabled !== 1 && client.guardian_portal_enabled !== true) {
      await Client.update(cid, { guardian_portal_enabled: 1 }, actorId);
    }
  } catch {
    /* best effort */
  }

  try {
    const st = String(guardian.status || '').toUpperCase();
    if (!st || st === 'PENDING_SETUP' || st === 'PENDING' || st === 'INVITED') {
      await pool.execute(`UPDATE users SET status = 'PENDING_SETUP' WHERE id = ?`, [guardian.id]);
    }
  } catch {
    /* ignore */
  }

  const tokenResult = await User.generatePasswordlessToken(guardian.id, 48, 'setup');
  const config = (await import('../config/config.js')).default;
  const frontendBase = String(config.frontendUrl || '').replace(/\/$/, '');
  const userOrgs = await User.getAgencies(guardian.id);
  const portalSlug = userOrgs?.[0]?.portal_url || userOrgs?.[0]?.slug || null;
  const setupUrl = portalSlug
    ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
    : `${frontendBase}/passwordless-login/${tokenResult.token}`;
  const setupDisplayUrl = portalSlug
    ? `${String(frontendBase).replace(/^https?:\/\//, '')}/${portalSlug}`
    : String(frontendBase).replace(/^https?:\/\//, '');

  const agency = await Agency.findById(aid);
  const actor = actorRows?.[0];
  const providerName =
    [actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || 'your provider';
  const providerTitle = [providerName, actor?.credential || actor?.title].filter(Boolean).join(', ');

  const { buildPortalInvitationEmailForAgency } = await import('./portalInvitationEmail.service.js');
  const built = await buildPortalInvitationEmailForAgency(agency, {
    agencyId: aid,
    agencyName: agency?.name || 'Care team',
    providerName: providerTitle,
    recipientFirstName: firstName || guardian.first_name,
    setupUrl,
    setupDisplayUrl,
    colorPalette: agency?.color_palette,
    supportUrl: `${frontendBase}${portalSlug ? `/${portalSlug}` : ''}/support`
  });

  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const { resolvePreferredSenderIdentityForAgency } = await import('./emailSenderIdentityResolver.service.js');
  const { preferredIdentityKeysForTemplateType } = await import('../constants/automatedEmailCatalog.js');
  const identity = await resolvePreferredSenderIdentityForAgency({
    agencyId: aid,
    preferredKeys: preferredIdentityKeysForTemplateType('hub_portal_invite')
  });
  if (!identity?.id) {
    const err = new Error('No email sender identity configured for portal invitations');
    err.status = 503;
    throw err;
  }

  await sendEmailFromIdentity({
    senderIdentityId: identity.id,
    to: email,
    subject: built.subject,
    text: built.text,
    html: built.html,
    source: 'auto',
    agencyId: aid,
    templateType: 'hub_portal_invite'
  });

  return {
    ok: true,
    emailed: email,
    guardianUserId: guardian.id,
    clientId: cid,
    setupUrl,
    personKey: formatPersonKey('user', guardian.id, aid)
  };
}
