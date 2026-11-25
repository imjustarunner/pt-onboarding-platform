import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { visibleClinicalWork } from './clinicalWorkArchiveRead.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { parseObject } from './supervisedBillingPolicy.service.js';

const keyFor = note => `intake_plan_${note.agency_id}_${note.client_id}`;

export function intakePlanSource(note) {
  const meta = parseObject(note?.metadata_json);
  const context = parseObject(meta.narrivaContext);
  const code = String(meta.serviceCode || note?.service_code || '').toUpperCase();
  const kind = meta.assessmentContext?.assessmentKind || context.assessmentKind;
  const date = String(meta.dateOfService || '').slice(0, 10);
  if (!note?.provider_signed_at || !['90791', 'H0031'].includes(code)
      || kind === 'additional' || /additional/i.test(String(meta.toolId || ''))
      || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || meta.restricted || meta.privatePsychotherapyNote || Number(note.is_deleted)) return null;
  return { date, meta };
}

export async function queueIntakeTreatmentPlan(note, {
  db = pool, clinical = clinicalPool, queue = NoteAidWorkQueueItem, checkArchive = visibleClinicalWork
} = {}) {
  const source = intakePlanSource(note);
  const userId = Number(note?.provider_signed_by_user_id || note?.created_by_user_id);
  if (!source || !userId || Number(note.created_by_user_id) !== userId) return null;
  const key = keyFor(note);
  const existing = await queue.findByClientKeyForUser({ clientKey: key, userId });
  if (existing) return Number(existing.sourceIntakeNoteId) === Number(note.id) && ['not_started', 'started'].includes(existing.status) ? existing : null;
  if (!(await checkArchive([note], { db, kind: 'note' })).length) return null;
  const [[plan]] = await clinical.execute(
    "SELECT id FROM clinical_treatment_plans WHERE agency_id=? AND client_id=? AND status IN ('active','final') LIMIT 1",
    [note.agency_id, note.client_id]
  );
  if (plan) return null;
  const [[client]] = await db.execute('SELECT full_name,initials FROM clients WHERE id=?', [note.client_id]);
  return queue.createIfMissingForUser(userId, {
    id: key, agencyId: note.agency_id, clientId: note.client_id, clientName: client?.full_name || client?.initials || '',
    sourceIntakeNoteId: note.id, noteKind: 'treatment_plan', action: 'Prepare initial treatment plan',
    date: source.date, status: 'not_started'
  });
}

// Recover recent signed intakes for clinicians whose notes predate this workflow.
export async function reconcileIntakeTreatmentPlanWork(user, agencyId = null) {
  const [known] = await pool.execute(
    "SELECT client_key FROM note_aid_work_queue_items WHERE user_id=? AND LEFT(client_key,12)='intake_plan_'",
    [user.id]
  );
  const seen = new Set(known.map(row => row.client_key));
  const [notes] = await clinicalPool.execute(
    `SELECT n.id,n.agency_id,n.client_id,n.created_by_user_id,n.provider_signed_by_user_id,n.provider_signed_at,n.metadata_json,s.service_code
       FROM clinical_notes n LEFT JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id
      WHERE n.created_by_user_id=? AND n.is_deleted=0 AND n.provider_signed_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY
        AND COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(n.metadata_json),n.metadata_json,'{}'),'$.serviceCode')),'null'),s.service_code) IN ('90791','H0031')
        ${agencyId ? 'AND n.agency_id=?' : ''}
        AND NOT EXISTS (SELECT 1 FROM clinical_treatment_plans p WHERE p.agency_id=n.agency_id AND p.client_id=n.client_id AND p.status IN ('active','final'))
      ORDER BY n.provider_signed_at,n.id LIMIT 100`,
    agencyId ? [user.id, agencyId] : [user.id]
  );
  for (const note of notes) {
    if (seen.has(keyFor(note)) || !intakePlanSource(note)) continue;
    try {
      await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: user, agencyId: note.agency_id });
      const access = await resolveClientRecordAccess({ userId: user.id, role: user.role, clientId: Number(note.client_id) });
      if (!access.ok) continue;
    } catch (error) {
      if ([403, 404].includes(error.status)) continue;
      throw error;
    }
    await queueIntakeTreatmentPlan(note);
    seen.add(keyFor(note));
  }
}

export async function intakeEvidenceForPlan({ noteId, agencyId, clientId, userId }) {
  const [[note]] = await clinicalPool.execute(
    'SELECT n.*,s.service_code FROM clinical_notes n LEFT JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id WHERE n.id=? AND n.agency_id=? AND n.client_id=? AND n.created_by_user_id=? AND n.is_deleted=0',
    [noteId, agencyId, clientId, userId]
  );
  const source = intakePlanSource(note);
  if (!source || !(await visibleClinicalWork([note], { kind: 'note' })).length) {
    throw Object.assign(new Error('The signed intake is unavailable for this treatment plan.'), { status: 404 });
  }
  const payload = parseObject(maybeDecryptNotePayload(note.note_payload));
  const sections = payload.sections || payload;
  const chart = parseObject(source.meta.structuredChart);
  const evidence = Object.entries(sections).filter(([title, body]) =>
    /presenting|history of present|symptom|function|assessment|screen|diagnos|impression|recommend|plan/i.test(title) && typeof body === 'string'
  ).map(([, body]) => body);
  const diagnoses = Array.isArray(chart.diagnoses) ? chart.diagnoses : [];
  return [...evidence, chart.diagnosticJustification, ...diagnoses.flatMap(row => [row?.description, row?.justification])].filter(Boolean).join('\n');
}

export async function completeIntakePlanWork(plan) {
  const userId = Number(plan.created_by_user_id);
  const existing = await NoteAidWorkQueueItem.findByClientKeyForUser({ clientKey: keyFor(plan), userId });
  if (Number(existing?.treatmentPlanId) !== Number(plan.id) || existing.status === 'completed') return;
  await NoteAidWorkQueueItem.patchForUser({ id: existing.serverId, userId, patch: { status: 'completed' } });
}
