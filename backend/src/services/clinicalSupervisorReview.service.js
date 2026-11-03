import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import { loadReviewDocument } from './clinicalReviewDocument.service.js';
import { parseObject, policyError, validDate } from './supervisedBillingPolicy.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { zonedWallTimeToUtc, dateToMysqlUtcDateTime, isValidTimeZone } from '../utils/zonedWallTime.util.js';

// Clinical encounter locations are stored by ID and in metadata, not in a
// location_label SQL column. Retain the legacy in-memory field for old callers.
export const sessionLocationLabel = session => parseObject(session?.metadata_json).locationLabel || session?.location_label || null;

export const REVIEW_ACTIONS = ['changes_needed', 'review_acknowledge', 'feedback'];
export function reviewSnapshotToken(note, session = {}) {
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])) : value;
  const date = v => {
    if (!v) return null;
    const raw = String(v), parsed = v instanceof Date ? v : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw)?raw.replace(' ','T'):`${raw.replace(' ','T')}Z`);
    return Number.isFinite(+parsed) ? parsed.toISOString() : raw;
  };
  const {supervisorQueue,...metadata}=parseObject(note.metadata_json);
  return crypto.createHash('sha256').update(JSON.stringify(ordered({metadata,providerSignedAt:date(note.provider_signed_at),providerSignedBy:note.provider_signed_by_user_id || null,supervisorSignedAt:date(note.supervisor_cosigned_at),supervisorSignedBy:note.supervisor_cosigned_by_user_id || null,session:{start:date(session.scheduled_start_at),end:date(session.scheduled_end_at),duration:session.duration_minutes==null?null:Number(session.duration_minutes),location:sessionLocationLabel(session),pos:session.place_of_service || null,serviceLocationId:Number(session.service_location_id)||null,timeZone:session.source_timezone || 'America/Denver'}}))).digest('hex');
}
export const noteAuthorId = note => Number(note.provider_signed_by_user_id || note.created_by_user_id);
export function reviewRequestsForDisplay(metadata) {
  return (metadata.reviewRequests || []).map(({messageEncrypted, ...r}) => ({...r, message: maybeDecryptNotePayload(messageEncrypted) || r.message || ''}));
}
export function appendReviewRequest(meta, {action, message, actorUserId, contentHash, source = 'supervisor', amendmentId = null}, now = new Date().toISOString()) {
  if (!REVIEW_ACTIONS.includes(action) || !String(message || '').trim() || String(message).length > 4000) throw policyError(400, 'Choose a review action and enter a message of 1–4,000 characters.');
  const request = {id: crypto.randomUUID(), action, status: action, messageEncrypted: maybeEncryptNotePayload(String(message).trim()), createdByUserId: Number(actorUserId), createdAt: now, contentHash, source, amendmentId, acknowledgedAt: null, resolvedAt: null};
  meta.reviewRequests = [...(meta.reviewRequests || []), request];
  return request;
}
export function acknowledgeReviewRequest(meta, requestId, actorUserId, authorId, now = new Date().toISOString()) {
  if (Number(actorUserId) !== Number(authorId)) throw policyError(403, 'Only the note author can acknowledge this review.');
  const request = (meta.reviewRequests || []).find(r => r.id === requestId);
  if (!request) throw policyError(404, 'Review request not found.');
  if (request.action === 'changes_needed') throw policyError(409, 'Sign an amendment addressing the requested changes before returning this note for supervisor review.');
  if (request.action === 'feedback') { request.dismissedAt ||= now; request.dismissedByUserId ||= Number(actorUserId); }
  else { request.acknowledgedAt ||= now; request.acknowledgedByUserId ||= Number(actorUserId); }
  return request;
}
export function normalizeServiceDetails(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw policyError(400, 'Enter the corrected service details.');
  const durationMinutes = Number(input.durationMinutes), locationLabel = String(input.locationLabel || '').trim(), startTime = String(input.startTime || ''), endTime = String(input.endTime || ''), placeOfService = String(input.placeOfService || '');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw policyError(400, 'Duration must be 1–1,440 whole minutes.');
  if (!locationLabel || locationLabel.length > 255 || !/^\d{2}$/.test(placeOfService)) throw policyError(400, 'Enter a location and its two-digit place-of-service code.');
  if (![startTime,endTime].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))) throw policyError(400, 'Enter start and end times in 24-hour HH:MM format.');
  const minutes = t => Number(t.slice(0,2))*60 + Number(t.slice(3));
  if (minutes(endTime) <= minutes(startTime) || minutes(endTime)-minutes(startTime) !== durationMinutes) throw policyError(400, 'Duration must match start and end times on the service date. Overnight encounters need an office review.');
  const participants = input.participants == null ? undefined : String(input.participants).trim();
  if (participants != null && participants.length > 1000) throw policyError(400,'Participants must be at most 1,000 characters.');
  if (input.patientPresent != null && typeof input.patientPresent !== 'boolean') throw policyError(400,'Confirm whether the patient was present.');
  return {durationMinutes, locationLabel, startTime, endTime, placeOfService, serviceLocationId:Number(input.serviceLocationId) || null,
    ...(participants !== undefined ? {participants} : {}), ...(typeof input.patientPresent === 'boolean' ? {patientPresent:input.patientPresent} : {})};
}
export function effectiveServiceDetails(note, session = {}) {
  const meta = parseObject(note.metadata_json), chart = meta.structuredChart || {};
  const approved = Number(note.clinical_version_number)>1 ? null : (meta.serviceDetailAmendments || []).filter(a => a.approvedAt && !a.supersededByRevisionId).at(-1);
  const localTime = raw => {
    if (!raw) return null;
    const instant = raw instanceof Date ? raw : new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(raw)) ? String(raw).replace(' ','T') : `${String(raw).replace(' ','T')}Z`);
    if (!Number.isFinite(+instant)) return null;
    if (!isValidTimeZone(session.source_timezone || 'America/Denver')) return null;
    return new Intl.DateTimeFormat('en-GB',{timeZone:session.source_timezone || 'America/Denver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant);
  };
  return approved?.serviceDetails || {durationMinutes: chart.durationMinutes ?? session.duration_minutes ?? null, locationLabel: chart.locationLabel || sessionLocationLabel(session) || meta.locationLabel || null, startTime: chart.startTime || localTime(session.scheduled_start_at), endTime: chart.endTime || localTime(session.scheduled_end_at), placeOfService: chart.placeOfService || session.place_of_service || null,serviceLocationId:Number(session.service_location_id) || null, ...(chart.participants ? {participants:chart.participants} : {}), ...(typeof chart.patientPresent === 'boolean' ? {patientPresent:chart.patientPresent} : {})};
}
export function pendingServiceDetails(meta) { return (meta.serviceDetailAmendments || []).filter(a => !a.approvedAt && !a.supersededByAmendmentId && !a.supersededByRevisionId).at(-1)?.serviceDetails || null; }
export function assertServiceDetailsComplete(note, session = {}) {
  const details = pendingServiceDetails(parseObject(note.metadata_json)) || effectiveServiceDetails(note,session);
  const missing = ['durationMinutes','locationLabel','startTime','endTime'].filter(k => !details[k]);
  if (missing.length) throw policyError(409, `Complete and attest the service details before approval: ${missing.join(', ')}.`);
  if (parseObject(note.metadata_json).serviceCode === 'H0002' && (!String(details.participants || '').trim() || typeof details.patientPresent !== 'boolean')) throw policyError(409,'Complete the screening participants and confirm whether the patient was present before approval.');
  const duration=Number(details.durationMinutes), validClock=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  if (!Number.isInteger(duration)||duration<1||duration>1440||!validClock(details.startTime)||!validClock(details.endTime)||minutes(details.endTime)-minutes(details.startTime)!==duration) throw policyError(409,'The duration must agree with valid start and end times. Sign a service-detail correction before approval.');
  const dos=String(parseObject(note.metadata_json).dateOfService || '').slice(0,10);
  if (validDate(dos)) serviceDetailTimes(details,dos,session.source_timezone || 'America/Denver');
}
export async function queueBillingAcknowledgement(db, {noteId,agencyId,actorUserId,message,source='billing_correction'}) {
  const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[noteId,agencyId]);
  if (!note || !note.provider_signed_at || Number(actorUserId) === noteAuthorId(note)) return;
  const meta = parseObject(note.metadata_json);
  appendReviewRequest(meta,{action:'review_acknowledge',message,actorUserId,source});
  await db.execute('UPDATE clinical_notes SET metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?',[JSON.stringify(meta),noteId,agencyId]);
}
export function assertNoUnresolvedChanges(meta) {
  if ((meta.reviewRequests || []).some(r => r.action === 'changes_needed' && !r.resolvedAt)) throw policyError(409, 'The author must address the requested changes in a signed amendment before supervisor approval.');
}
export function serviceDetailTimes(details, date, timeZone = 'America/Denver') {
  if (!validDate(date) || !isValidTimeZone(timeZone)) throw policyError(409, 'A valid service date and encounter timezone are required.');
  const [year,month,day] = date.split('-').map(Number);
  const convert = t => {
    const [hour,minute] = t.split(':').map(Number), instant = zonedWallTimeToUtc({year,month,day,hour,minute,timeZone});
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const map = Object.fromEntries(parts.map(p=>[p.type,p.value]));
    if (`${map.year}-${map.month}-${map.day}` !== date || `${map.hour}:${map.minute}` !== t) throw policyError(400, 'The encounter time does not exist in this timezone.');
    return instant;
  };
  const start = convert(details.startTime), end = convert(details.endTime);
  if ((end-start)/60000 !== details.durationMinutes) throw policyError(400, 'The elapsed duration does not match the encounter times across the timezone transition.');
  return {startAt:dateToMysqlUtcDateTime(start),endAt:dateToMysqlUtcDateTime(end)};
}
export async function lockedNoteMutation({noteId, agencyId, contentHash, snapshotToken, mutate, lockEncounter = false}, source = clinicalPool) {
  const db = await source.getConnection();
  try {
    await db.beginTransaction();
    if (lockEncounter) {
      const [[ref]] = await db.execute('SELECT clinical_session_id FROM clinical_notes WHERE id=? AND agency_id=?',[noteId,agencyId]);
      if (ref?.clinical_session_id) {
        await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[ref.clinical_session_id,agencyId]);
        await db.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? AND agency_id=? ORDER BY id FOR UPDATE',[ref.clinical_session_id,agencyId]);
      }
    }
    const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[noteId,agencyId]);
    if (!note || note.is_deleted) throw policyError(404,'Note not found.');
    if (!note.provider_signed_at) throw policyError(409,'The note author must sign before supervisor review.');
    const current = await loadReviewDocument({agencyId,providerUserId:note.provider_signed_by_user_id || note.created_by_user_id},'note',noteId,db);
    if (contentHash !== undefined && (!contentHash || contentHash !== current.hash)) throw policyError(409,'The note changed. Open the current version before continuing.');
    const [[reviewSession]] = note.clinical_session_id ? await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?',[note.clinical_session_id,agencyId]) : [[{}]];
    if (contentHash !== undefined && snapshotToken !== reviewSnapshotToken(current.row || note,current.session || reviewSession || {})) throw policyError(409,'The review details changed. Open the current note before continuing.');
    const meta = parseObject(note.metadata_json), result = await mutate({db,note,meta,current});
    await db.execute('UPDATE clinical_notes SET metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?',[JSON.stringify(meta),noteId,agencyId]);
    await db.commit(); return result;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
