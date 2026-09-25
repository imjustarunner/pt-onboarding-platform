import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { validDate } from './supervisedBillingPolicy.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
export function plannedServiceIdentity(item, userId) {
  const agencyId = Number(item.agencyId), clientId = Number(item.clientId);
  const kind = String(item.noteKind || '').toLowerCase();
  // This rollout is for TISI's imported service tasks, never non-service documents.
  if (agencyId !== 377 || !['progress', 'intake'].includes(kind)) return null;
  const date = String(item.date || ''), code = String(item.serviceCode || '').toUpperCase();
  if (!Number.isSafeInteger(clientId) || clientId < 1 || !validDate(date) || !/^[A-Z0-9_]{5,16}$/.test(code)) {
    throw fail(400, 'Imported services need a linked client, service date and service code');
  }
  const time = String(item.timeLabel || '').trim().toUpperCase();
  const key = crypto.createHash('sha256').update(JSON.stringify([agencyId, clientId, userId, date, code, kind, time])).digest('hex');
  return { agencyId, clientId, date, code, key, time };
}

export async function linkImportedPlannedServices(items, user, source = clinicalPool) {
  const result = [];
  for (const item of items) {
    const identity = plannedServiceIdentity(item, user.id);
    if (!identity) { result.push(item); continue; }
    if (!['provider','provider_plus','supervisor','admin','super_admin','clinical_practice_assistant'].includes(String(user.role || '').toLowerCase())) throw fail(403,'Clinical staff access is required to import planned services');
    const { agencyId, clientId, date, code, key, time } = identity;
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: user, agencyId });
    const access = await resolveClientRecordAccess({ userId: user.id, role: user.role, clientId });
    if (!access.ok) throw fail(access.status, access.message);
    if (Number(access.client.agency_id) !== agencyId) throw fail(403, 'Client does not belong to the import agency');
    const db = await source.getConnection();
    try {
      await db.beginTransaction();
      // Serialize different pasted keys for the same provider/client/date too.
      const scopeKey=crypto.createHash('sha256').update(`scope:${agencyId}:${clientId}:${user.id}:${date}`).digest('hex');
      await db.execute('INSERT INTO note_aid_planned_services (agency_id,import_key,client_id,provider_user_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE import_key=VALUES(import_key)',[agencyId,scopeKey,clientId,user.id]);
      await db.execute('SELECT import_key FROM note_aid_planned_services WHERE agency_id=? AND import_key=? FOR UPDATE',[agencyId,scopeKey]);
      await db.execute('INSERT INTO note_aid_planned_services (agency_id,import_key,client_id,provider_user_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE import_key=VALUES(import_key)', [agencyId,key,clientId,user.id]);
      const [[link]] = await db.execute('SELECT clinical_session_id FROM note_aid_planned_services WHERE agency_id=? AND import_key=? FOR UPDATE', [agencyId,key]);
      let sessionId = Number(link.clinical_session_id || 0);
      if (!sessionId) {
        // Do not silently create a second encounter beside a scheduled/imported one.
        const [candidates] = await db.execute(`SELECT id FROM clinical_sessions WHERE agency_id=? AND client_id=? AND provider_user_id=?
          AND (DATE(scheduled_start_at)=? OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.serviceDate'))=?)
          AND service_code=? ORDER BY id`, [agencyId,clientId,user.id,date,date,code]);
        const requested = Number(item.clinicalSessionId || 0);
        if (requested && !candidates.some(row => Number(row.id) === requested)) throw fail(409, 'The selected session does not match this imported service');
        if (!requested && candidates.length) throw fail(409, 'A session already exists for this client, provider, date and code. Open that session in Note Aid or link its session before importing; no duplicate was created.');
        sessionId = requested;
        if (!sessionId) {
          const [insert] = await db.execute(`INSERT INTO clinical_sessions
            (agency_id,client_id,office_event_id,provider_user_id,rendering_provider_user_id,service_code,encounter_status,source_timezone,metadata_json,created_by_user_id)
            VALUES (?,?,NULL,?,?,?,'scheduled','America/Denver',?,?)`,
          [agencyId,clientId,user.id,user.id,code,JSON.stringify({source:'note_aid_todo_import',serviceDate:date,importTimeLabel:time || null,plannedClaim:true,missingCalendarAttachment:true}),user.id]);
          sessionId = Number(insert.insertId);
        }
        await db.execute('UPDATE note_aid_planned_services SET clinical_session_id=? WHERE agency_id=? AND import_key=?', [sessionId,agencyId,key]);
      }
      await db.commit();
      result.push({ ...item, clinicalSessionId:sessionId });
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  return result;
}
