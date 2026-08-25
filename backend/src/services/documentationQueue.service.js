import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { enrichEncountersWithNoteSummary } from './billingEncounterClinical.service.js';

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

export function isClinicalDbConnectionError(err) {
  const code = String(err?.code || err?.errno || '').trim();
  const msg = String(err?.message || err?.sqlMessage || '').toLowerCase();
  return (
    code === 'ECONNREFUSED'
    || code === 'ER_ACCESS_DENIED_ERROR'
    || code === 'ER_ACCESS_DENIED'
    || code === 'ENOTFOUND'
    || code === 'ETIMEDOUT'
    || code === 'PROTOCOL_CONNECTION_LOST'
    || code === 'ER_BAD_DB_ERROR'
    || msg.includes('connect econnrefused')
    || msg.includes('access denied')
  );
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

function isMissingColumnError(err) {
  return err?.code === 'ER_BAD_FIELD_ERROR' || /unknown column/i.test(String(err?.message || err?.sqlMessage || ''));
}

async function loadNoteStatusBySession(sessionIds = []) {
  const ids = [...new Set((sessionIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(', ');
  const noteQueries = [
    `SELECT id, clinical_session_id, title, provider_signed_at, created_at
     FROM clinical_notes
     WHERE clinical_session_id IN (${placeholders}) AND is_deleted = 0
     ORDER BY created_at DESC`,
    `SELECT id, clinical_session_id, title, created_at
     FROM clinical_notes
     WHERE clinical_session_id IN (${placeholders}) AND is_deleted = 0
     ORDER BY created_at DESC`
  ];
  for (const sql of noteQueries) {
    try {
      const [rows] = await clinicalPool.execute(sql, ids);
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
    } catch (e) {
      if (isClinicalDbConnectionError(e)) return map;
      if (isMissingColumnError(e)) continue;
      throw e;
    }
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
      // optional columns vary by migration
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

function sessionRowKey(row) {
  const sid = Number(row.clinical_session_id || 0);
  if (sid) return `s:${sid}`;
  const eid = Number(row.office_event_id || 0);
  if (eid) return `e:${eid}`;
  const bid = Number(row.billing_encounter_id || 0);
  if (bid) return `b:${bid}`;
  return `x:${row.client_id}:${row.scheduled_start_at}`;
}

async function listSessionsFromClinicalDb({
  agencyIds,
  cid,
  pid,
  from,
  to,
  lim
}) {
  const agencyPh = agencyIds.map(() => '?').join(', ');
  const baseParams = [...agencyIds];
  if (cid) baseParams.push(cid);
  if (from) baseParams.push(from);
  if (to) baseParams.push(to);

  const variants = [
    {
      select: `
        cs.id AS clinical_session_id,
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
        cs.encounter_status`,
      providerSql: pid ? ' AND (cs.provider_user_id = ? OR cs.rendering_provider_user_id = ?)' : '',
      providerParams: pid ? [pid, pid] : []
    },
    {
      select: `
        cs.id AS clinical_session_id,
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
        cs.encounter_status`,
      providerSql: pid ? ' AND (cs.provider_user_id = ? OR cs.rendering_provider_user_id = ?)' : '',
      providerParams: pid ? [pid, pid] : []
    },
    {
      select: `
        cs.id AS clinical_session_id,
        cs.agency_id,
        cs.client_id,
        cs.office_event_id,
        NULL AS billing_encounter_id,
        cs.provider_user_id,
        NULL AS rendering_provider_user_id,
        cs.service_code,
        NULL AS effective_service_code,
        cs.scheduled_start_at,
        cs.scheduled_end_at,
        NULL AS encounter_status`,
      providerSql: pid ? ' AND cs.provider_user_id = ?' : '',
      providerParams: pid ? [pid] : []
    },
    {
      select: `
        cs.id AS clinical_session_id,
        cs.agency_id,
        cs.client_id,
        cs.office_event_id,
        NULL AS billing_encounter_id,
        cs.provider_user_id,
        NULL AS rendering_provider_user_id,
        NULL AS service_code,
        NULL AS effective_service_code,
        cs.scheduled_start_at,
        cs.scheduled_end_at,
        NULL AS encounter_status`,
      providerSql: pid ? ' AND cs.provider_user_id = ?' : '',
      providerParams: pid ? [pid] : []
    }
  ];

  const filterSql = [
    cid ? ' AND cs.client_id = ?' : '',
    from ? ' AND DATE(cs.scheduled_start_at) >= ?' : '',
    to ? ' AND DATE(cs.scheduled_start_at) <= ?' : ''
  ].join('');
  const fetchLimit = lim * 3;

  let lastError = null;
  for (const variant of variants) {
    const params = [...baseParams, ...variant.providerParams];
    const sql = `
      SELECT ${variant.select}
      FROM clinical_sessions cs
      WHERE cs.agency_id IN (${agencyPh})
      ${filterSql}
      ${variant.providerSql}
      ORDER BY cs.scheduled_start_at DESC, cs.id DESC
      LIMIT ${fetchLimit}
    `;
    try {
      const [rows] = await clinicalPool.execute(sql, params);
      return { sessions: rows || [], clinicalUnavailable: false };
    } catch (e) {
      lastError = e;
      if (isClinicalDbConnectionError(e)) {
        return { sessions: [], clinicalUnavailable: true };
      }
      if (isMissingColumnError(e)) continue;
      throw e;
    }
  }

  if (lastError && isMissingColumnError(lastError)) {
    console.warn('[documentationQueue] clinical_sessions schema behind migrations; using main DB fallback');
    return { sessions: [], clinicalUnavailable: true };
  }
  if (lastError) throw lastError;
  return { sessions: [], clinicalUnavailable: false };
}

async function listSessionsFromMainDb({
  agencyIds,
  cid,
  pid,
  from,
  to,
  lim
}) {
  const agencyPh = agencyIds.map(() => '?').join(', ');
  const fetchLimit = lim * 3;
  const rows = [];
  const seen = new Set();

  const pushRow = (row) => {
    const key = sessionRowKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const eventParams = [...agencyIds];
  let eventSql = `
    SELECT oe.clinical_session_id,
           oe.id AS office_event_id,
           NULL AS billing_encounter_id,
           c.agency_id,
           oe.client_id,
           COALESCE(oe.booked_provider_id, oe.assigned_provider_id) AS provider_user_id,
           NULL AS rendering_provider_user_id,
           oe.service_code,
           NULL AS effective_service_code,
           oe.start_at AS scheduled_start_at,
           oe.end_at AS scheduled_end_at,
           oe.status AS encounter_status
    FROM office_events oe
    INNER JOIN clients c ON c.id = oe.client_id
    WHERE c.agency_id IN (${agencyPh})
      AND oe.client_id IS NOT NULL
      AND UPPER(COALESCE(oe.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'RELEASED')
  `;
  if (cid) {
    eventSql += ' AND oe.client_id = ?';
    eventParams.push(cid);
  }
  if (pid) {
    eventSql += ' AND (oe.booked_provider_id = ? OR oe.assigned_provider_id = ?)';
    eventParams.push(pid, pid);
  }
  if (from) {
    eventSql += ' AND DATE(oe.start_at) >= ?';
    eventParams.push(from);
  }
  if (to) {
    eventSql += ' AND DATE(oe.start_at) <= ?';
    eventParams.push(to);
  }
  eventSql += ` ORDER BY oe.start_at DESC LIMIT ${fetchLimit}`;

  try {
    const [eventRows] = await pool.execute(eventSql, eventParams);
    for (const r of eventRows || []) pushRow(r);
  } catch (e) {
    console.warn('[documentationQueue] office_events fallback failed:', e?.message || e);
  }

  const billingParams = [...agencyIds];
  let billingSql = `
    SELECT be.clinical_session_id,
           NULL AS office_event_id,
           be.id AS billing_encounter_id,
           be.agency_id,
           be.client_id,
           be.provider_user_id,
           NULL AS rendering_provider_user_id,
           be.service_code,
           NULL AS effective_service_code,
           be.service_date AS scheduled_start_at,
           NULL AS scheduled_end_at,
           NULL AS encounter_status
    FROM billing_encounters be
    WHERE be.agency_id IN (${agencyPh})
  `;
  if (cid) {
    billingSql += ' AND be.client_id = ?';
    billingParams.push(cid);
  }
  if (pid) {
    billingSql += ' AND be.provider_user_id = ?';
    billingParams.push(pid);
  }
  if (from) {
    billingSql += ' AND be.service_date >= ?';
    billingParams.push(from);
  }
  if (to) {
    billingSql += ' AND be.service_date <= ?';
    billingParams.push(to);
  }
  billingSql += ` ORDER BY be.service_date DESC, be.id DESC LIMIT ${fetchLimit}`;

  try {
    const [billingRows] = await pool.execute(billingSql, billingParams);
    for (const r of billingRows || []) pushRow(r);
  } catch (e) {
    console.warn('[documentationQueue] billing_encounters fallback failed:', e?.message || e);
  }

  rows.sort((a, b) => {
    const da = toDateOnly(a.scheduled_start_at) || '';
    const db = toDateOnly(b.scheduled_start_at) || '';
    if (da !== db) return da < db ? 1 : -1;
    return 0;
  });

  return rows.slice(0, fetchLimit);
}

function documentationQueueSearchHaystack({
  clientName,
  clientInitials,
  agencyName,
  serviceCode,
  dateOfService,
  clientId,
  identifierCode
} = {}) {
  const parts = [
    clientName,
    clientInitials,
    agencyName,
    serviceCode,
    dateOfService,
    String(clientId || ''),
    String(identifierCode || '')
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  const dos = String(dateOfService || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dos)) {
    const [, mm, dd] = dos.split('-');
    parts.push(`${mm}-${dd}`, `${mm}/${dd}`);
  }
  return parts.join(' ');
}

function buildQueueItems({
  sessions,
  noteMap,
  hydrated,
  statusFilter,
  q,
  lim
}) {
  const out = [];

  for (const s of sessions) {
    const sid = Number(s.clinical_session_id || 0);
    const note = sid
      ? (noteMap.get(sid) || { clinicalNoteId: null, noteStatus: 'none', noteTitle: null })
      : { clinicalNoteId: null, noteStatus: 'none', noteTitle: null };

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
      toDateOnly(s.scheduled_start_at)
      || toDateOnly(event?.start_at)
      || toDateOnly(billing?.service_date)
      || null;

    const serviceCode = String(
      s.effective_service_code || s.service_code || event?.service_code || billing?.service_code || ''
    )
      .trim()
      .toUpperCase() || null;

    const clientName = String(client?.full_name || '').trim() || null;
    const clientInitials = String(client?.initials || '').trim() || null;
    const agencyName = String(agency?.name || '').trim() || null;

    if (q) {
      const hay = documentationQueueSearchHaystack({
        clientName,
        clientInitials,
        agencyName,
        serviceCode,
        dateOfService,
        clientId: s.client_id,
        identifierCode: client?.identifier_code || ''
      });
      if (!hay.includes(q)) continue;
    }

    out.push({
      clinicalSessionId: sid || null,
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

  out.sort((a, b) => {
    const rank = (st) => (st === 'none' ? 0 : st === 'draft' ? 1 : 2);
    const r = rank(a.noteStatus) - rank(b.noteStatus);
    if (r !== 0) return r;
    const da = a.dateOfService || '';
    const db = b.dateOfService || '';
    if (da !== db) return da < db ? -1 : 1;
    return Number(a.clinicalSessionId || a.officeEventId || 0)
      - Number(b.clinicalSessionId || b.officeEventId || 0);
  });

  return out;
}

/**
 * List sessions needing documentation across the user's affiliated tenants.
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
  if (!agencyIds.length) return { items: [], clinicalUnavailable: false };

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const cid = parseIntValue(clientId);
  const pid = parseIntValue(providerUserId) || parseIntValue(reqUser?.id);
  const from = toDateOnly(fromDos);
  const to = toDateOnly(toDos);
  const q = String(search || '').trim().toLowerCase();
  const statusFilter = String(noteStatus || 'undocumented').toLowerCase();

  let sessions = [];
  let clinicalUnavailable = false;

  const clinicalResult = await listSessionsFromClinicalDb({
    agencyIds,
    cid,
    pid,
    from,
    to,
    lim
  });
  sessions = clinicalResult.sessions;
  clinicalUnavailable = clinicalResult.clinicalUnavailable;

  if (!sessions.length && clinicalUnavailable) {
    sessions = await listSessionsFromMainDb({ agencyIds, cid, pid, from, to, lim });
  }

  // When clinical DB works but returned nothing, still merge main-DB appointments for coverage.
  if (!clinicalUnavailable && !sessions.length) {
    sessions = await listSessionsFromMainDb({ agencyIds, cid, pid, from, to, lim });
  }

  const noteMap = await loadNoteStatusBySession(
    sessions.map((s) => s.clinical_session_id || s.clinicalSessionId).filter(Boolean)
  );

  // Enrich billing-style rows when clinical DB is reachable.
  if (!clinicalUnavailable) {
    try {
      const withSessionIds = sessions.filter((s) => Number(s.clinical_session_id || 0) > 0);
      if (withSessionIds.length) {
        const enriched = await enrichEncountersWithNoteSummary(
          withSessionIds.map((s) => ({
            clinical_session_id: s.clinical_session_id,
            id: s.billing_encounter_id || s.office_event_id
          }))
        );
        for (const row of enriched) {
          const sid = Number(row.clinical_session_id || 0);
          if (!sid || noteMap.has(sid)) continue;
          noteMap.set(sid, {
            clinicalNoteId: row.clinical_note_id || null,
            noteStatus: row.note_status || 'none',
            noteTitle: row.note_title || null
          });
        }
      }
    } catch (e) {
      if (!isClinicalDbConnectionError(e)) {
        console.warn('[documentationQueue] note enrichment failed:', e?.message || e);
      } else {
        clinicalUnavailable = true;
      }
    }
  }

  const hydrated = await hydrateMainDbContext(sessions);
  const items = buildQueueItems({
    sessions,
    noteMap,
    hydrated,
    statusFilter,
    q,
    lim
  });

  return { items, clinicalUnavailable };
}

export default { listDocumentationQueue, isClinicalDbConnectionError };
