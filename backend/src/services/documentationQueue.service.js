import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function resolveAccessibleAgencyIds(reqUser, requestedAgencyId = null) {
  const role = String(reqUser?.role || '').toLowerCase();
  let agencyIds = [];
  if (role === 'super_admin') {
    const allAgencies = await Agency.findAll(true, false);
    agencyIds = (allAgencies || []).map((a) => Number(a.id)).filter((id) => id > 0);
  } else {
    const userAgencies = await User.getAgencies(reqUser.id);
    agencyIds = (userAgencies || []).map((a) => Number(a.id)).filter((id) => id > 0);
  }
  const requested = parseIntValue(requestedAgencyId);
  if (requested) {
    if (role !== 'super_admin' && !agencyIds.includes(requested)) {
      const err = new Error('You do not have access to this agency');
      err.status = 403;
      throw err;
    }
    return [requested];
  }
  return agencyIds;
}

async function loadNoteStatusBySession(sessionIds = []) {
  const ids = [...new Set((sessionIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await clinicalPool.execute(
    `SELECT id, clinical_session_id, title, provider_signed_at, created_at
     FROM clinical_notes
     WHERE clinical_session_id IN (${placeholders}) AND is_deleted = 0
     ORDER BY created_at DESC`,
    ids
  );
  for (const note of rows || []) {
    const sid = Number(note.clinical_session_id || 0);
    if (!sid || map.has(sid)) continue;
    let noteStatus = 'none';
    if (note.provider_signed_at) noteStatus = 'signed';
    else if (note.id) noteStatus = 'draft';
    map.set(sid, {
      clinicalNoteId: Number(note.id),
      noteStatus,
      noteTitle: note.title || null
    });
  }
  return map;
}

async function hydrateMainDbContext(rows = []) {
  const clientIds = [...new Set(rows.map((r) => Number(r.client_id || 0)).filter(Boolean))];
  const agencyIds = [...new Set(rows.map((r) => Number(r.agency_id || 0)).filter(Boolean))];
  const providerIds = [
    ...new Set(
      rows
        .flatMap((r) => [Number(r.provider_user_id || 0), Number(r.rendering_provider_user_id || 0)])
        .filter(Boolean)
    )
  ];
  const officeEventIds = [...new Set(rows.map((r) => Number(r.office_event_id || 0)).filter(Boolean))];
  const billingIds = [...new Set(rows.map((r) => Number(r.billing_encounter_id || 0)).filter(Boolean))];

  const clientsById = new Map();
  const agenciesById = new Map();
  const providersById = new Map();
  const eventsById = new Map();
  const billingById = new Map();

  if (clientIds.length) {
    const ph = clientIds.map(() => '?').join(', ');
    const [cRows] = await pool.execute(
      `SELECT id, agency_id, full_name, initials, identifier_code, organization_id
       FROM clients WHERE id IN (${ph})`,
      clientIds
    );
    for (const c of cRows || []) clientsById.set(Number(c.id), c);
  }
  if (agencyIds.length) {
    const ph = agencyIds.map(() => '?').join(', ');
    const [aRows] = await pool.execute(
      `SELECT id, name FROM agencies WHERE id IN (${ph})`,
      agencyIds
    );
    for (const a of aRows || []) agenciesById.set(Number(a.id), a);
  }
  if (providerIds.length) {
    const ph = providerIds.map(() => '?').join(', ');
    const [uRows] = await pool.execute(
      `SELECT id, first_name, last_name FROM users WHERE id IN (${ph})`,
      providerIds
    );
    for (const u of uRows || []) providersById.set(Number(u.id), u);
  }
  if (officeEventIds.length) {
    const ph = officeEventIds.map(() => '?').join(', ');
    try {
      const [eRows] = await pool.execute(
        `SELECT id, start_at, end_at, service_code, clinical_session_id, client_id
         FROM office_events WHERE id IN (${ph})`,
        officeEventIds
      );
      for (const e of eRows || []) eventsById.set(Number(e.id), e);
    } catch {
      // office_events.service_code may vary by migration
    }
  }
  if (billingIds.length) {
    const ph = billingIds.map(() => '?').join(', ');
    try {
      const [bRows] = await pool.execute(
        `SELECT id, service_date, service_code, clinical_session_id, client_id
         FROM billing_encounters WHERE id IN (${ph})`,
        billingIds
      );
      for (const b of bRows || []) billingById.set(Number(b.id), b);
    } catch {
      // optional
    }
  }

  return { clientsById, agenciesById, providersById, eventsById, billingById };
}

function providerDisplayName(user) {
  if (!user) return null;
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || null;
}

/**
 * List sessions needing documentation across the user's affiliated tenants.
 * Dual-DB: clinical_sessions/notes in clinical DB; clients/events in main DB.
 */
export async function listDocumentationQueue({
  reqUser,
  agencyId = null,
  clientId = null,
  providerUserId = null,
  fromDos = null,
  toDos = null,
  noteStatus = 'undocumented',
  search = '',
  limit = 100
} = {}) {
  const agencyIds = await resolveAccessibleAgencyIds(reqUser, agencyId);
  if (!agencyIds.length) return [];

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const cid = parseIntValue(clientId);
  const pid = parseIntValue(providerUserId);
  const from = toDateOnly(fromDos);
  const to = toDateOnly(toDos);
  const q = String(search || '').trim().toLowerCase();

  const agencyPh = agencyIds.map(() => '?').join(', ');
  const params = [...agencyIds];
  let sql = `
    SELECT cs.id AS clinical_session_id,
           cs.agency_id,
           cs.client_id,
           cs.office_event_id,
           cs.billing_encounter_id,
           cs.provider_user_id,
           cs.rendering_provider_user_id,
           cs.service_code,
           cs.effective_service_code,
           cs.scheduled_start_at,
           cs.scheduled_end_at,
           cs.encounter_status
    FROM clinical_sessions cs
    WHERE cs.agency_id IN (${agencyPh})
  `;
  if (cid) {
    sql += ' AND cs.client_id = ?';
    params.push(cid);
  }
  if (pid) {
    sql += ' AND (cs.provider_user_id = ? OR cs.rendering_provider_user_id = ?)';
    params.push(pid, pid);
  }
  if (from) {
    sql += ' AND DATE(cs.scheduled_start_at) >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND DATE(cs.scheduled_start_at) <= ?';
    params.push(to);
  }
  sql += ' ORDER BY cs.scheduled_start_at DESC, cs.id DESC LIMIT ?';
  params.push(lim * 3); // over-fetch before note-status filter

  let sessions = [];
  try {
    const [rows] = await clinicalPool.execute(sql, params);
    sessions = rows || [];
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      // Older clinical schema without billing_encounter_id / effective_service_code
      const fallbackSql = `
        SELECT cs.id AS clinical_session_id,
               cs.agency_id,
               cs.client_id,
               cs.office_event_id,
               NULL AS billing_encounter_id,
               cs.provider_user_id,
               cs.rendering_provider_user_id,
               cs.service_code,
               NULL AS effective_service_code,
               cs.scheduled_start_at,
               cs.scheduled_end_at,
               cs.encounter_status
        FROM clinical_sessions cs
        WHERE cs.agency_id IN (${agencyPh})
        ${cid ? ' AND cs.client_id = ?' : ''}
        ${pid ? ' AND (cs.provider_user_id = ? OR cs.rendering_provider_user_id = ?)' : ''}
        ${from ? ' AND DATE(cs.scheduled_start_at) >= ?' : ''}
        ${to ? ' AND DATE(cs.scheduled_start_at) <= ?' : ''}
        ORDER BY cs.scheduled_start_at DESC, cs.id DESC
        LIMIT ?
      `;
      const [rows] = await clinicalPool.execute(fallbackSql, params);
      sessions = rows || [];
    } else {
      throw e;
    }
  }

  const noteMap = await loadNoteStatusBySession(sessions.map((s) => s.clinical_session_id));
  const hydrated = await hydrateMainDbContext(sessions);

  const statusFilter = String(noteStatus || 'undocumented').toLowerCase();
  const out = [];

  for (const s of sessions) {
    const sid = Number(s.clinical_session_id);
    const note = noteMap.get(sid) || { clinicalNoteId: null, noteStatus: 'none', noteTitle: null };
    if (statusFilter === 'undocumented') {
      if (note.noteStatus === 'signed') continue;
    } else if (statusFilter !== 'all' && note.noteStatus !== statusFilter) {
      continue;
    }

    const client = hydrated.clientsById.get(Number(s.client_id)) || null;
    const agency = hydrated.agenciesById.get(Number(s.agency_id)) || null;
    const providerId = Number(s.rendering_provider_user_id || s.provider_user_id || 0) || null;
    const provider = providerId ? hydrated.providersById.get(providerId) : null;
    const event = Number(s.office_event_id) ? hydrated.eventsById.get(Number(s.office_event_id)) : null;
    const billing = Number(s.billing_encounter_id)
      ? hydrated.billingById.get(Number(s.billing_encounter_id))
      : null;

    const dateOfService =
      toDateOnly(s.scheduled_start_at) ||
      toDateOnly(event?.start_at) ||
      toDateOnly(billing?.service_date) ||
      null;

    const serviceCode = String(
      s.effective_service_code || s.service_code || event?.service_code || billing?.service_code || ''
    )
      .trim()
      .toUpperCase() || null;

    const clientName = String(client?.full_name || '').trim() || null;
    const clientInitials = String(client?.initials || '').trim() || null;
    const agencyName = String(agency?.name || '').trim() || null;

    if (q) {
      const hay = [
        clientName,
        clientInitials,
        agencyName,
        serviceCode,
        String(s.client_id),
        String(client?.identifier_code || '')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    out.push({
      clinicalSessionId: sid,
      officeEventId: Number(s.office_event_id || 0) || null,
      billingEncounterId: Number(s.billing_encounter_id || 0) || null,
      agencyId: Number(s.agency_id),
      agencyName,
      clientId: Number(s.client_id),
      clientName,
      clientInitials,
      identifierCode: client?.identifier_code || null,
      dateOfService,
      serviceCode,
      providerUserId: providerId,
      providerName: providerDisplayName(provider),
      noteStatus: note.noteStatus,
      clinicalNoteId: note.clinicalNoteId,
      noteTitle: note.noteTitle,
      encounterStatus: s.encounter_status || null,
      scheduledStartAt: s.scheduled_start_at || null
    });

    if (out.length >= lim) break;
  }

  // Default: missing notes first, then by DOS ascending (oldest undocumented first)
  out.sort((a, b) => {
    const rank = (st) => (st === 'none' ? 0 : st === 'draft' ? 1 : 2);
    const r = rank(a.noteStatus) - rank(b.noteStatus);
    if (r !== 0) return r;
    const da = a.dateOfService || '';
    const db = b.dateOfService || '';
    if (da !== db) return da < db ? -1 : 1;
    return Number(a.clinicalSessionId) - Number(b.clinicalSessionId);
  });

  return out;
}

export default { listDocumentationQueue };
