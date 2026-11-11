import crypto from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { clientSessionBookingAccess } from './clientSessionBookingRollout.service.js';
import { updateAppointment } from './appointment.service.js';
import { readAppointmentRecord } from './appointmentRecord.service.js';
import { occurrenceTime } from './auricwell/schedulingTime.js';
import { createSchoolDayClosures } from './schoolDayClosures.service.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { utcDateToZonedYmd, utcMysqlToIso, wallMysqlToUtcMysql, isValidTimeZone } from '../utils/zonedWallTime.util.js';

const fail = (status,message) => Object.assign(new Error(message),{status});
const staffRoles = new Set(['admin','support','super_admin','superadmin']);
const providers = new Set(['provider','provider_plus','intern','intern_plus','clinical_practice_assistant']);
const schoolWeekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const identityTriggerBody = `UPDATE school_schedule_appointment_links SET slot_id=NULL
WHERE slot_id=OLD.id AND (
  NOT (OLD.client_id <=> NEW.client_id)
  OR OLD.school_organization_id<>NEW.school_organization_id
  OR OLD.provider_user_id<>NEW.provider_user_id
  OR OLD.weekday<>NEW.weekday
)`;
const normalizedSql=value=>String(value||'').replace(/`/g,'').replace(/\s+/g,'').toLowerCase();
export function schoolTransitionSchemaError(error) {
  if (error?.code === 'ER_NO_SUCH_TABLE' && /school_schedule_(transitions|appointment_links)/.test(error.message || ''))
    return fail(503,'Apply database migration 1786 before school appointment transition is available.');
  return error;
}
function positive(value,label) {
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<1) throw fail(400,`Choose a valid ${label}.`);
  return id;
}
export function schoolTransitionDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw fail(400,'Choose a valid date.');
  const date=new Date(`${value}T12:00:00Z`);
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value) throw fail(400,'Choose a valid date.');
  return value;
}
const iso=value=>value instanceof Date?value.toISOString():utcMysqlToIso(value);
export const schoolAppointmentFingerprint = row => crypto.createHash('sha256').update(JSON.stringify([
  Number(row.id),Number(row.provider_user_id),iso(row.start_at),iso(row.end_at),row.status
])).digest('hex');

export async function schoolTransitionAccess({actor,schoolId,providerId,manage=false,db=pool}) {
  const sid=positive(schoolId,'school'),pid=positive(providerId,'provider');
  const role=String(actor?.role||'').toLowerCase();
  if(!Number(actor?.id) || (manage && !staffRoles.has(role))) throw fail(403,'Practice scheduling staff must review this transition.');
  const school=await Agency.findById(sid);
  if(!school || school.organization_type!=='school') throw fail(404,'School not found.');
  const agencyId=Number(await OrganizationAffiliation.getActiveAgencyIdForOrganization(sid) || await AgencySchool.getActiveAgencyIdForSchool(sid));
  if(!agencyId) throw fail(409,'Connect this school to its practice first.');
  const memberships=['super_admin','superadmin'].includes(role)?[]:await User.getAgencies(actor.id);
  if(!['super_admin','superadmin'].includes(role)) {
    if(role==='school_staff') {
      if(manage || !memberships.some(row=>Number(row.id)===sid)) throw fail(403,'You do not have access to this school.');
    } else if(!memberships.some(row=>Number(row.id)===agencyId) || (!staffRoles.has(role) && !(providers.has(role)&&Number(actor.id)===pid))) {
      throw fail(403,'You do not have scheduling access to this provider.');
    }
  }
  const [assigned]=await db.execute(`SELECT id FROM provider_school_assignments WHERE school_organization_id=? AND provider_user_id=? AND is_active=TRUE LIMIT 1`,[sid,pid]);
  if(!assigned.length) throw fail(403,'This provider is not assigned to this school.');
  const agency=await Agency.findById(agencyId);
  const timeZone=isValidTimeZone(agency?.timezone)?agency.timezone:'America/Denver';
  return {agencyId,schoolId:sid,providerId:pid,timeZone,schoolName:school.name,canManage:staffRoles.has(role),canMove:true};
}

export async function readSchoolTransition({agencyId,schoolId,providerId,db=pool}) {
  try {
    const [[row]]=await db.execute(`SELECT effective_date,revision FROM school_schedule_transitions WHERE agency_id=? AND school_organization_id=? AND provider_user_id=?`,[agencyId,schoolId,providerId]);
    return row?{effectiveDate:row.effective_date instanceof Date?row.effective_date.toISOString().slice(0,10):String(row.effective_date).slice(0,10),revision:Number(row.revision)}:null;
  } catch(error){throw schoolTransitionSchemaError(error);}
}

/** A partial DDL application must never enable a school transition. */
export async function requireSchoolTransitionSchema({db=pool}={}) {
  try {
    await db.execute(`SELECT agency_id,school_organization_id,provider_user_id,effective_date,revision,created_by_user_id,updated_by_user_id FROM school_schedule_transitions LIMIT 0`);
    await db.execute(`SELECT appointment_id,slot_id,planning_weekday,agency_id,school_organization_id,provider_user_id,client_id,series_key,created_by_user_id FROM school_schedule_appointment_links LIMIT 0`);
    const [[trigger]]=await db.execute(`SELECT EVENT_MANIPULATION,ACTION_TIMING,EVENT_OBJECT_TABLE,ACTION_STATEMENT FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='school_schedule_slot_identity_detach'`);
    if(!trigger || trigger.EVENT_MANIPULATION!=='UPDATE' || trigger.ACTION_TIMING!=='BEFORE' || trigger.EVENT_OBJECT_TABLE!=='soft_schedule_slots'
      || normalizedSql(trigger.ACTION_STATEMENT)!==normalizedSql(identityTriggerBody))
      throw fail(503,'The school schedule safety trigger is not ready. Apply and verify database migration 1786 before activating the transition.');
    return true;
  }catch(error){
    if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code)) throw fail(503,'Apply and verify database migration 1786 before activating the school appointment transition.');
    throw error;
  }
}

export async function saveSchoolTransition({context,actorUserId,input,dbPool=pool}) {
  const effectiveDate=schoolTransitionDate(input.effectiveDate);
  if(input.reviewed!==true) throw fail(400,'Review the school appointment transition before saving.');
  const db=await dbPool.getConnection();
  try {
    await db.beginTransaction();
    await requireSchoolTransitionSchema({db});
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[context.agencyId]);
    const current=await readSchoolTransition({...context,db});
    if(Number(input.revision)!==Number(current?.revision||0)) throw fail(409,'The transition changed. Refresh before saving.');
    const rollout=await clientSessionBookingAccess(context.agencyId,context.providerId,db);
    if(!rollout.enabled) throw fail(409,rollout.reason);
    const [[earliest]]=await db.execute(`SELECT MIN(a.start_at) first_start FROM school_schedule_appointment_links l JOIN appointments a ON a.id=l.appointment_id
      WHERE l.agency_id=? AND l.school_organization_id=? AND l.provider_user_id=?`,[context.agencyId,context.schoolId,context.providerId]);
    if(earliest?.first_start && effectiveDate>utcDateToZonedYmd(new Date(iso(earliest.first_start)),context.timeZone))
      throw fail(409,'The effective date must retain already linked school appointments.');
    await db.execute(`INSERT INTO school_schedule_transitions (agency_id,school_organization_id,provider_user_id,effective_date,revision,created_by_user_id,updated_by_user_id)
      VALUES (?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE effective_date=VALUES(effective_date),revision=revision+1,updated_by_user_id=VALUES(updated_by_user_id)`,
      [context.agencyId,context.schoolId,context.providerId,effectiveDate,actorUserId,actorUserId]);
    await db.commit();
    return {effectiveDate,revision:Number(current?.revision||0)+1};
  } catch(error){await db.rollback();throw schoolTransitionSchemaError(error);} finally{db.release();}
}

/** Source identity is explicit: names and same-day appointments never establish a link. */
export async function schoolAgendaLinkContext({db=pool,agencyId,providerId,clientId,date,schoolId,slotId=null,lock=false}) {
  const aid=positive(agencyId,'practice'),sid=positive(schoolId,'school'),pid=positive(providerId,'provider'),cid=positive(clientId,'client');
  schoolTransitionDate(date);
  await requireSchoolTransitionSchema({db});
  const transition=await readSchoolTransition({agencyId:aid,schoolId:sid,providerId:pid,db});
  if(!transition || date<transition.effectiveDate) throw fail(409,'Review the school transition effective date before linking this appointment.');
  const rollout=await clientSessionBookingAccess(aid,pid,db);
  if(!rollout.enabled) throw fail(409,rollout.reason);
  const [slots]=await db.execute(`SELECT s.id,s.weekday,s.client_id FROM soft_schedule_slots s JOIN clients c ON c.id=s.client_id AND c.agency_id=?
    WHERE s.school_organization_id=? AND s.provider_user_id=? AND s.client_id=? ${slotId?'AND s.id=?':''}
    AND (EXISTS (SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=c.id AND coa.organization_id=s.school_organization_id AND coa.is_active=TRUE)
      OR c.organization_id=s.school_organization_id)
    AND (EXISTS (SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id=c.id AND cpa.organization_id=s.school_organization_id AND cpa.provider_user_id=s.provider_user_id AND cpa.is_active=TRUE)
      OR (c.organization_id=s.school_organization_id AND c.provider_id=s.provider_user_id)) ORDER BY s.id${lock?' FOR UPDATE':''}`,[aid,sid,pid,cid,...(slotId?[positive(slotId,'school slot')]:[])]);
  const weekday=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  const candidates=slotId?slots:slots.filter(slot=>slot.weekday===weekday);
  if(candidates.length!==1) throw fail(409,candidates.length?'Choose the exact school slot for this client.':'Save and select this client’s school slot before linking the appointment.');
  return {slotId:Number(candidates[0].id),planningWeekday:candidates[0].weekday,schoolId:sid,agencyId:aid,providerId:pid,clientId:cid,effectiveDate:transition.effectiveDate};
}

export async function linkSchoolAppointment({db=pool,agencyId,schoolId,slotId,appointmentId,actorUserId,seriesKey=null}) {
  if(db===pool) {
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[agencyId]);
      const result=await linkSchoolAppointment({db:connection,agencyId,schoolId,slotId,appointmentId,actorUserId,seriesKey});
      await connection.commit();return result;
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  const id=positive(appointmentId,'appointment');
  const [[appointment]]=await db.execute(`SELECT a.*,sl.school_organization_id FROM appointments a
    LEFT JOIN agency_service_locations sl ON sl.id=a.service_location_id AND sl.agency_id=a.agency_id WHERE a.id=? AND a.agency_id=? FOR UPDATE`,[id,agencyId]);
  if(!appointment || Number(appointment.school_organization_id)!==Number(schoolId)) throw fail(409,'The appointment must use this school’s service location.');
  const [participants]=await db.execute('SELECT client_id FROM appointment_participants WHERE appointment_id=? AND client_id IS NOT NULL FOR UPDATE',[id]);
  if(participants.length!==1) throw fail(409,'Link individual school appointments with exactly one client.');
  const context=await schoolAgendaLinkContext({db,agencyId,schoolId,slotId,lock:true,providerId:appointment.provider_user_id,clientId:participants[0].client_id,
    date:utcDateToZonedYmd(new Date(iso(appointment.start_at)),appointment.source_timezone||'America/Denver')});
  const [[existing]]=await db.execute('SELECT slot_id,agency_id,school_organization_id,provider_user_id,client_id FROM school_schedule_appointment_links WHERE appointment_id=? FOR UPDATE',[id]);
  if(existing) {
    if(Number(existing.slot_id)!==context.slotId || Number(existing.agency_id)!==context.agencyId || Number(existing.school_organization_id)!==context.schoolId || Number(existing.provider_user_id)!==context.providerId || Number(existing.client_id)!==context.clientId)
      throw fail(409,'This appointment is already linked to a different school slot.');
    return {appointmentId:id,slotId:context.slotId,alreadyLinked:true};
  }
  await db.execute(`INSERT INTO school_schedule_appointment_links (appointment_id,slot_id,planning_weekday,agency_id,school_organization_id,provider_user_id,client_id,series_key,created_by_user_id)
    VALUES (?,?,?,?,?,?,?,?,?)`,[id,context.slotId,context.planningWeekday,context.agencyId,context.schoolId,context.providerId,context.clientId,seriesKey?String(seriesKey).slice(0,100):null,actorUserId]);
  return {appointmentId:id,slotId:context.slotId,alreadyLinked:false};
}

/** Canonical times are read live, so provider recurrence edits need no copied schedule. */
export async function listSchoolBookedSessions({context,startDate,endDate,db=pool}) {
  schoolTransitionDate(startDate);schoolTransitionDate(endDate);
  if(endDate<=startDate || (Date.parse(`${endDate}T12:00Z`)-Date.parse(`${startDate}T12:00Z`))/86400000>32) throw fail(400,'Choose a date range of up to 32 days.');
  const transition=await readSchoolTransition({...context,db});
  if(!transition) return {transition:null,appointments:[],timeZone:context.timeZone};
  const [rows]=await db.execute(`SELECT a.id,a.provider_user_id,a.start_at,a.end_at,a.status,a.product_origin,a.source_timezone,
    l.slot_id,l.client_id,l.series_key,l.planning_weekday,c.initials,c.identifier_code
    FROM school_schedule_appointment_links l JOIN appointments a ON a.id=l.appointment_id AND a.agency_id=l.agency_id AND a.provider_user_id=l.provider_user_id
    JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=l.client_id
    JOIN clients c ON c.id=l.client_id AND c.agency_id=l.agency_id
    JOIN agency_service_locations sl ON sl.id=a.service_location_id AND sl.agency_id=a.agency_id AND sl.school_organization_id=l.school_organization_id
    WHERE l.agency_id=? AND l.school_organization_id=? AND l.provider_user_id=? AND a.start_at<? AND a.end_at>?
      AND (EXISTS (SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=c.id AND coa.organization_id=l.school_organization_id AND coa.is_active=TRUE) OR c.organization_id=l.school_organization_id)
    ORDER BY a.start_at,a.id LIMIT 1001`,[context.agencyId,context.schoolId,context.providerId,wallMysqlToUtcMysql(`${endDate} 00:00:00`,context.timeZone),wallMysqlToUtcMysql(`${startDate} 00:00:00`,context.timeZone)]);
  if(rows.length>1000) throw fail(422,'Choose a shorter school schedule range.');
  return {transition,timeZone:context.timeZone,appointments:rows.map(row=>({id:Number(row.id),slotId:row.slot_id?Number(row.slot_id):null,clientId:Number(row.client_id),
    clientLabel:row.identifier_code||row.initials||`Client ${row.client_id}`,startAt:iso(row.start_at),endAt:iso(row.end_at),status:row.status,
    planningWeekday:row.planning_weekday,seriesKey:row.series_key||null,fingerprint:schoolAppointmentFingerprint(row),
    canMove:['scheduled','confirmed'].includes(row.status)&&Date.parse(iso(row.start_at))>Date.now()&&row.product_origin!=='auricwell_ehr'}))};
}

export async function moveSchoolBookedSession({context,appointmentId,actorUserId,input,db=pool,move=updateAppointment}) {
  const date=schoolTransitionDate(input.date),start=String(input.startTime||''),end=String(input.endTime||'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start) throw fail(400,'Choose valid start and end times on the same day.');
  const day=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  if(['Saturday','Sunday'].includes(day)) throw fail(400,'School appointments must be on a school weekday.');
  const transition=await readSchoolTransition({...context,db});
  if(!transition||date<transition.effectiveDate) throw fail(409,'This date is before the school appointment transition.');
  // The reviewed occurrence helper rejects missing and repeated DST wall times.
  const timing=occurrenceTime(`${date}T${start}`,0,(Number(end.slice(0,2))*60+Number(end.slice(3)))-(Number(start.slice(0,2))*60+Number(start.slice(3))),context.timeZone);
  if(Date.parse(timing.start)<=Date.now()) throw fail(409,'Only future school appointments can be moved.');
  const closures=await createSchoolDayClosures({db}).listProviderSchoolDayClosures({providerId:context.providerId,agencyIds:[context.agencyId],startDate:date,endDate:addDaysYmd(date,1)});
  if(closures.some(row=>Number(row.schoolOrgId)===Number(context.schoolId)&&row.date===date)) throw fail(409,'School is closed or sessions are prohibited on this date.');
  const [hours]=await db.execute(`SELECT start_time,end_time FROM provider_school_assignments WHERE school_organization_id=? AND provider_user_id=? AND day_of_week=? AND is_active=TRUE`,[context.schoolId,context.providerId,day]);
  if(!hours.some(row=>(!row.start_time||start>=String(row.start_time).slice(0,5))&&(!row.end_time||end<=String(row.end_time).slice(0,5)))) throw fail(409,'Choose a time within the provider’s assigned school hours.');
  const [[row]]=await db.execute(`SELECT a.*,l.client_id school_link_client_id FROM school_schedule_appointment_links l JOIN appointments a ON a.id=l.appointment_id
    JOIN agency_service_locations sl ON sl.id=a.service_location_id AND sl.agency_id=a.agency_id AND sl.school_organization_id=l.school_organization_id
    JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=l.client_id
    JOIN clients c ON c.id=l.client_id AND c.agency_id=l.agency_id
    WHERE l.appointment_id=? AND l.agency_id=? AND l.school_organization_id=? AND l.provider_user_id=? AND a.agency_id=l.agency_id AND a.provider_user_id=l.provider_user_id
      AND (EXISTS(SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=c.id AND coa.organization_id=l.school_organization_id AND coa.is_active=TRUE) OR c.organization_id=l.school_organization_id)`,
    [positive(appointmentId,'appointment'),context.agencyId,context.schoolId,context.providerId]);
  if(!row) throw fail(404,'Linked school appointment not found.');
  if(schoolAppointmentFingerprint(row)!==input.fingerprint) throw fail(409,'The appointment changed. Refresh the school schedule before saving.');
  if(!['scheduled','confirmed','client_confirmed'].includes(row.status)||Date.parse(iso(row.start_at))<=Date.now()) throw fail(409,'Preserve past, completed and canceled school appointments.');
  // Only time fields cross this school-specific boundary. No role elevation,
  // clinical/billing payload, participant or provider change is accepted.
  const expected=await readAppointmentRecord(context.agencyId,row.id,db);
  await move(row.id,{startAt:timing.start,endAt:timing.end,timeZone:context.timeZone},{actorUserId,expectedScheduleFingerprint:expected.fingerprint,expectedParticipantClientId:Number(row.school_link_client_id)});
  return {ok:true,appointmentId:Number(row.id)};
}

export async function annotateSchoolSlotLinks({schoolId,providerId,slots,db=pool}) {
  try {
    const [rows]=await db.execute(`SELECT DISTINCT l.slot_id FROM school_schedule_appointment_links l JOIN school_schedule_transitions t
      ON t.agency_id=l.agency_id AND t.school_organization_id=l.school_organization_id AND t.provider_user_id=l.provider_user_id
      JOIN soft_schedule_slots s ON s.id=l.slot_id AND s.client_id=l.client_id AND s.provider_user_id=l.provider_user_id
      WHERE l.school_organization_id=? AND l.provider_user_id=?`,[schoolId,providerId]);
    const linked=new Set(rows.map(row=>Number(row.slot_id)));
    return slots.map(slot=>({...slot,appointment_linked:linked.has(Number(slot.id))}));
  } catch(error) { if(error.code==='ER_NO_SUCH_TABLE') return slots;throw error; }
}

export async function assertLinkedSchoolSlotPlanningEdits({schoolId,providerId,weekday,slots,db=pool}) {
  if(!schoolWeekdays.includes(weekday)) throw fail(400,'Choose a school weekday before saving planning slots.');
  const [existing]=await db.execute(`SELECT s.id,s.client_id,s.start_time,s.end_time FROM soft_schedule_slots s
    JOIN school_schedule_appointment_links l ON l.slot_id=s.id WHERE s.school_organization_id=? AND s.provider_user_id=? AND s.weekday=? GROUP BY s.id`,[schoolId,providerId,weekday]);
  for(const saved of existing) {
    const proposed=slots.find(slot=>Number(slot.id)===Number(saved.id));
    const clock=value=>value?String(value).slice(0,5):'';
    if(!proposed || Number(saved.client_id||0)!==Number(proposed.client_id||0) || clock(saved.start_time)!==clock(proposed.start_time) || clock(saved.end_time)!==clock(proposed.end_time))
      throw fail(409,'This slot has booked school appointments. Change the actual appointment in Booked school sessions; its clinical history and capacity are retained.');
  }
}
