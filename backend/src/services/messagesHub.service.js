/**
 * People-first Messaging Hub: search, method availability, timeline merge, send dispatch helpers.
 */
import pool from '../config/database.js';
import { searchCommunicationDirectory } from './communicationDirectory.service.js';
import { findPersonalInbox, ensurePersonalMailbox } from './personalMailbox.service.js';
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

export function parsePersonKey(personKey) {
  const raw = String(personKey || '').trim();
  const m = raw.match(/^(user|client|contact|email|phone):(.+)$/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const value = m[2].trim();
  if (type === 'user' || type === 'client' || type === 'contact') {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { type, id, value };
  }
  return { type, id: null, value };
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
  hasAppInbox = false
}) {
  const isClientish = kinds.includes('client') || kinds.includes('guardian');
  const isStaffish =
    kinds.includes('employee') || kinds.includes('staff') || kinds.includes('school_staff') || kinds.includes('team');
  const isExternal = kinds.includes('external') || kinds.includes('school_contact');

  const secureAvailable = hasUserId && (isClientish || kinds.includes('school_staff'));
  const internalAvailable = hasUserId && (isStaffish || kinds.includes('school_staff'));
  // Guardians can use the same chat thread; label as secure preferred, internal as alternate only for staff
  const internalForGuardian = hasUserId && kinds.includes('guardian');
  const smsAvailable = hasPhone && smsOk && (isClientish || isExternal || kinds.includes('contact'));
  const emailAvailable = hasEmail && hasAppInbox;

  let preferred = null;
  if (isClientish && secureAvailable) preferred = 'secure';
  else if (isStaffish && internalAvailable) preferred = 'internal';
  else if (smsAvailable) preferred = 'sms';
  else if (emailAvailable) preferred = 'email';
  else if (secureAvailable) preferred = 'secure';
  else if (internalAvailable || internalForGuardian) preferred = 'internal';

  return {
    methods: [
      method(
        'secure',
        secureAvailable,
        secureAvailable
          ? 'Secure portal message (client/guardian notify email when applicable)'
          : 'Needs a portal user (client, guardian, or school staff)',
        preferred === 'secure'
      ),
      method(
        'sms',
        smsAvailable,
        smsAvailable ? 'SMS to their phone' : !hasPhone ? 'No phone on file' : 'SMS not available (opt-in / permissions)',
        preferred === 'sms'
      ),
      method(
        'email',
        emailAvailable,
        emailAvailable ? 'Send from your App inbox' : !hasEmail ? 'No email on file' : 'App inbox not available for you',
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
    preferredMethod: preferred
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
              c.id AS client_id, c.full_name AS client_name, c.initials AS client_initials
       FROM users u
       INNER JOIN client_guardians cg ON cg.guardian_user_id = u.id AND cg.access_enabled = 1
       INNER JOIN clients c ON c.id = cg.client_id AND c.agency_id = ?
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
      `SELECT c.id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
              c.session_sms_opt_in, c.guardian_portal_enabled, c.provider_id
       FROM clients c
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
    smsOptIn: false
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
    smsOptIn: !!(patch.smsOptIn || existing.smsOptIn)
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

function finalizePeople(map, hasAppInbox, lim) {
  const people = [];
  for (const person of map.values()) {
    const { methods, preferredMethod } = buildMethods({
      kinds: person.kinds,
      hasUserId: !!person.userId,
      hasPhone: !!person.phone,
      smsOk: person.smsOptIn || (person.kinds.includes('contact') && !!person.phone),
      hasEmail: !!person.email,
      hasAppInbox
    });
    people.push({
      ...person,
      methods,
      preferredMethod
    });
  }
  people.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  return people.slice(0, lim);
}

function upsertClientRow(map, c) {
  const smsDenied = c.session_sms_opt_in === 0 || c.session_sms_opt_in === false;
  const smsOk = !!c.contact_phone && !smsDenied;
  upsertPerson(map, `client:${c.id}`, {
    displayName: clientDisplayName(c),
    kinds: ['client'],
    clientId: c.id,
    email: c.email,
    phone: c.contact_phone,
    relationshipMeta: clientMeta(c),
    portalAccess: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
    smsOptIn: smsOk,
    occurredAt: c.last_at || null
  });
}

/**
 * Browse people without knowing a name: caseload and/or recent activity.
 * browse: 'caseload' | 'recent' | 'suggested' (caseload + recent, default)
 */
export async function browseHubPeople({ agencyId, userId, browse = 'suggested', limit = 30 }) {
  if (!agencyId || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 60);
  const mode = String(browse || 'suggested').toLowerCase();
  const hasAppInbox = await actorHasAppInbox(agencyId, userId);
  const map = new Map();

  const wantCaseload = mode === 'caseload' || mode === 'suggested';
  const wantRecent = mode === 'recent' || mode === 'suggested';

  if (wantCaseload) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled
         FROM clients c
         WHERE c.agency_id = ?
           AND c.provider_id = ?
           AND (c.compliance_archived_at IS NULL)
         ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
         LIMIT ${lim}`,
        [agencyId, userId]
      );
      for (const c of rows || []) upsertClientRow(map, c);
    } catch {
      // If archived column missing, retry without it
      try {
        const [rows] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
                  c.session_sms_opt_in, c.guardian_portal_enabled
           FROM clients c
           WHERE c.agency_id = ? AND c.provider_id = ?
           ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
           LIMIT ${lim}`,
          [agencyId, userId]
        );
        for (const c of rows || []) upsertClientRow(map, c);
      } catch {
        /* ignore */
      }
    }
  }

  if (wantRecent) {
    // Recent SMS partners (clients / contacts this user texted)
    try {
      const [smsRows] = await pool.execute(
        `SELECT ml.client_id, ml.agency_contact_id, MAX(ml.created_at) AS last_at
         FROM message_logs ml
         WHERE ml.agency_id = ?
           AND (ml.user_id = ? OR ml.assigned_user_id = ?)
           AND (ml.client_id IS NOT NULL OR ml.agency_contact_id IS NOT NULL)
         GROUP BY ml.client_id, ml.agency_contact_id
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [agencyId, userId, userId]
      );
      for (const r of smsRows || []) {
        if (r.client_id) {
          const [clients] = await pool.execute(
            `SELECT id, full_name, initials, identifier_code, contact_phone, email,
                    session_sms_opt_in, guardian_portal_enabled
             FROM clients WHERE id = ? AND agency_id = ? LIMIT 1`,
            [r.client_id, agencyId]
          );
          if (clients?.[0]) upsertClientRow(map, { ...clients[0], last_at: r.last_at });
        } else if (r.agency_contact_id) {
          const [contacts] = await pool.execute(
            `SELECT id, full_name, email, phone, client_id FROM agency_contacts
             WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
            [r.agency_contact_id, agencyId]
          );
          const c = contacts?.[0];
          if (c) {
            upsertPerson(map, `contact:${c.id}`, {
              displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
              kinds: ['contact', 'external'],
              contactId: c.id,
              clientId: c.client_id || null,
              email: c.email,
              phone: c.phone,
              relationshipMeta: 'Agency contact',
              smsOptIn: !!c.phone,
              occurredAt: r.last_at
            });
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Recent direct chat partners
    try {
      const [dmRows] = await pool.execute(
        `SELECT other.user_id AS other_user_id, MAX(lm.created_at) AS last_at
         FROM chat_threads t
         INNER JOIN chat_thread_participants me ON me.thread_id = t.id AND me.user_id = ?
         INNER JOIN chat_thread_participants other ON other.thread_id = t.id AND other.user_id <> ?
         LEFT JOIN chat_messages lm ON lm.id = (
           SELECT m.id FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1
         )
         WHERE t.agency_id = ? AND t.thread_type = 'direct'
         GROUP BY other.user_id
         ORDER BY last_at DESC
         LIMIT ${lim}`,
        [userId, userId, agencyId]
      );
      for (const r of dmRows || []) {
        if (!r.other_user_id) continue;
        const person = await resolveHubPerson({
          agencyId,
          userId,
          personKey: `user:${r.other_user_id}`
        });
        if (person) {
          map.set(person.personKey, { ...person, occurredAt: r.last_at });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Caseload empty for admins: fall back to recent agency clients with phone (browseable)
  if (wantCaseload && mode === 'caseload' && map.size === 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.id, c.full_name, c.initials, c.identifier_code, c.contact_phone, c.email,
                c.session_sms_opt_in, c.guardian_portal_enabled
         FROM clients c
         WHERE c.agency_id = ?
           AND c.contact_phone IS NOT NULL AND c.contact_phone <> ''
         ORDER BY COALESCE(c.full_name, c.initials, c.identifier_code) ASC
         LIMIT ${lim}`,
        [agencyId]
      );
      for (const c of rows || []) upsertClientRow(map, c);
    } catch {
      /* ignore */
    }
  }

  const people = finalizePeople(map, hasAppInbox, lim);
  if (mode === 'recent' || mode === 'suggested') {
    people.sort((a, b) => {
      const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  }
  return people.slice(0, lim);
}

/**
 * Search people across directory, guardians, clients, contacts.
 * Matches name, initials, identifier code, email, phone.
 */
export async function searchHubPeople({ agencyId, userId, q, limit = 20 }) {
  const query = String(q || '').trim();
  if (!agencyId || query.length < 2) return [];

  const lim = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const hasAppInbox = await actorHasAppInbox(agencyId, userId);
  const map = new Map();

  const [dir, guardians, clients, contacts] = await Promise.all([
    searchCommunicationDirectory({ agencyId, q: query, limit: lim }),
    searchGuardians({ agencyId, q: query, limit: lim }),
    searchClients({ agencyId, q: query, limit: lim }),
    searchContacts({ agencyId, q: query, limit: lim })
  ]);

  for (const d of dir || []) {
    const kinds =
      d.kind === 'school_staff'
        ? ['school_staff']
        : d.kind === 'school_contact'
          ? ['external', 'school_contact']
          : ['employee', 'staff', 'team'];
    const key = d.kind === 'school_contact' ? `email:${String(d.email || '').toLowerCase()}` : `user:${d.id}`;
    upsertPerson(map, key, {
      displayName: d.name,
      kinds,
      userId: d.kind === 'school_contact' ? null : d.id,
      email: d.email,
      relationshipMeta: d.meta || d.role || null,
      portalAccess: d.kind !== 'school_contact'
    });
  }

  for (const g of guardians) {
    const clientLabel = g.client_name || g.client_initials || `Client #${g.client_id}`;
    upsertPerson(map, `user:${g.id}`, {
      displayName: [g.first_name, g.last_name].filter(Boolean).join(' ') || g.email,
      kinds: ['guardian'],
      userId: g.id,
      clientId: g.client_id,
      email: g.email,
      phone: g.phone,
      relationshipMeta: `Guardian of ${clientLabel}`,
      portalAccess: true,
      smsOptIn: !!g.phone
    });
  }

  for (const c of clients) {
    upsertClientRow(map, c);
  }

  for (const c of contacts) {
    upsertPerson(map, `contact:${c.id}`, {
      displayName: c.full_name || c.email || c.phone || `Contact #${c.id}`,
      kinds: ['contact', 'external'],
      contactId: c.id,
      clientId: c.client_id || null,
      email: c.email,
      phone: c.phone,
      relationshipMeta: 'Agency contact',
      smsOptIn: !!c.phone
    });
  }

  return finalizePeople(map, hasAppInbox, lim);
}

/**
 * Resolve a personKey to hydrated person + methods (for selection / send).
 */
export async function resolveHubPerson({ agencyId, userId, personKey }) {
  const parsed = parsePersonKey(personKey);
  if (!parsed) return null;

  let seed = {
    personKey,
    displayName: '',
    kinds: [],
    userId: null,
    clientId: null,
    contactId: null,
    email: null,
    phone: null,
    relationshipMeta: null,
    portalAccess: false,
    smsOptIn: false
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
    if (role === 'client_guardian') {
      try {
        const [links] = await pool.execute(
          `SELECT c.id, c.full_name, c.initials
           FROM client_guardians cg
           INNER JOIN clients c ON c.id = cg.client_id
           WHERE cg.guardian_user_id = ? AND c.agency_id = ? AND cg.access_enabled = 1
           LIMIT 1`,
          [u.id, agencyId]
        );
        if (links?.[0]) {
          seed.clientId = links[0].id;
          seed.relationshipMeta = `Guardian of ${links[0].full_name || links[0].initials || links[0].id}`;
        }
      } catch {
        /* ignore */
      }
      seed.smsOptIn = !!seed.phone;
    }
  } else if (parsed.type === 'client') {
    const [rows] = await pool.execute(
      `SELECT id, full_name, initials, identifier_code, contact_phone, email,
              session_sms_opt_in, guardian_portal_enabled
       FROM clients WHERE id = ? AND agency_id = ? LIMIT 1`,
      [parsed.id, agencyId]
    );
    const c = rows?.[0];
    if (!c) return null;
    const smsDenied = c.session_sms_opt_in === 0 || c.session_sms_opt_in === false;
    seed = {
      ...seed,
      displayName: c.full_name || c.initials || `Client #${c.id}`,
      kinds: ['client'],
      clientId: c.id,
      email: c.email,
      phone: c.contact_phone,
      relationshipMeta: c.identifier_code || 'Client',
      portalAccess: !!(c.guardian_portal_enabled === 1 || c.guardian_portal_enabled === true),
      smsOptIn: !!c.contact_phone && !smsDenied
    };
  } else if (parsed.type === 'contact') {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, client_id FROM agency_contacts
       WHERE id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
      [parsed.id, agencyId]
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

  const hasAppInbox = await actorHasAppInbox(agencyId, userId);
  const { methods, preferredMethod } = buildMethods({
    kinds: seed.kinds,
    hasUserId: !!seed.userId,
    hasPhone: !!seed.phone,
    smsOk: seed.smsOptIn,
    hasEmail: !!seed.email,
    hasAppInbox
  });

  return { ...seed, methods, preferredMethod };
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
    const inbox = await findPersonalInbox({ agencyId, userId: actorUserId });
    if (!inbox?.id) return [];
    const [rows] = await pool.execute(
      `SELECT c.id, c.subject, c.last_message_at, c.last_message_preview, c.created_at, c.status
       FROM communication_conversations c
       WHERE c.agency_id = ?
         AND c.inbox_id = ?
         AND c.channel = 'email'
         AND EXISTS (
           SELECT 1 FROM communication_participants p
           WHERE p.conversation_id = c.id
             AND LOWER(COALESCE(p.email, '')) = ?
         )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT ${Math.min(limit, 40)}`,
      [agencyId, inbox.id, normalized]
    );
    return (rows || []).map((r) => ({
      id: `email-${r.id}`,
      channel: 'email',
      bodyPreview: String(r.last_message_preview || r.subject || '').slice(0, 400),
      createdAt: r.last_message_at || r.created_at,
      direction: 'outbound',
      meta: { conversationId: r.id, subject: r.subject, status: r.status }
    }));
  } catch {
    return [];
  }
}

/**
 * Merge-on-read timeline for a person.
 */
export async function getHubPersonTimeline({ agencyId, userId, personKey, limit = 60 }) {
  const person = await resolveHubPerson({ agencyId, userId, personKey });
  if (!person) return { person: null, items: [] };

  const [chat, sms, email] = await Promise.all([
    loadChatTimeline({
      agencyId,
      actorUserId: userId,
      otherUserId: person.userId,
      limit
    }),
    loadSmsTimeline({
      agencyId,
      actorUserId: userId,
      clientId: person.clientId,
      contactId: person.contactId,
      limit
    }),
    loadEmailTimeline({
      agencyId,
      actorUserId: userId,
      email: person.email,
      limit
    })
  ]);

  // Fix channel labels: if person is staff-only, chat items are internal
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

export async function sendHubEmail({ agencyId, userId, person, body, subject }) {
  if (!person.email) {
    const err = new Error('Person has no email address');
    err.status = 400;
    throw err;
  }
  let inbox = await findPersonalInbox({ agencyId, userId });
  if (!inbox) {
    inbox = await ensurePersonalMailbox({ agencyId, userId });
  }
  if (!inbox?.id) {
    const err = new Error('Could not provision App inbox');
    err.status = 400;
    throw err;
  }
  const result = await composeNewEmail({
    agencyId,
    inboxId: inbox.id,
    userId,
    payload: {
      to: [{ email: person.email, name: person.displayName }],
      subject: subject || `Message from ${person.displayName ? 'your team' : 'PlotTwist'}`,
      text: body
    }
  });
  return { channel: 'email', threadRef: { conversationId: result?.id || result?.conversation?.id || null } };
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