export async function applyApprovedServiceDetails(db, note, meta, actorUserId, approvedAt) {
  const pending = (meta.serviceDetailAmendments || []).filter(a => !a.approvedAt && !a.supersededByAmendmentId && !a.supersededByRevisionId);
  if (!pending.length) return;
  const latest = pending.at(-1), d = latest.serviceDetails;
  const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?',[note.clinical_session_id,note.agency_id]);
  if (!session) throw policyError(409,'The linked encounter is unavailable.');
  const times = serviceDetailTimes(d,latest.dateOfService,latest.timeZone);
  const location = await verifyServiceAmendmentLocation(note,session,d);
  await db.execute(`UPDATE clinical_sessions SET scheduled_start_at=?,scheduled_end_at=?,duration_minutes=?,metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.locationLabel',?),place_of_service=?,is_telehealth=?,service_location_id=?,billing_office_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,[times.startAt,times.endAt,d.durationMinutes,d.locationLabel,d.placeOfService,['02','10'].includes(d.placeOfService)?1:0,d.serviceLocationId,location.billing_office_location_id || null,note.clinical_session_id,note.agency_id]);
  const [claims] = await db.execute('SELECT * FROM clinical_claims WHERE clinical_session_id=? AND agency_id=? AND is_deleted=0 ORDER BY id',[note.clinical_session_id,note.agency_id]);
  for (const claim of claims) {
    if (claim.claimmd_submitted_at || claim.claimmd_claim_id || claim.claimmd_connection_id || !['draft','ready'].includes(claim.claim_lifecycle)) throw policyError(409,'An existing claim has submission history. Billing must reconcile it before service details can be approved.');
    const [[attempt]] = await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1",[note.agency_id,claim.id]);
    if (attempt) throw policyError(409,'An existing claim was previously transmitted. Billing reconciliation is required.');
    const payload = {...parseObject(claim.claim_payload),serviceDetails:d,serviceLocationId:d.serviceLocationId,serviceDetailsAmendmentId:latest.id};
    await db.execute("UPDATE clinical_claims SET place_of_service=?,claim_payload=?,billing_revision=billing_revision+1,claim_lifecycle='draft' WHERE id=? AND agency_id=?",[d.placeOfService,JSON.stringify(payload),claim.id,note.agency_id]);
  }
  for (const amendment of pending) { amendment.approvedAt=approvedAt; amendment.approvedByUserId=Number(actorUserId); }
}

// A corrected duration must agree with the configured code/units. Never silently
// reprice a draft or let stale units survive an approved timing amendment.
export async function serviceDetailBillingBlockers(note, claim, lines, loadCodes, session) {
  const meta = parseObject(note.metadata_json), approved = Number(note.clinical_version_number)>1 ? null : (meta.serviceDetailAmendments || []).filter(a => a.approvedAt && !a.supersededByRevisionId).at(-1);
  if (!approved) return [];
  const blockers = [], details = approved.serviceDetails;
  try { await verifyServiceAmendmentLocation(note,session || {},details); } catch(e) { blockers.push(e.message); }
  if (session && Number(session.service_location_id)!==Number(details.serviceLocationId)) blockers.push('The encounter location mapping differs from the latest approved service correction.');
  if (String(claim.place_of_service || '') !== details.placeOfService) blockers.push('The claim place of service differs from the latest approved service correction.');
  const codes = loadCodes ? await loadCodes() : await (await import('../models/AgencyMedicalServiceCode.model.js')).default.listByAgency(note.agency_id,{includeInactive:false});
  const {ruleFromMedicalServiceCodeRow,resolveWithOverflowChain} = await import('./serviceCodeUnits.service.js');
  const primaryCode = String(meta.serviceCode || lines[0]?.procedure_code || '').toUpperCase(), primary = codes.find(c=>String(c.service_code || c.serviceCode).toUpperCase() === primaryCode);
  if (!primary) return [...blockers,'Configure and review the service-code duration rule for this corrected encounter before billing.'];
  const resolved = resolveWithOverflowChain(details.durationMinutes,ruleFromMedicalServiceCodeRow(primary),code=>ruleFromMedicalServiceCodeRow(codes.find(c=>String(c.service_code || c.serviceCode).toUpperCase()===code)));
  const matching = lines.filter(l=>String(l.procedure_code).toUpperCase()===resolved.effectiveServiceCode);
  const actualUnits = matching.reduce((sum,line)=>sum+Number(line.units),0);
  const stalePrimary = resolved.effectiveServiceCode !== primaryCode && lines.some(l=>String(l.procedure_code).toUpperCase()===primaryCode);
  if (!resolved.claimable || matching.length!==1 || actualUnits !== Number(resolved.units) || stalePrimary) blockers.push('The latest approved duration does not support the current claim code/units. Correct the service lines through the signed service amendment and billing review workflow.');
  return blockers;
}

// Persist the desired main-database queue state with the clinical record first.
// Synchronization is idempotent and is retried when the supervisor opens My Work.
export function markSupervisorQueue(meta, note, supervisorUserId, status) {
  meta.supervisorQueue = {revision:crypto.randomUUID(),supervisorUserId:Number(supervisorUserId),providerUserId:noteAuthorId(note),status,updatedAt:new Date().toISOString(),synchronizedAt:null};
  return meta.supervisorQueue;
}
export async function synchronizeSupervisorQueue(note, marker, {main=pool,clinical=clinicalPool}={}) {
  if (!marker?.revision) return false;
  let db;
  try {
    db=await clinical.getConnection(); await db.beginTransaction();
    const [[current]]=await db.execute('SELECT metadata_json FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[note.id,note.agency_id]);
    if (parseObject(current?.metadata_json).supervisorQueue?.revision !== marker.revision) { await db.rollback(); return false; }
    await main.execute(`INSERT INTO clinical_note_signoffs (agency_id,clinical_note_id,provider_user_id,supervisor_user_id,provider_signed_at,status,supervisor_signed_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE provider_user_id=VALUES(provider_user_id),supervisor_user_id=VALUES(supervisor_user_id),status=VALUES(status),supervisor_signed_at=VALUES(supervisor_signed_at)`,[note.agency_id,note.id,marker.providerUserId,marker.supervisorUserId,note.provider_signed_at,marker.status,marker.status==='signed' ? note.supervisor_cosigned_at || new Date() : null]);
    await db.execute(`UPDATE clinical_notes SET metadata_json=JSON_SET(metadata_json,'$.supervisorQueue.synchronizedAt',?) WHERE id=? AND agency_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.supervisorQueue.revision'))=?`,[new Date().toISOString(),note.id,note.agency_id,marker.revision]);
    await db.commit(); return true;
  } catch { if(db) await db.rollback().catch(()=>{}); return false; } finally { db?.release(); }
}
export async function reconcileSupervisorQueue(supervisorUserId, agencyId=null) {
  const [notes]=await clinicalPool.execute(`SELECT id,agency_id,provider_signed_at,supervisor_cosigned_at,metadata_json FROM clinical_notes WHERE is_deleted=0 AND JSON_EXTRACT(metadata_json,'$.supervisorQueue.supervisorUserId')=? AND (JSON_EXTRACT(metadata_json,'$.supervisorQueue.synchronizedAt') IS NULL OR JSON_TYPE(JSON_EXTRACT(metadata_json,'$.supervisorQueue.synchronizedAt'))='NULL') ${agencyId ? 'AND agency_id=?' : ''} ORDER BY updated_at LIMIT 200`,[Number(supervisorUserId),...(agencyId?[Number(agencyId)]:[])]);
  for(const note of notes) await synchronizeSupervisorQueue(note,parseObject(note.metadata_json).supervisorQueue);
}
export async function verifiedServiceLocation(agencyId, details, source=pool) {
  if (!Number.isSafeInteger(Number(details.serviceLocationId)) || Number(details.serviceLocationId)<1) throw policyError(400,'Select the verified service location from this agency’s location list.');
  const [[location]]=await source.execute('SELECT id,name,place_of_service,billing_office_location_id,street_address,city,state,postal_code FROM agency_service_locations WHERE id=? AND agency_id=? AND is_active=1',[details.serviceLocationId,agencyId]);
  if (!location) throw policyError(409,'The selected service location is unavailable or belongs to another agency.');
  if (String(location.place_of_service)!==String(details.placeOfService) || String(location.name)!==String(details.locationLabel)) throw policyError(409,'The service location changed. Refresh its verified name and place of service.');
  if (details.locationSnapshot && JSON.stringify(Object.entries(details.locationSnapshot).sort(([a],[b])=>a.localeCompare(b)))!==JSON.stringify(Object.entries(serviceLocationSnapshot(location)).sort(([a],[b])=>a.localeCompare(b)))) throw policyError(409,'The verified location address or billing office changed. Record a new service-detail amendment before approval.');
  return location;
}
export function serviceLocationSnapshot(location) { return {name:location.name,placeOfService:location.place_of_service,billingOfficeLocationId:Number(location.billing_office_location_id)||null,streetAddress:location.street_address||null,city:location.city||null,state:location.state||null,postalCode:location.postal_code||null}; }

// A digital screening may have a confirmed virtual/school setting without a
// physical agency location ID. A timing/participant correction can retain that
// exact documented setting; changing it still requires an active mapped site.
export async function verifyServiceAmendmentLocation(note, session, details, source=pool) {
  if (Number(details.serviceLocationId)) return verifiedServiceLocation(note.agency_id,details,source);
  const meta=parseObject(note.metadata_json), chart=meta.structuredChart || {};
  const label=sessionLocationLabel(session) || chart.locationLabel;
  const pos=session.place_of_service || chart.placeOfService;
  if (meta.serviceCode !== 'H0002' || !label || !pos || details.locationLabel !== label || details.placeOfService !== pos) throw policyError(409,'Select a verified location, or retain the screening’s documented setting unchanged.');
  return {name:label,place_of_service:pos,billing_office_location_id:session.billing_office_location_id || null};
}
