import crypto from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import eligibility from './clinicalEligibility.service.js';
import { toApiItem } from '../models/NoteAidWorkQueueItem.model.js';
import { attachClinicalWorkArchives } from './clinicalWorkArchiveRead.service.js';
import { utcDateToZonedYmd, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const marks = values => values.map(() => '?').join(',');
const values = set => set.size ? [...set].sort((a, b) => a - b) : [0];
const object = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function serviceDate(row) {
  try {
    const saved = object(row.metadata_json).serviceDate;
    return /^\d{4}-\d{2}-\d{2}$/.test(saved || '') ? saved : utcDateToZonedYmd(utcMysqlToIso(row.scheduled_start_at), row.source_timezone || 'America/Denver');
  } catch { return null; }
}
const explanation = value => {
  const text = String(value || '').trim();
  if (text.length < 10 || text.length > 2000) throw fail(400, 'Enter an archive or restore reason of 10–2,000 characters.');
  return text;
};

export function createClinicalWorkArchive({ main = pool, clinical = clinicalPool,
  authorize = input => eligibility.ensureAgencyAccess(input) } = {}) {
  async function access(actor, agencyId, db = main) {
    if (!id(agencyId) || !id(actor?.id) || !['admin', 'super_admin'].includes(actor.role)) throw fail(403, 'Admin access is required.');
    const [[current]] = await db.execute('SELECT id, role, is_active, is_archived FROM users WHERE id=?', [actor.id]);
    if (!current || current.role !== actor.role || !Number(current.is_active) || Number(current.is_archived)) throw fail(403, 'Current active admin access is required.');
    await authorize({ reqUser: { ...actor, role: current.role }, agencyId: Number(agencyId) });
  }

  async function collect(agencyId, target, db = main, chart = clinical, lock = false) {
    if (!['claim', 'clinical_session', 'appointment', 'draft'].includes(target?.type) || !id(target?.id)) throw fail(400, 'Choose a saved session, appointment, draft or claim.');
    const suffix = lock ? ' FOR UPDATE' : '';
    const sessionIds = new Set(), claimIds = new Set(), appointmentIds = new Set();
    let seed;
    if (target.type === 'appointment' || target.type === 'draft') {
      const table = target.type === 'appointment' ? 'appointments' : 'clinical_note_drafts';
      [[seed]] = await db.execute(`SELECT * FROM ${table} WHERE id=? AND agency_id=?${suffix}`, [target.id, agencyId]);
      if (seed) {
        if (target.type === 'appointment') appointmentIds.add(Number(seed.id));
        if (seed.clinical_session_id) sessionIds.add(Number(seed.clinical_session_id));
        const [linked] = target.type === 'appointment'
          ? await chart.execute('SELECT id FROM clinical_sessions WHERE agency_id=? AND appointment_id=?', [agencyId, seed.id])
          : seed.office_event_id && seed.client_id
            ? await chart.execute('SELECT id FROM clinical_sessions WHERE agency_id=? AND office_event_id=? AND client_id=? AND provider_user_id=?', [agencyId, seed.office_event_id, seed.client_id, seed.user_id]) : [[]];
        linked.forEach(row => sessionIds.add(Number(row.id)));
      }
    } else {
      const table = target.type === 'claim' ? 'clinical_claims' : 'clinical_sessions';
      [[seed]] = await chart.execute(`SELECT * FROM ${table} WHERE id=? AND agency_id=?${suffix}`, [target.id, agencyId]);
      if (seed) (target.type === 'claim' ? claimIds : sessionIds).add(Number(seed.id));
    }
    if (!seed) throw fail(404, 'The selected record was not found in this organization.');
    let sessions = [], claims = [], settled = false;
    // Follow saved claim/session and claim-family links, never client/date guesses.
    for (let iteration = 0; iteration < 10; iteration++) {
      if (sessionIds.size + claimIds.size > 200) throw fail(409, 'This record has too many connected sessions or claims. Review its links before archiving.');
      const before = `${values(sessionIds)}|${values(claimIds)}`;
      const ss = values(sessionIds), cc = values(claimIds);
      [claims] = await chart.execute(`SELECT id,agency_id,client_id,clinical_session_id,parent_claim_id,claim_lifecycle,
        claim_status,claimmd_submitted_at,claimmd_claim_id,claimmd_connection_id,billing_revision,updated_at,is_legal_hold,metadata_json
        FROM clinical_claims WHERE agency_id=? AND (id IN (${marks(cc)}) OR parent_claim_id IN (${marks(cc)}) OR clinical_session_id IN (${marks(ss)})) ORDER BY id${suffix}`, [agencyId, ...cc, ...cc, ...ss]);
      for (const row of claims) {
        claimIds.add(Number(row.id));
        if (row.parent_claim_id) claimIds.add(Number(row.parent_claim_id));
        if (row.clinical_session_id) sessionIds.add(Number(row.clinical_session_id));
      }
      const [links] = await chart.execute(`SELECT clinical_session_id,clinical_claim_id FROM clinical_claim_sessions
        WHERE agency_id=? AND (clinical_session_id IN (${marks(values(sessionIds))}) OR clinical_claim_id IN (${marks(values(claimIds))}))`, [agencyId, ...values(sessionIds), ...values(claimIds)]);
      for (const row of links) { sessionIds.add(Number(row.clinical_session_id)); claimIds.add(Number(row.clinical_claim_id)); }
      [sessions] = await chart.execute(`SELECT id,agency_id,client_id,provider_user_id,appointment_id,office_event_id,billing_encounter_id,
        scheduled_start_at,source_timezone,metadata_json,service_code,updated_at FROM clinical_sessions WHERE agency_id=? AND id IN (${marks(values(sessionIds))}) ORDER BY id${suffix}`, [agencyId, ...values(sessionIds)]);
      if (before === `${values(sessionIds)}|${values(claimIds)}`) { settled = true; break; }
    }
    if (!settled) throw fail(409, 'The linked record group changed. Review its links before archiving.');
    for (const claim of claims) {
      const metadata = object(claim.metadata_json);
      const closedLocally = claim.claim_lifecycle === 'closed' && metadata.claimClosure;
      if ((!['draft', 'ready'].includes(claim.claim_lifecycle) && !closedLocally)
        || claim.claimmd_submitted_at || claim.claimmd_claim_id || claim.claimmd_connection_id
        || !['', 'PENDING', 'DRAFT', 'READY', 'CLOSED'].includes(String(claim.claim_status || '').toUpperCase())) {
        throw fail(409, 'This group has a submitted or unresolved claim. Reconcile it with billing before archiving.');
      }
      if (Number(claim.is_legal_hold)) throw fail(409, 'A linked record is on legal hold. It cannot be archived.');
    }
    if (claims.length) {
      const cc = claims.map(row => row.id);
      const [attempts] = await chart.execute(`SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id IN (${marks(cc)})
        AND (event_type LIKE '%submission%' OR event_type LIKE '%upload%') LIMIT 1`, [agencyId, ...cc]);
      const [payments] = await chart.execute(`SELECT id FROM claimmd_payment_postings WHERE agency_id=? AND clinical_claim_id IN (${marks(cc)}) LIMIT 1`, [agencyId, ...cc]);
      if (attempts.length || payments.length) throw fail(409, 'Submission or payment history exists. Billing must reconcile this record before archiving.');
    }
    const ss = sessions.map(row => Number(row.id));
    const [notes] = ss.length ? await chart.execute(`SELECT id,clinical_session_id,is_legal_hold,provider_signed_at,updated_at FROM clinical_notes
      WHERE agency_id=? AND clinical_session_id IN (${marks(ss)}) ORDER BY id${suffix}`, [agencyId, ...ss]) : [[]];
    if (notes.some(row => Number(row.is_legal_hold))) throw fail(409, 'A linked note is on legal hold. It cannot be archived.');
    sessions.forEach(row => { if (row.appointment_id) appointmentIds.add(Number(row.appointment_id)); });
    const [appointments] = await db.execute(`SELECT * FROM appointments WHERE agency_id=?
      AND (id IN (${marks(values(appointmentIds))}) OR clinical_session_id IN (${marks(ss.length ? ss : [0])})) ORDER BY id${suffix}`, [agencyId, ...values(appointmentIds), ...(ss.length ? ss : [0])]);
    appointments.forEach(row => appointmentIds.add(Number(row.id)));
    const resources = new Map();
    const add = (type, value) => { if (id(value)) resources.set(`${type}:${value}`, { type, id: Number(value) }); };
    sessions.forEach(row => { add('clinical_session', row.id); add('billing_encounter', row.billing_encounter_id); });
    claims.forEach(row => add('claim', row.id)); notes.forEach(row => add('note', row.id));
    appointments.forEach(row => add('appointment', row.id));
    // Shared office blocks and provider calendar events are retained when they
    // also contain another appointment. Do not hide somebody else's visit.
    const officeIds = [...new Set([...sessions, ...appointments].map(row => Number(row.office_event_id)).filter(Boolean))];
    for (const eventId of officeIds) {
      const [otherSessions] = await chart.execute(`SELECT id FROM clinical_sessions WHERE office_event_id=? AND id NOT IN (${marks(ss.length ? ss : [0])}) LIMIT 1`, [eventId, ...(ss.length ? ss : [0])]);
      const [otherAppointments] = await db.execute(`SELECT id FROM appointments WHERE office_event_id=? AND id NOT IN (${marks(values(appointmentIds))}) LIMIT 1`, [eventId, ...values(appointmentIds)]);
      if (!otherSessions.length && !otherAppointments.length) add('office_event', eventId);
    }
    for (const eventId of new Set(appointments.map(row => Number(row.provider_schedule_event_id)).filter(Boolean))) {
      const [other] = await db.execute(`SELECT id FROM appointments WHERE provider_schedule_event_id=? AND id NOT IN (${marks(values(appointmentIds))}) LIMIT 1`, [eventId, ...values(appointmentIds)]);
      if (!other.length) add('provider_schedule_event', eventId);
    }
    const [drafts] = await db.execute(`SELECT id,updated_at FROM clinical_note_drafts WHERE agency_id=?
      AND (clinical_session_id IN (${marks(ss.length ? ss : [0])}) OR id=?) ORDER BY id${suffix}`, [agencyId, ...(ss.length ? ss : [0]), target.type === 'draft' ? Number(seed.id) : 0]);
    drafts.forEach(row => add('draft', row.id));
    const clientIds = [...new Set([...sessions, ...claims, seed].map(row => Number(row.client_id)).filter(Boolean))];
    if (lock && clientIds.length) await db.execute(`SELECT id FROM clients WHERE id IN (${marks(clientIds)}) FOR UPDATE`, clientIds);
    const [balances] = await db.execute(`SELECT id FROM family_receivables WHERE agency_id=? AND status<>'void'
      AND ((source_type IN ('clinical_self_pay','clinical_copay') AND source_key IN (${marks(ss.length ? ss : [0])}))
        OR (source_type='claim_responsibility' AND source_key IN (${marks(claims.length ? claims.map(row => row.id) : [0])}))) LIMIT 1`,
      [agencyId, ...(ss.length ? ss : [0]).map(String), ...(claims.length ? claims.map(row => row.id) : [0]).map(String)]);
    if (balances.length) throw fail(409, 'This group has a client balance or payment record. Review it in billing before archiving.');
    const [clients] = clientIds.length ? await db.execute(`SELECT id,full_name,initials FROM clients WHERE id IN (${marks(clientIds)})`, clientIds) : [[]];
    const [queue] = await db.execute(`SELECT * FROM note_aid_work_queue_items WHERE agency_id=? ORDER BY id${suffix}`, [agencyId]);
    const relatedQueue = queue.filter(raw => {
      const row = toApiItem(raw);
      return resources.has(`clinical_session:${row.clinicalSessionId}`) || resources.has(`appointment:${row.appointmentId}`)
        || resources.has(`office_event:${row.officeEventId}`) || resources.has(`draft:${row.draftId}`) || resources.has(`note:${row.clinicalNoteId}`);
    });
    relatedQueue.forEach(row => add('work_queue', row.id));
    const refs = [...resources.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
    const archived = await attachClinicalWorkArchives(refs.map(row => ({ id: row.id, archiveResourceType: row.type })), { db, currentRead: lock });
    if (archived.some(row => row.administrativeArchive)) throw fail(409, 'Some linked work is already archived. Open Archived test records to review or restore it.');
    const summary = { target, clientIds, claims: claims.map(row => ({ id: row.id, clientId: row.client_id, clinicalSessionId: row.clinical_session_id, status: row.claim_lifecycle })), sessions: sessions.map(row => ({ id: row.id, clientId: row.client_id, dateOfService: serviceDate(row), serviceCode: row.service_code })),
      counts: { sessions: sessions.length, claims: claims.length, appointments: appointments.length, notes: notes.length, drafts: drafts.length, myWork: relatedQueue.length } };
    return { resources: refs, summary, clientLabels: clients.map(row => ({ id: row.id, name: row.full_name || row.initials || `Client #${row.id}` })), version: hash({ refs, summary, seed: { clientId: seed.client_id, officeEventId: seed.office_event_id, providerId: seed.user_id }, sessions, claims, notes, appointments, drafts, queue: relatedQueue }) };
  }

  async function audit(db, actor, agencyId, action, metadata) {
    await db.execute('INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)', [action, actor.id, agencyId, JSON.stringify(metadata)]);
  }
  return {
    async preview(actor, agencyId, target) { await access(actor, agencyId); return collect(Number(agencyId), target); },
    async list(actor, agencyId) {
      await access(actor, agencyId);
      const [rows] = await main.execute(`SELECT a.*,CONCAT_WS(' ',u.first_name,u.last_name) AS archived_by_name,COALESCE(c.full_name,c.initials) AS client_name
        FROM clinical_work_archives a LEFT JOIN users u ON u.id=a.archived_by_user_id
        LEFT JOIN clients c ON c.id=a.client_id
        WHERE a.agency_id=? AND a.restored_at IS NULL ORDER BY a.id DESC LIMIT 200`, [agencyId]);
      return { items: rows.map(row => ({ id: row.id, clientName: row.client_name, reason: row.reason, archivedAt: row.archived_at, archivedBy: row.archived_by_name, summary: object(row.summary_json) })) };
    },
    async archive(actor, agencyId, target, version, reason) {
      const why = explanation(reason);
      const db = await main.getConnection();
      let chart;
      try {
        chart = await clinical.getConnection();
        await chart.beginTransaction(); await db.beginTransaction(); await access(actor, agencyId, db);
        const current = await collect(Number(agencyId), target, db, chart, true);
        if (current.version !== version) throw fail(409, 'The records changed after preview. Refresh and review them again.');
        const [saved] = await db.execute(`INSERT INTO clinical_work_archives (agency_id,client_id,archived_by_user_id,reason,summary_json)
          VALUES (?,?,?,?,?)`, [agencyId, current.summary.clientIds.length === 1 ? current.summary.clientIds[0] : null, actor.id, why, JSON.stringify(current.summary)]);
        for (const resource of current.resources) await db.execute('INSERT INTO clinical_work_archive_resources (archive_id,resource_type,resource_id) VALUES (?,?,?)', [saved.insertId, resource.type, resource.id]);
        await audit(db, actor, agencyId, 'clinical_work_archived', { archiveId: saved.insertId, reason: why, resources: current.resources, summary: current.summary, previewVersion: current.version });
        // Only the main plane is written. Clinical row locks serialize this
        // archive against claim creation/submission; no clinical status changes.
        await db.commit();
        return { archiveId: saved.insertId, summary: current.summary };
      } catch (error) { await db.rollback(); throw error; }
      finally {
        if (chart) {
          try { await chart.rollback(); } catch { chart.destroy?.(); }
          chart.release();
        }
        db.release();
      }
    },
    async restore(actor, agencyId, archiveId, reason) {
      const why = explanation(reason), db = await main.getConnection();
      try {
        await db.beginTransaction(); await access(actor, agencyId, db);
        const [[row]] = await db.execute('SELECT * FROM clinical_work_archives WHERE id=? AND agency_id=? AND restored_at IS NULL FOR UPDATE', [archiveId, agencyId]);
        if (!row) throw fail(404, 'Active archive not found in this organization.');
        await db.execute('UPDATE clinical_work_archives SET restored_at=UTC_TIMESTAMP(3),restored_by_user_id=?,restore_reason=? WHERE id=? AND agency_id=?', [actor.id, why, archiveId, agencyId]);
        await audit(db, actor, agencyId, 'clinical_work_restored', { archiveId, reason: why });
        await db.commit(); return { restored: true, archiveId };
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
    }
  };
}
export default createClinicalWorkArchive();
