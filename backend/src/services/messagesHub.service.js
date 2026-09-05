/**
 * People-first Messaging Hub: search, method availability, timeline merge, send dispatch helpers.
 */
import pool from '../config/database.js';
import { searchCommunicationDirectory } from './communicationDirectory.service.js';
import { findPersonalInbox, ensurePersonalMailbox } from './personalMailbox.service.js';
import {
  shouldDefaultToSecureMessage,
  isSecureMessageClientType,
  isActiveClientStatusKey
} from './secureMessagingPolicy.service.js';
import { composeNewEmail } from './unifiedInbox.service.js';
import { findOrCreateDirectThread } from '../controllers/chat.controller.js';
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
  const ids = [...new Set((agencyIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, name, official_name FROM agencies WHERE id IN (${ph})`,
    ids
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(Number(r.id), r.name || r.official_name || `Agency #${r.id}`);
  }
  return map;
}

function method(id, available, reason, recommended = false) {
  return { id, available: !!available, reason: reason || null, recommended: !!recommended };
}

function buildMethods({
  kinds = [],
  hasUserId = false,
  hasPhone = false,
  smsOk = false,
  hasEmail = false,
  hasAppInbox = false,
  clientStatusKey = null,
  clientType = null
}) {
  const isClientish = kinds.includes('client') || kinds.includes('guardian');
  const isStaffish =
    kinds.includes('employee') || kinds.includes('staff') || kinds.includes('school_staff') || kinds.includes('team');
  const isExternal = kinds.includes('external') || kinds.includes('school_contact');

  const activeSecureClient = shouldDefaultToSecureMessage({
    clientStatusKey,
    clientType,
    isClientOrGuardian: isClientish
  });

  // Secure portal: active clinical/school clients (and guardians). School staff keep secure option.
  // Pre-active / learning / others: normal email — not labeled secure.
  const secureAvailable =
    (hasUserId && activeSecureClient) || (hasUserId && kinds.includes('school_staff'));
  const internalAvailable = hasUserId && (isStaffish || kinds.includes('school_staff'));
  const internalForGuardian = hasUserId && kinds.includes('guardian');
  const smsAvailable = hasPhone && smsOk && (isClientish || isExternal || kinds.includes('contact'));
  const emailAvailable = hasEmail;

  let preferred = null;
  if (isClientish && secureAvailable) preferred = 'secure';
  else if (isClientish && emailAvailable) preferred = 'email';
  else if (isStaffish && internalAvailable) preferred = 'internal';
  else if (smsAvailable) preferred = 'sms';
  else if (emailAvailable) preferred = 'email';
  else if (secureAvailable) preferred = 'secure';
  else if (internalAvailable || internalForGuardian) preferred = 'internal';

  const secureReason = secureAvailable
    ? 'Secure portal message (default for active clients — turn off by choosing Email)'
    : isClientish && hasUserId && isSecureMessageClientType(clientType) && !isActiveClientStatusKey(clientStatusKey)
      ? 'Secure is for active clients — use Email until they are active'
      : isClientish && hasUserId && !isSecureMessageClientType(clientType)
        ? 'Secure is for clinical/school clients — use Email'
        : 'Needs an active clinical/school client (or school staff) portal user';

  return {
    methods: [
      method('secure', secureAvailable, secureReason, preferred === 'secure'),
      method(
        'sms',
        smsAvailable,
        smsAvailable ? 'SMS to their phone' : !hasPhone ? 'No phone on file' : 'SMS not available (opt-in / permissions)',
        preferred === 'sms'
      ),
      method(
        'email',
        emailAvailable,
        emailAvailable
          ? 'Regular email via messages@ (looks like normal email — reply as usual)'
          : 'No email on file',
        preferred === 'email'
      ),
      method(
        'internal',
        internalAvailable || internalForGuardian,
        internalAvailable || internalForGuardian
          ? 'Internal encrypted team chat'
          : 'Internal chat requires a staff/school user',
        preferred === 'internal'
      )
    ],
    preferredMethod: preferred,
    secureDefault: preferred === 'secure',
    isActiveClient: activeSecureClient
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

async function searchGuardians({ agencyId, q, limit }) {
  const like = likeParam(q);
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email,
              COALESCE(u.phone_number, u.personal_phone, u.work_phone) AS phone,
              u.role,
              c.id AS client_id, c.full_name AS client_name, c.initials AS client_initials,
              c.client_type, cs.status_key AS client_status_key
       FROM users u
       INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id AND cg.access_enabled = 1
       INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE LOWER(COALESCE(u.role, '')) = 'client_guardian'
         AND (
           u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?
           OR COALESCE(u.phone_number, u.personal_phone, u.work_phone) LIKE ?
           OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
           OR c.full_name LIKE ? OR c.initials LIKE ?
         )
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT ${limit}`,
      [agencyId, like, like, like, like, like, like, like]
    );
    return rows || [];
  } catch {
    return [];
  }
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
    clientType: null
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
    clientType: patch.clientType ?? existing.clientType
  });
}

function clientDisplayName(c) {
  const codeBits = [c.initials, c.identifier_code].filter(Boolean).join(' · ');
  return c.full_name || codeBits || `Client #${c.id}`;
}

function clientMeta(c) {
  const bits = [c.initials, c.identifier_code].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Client';
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
    const { methods, preferredMethod, secureDefault, isActiveClient } = buildMethods({
      kinds: person.kinds,
      hasUserId: !!person.userId,
      hasPhone: !!person.phone,
      smsOk: person.smsOptIn || (person.kinds.includes('contact') && !!person.phone),
      hasEmail: !!person.email,
      hasAppInbox,
      clientStatusKey: person.clientStatusKey,
      clientType: person.clientType
    });
    const photoMeta = person.userId ? photoByUser.get(Number(person.userId)) : null;
    people.push({
      ...person,
      methods,
      preferredMethod,
      secureDefault,
      isActiveClient,
      photoUrl: person.photoUrl || photoMeta?.photoUrl || null,
      title: person.title || photoMeta?.title || null
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
  return people.slice(0, lim);
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

function upsertClientRow(map, c, agencyId, agencyName) {
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
    portalAccess: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
    smsOptIn: smsOk,
    occurredAt: c.last_at || null,
    agencyId,
    agencyName,
    clientStatusKey: c.client_status_key || null,
    clientType: c.client_type || null,
    userId: c.user_id || null
  });
}

const CLIENT_SELECT_CORE = `c.id, c.agency_id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled, c.client_type, c.user_id,
                cs.status_key AS client_status_key`;
const CLIENT_SELECT_ONE = `c.id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled, c.client_type, c.user_id,
                cs.status_key AS client_status_key`;
const CLIENT_FROM_JOIN = `FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id`;

/**
 * Browse people without knowing a name: caseload and/or recent activity.
 * Supports multiple agencies so staff see DMs/clients across every tenant they belong to.
 * browse: 'caseload' | 'recent' | 'suggested' (caseload + recent, default)
 */
export async function browseHubPeople({ agencyId, agencyIds = null, userId, browse = 'suggested', limit = 30 }) {
  const ids = [...new Set((agencyIds?.length ? agencyIds : [agencyId]).map(Number).filter((n) => n > 0))];
  if (!ids.length || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 80);
  const mode = String(browse || 'suggested').toLowerCase();
  const nameMap = await loadAgencyNameMap(ids);
  const inboxByAgency = await buildInboxMap(ids, userId);
  const map = new Map();
  const ph = ids.map(() => '?').join(',');

  const wantCaseload = mode === 'caseload' || mode === 'suggested';
  const wantRecent = mode === 'recent' || mode === 'suggested';

  if (wantCaseload) {
    try {
      const [rows] = await pool.execute(
        `SELECT ${CLIENT_SELECT_CORE}
         ${CLIENT_FROM_JOIN}
         WHERE c.agency_id IN (${ph})
           AND (c.compliance_archived_at IS NULL)
           AND (
             c.provider_id = ?
             OR EXISTS (
               SELECT 1 FROM client_provider_assignments cpa
               WHERE cpa.client_id = c.id
                 AND cpa.provider_user_id = ?
                 AND cpa.is_active = 1
             )
           )
         ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
         LIMIT ${lim}`,
        [...ids, userId, userId]
      );
      for (const c of rows || []) {
        const aid = Number(c.agency_id);
        upsertClientRow(map, c, aid, nameMap.get(aid) || null);
      }
    } catch {
      try {
        const [rows] = await pool.execute(
          `SELECT ${CLIENT_SELECT_CORE}
           ${CLIENT_FROM_JOIN}
           WHERE c.agency_id IN (${ph})
             AND (
               c.provider_id = ?
               OR EXISTS (
                 SELECT 1 FROM client_provider_assignments cpa
                 WHERE cpa.client_id = c.id
                   AND cpa.provider_user_id = ?
                   AND cpa.is_active = 1
               )
             )
           ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
           LIMIT ${lim}`,
          [...ids, userId, userId]
        );
        for (const c of rows || []) {
          const aid = Number(c.agency_id);
          upsertClientRow(map, c, aid, nameMap.get(aid) || null);
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
        const agencyName = nameMap.get(aid) || null;
        if (r.client_id) {
          const [clients] = await pool.execute(
            `SELECT ${CLIENT_SELECT_ONE}
             ${CLIENT_FROM_JOIN}
             WHERE c.id = ? AND c.agency_id = ? LIMIT 1`,
            [r.client_id, aid]
          );
          if (clients?.[0]) upsertClientRow(map, { ...clients[0], last_at: r.last_at }, aid, agencyName);
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
            agencyName: nameMap.get(aid) || person.agencyName || null
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return finalizePeople(map, inboxByAgency, lim, {
    sortRecent: mode === 'recent' || mode === 'suggested'
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
    const agencyName = nameMap.get(aid) || null;
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
      upsertClientRow(map, c, aid, agencyName);
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
  const agencyName = nameMap.get(Number(resolvedAgencyId)) || null;
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
              role
       FROM users WHERE id = ? LIMIT 1`,
      [parsed.id]
    );
    const u = rows?.[0];
    if (!u) return null;
    const role = String(u.role || '').toLowerCase();
    const kinds =
      role === 'client_guardian'
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
      relationshipMeta: role,
      portalAccess: true
    };
    if (role === 'client') {
      try {
        const [links] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials, c.client_type, c.contact_phone, c.email AS client_email,
                  cs.status_key AS client_status_key
           FROM clients c
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           WHERE c.user_id = ? AND c.agency_id = ?
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
    } else if (role === 'client_guardian') {
      try {
        const [links] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials, c.client_type, cs.status_key AS client_status_key
           FROM client_guardians cg
           INNER JOIN clients c ON c.id = cg.client_id
           LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
           WHERE cg.guardian_user_id = ? AND c.agency_id = ? AND cg.access_enabled = 1
           LIMIT 1`,
          [u.id, resolvedAgencyId]
        );
        if (links?.[0]) {
          seed.clientId = links[0].id;
          seed.clientType = links[0].client_type || null;
          seed.clientStatusKey = links[0].client_status_key || null;
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
      portalAccess: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
      smsOptIn: !!c.contact_phone && !smsDenied,
      clientStatusKey: c.client_status_key || null,
      clientType: c.client_type || null
    };
  } else if (parsed.type === 'contact') {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, client_id FROM agency_contacts
       WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
      [parsed.id, resolvedAgencyId]
    );
    const c = rows?.[0];
    if (!c) return null;
    seed = {
      ...seed,
      displayName: c.full_name || c.email || c.phone,
      kinds: ['contact', 'external'],
      contactId: c.id,
      clientId: c.client_id,
      email: c.email,
      phone: c.phone,
      relationshipMeta: 'Agency contact',
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

  const hasAppInbox = await actorHasAppInbox(resolvedAgencyId, userId);
  const { methods, preferredMethod, secureDefault, isActiveClient } = buildMethods({
    kinds: seed.kinds,
    hasUserId: !!seed.userId,
    hasPhone: !!seed.phone,
    smsOk: seed.smsOptIn,
    hasEmail: !!seed.email,
    hasAppInbox,
    clientStatusKey: seed.clientStatusKey,
    clientType: seed.clientType
  });

  let photoUrl = null;
  let title = seed.title || null;
  if (seed.userId) {
    try {
      const [pr] = await pool.execute(
        `SELECT profile_photo_path, title FROM users WHERE id = ? LIMIT 1`,
        [seed.userId]
      );
      const { publicUploadsUrlFromStoredPath } = await import('../utils/uploads.js');
      photoUrl = publicUploadsUrlFromStoredPath(pr?.[0]?.profile_photo_path) || null;
      title = title || pr?.[0]?.title || null;
    } catch {
      /* ignore */
    }
  }

  return { ...seed, methods, preferredMethod, secureDefault, isActiveClient, photoUrl, title };
}

async function loadChatTimeline({ agencyId, actorUserId, otherUserId, limit = 40 }) {
  if (!otherUserId) return [];
  try {
    const [threadRows] = await pool.execute(
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
    const threadId = threadRows?.[0]?.thread_id;
    if (!threadId) return [];
    const [rows] = await pool.execute(
      `SELECT m.id, m.body, m.body_ciphertext, m.body_iv, m.body_auth_tag, m.created_at, m.sender_user_id
       FROM chat_messages m
       WHERE m.thread_id = ?
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${Math.min(limit, 80)}`,
      [threadId]
    );
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
      items.push({
        id: `chat-${m.id}`,
        channel: 'secure',
        bodyPreview: String(body || '').slice(0, 400),
        createdAt: m.created_at,
        direction: Number(m.sender_user_id) === Number(actorUserId) ? 'outbound' : 'inbound',
        meta: { threadId, messageId: m.id }
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
              m.sent_at, m.created_at, c.subject AS conv_subject,
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
       ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
       LIMIT ${Math.min(limit, 80)}`,
      [agencyId, normalized, actorUserId]
    );
    return (rows || []).map((r) => {
      const dir = String(r.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
      const preview = String(r.body_text || r.subject || r.conv_subject || '').slice(0, 400);
      return {
        id: `email-msg-${r.message_id}`,
        channel: 'email',
        bodyPreview: preview,
        createdAt: r.sent_at || r.created_at,
        direction: dir,
        meta: {
          conversationId: r.conversation_id,
          messageId: r.message_id,
          subject: r.subject || r.conv_subject,
          openedAt: r.opened_at || null,
          deliveredAt: r.delivered_at || null,
          userCommunicationId: r.user_communication_id || null,
          inboxKey: r.inbox_key || null
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
  fromAliasIdentityId = null
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

  const result = await composeNewEmail({
    agencyId: aid,
    inboxId: inbox.id,
    userId,
    payload: {
      to: [{ email: person.email, name: person.displayName }],
      cc: normalizeList(cc),
      bcc: normalizeList(bcc),
      subject: subject || `Message from ${agencyName}`,
      text: body,
      html,
      attachments: Array.isArray(attachments) ? attachments : null,
      fromDisplayName: senderDisplayName,
      replyTo,
      skipUndo: true,
      clientId: person.clientId || null,
      templateType: 'hub_email'
    }
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

  return {
    channel: 'email',
    threadRef: { conversationId },
    fromEmail: mailboxes.messages?.from_email || null
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

  // Email ping is the primary notify channel for reactions (in-app table types are constrained).

  if (notifyEmail) {
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
  const threadId = await findOrCreateDirectThread(agencyId, null, userId, otherUserId);
  return threadId;
}
