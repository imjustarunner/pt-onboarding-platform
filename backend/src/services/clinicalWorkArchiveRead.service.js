import pool from '../config/database.js';
let archiveSchemaConfirmed = false;

const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fields = {
  clinical_session: ['clinical_session_id', 'clinicalSessionId', 'sessionId'],
  claim: ['claimId', 'clinical_claim_id'], appointment: ['appointment_id', 'appointmentId'],
  office_event: ['office_event_id', 'officeEventId'],
  provider_schedule_event: ['provider_schedule_event_id', 'providerScheduleEventId'],
  draft: ['draft_id', 'draftId'], note: ['clinical_note_id', 'clinicalNoteId', 'sourceIntakeNoteId'],
  billing_encounter: ['billing_encounter_id', 'billingEncounterId']
};
export function clinicalWorkResourceRefs(row, kind = null) {
  kind ||= row.archiveResourceType || null;
  const refs = [];
  if (kind && id(row.id)) refs.push([kind, id(row.id)]);
  for (const [type, keys] of Object.entries(fields)) {
    for (const key of keys) if (id(row[key])) refs.push([type, id(row[key])]);
  }
  if (kind === 'provider_schedule_event' && id(row.office_event_id)) refs.push(['office_event', id(row.office_event_id)]);
  return [...new Map(refs.map(ref => [ref.join(':'), ref])).values()];
}

export async function attachClinicalWorkArchives(rows, { db = pool, kind = null, currentRead = false } = {}) {
  if (!rows?.length) return rows || [];
  const groups = new Map();
  for (const row of rows) for (const [type, resourceId] of clinicalWorkResourceRefs(row, kind)) {
    if (!groups.has(type)) groups.set(type, new Set());
    groups.get(type).add(resourceId);
  }
  if (!groups.size) return rows;
  const resources = [...groups].flatMap(([type, ids]) => [...ids].map(resourceId => [type, resourceId]));
  const found = [];
  for (let offset = 0; offset < resources.length; offset += 1000) {
    const batch = new Map();
    for (const [type, resourceId] of resources.slice(offset, offset + 1000)) {
      if (!batch.has(type)) batch.set(type, []);
      batch.get(type).push(resourceId);
    }
    const clauses = [], params = [];
    for (const [type, ids] of batch) {
      clauses.push(`(r.resource_type = ? AND r.resource_id IN (${ids.map(() => '?').join(',')}))`);
      params.push(type, ...ids);
    }
    try {
      const [rows] = await db.execute(`SELECT r.resource_type, r.resource_id, a.id AS archive_id, a.archived_at
        FROM clinical_work_archive_resources r JOIN clinical_work_archives a ON a.id=r.archive_id
        WHERE a.restored_at IS NULL AND (${clauses.join(' OR ')})${currentRead ? ' FOR SHARE' : ''}`, params);
      found.push(...(rows || []));
    } catch (error) {
      // Older isolated schemas can be read before installation. A running
      // server that verified archive storage must fail closed on its loss.
      if (error.code === 'ER_NO_SUCH_TABLE' && !archiveSchemaConfirmed) return rows;
      throw error;
    }
  }
  const byRef = new Map((found || []).map(row => [`${row.resource_type}:${row.resource_id}`, row]));
  return rows.map(row => {
    const archive = clinicalWorkResourceRefs(row, kind).map(ref => byRef.get(ref.join(':'))).find(Boolean);
    if (archive) return { ...row, administrativeArchive: { id: Number(archive.archive_id), archivedAt: archive.archived_at } };
    if (row.administrativeArchive) {
      const { administrativeArchive, ...active } = row;
      return active;
    }
    return row;
  });
}

export function filterClinicalWorkArchiveStatus(rows, status = 'active') {
  if (!['active', 'archived', 'all'].includes(status)) throw Object.assign(new Error('Invalid archive filter.'), { status: 400 });
  return rows.filter(row => status === 'all' || Boolean(row.administrativeArchive) === (status === 'archived'));
}

export async function visibleClinicalWork(rows, options = {}) {
  return filterClinicalWorkArchiveStatus(await attachClinicalWorkArchives(rows, options), options.archiveStatus || 'active');
}

export async function assertClinicalWorkActive(row, options = {}) {
  const [current] = await attachClinicalWorkArchives([row], options);
  if (current.administrativeArchive) throw Object.assign(new Error('This test session is archived. An admin must restore it before documentation, billing changes or submission.'), { status: 409, code: 'CLINICAL_WORK_ARCHIVED' });
}

export async function requireClinicalWorkArchiveSchema(db = pool) {
  try {
    await db.execute(`SELECT a.id,a.agency_id,a.archived_by_user_id,a.reason,a.summary_json,a.restored_at,
      r.resource_type,r.resource_id FROM clinical_work_archives a
      JOIN clinical_work_archive_resources r ON r.archive_id=a.id LIMIT 0`);
    archiveSchemaConfirmed = true;
  } catch (error) {
    throw Object.assign(new Error('Clinical work archive storage is unavailable. Apply main migration 1846 before releasing this version.'), { code: error.code, requiredMigration: '1846', component: 'clinical_work_archives' });
  }
}
