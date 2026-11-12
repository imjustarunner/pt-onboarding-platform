import pool from '../config/database.js';
import {STAFF_ROLES} from '../utils/staffEligibility.js';
import {isNluChildcareAgency} from './compensationCategories.service.js';
import {calculateChildcarePay,childcareRateSchedule,childcareSnapshotHash,childcareSnapshotHashMatches,childcareWorkIntervals,childcareStoredIso} from './childcarePay.service.js';
import {toUtcIso,utcDateToZonedYmd,dateToMysqlUtcDateTime} from '../utils/zonedWallTime.util.js';
import {assertAppointmentWindowAvailable} from './appointmentConflict.service.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';

const parse=value=>{try{return typeof value==='string'?JSON.parse(value):(value||{});}catch{return {};}};
const fail=(status,message,code='CHILDCARE_REQUEST_INVALID')=>{throw Object.assign(new Error(message),{status,code});};
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail(400,'A valid organization or record ID is required.');return n;};
const count=value=>{const n=Number(value);if(value==null||value===''||!Number.isSafeInteger(n)||n<0||n>1000)fail(400,'Enter the actual number of children, from zero through 1000.');return n;};
const active=row=>row&&Number(row.is_active)===1&&!Number(row.is_archived)&&!Number(row.is_assistant_account)&&!row.terminated_at&&['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(row.status||'').toUpperCase())&&STAFF_ROLES.includes(String(row.role||'').toLowerCase());
const sqlInstant=value=>dateToMysqlUtcDateTime(new Date(value));
const jsonParams=value=>JSON.stringify(value);
const providerSelectionLocks=Symbol('childcareProviderSelectionLocks');

async function audit(db,{agencyId,userId,action,metadata}) {
  const [result]=await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',[action,userId,agencyId,jsonParams(metadata)]);
  return result.insertId;
}
async function transaction(work) {
  const db=await pool.getConnection();
  try{await db.beginTransaction();const result=await work(db);await db.commit();return result;}
  catch(error){await db.rollback();throw error;}finally{
    let unlockFailed=false;
    for(const key of db[providerSelectionLocks]||[])try{await db.execute('SELECT RELEASE_LOCK(?)',[key]);}catch{unlockFailed=true;}
    delete db[providerSelectionLocks];
    if(unlockFailed&&typeof db.destroy==='function')db.destroy();else db.release();
  }
}
async function lockProviderSelections(db,userIds) {
  db[providerSelectionLocks]||=[];
  for(const uid of [...new Set(userIds)].sort((a,b)=>a-b)) {
    const key=`public-provider-selection:${uid}`;
    if(db[providerSelectionLocks].includes(key))continue;
    const [[lock]]=await db.execute('SELECT GET_LOCK(?, 5) AS acquired',[key]);
    if(Number(lock?.acquired)!==1)fail(409,'Another booking is checking this employee’s calendar. Please retry.');
    db[providerSelectionLocks].push(key);
  }
}

export async function childcareContext({agencyId,userId},db=pool) {
  const aid=id(agencyId),uid=id(userId);
  const [[agency]] = await db.execute('SELECT id,slug,name,feature_flags,is_active FROM agencies WHERE id=? AND COALESCE(is_archived,0)=0',[aid]);
  const [[user]] = await db.execute(`SELECT u.*,ua.is_active AS membership_active FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=? LIMIT 1`,[aid,uid]);
  if(!active(user)||Number(user.membership_active??1)!==1)fail(403,'An active employee membership in this organization is required.','CHILDCARE_ACCESS_DENIED');
  const enabled=isNluChildcareAgency(agency)&&Number(agency.is_active)===1&&parse(agency.feature_flags).childcareEnabled!==false;
  if(!enabled)fail(403,'Childcare is not enabled for this organization.','CHILDCARE_ACCESS_DENIED');
  const access=await readAgencyAccess(uid,aid,db);
  if(!access||!STAFF_ROLES.includes(access.role))fail(403,'Current employee access to this company is required.','CHILDCARE_ACCESS_DENIED');
  const [[saved]]=await db.execute('SELECT enabled,self_schedule,manage_schedule FROM childcare_service_grants WHERE agency_id=? AND user_id=?',[aid,uid]);
  const grant=saved?{enabled:!!Number(saved.enabled),selfSchedule:!!Number(saved.self_schedule),manageSchedule:!!Number(saved.manage_schedule)}:null;
  const canManagePermissions=user.role==='super_admin'||access.role==='admin',canManage=canManagePermissions||!!(grant?.enabled&&grant?.manageSchedule);
  return {agencyId:aid,agencySlug:agency.slug,enabled:true,canManage,canManagePermissions,canManagePay:canManagePermissions,canWork:!!grant?.enabled,canSchedule:canManage||!!(grant?.enabled&&grant?.selfSchedule),serviceRoles:grant?.enabled?['childcare']:[],grant};
}
export async function listChildcareStaff({agencyId,userId},db=pool) {
  const ctx=await childcareContext({agencyId,userId},db);if(!ctx.canManage)fail(403,'Childcare staff management requires an organization administrator.');
  const [rows]=await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.status,u.is_active,u.is_archived,u.terminated_at,g.enabled,g.self_schedule,g.manage_schedule
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    LEFT JOIN childcare_service_grants g ON g.agency_id=ua.agency_id AND g.user_id=u.id ORDER BY u.first_name,u.last_name,u.id`,[ctx.agencyId]);
  return {staff:rows.filter(active).map(row=>({userId:Number(row.id),firstName:row.first_name,lastName:row.last_name,role:row.role,grant:{enabled:!!Number(row.enabled),selfSchedule:!!Number(row.self_schedule),manageSchedule:!!Number(row.manage_schedule)}}))};
}
export async function saveChildcareGrant({agencyId,userId,targetUserId,enabled,selfSchedule=false,manageSchedule=false}) {
  if(typeof enabled!=='boolean'||typeof selfSchedule!=='boolean'||typeof manageSchedule!=='boolean')fail(400,'Use explicit childcare and scheduling permission choices.');
  return transaction(async db=>{
    const ctx=await childcareContext({agencyId,userId},db);if(!ctx.canManagePermissions)fail(403,'Only an organization administrator may assign childcare permissions.');
    const target=id(targetUserId);
    const [[employee]]=await db.execute(`SELECT u.*,ua.is_active membership_active FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=? FOR UPDATE`,[ctx.agencyId,target]);
    if(!active(employee)||Number(employee.membership_active??1)!==1)fail(409,'Complete the employee’s normal activation before assigning childcare.');
    await db.execute(`INSERT INTO childcare_service_grants(agency_id,user_id,enabled,self_schedule,manage_schedule,granted_by_user_id) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),self_schedule=VALUES(self_schedule),manage_schedule=VALUES(manage_schedule),granted_by_user_id=VALUES(granted_by_user_id)`,[ctx.agencyId,target,enabled?1:0,enabled&&selfSchedule?1:0,enabled&&manageSchedule?1:0,Number(userId)]);
    const auditRowId=await audit(db,{agencyId:ctx.agencyId,userId,action:'childcare_permission_changed',metadata:{targetUserId:target,enabled,selfSchedule:enabled&&selfSchedule,manageSchedule:enabled&&manageSchedule}});
    return {userId:target,grant:{enabled,selfSchedule:enabled&&selfSchedule,manageSchedule:enabled&&manageSchedule},auditRowId};
  });
}
export async function getChildcareStaffRates({agencyId,userId,targetUserId,asOfDate},db=pool) {
  const ctx=await childcareContext({agencyId,userId},db),target=id(targetUserId);
  if(!ctx.canManagePay&&target!==Number(userId))fail(403,'Employees may only view their own childcare rates.');
  const [[membership]]=await db.execute('SELECT user_id FROM user_agencies WHERE agency_id=? AND user_id=? AND COALESCE(is_active,1)=1',[ctx.agencyId,target]);
  if(!membership)fail(404,'Employee not found in this organization.');
  const day=asOfDate||utcDateToZonedYmd(new Date(),'America/Denver');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))fail(400,'Choose a valid service date.');
  try {const {profile,...schedule}=await childcareRateSchedule({agencyId:ctx.agencyId,userId:target,asOfDate:day,db});return schedule;}
  catch(error){if(error.code!=='CHILDCARE_PAY_REVIEW_REQUIRED')throw error;return {ratesByBand:null,category:null,childcareLevel:null,scheduleId:null,reviewRequired:true,reasons:[error.message]};}
}

async function loadShift(shiftId,db=pool,{lock=false}={}) {
  const [[shift]]=await db.execute(`SELECT s.*,e.title,e.starts_at,e.ends_at,e.timezone,e.is_active,e.school_event_status
    FROM childcare_shifts s JOIN company_events e ON e.id=s.company_event_id AND e.agency_id=s.agency_id WHERE s.id=? ${lock?'FOR UPDATE':''}`,[id(shiftId)]);
  if(!shift)fail(404,'Childcare shift not found.');return shift;
}
async function assigned(shift,userId,db) {
  const [[row]]=await db.execute('SELECT id FROM company_event_provider_assignments WHERE company_event_id=? AND provider_user_id=?',[shift.company_event_id,Number(userId)]);return !!row;
}
async function authorizeShift(shift,userId,db,{work=false}={}) {
  const ctx=await childcareContext({agencyId:shift.agency_id,userId},db),onShift=await assigned(shift,userId,db);
  if(!ctx.canManage&&!onShift)fail(404,'Childcare shift not found.');
  if(work&&(!ctx.canWork||!onShift))fail(403,'An active childcare assignment to this shift is required.');
  return {...ctx,onShift};
}
async function shiftSources(shift,db) {
  const [punches]=await db.execute('SELECT id,user_id,punch_type,punched_at FROM skill_builders_event_kiosk_punches WHERE company_event_id=? ORDER BY punched_at,id',[shift.company_event_id]);
  const [attendance]=await db.execute('SELECT * FROM childcare_attendance_events WHERE shift_id=? ORDER BY effective_at,version',[shift.id]);
  return {punches,attendance};
}
async function mapShift(shift,userId,db=pool) {
  const [providers]=await db.execute(`SELECT u.id,u.first_name,u.last_name,
    (SELECT MIN(p.punched_at) FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=a.company_event_id AND p.user_id=u.id AND p.punch_type='clock_in') first_clock_in,
    (SELECT p.punch_type FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=a.company_event_id AND p.user_id=u.id ORDER BY p.punched_at DESC,p.id DESC LIMIT 1) last_punch,
    (SELECT MAX(p.punched_at) FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=a.company_event_id AND p.user_id=u.id AND p.punch_type='clock_in') last_clock_in,
    (SELECT MAX(p.punched_at) FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=a.company_event_id AND p.user_id=u.id AND p.punch_type='clock_out') last_clock_out
    FROM company_event_provider_assignments a JOIN users u ON u.id=a.provider_user_id WHERE a.company_event_id=? ORDER BY u.id`,[shift.company_event_id]);
  const mine=providers.find(row=>Number(row.id)===Number(userId));
  return {id:Number(shift.id),eventId:Number(shift.company_event_id),agencyId:Number(shift.agency_id),title:shift.title,startsAt:childcareStoredIso(shift.starts_at),endsAt:childcareStoredIso(shift.ends_at),firstClockInAt:providers.map(row=>childcareStoredIso(row.first_clock_in)).filter(Boolean).sort()[0]||null,timezone:shift.timezone,status:shift.status,plannedChildren:Number(shift.planned_children),actualChildren:shift.actual_children==null?null:Number(shift.actual_children),attendanceVersion:Number(shift.attendance_version),attendanceReviewRequired:!!Number(shift.attendance_review_required),locationName:shift.location_name||'',note:shift.private_note||'',minimumHourlyRate:shift.minimum_hourly_rate==null?null:Number(shift.minimum_hourly_rate),wageFloorJurisdiction:shift.wage_floor_jurisdiction||'',providers:providers.map(row=>({userId:Number(row.id),firstName:row.first_name,lastName:row.last_name,clockedIn:row.last_punch==='clock_in'})),myParticipation:{assigned:!!mine,clockedIn:mine?.last_punch==='clock_in',clockedInAt:childcareStoredIso(mine?.last_clock_in)||null,clockedOutAt:childcareStoredIso(mine?.last_clock_out)||null}};
}
export async function listChildcareShifts({agencyId,userId},db=pool) {
  const ctx=await childcareContext({agencyId,userId},db);if(!ctx.canManage&&!ctx.canWork)fail(403,'Childcare access is required.');
  const [rows]=await db.execute(`SELECT s.*,e.title,e.starts_at,e.ends_at,e.timezone FROM childcare_shifts s JOIN company_events e ON e.id=s.company_event_id
    WHERE s.agency_id=? ${ctx.canManage?'':'AND EXISTS(SELECT 1 FROM company_event_provider_assignments a WHERE a.company_event_id=s.company_event_id AND a.provider_user_id=?)'} ORDER BY e.starts_at DESC,s.id DESC LIMIT 200`,ctx.canManage?[ctx.agencyId]:[ctx.agencyId,Number(userId)]);
  return {shifts:await Promise.all(rows.map(row=>mapShift(row,userId,db))),limit:200};
}
export async function getChildcareShift({shiftId,userId},db=pool) {
  const shift=await loadShift(shiftId,db);await authorizeShift(shift,userId,db);
  await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_shift_viewed',metadata:{shiftId:Number(shift.id),eventId:Number(shift.company_event_id)}});
  return {shift:await mapShift(shift,userId,db)};
}

export function normalizeChildcareShift(body,existing={}) {
  const value={...existing,...body};
  const start=new Date(value.startsAt),end=new Date(value.endsAt);
  if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(value.startsAt))||!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(value.endsAt))||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>24*3600000)fail(400,'Choose a shift of up to 24 hours with start and end times including their timezone offset.');
  const timezone=String(value.timezone||'America/Denver');try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(start);}catch{fail(400,'Choose a valid timezone.');}
  const providers=value.providerUserIds;
  if(!Array.isArray(providers)||!providers.length||providers.length>50)fail(400,'Assign at least one childcare provider.');
  const providerUserIds=[...new Set(providers.map(id))];
  const plannedChildren=count(value.plannedChildren);
  const floor=value.minimumHourlyRate==null||value.minimumHourlyRate===''?null:Number(value.minimumHourlyRate);
  if(floor!==null&&(!Number.isFinite(floor)||floor<=0||floor>100000))fail(400,'Confirm a positive applicable hourly wage floor.');
  if(String(value.note||'').length>4000)fail(400,'Keep the private shift note under 4,000 characters.');
  return {title:String(value.title||'Childcare').trim().slice(0,255)||'Childcare',startsAt:start.toISOString(),endsAt:end.toISOString(),timezone,plannedChildren,providerUserIds,note:String(value.note||'').trim(),locationName:String(value.locationName||'').trim().slice(0,255),minimumHourlyRate:floor,wageFloorJurisdiction:String(value.wageFloorJurisdiction||'').trim().slice(0,255)};
}
async function validateProviders(ctx,providerUserIds,userId,db) {
  if(!ctx.canSchedule)fail(403,'Childcare scheduling permission is required.');
  if(!ctx.canManage&&(providerUserIds.length!==1||providerUserIds[0]!==Number(userId)))fail(403,'Self-scheduling may only assign your own childcare work.');
  await lockProviderSelections(db,providerUserIds);
  for(const uid of [...providerUserIds].sort((a,b)=>a-b)) {
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[uid]);
    const worker=await childcareContext({agencyId:ctx.agencyId,userId:uid},db);
    if(!worker.canWork)fail(409,'Every assigned employee needs active childcare permission.');
  }
}
async function checkConflicts(value,db,excludeShiftId=0) {
  for(const uid of value.providerUserIds) {
    await assertAppointmentWindowAvailable(db,{providerUserId:uid,startAt:sqlInstant(value.startsAt),endAt:sqlInstant(value.endsAt),status:'scheduled',sourceTimezone:value.timezone,excludeChildcareShiftId:excludeShiftId});
  }
}
export async function createChildcareShift({userId,...body}) {
  return transaction(async db=>{
    const ctx=await childcareContext({agencyId:body.agencyId,userId},db);
    const value=normalizeChildcareShift({...body,providerUserIds:body.providerUserIds||[Number(userId)]});
    await validateProviders(ctx,value.providerUserIds,userId,db);await checkConflicts(value,db);
    if(!ctx.canManagePay&&(value.minimumHourlyRate!=null||value.wageFloorJurisdiction))fail(403,'A pay administrator must confirm work-location compensation settings.');
    const [[agency]]=await db.execute('SELECT feature_flags FROM agencies WHERE id=?',[ctx.agencyId]);
    const floor=parse(agency.feature_flags).childcareWageFloor||{};
    const [event]=await db.execute(`INSERT INTO company_events(agency_id,created_by_user_id,updated_by_user_id,title,event_type,description,starts_at,ends_at,timezone,is_active,rsvp_mode)
      VALUES (?,?,?,?,'childcare',?,?,?, ?,1,'none')`,[ctx.agencyId,userId,userId,value.title,`${value.plannedChildren} children planned`,sqlInstant(value.startsAt),sqlInstant(value.endsAt),value.timezone]);
    const [created]=await db.execute(`INSERT INTO childcare_shifts(agency_id,company_event_id,planned_children,private_note,location_name,minimum_hourly_rate,wage_floor_jurisdiction,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)`,[ctx.agencyId,event.insertId,value.plannedChildren,value.note||null,value.locationName||null,value.minimumHourlyRate??floor.minimumHourlyRate??null,value.wageFloorJurisdiction||floor.jurisdiction||null,userId]);
    for(const uid of value.providerUserIds) {
      await db.execute("INSERT INTO company_event_provider_assignments(company_event_id,provider_user_id,role_title,role_key) VALUES (?,?,'Childcare provider','childcare')",[event.insertId,uid]);
      await db.execute("INSERT INTO company_event_audiences(company_event_id,audience_type,target_id) VALUES (?,'user',?)",[event.insertId,uid]);
    }
    const auditRowId=await audit(db,{agencyId:ctx.agencyId,userId,action:'childcare_shift_created',metadata:{shiftId:created.insertId,eventId:event.insertId,plannedChildren:value.plannedChildren,providerUserIds:value.providerUserIds}});
    return {shift:await mapShift(await loadShift(created.insertId,db),userId,db),auditRowId};
  });
}
export async function updateChildcareShift({shiftId,userId,...body}) {
  return transaction(async db=>{
    const initial=await loadShift(shiftId,db),initialContext=await authorizeShift(initial,userId,db);
    if(!initialContext.canManage&&Number(initial.created_by_user_id)!==Number(userId))fail(403,'Only the shift manager or self-scheduling creator may change this shift.');
    const currentStaff=await mapShift(initial,userId,db);
    const nextStaff=body.providerUserIds==null?[]:(Array.isArray(body.providerUserIds)?body.providerUserIds.map(id):fail(400,'Select childcare provider IDs.'));
    const lockUsers=[...new Set([...currentStaff.providers.map(row=>row.userId),...nextStaff])].sort((a,b)=>a-b);
    await lockProviderSelections(db,lockUsers);
    for(const uid of lockUsers)await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[uid]);
    const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db);
    if(!ctx.canManage&&Number(shift.created_by_user_id)!==Number(userId))fail(403,'Only the shift manager or self-scheduling creator may change this shift.');
    const {punches}=await shiftSources(shift,db);
    if(punches.length) {
      if(!ctx.canManage)fail(403,'A manager must review changes after recorded work.');
    }
    if(body.agencyId!=null&&Number(body.agencyId)!==Number(shift.agency_id))fail(403,'This shift belongs to another organization.');
    const current=await mapShift(shift,userId,db),value=normalizeChildcareShift({...body,providerUserIds:body.providerUserIds||current.providers.map(row=>row.userId)},current);
    if(!ctx.canManagePay&&(value.minimumHourlyRate!==current.minimumHourlyRate||value.wageFloorJurisdiction!==current.wageFloorJurisdiction))fail(403,'Only a pay administrator may change work-location pay settings.');
    if(!punches.length){await validateProviders(ctx,value.providerUserIds,userId,db);await checkConflicts(value,db,shift.id);}
    if(body.status!=null&&!['scheduled','canceled'].includes(body.status))fail(400,'Use scheduled or canceled for a childcare shift.');
    const status=body.status||shift.status;
    const scheduleChanged=['title','startsAt','endsAt','timezone','plannedChildren','locationName'].some(key=>JSON.stringify(value[key])!==JSON.stringify(current[key]))||status!==shift.status||JSON.stringify([...value.providerUserIds].sort((a,b)=>a-b))!==JSON.stringify(current.providers.map(row=>row.userId).sort((a,b)=>a-b));
    if(punches.length&&scheduleChanged)fail(409,'Recorded work keeps its original schedule and staffing. Review attendance or create a separate future shift.');
    await db.execute('UPDATE company_events SET title=?,description=?,starts_at=?,ends_at=?,timezone=?,updated_by_user_id=?,school_event_status=? WHERE id=?',[value.title,`${value.plannedChildren} children planned`,sqlInstant(value.startsAt),sqlInstant(value.endsAt),value.timezone,userId,status==='canceled'?'canceled':null,shift.company_event_id]);
    await db.execute('UPDATE childcare_shifts SET planned_children=?,private_note=?,location_name=?,minimum_hourly_rate=?,wage_floor_jurisdiction=?,status=? WHERE id=?',[value.plannedChildren,value.note||null,value.locationName||null,value.minimumHourlyRate,value.wageFloorJurisdiction||null,status,shift.id]);
    if(scheduleChanged)await db.execute('UPDATE childcare_shifts SET schedule_version=schedule_version+1 WHERE id=?',[shift.id]);
    if(!punches.length){
      await db.execute('DELETE FROM company_event_provider_assignments WHERE company_event_id=?',[shift.company_event_id]);
      await db.execute('DELETE FROM company_event_audiences WHERE company_event_id=?',[shift.company_event_id]);
      for(const uid of value.providerUserIds){await db.execute("INSERT INTO company_event_provider_assignments(company_event_id,provider_user_id,role_title,role_key) VALUES (?,?,'Childcare provider','childcare')",[shift.company_event_id,uid]);await db.execute("INSERT INTO company_event_audiences(company_event_id,audience_type,target_id) VALUES (?,'user',?)",[shift.company_event_id,uid]);}
    }
    if(punches.length)await refreshChildcarePay(await loadShift(shift.id,db),db);
    const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_shift_updated',metadata:{shiftId:shift.id,eventId:shift.company_event_id,status,plannedChildren:value.plannedChildren}});
    return {shift:await mapShift(await loadShift(shift.id,db),userId,db),auditRowId};
  });
}

async function recordAttendance(shift,{actualChildren,confirmPlannedCount,expectedVersion,source,userId,now,reviewChange=false,effectiveAt=null,reviewNote=''},db) {
  if(expectedVersion!=null&&Number(expectedVersion)!==Number(shift.attendance_version))fail(409,'Attendance changed. Refresh the current child count before confirming.','CHILDCARE_STALE_ATTENDANCE');
  const actual=confirmPlannedCount===true?Number(shift.planned_children):count(actualChildren);
  if(actualChildren!=null&&confirmPlannedCount===true&&Number(actualChildren)!==Number(shift.planned_children))fail(400,'Confirm the planned count or enter the actual count.');
  const changed=shift.actual_children!=null&&actual!==Number(shift.actual_children);
  const needsReview=reviewChange&&changed;
  const version=Number(shift.attendance_version)+1;
  await db.execute('INSERT INTO childcare_attendance_events(shift_id,actor_user_id,actual_children,effective_at,version,source,needs_review,review_note) VALUES (?,?,?,?,?,?,?,?)',[shift.id,userId,actual,sqlInstant(effectiveAt||now),version,source,needsReview?1:0,reviewNote?String(reviewNote).slice(0,2000):null]);
  const [[latest]]=await db.execute('SELECT actual_children FROM childcare_attendance_events WHERE shift_id=? ORDER BY effective_at DESC,version DESC LIMIT 1',[shift.id]);
  const current=latest?.actual_children??actual;
  await db.execute('UPDATE childcare_shifts SET actual_children=?,attendance_version=?,attendance_review_required=IF(?,1,attendance_review_required) WHERE id=?',[current,version,needsReview?1:0,shift.id]);
  Object.assign(shift,{actual_children:current,attendance_version:version,attendance_review_required:needsReview||shift.attendance_review_required});
}
async function refreshChildcarePay(shift,db) {
  const {punches,attendance}=await shiftSources(shift,db),users=[...new Set(punches.map(row=>Number(row.user_id)))];
  for(const userId of users) {
    const snapshot=await calculateChildcarePay({shift,userId,punches,attendance,db}),hash=childcareSnapshotHash(snapshot);
    const [[saved]]=await db.execute('SELECT s.*,c.status claim_status FROM childcare_pay_snapshots s LEFT JOIN payroll_time_claims c ON c.id=s.payroll_time_claim_id WHERE s.shift_id=? AND s.user_id=? FOR UPDATE',[shift.id,userId]);
    if(saved&&['approved','paid'].includes(saved.claim_status)) {
      const stored=parse(saved.snapshot_json);
      if(!childcareSnapshotHashMatches(stored,saved.snapshot_hash)||childcareSnapshotHash(stored)!==hash)await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_pay_correction_required',metadata:{shiftId:shift.id,claimId:saved.payroll_time_claim_id,reason:'Attendance or compensation changed after approval. Preserve approved earnings and review a separate correction.'}});
      continue;
    }
    const payload={source:'childcare_shift',companyEventId:Number(shift.company_event_id),childcareShiftId:Number(shift.id),childcareSnapshot:snapshot,childcareSnapshotHash:hash,childcareSnapshotHashVersion:2,totalMinutes:snapshot.totalMinutes,bucket:'direct',categoryLabel:'Childcare',rateReviewRequired:snapshot.reviewRequired,clockInAt:snapshot.segments[0]?.startedAt||null,clockOutAt:snapshot.segments.at(-1)?.endedAt||null};
    let claimId=saved?.payroll_time_claim_id||null;
    if(snapshot.totalMinutes>0) {
      if(claimId)await db.execute("UPDATE payroll_time_claims SET payload_json=?,status=?,credits_hours=?,bucket='direct' WHERE id=? AND status IN ('submitted','deferred','rejected')",[jsonParams(payload),snapshot.reviewRequired?'deferred':'submitted',snapshot.totalMinutes/60,claimId]);
      else {
        const [created]=await db.execute(`INSERT INTO payroll_time_claims(agency_id,user_id,submitted_by_user_id,status,claim_type,claim_date,payload_json,credits_hours,bucket) VALUES (?,?,?,?,'childcare_shift',?,?,?,'direct')`,[shift.agency_id,userId,userId,snapshot.reviewRequired?'deferred':'submitted',utcDateToZonedYmd(new Date(snapshot.segments.at(-1).endedAt),shift.timezone),jsonParams(payload),snapshot.totalMinutes/60]);claimId=created.insertId;
      }
      const punchIds=snapshot.segments.flatMap(row=>[row.punchInId,row.punchOutId]);
      if(punchIds.length)await db.execute(`UPDATE skill_builders_event_kiosk_punches SET payroll_time_claim_id=? WHERE id IN (${punchIds.map(()=>'?').join(',')})`,[claimId,...punchIds]);
    }
    await db.execute('INSERT INTO childcare_pay_snapshots(shift_id,user_id,snapshot_json,snapshot_hash,payroll_time_claim_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE snapshot_json=VALUES(snapshot_json),snapshot_hash=VALUES(snapshot_hash),payroll_time_claim_id=VALUES(payroll_time_claim_id)',[shift.id,userId,jsonParams(snapshot),hash,claimId]);
  }
}
export async function recordChildcareAction({shiftId,userId,action,actualChildren,confirmPlannedCount=false,expectedVersion,idempotencyKey,resolveReview=false,reviewNote='',effectiveAt=null,now=new Date()}) {
  if(!['clock-in','clock-out','attendance'].includes(action))fail(400,'Choose a childcare clock or attendance action.');
  if(idempotencyKey!=null&&(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128))fail(400,'Use a valid request key.');
  return transaction(async db=>{
    // Use the same employee/event lock order as ordinary event attendance.
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[id(userId)]);
    const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db,{work:action==='clock-in'});
    if(resolveReview&&(!ctx.canManage||!String(reviewNote||'').trim()))fail(403,'A manager must review the recorded count timeline and give a reason before resolving attendance review.');
    if(action==='attendance'&&!ctx.canManage&&(!ctx.canWork||!ctx.onShift))fail(403,'Only an assigned caregiver may record attendance.');
    if(idempotencyKey) {
      const [receipt]=await db.execute('INSERT IGNORE INTO childcare_action_receipts(shift_id,user_id,action,request_key) VALUES (?,?,?,?)',[shift.id,userId,action,idempotencyKey]);
      if(!receipt.affectedRows){const [[original]]=await db.execute('SELECT action FROM childcare_action_receipts WHERE shift_id=? AND user_id=? AND request_key=?',[shift.id,userId,idempotencyKey]);if(original.action!==action)fail(409,'This request key belongs to a different action.');return {alreadyProcessed:true,shift:await mapShift(shift,userId,db)};}
    }
    const {punches}=await shiftSources(shift,db),own=punches.filter(row=>Number(row.user_id)===Number(userId)),last=own.at(-1);
    let correctionTime=null;
    if(effectiveAt!=null) {
      if(action!=='attendance'||!ctx.canManage||!resolveReview)fail(403,'Only an explicit manager attendance review may correct the recorded count timeline.');
      correctionTime=new Date(effectiveAt);
      const times=punches.map(row=>new Date(childcareStoredIso(row.punched_at)).getTime()),first=times.length?Math.min(...times):null;
      const {open}=childcareWorkIntervals(punches),lastTime=open.size?now.getTime():(times.length?Math.max(...times):null);
      if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(effectiveAt))||!Number.isFinite(correctionTime.getTime())||first==null||correctionTime<first||correctionTime>lastTime||correctionTime>now)fail(400,'A count correction must identify a real time within recorded work, including its timezone offset.');
    }
    if(action==='clock-in') {
      if(shift.status==='canceled'||!Number(shift.is_active))fail(409,'This childcare shift is canceled or inactive.');
      const today=utcDateToZonedYmd(now,shift.timezone),firstDay=utcDateToZonedYmd(new Date(childcareStoredIso(shift.starts_at)),shift.timezone),lastDay=utcDateToZonedYmd(new Date(childcareStoredIso(shift.ends_at)),shift.timezone);
      if(today<firstDay||today>lastDay)fail(409,'Clock in on the shift’s local scheduled day when work begins.');
      if(last?.punch_type==='clock_in')return {alreadyProcessed:true,shift:await mapShift(shift,userId,db)};
      const [other]=await db.execute(`SELECT p.id FROM skill_builders_event_kiosk_punches p WHERE p.user_id=? AND p.company_event_id<>? AND p.punch_type='clock_in' AND NOT EXISTS(SELECT 1 FROM skill_builders_event_kiosk_punches o WHERE o.user_id=p.user_id AND o.company_event_id=p.company_event_id AND o.punch_type='clock_out' AND (o.punched_at>p.punched_at OR (o.punched_at=p.punched_at AND o.id>p.id))) LIMIT 1`,[userId,shift.company_event_id]);
      if(other.length)fail(409,'Clock out of the other event before starting childcare.');
      await recordAttendance(shift,{actualChildren,confirmPlannedCount,expectedVersion,source:'clock_in',userId,now,reviewChange:true},db);
      await db.execute("INSERT INTO skill_builders_event_kiosk_punches(company_event_id,user_id,punch_type,punched_at) VALUES (?,?,'clock_in',?)",[shift.company_event_id,userId,sqlInstant(now)]);
    } else if(action==='clock-out') {
      if(last?.punch_type!=='clock_in')return {alreadyProcessed:true,shift:await mapShift(shift,userId,db)};
      if(new Date(childcareStoredIso(last.punched_at))>=new Date(childcareStoredIso(sqlInstant(now))))fail(409,'Clock-out must follow the actual clock-in by at least one recorded second.');
      // Missing/changed count must never erase or prevent an employee recording an actual end time.
      let validCount=false;
      if(actualChildren!=null||confirmPlannedCount===true) {
        try{await recordAttendance(shift,{actualChildren,confirmPlannedCount,source:'clock_out',userId,now,reviewChange:true},db);validCount=true;}
        catch(error){if(![400,409].includes(error.status))throw error;}
      }
      if(!validCount){await db.execute('UPDATE childcare_shifts SET attendance_review_required=1 WHERE id=?',[shift.id]);shift.attendance_review_required=1;}
      await db.execute("INSERT INTO skill_builders_event_kiosk_punches(company_event_id,user_id,punch_type,punched_at) VALUES (?,?,'clock_out',?)",[shift.company_event_id,userId,sqlInstant(now)]);
    } else {
      if(last?.punch_type!=='clock_in'&&!ctx.canManage)fail(409,'Record child-count changes while clocked in.');
      await recordAttendance(shift,{actualChildren,confirmPlannedCount,expectedVersion,source:correctionTime?'manager_timeline_correction':'attendance_change',userId,now,effectiveAt:correctionTime,reviewNote},db);
      if(resolveReview){await db.execute('UPDATE childcare_shifts SET attendance_review_required=0 WHERE id=?',[shift.id]);shift.attendance_review_required=0;}
    }
    await refreshChildcarePay(shift,db);
    const state=childcareWorkIntervals((await shiftSources(shift,db)).punches);
    if(action==='clock-out'&&state.open.size===0)await db.execute("UPDATE childcare_shifts SET status='completed' WHERE id=? AND status<>'canceled'",[shift.id]);
    const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:`childcare_${action.replace('-','_')}`,metadata:{shiftId:shift.id,eventId:shift.company_event_id,actualChildren:shift.actual_children,plannedChildren:shift.planned_children,attendanceVersion:shift.attendance_version,...(resolveReview?{reviewResolved:true,effectiveAt:correctionTime?.toISOString()||null,reviewNote:String(reviewNote).trim().slice(0,2000)}:{})}});
    return {shift:await mapShift(await loadShift(shift.id,db),userId,db),auditRowId};
  });
}
export async function previewChildcarePay({shiftId,userId,targetUserId},db=pool) {
  const shift=await loadShift(shiftId,db),ctx=await authorizeShift(shift,userId,db),target=targetUserId?id(targetUserId):Number(userId);
  if(target!==Number(userId)&&!ctx.canManagePay)fail(403,'Employees may only view their own pay.');
  if(!await assigned(shift,target,db))fail(404,'The employee is not assigned to this shift.');
  const sources=await shiftSources(shift,db),snapshot=await calculateChildcarePay({shift,userId:target,...sources,db});
  const [[saved]]=await db.execute('SELECT s.payroll_time_claim_id,s.snapshot_hash,s.snapshot_json,c.status claim_status FROM childcare_pay_snapshots s LEFT JOIN payroll_time_claims c ON c.id=s.payroll_time_claim_id WHERE s.shift_id=? AND s.user_id=?',[shift.id,target]);
  const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_pay_viewed',metadata:{shiftId:shift.id,targetUserId:target}});
  const stored= saved ? parse(saved.snapshot_json) : null;
  const correctionReviewRequired=saved&&['approved','paid'].includes(saved.claim_status)&&(!childcareSnapshotHashMatches(stored,saved.snapshot_hash)||childcareSnapshotHash(stored)!==childcareSnapshotHash(snapshot));
  return {...snapshot,...(correctionReviewRequired?{reviewRequired:true,totalAmount:null,estimatedUnapprovedAmount:snapshot.totalAmount,approvedAmount:parse(saved.snapshot_json).totalAmount,correctionReviewRequired:true,reasons:[...snapshot.reasons,'This shift changed after payroll approval. Retain the approved amount and review a separate correction.']}:{correctionReviewRequired:false}),claimId:saved?.payroll_time_claim_id||null,claimStatus:saved?.claim_status||null,auditRowId};
}
