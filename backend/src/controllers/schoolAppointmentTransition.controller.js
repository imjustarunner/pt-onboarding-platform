import pool from '../config/database.js';
import User from '../models/User.model.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import {
  schoolTransitionAccess, readSchoolTransition, saveSchoolTransition,
  linkSchoolAppointment, listSchoolBookedSessions, moveSchoolBookedSession,
  schoolTransitionSchemaError, schoolTransitionDate
} from '../services/schoolAppointmentTransition.service.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const access=(req,manage=false)=>schoolTransitionAccess({actor:req.user,schoolId:req.params.schoolId,providerId:req.params.providerId,manage});
export const schoolTransitionHandler=work=>async(req,res,next)=>{
  try {await work(req,res);} catch(raw){const error=schoolTransitionSchemaError(raw);if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
};
export const listTransitionSchools=schoolTransitionHandler(async(req,res)=>{
  const agencyId=Number(req.query.agencyId),providerId=Number(req.query.providerId),role=String(req.user?.role||'').toLowerCase();
  if(!Number.isSafeInteger(agencyId)||agencyId<1||!Number.isSafeInteger(providerId)||providerId<1) throw fail(400,'Choose a practice and provider.');
  if(!['super_admin','superadmin'].includes(role)) {
    const agencies=await User.getAgencies(req.user.id);
    if(!agencies.some(row=>Number(row.id)===agencyId)||(!['admin','support'].includes(role)&&Number(req.user.id)!==providerId)) throw fail(403,'You do not have access to this provider’s transition.');
  }
  const [schools]=await pool.execute(`SELECT DISTINCT s.id,s.name FROM provider_school_assignments psa JOIN agencies s ON s.id=psa.school_organization_id
    WHERE psa.provider_user_id=? AND psa.is_active=TRUE AND s.organization_type='school'
      AND (EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=s.id AND oa.agency_id=? AND oa.is_active=TRUE)
        OR EXISTS(SELECT 1 FROM agency_schools a WHERE a.school_organization_id=s.id AND a.agency_id=? AND a.is_active=TRUE)) ORDER BY s.name`,[providerId,agencyId,agencyId]);
  res.json({schools});
});
export const getSchoolTransition=schoolTransitionHandler(async(req,res)=>{
  const context=await access(req),transition=await readSchoolTransition(context);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:context.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const startDate=schoolTransitionDate(req.query.startDate||today),endDate=schoolTransitionDate(req.query.endDate||addDaysYmd(startDate,7));
  const result=await listSchoolBookedSessions({context,startDate,endDate});
  const [slots]=await pool.execute(`SELECT s.id,s.client_id,s.weekday,s.start_time,s.end_time,c.initials,c.identifier_code,
      (SELECT COUNT(*) FROM school_schedule_appointment_links l WHERE l.slot_id=s.id) linked_count
    FROM soft_schedule_slots s LEFT JOIN clients c ON c.id=s.client_id AND c.agency_id=?
    WHERE s.school_organization_id=? AND s.provider_user_id=? ORDER BY FIELD(s.weekday,'Monday','Tuesday','Wednesday','Thursday','Friday'),s.slot_index`,[context.agencyId,context.schoolId,context.providerId]);
  let candidates=[];
  if(context.canManage && transition) {
    [candidates]=await pool.execute(`SELECT a.id,a.start_at,a.end_at,a.status,ap.client_id,c.initials,c.identifier_code,
      l.slot_id linked_slot_id FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id IS NOT NULL
      JOIN clients c ON c.id=ap.client_id AND c.agency_id=a.agency_id
      JOIN agency_service_locations sl ON sl.id=a.service_location_id AND sl.agency_id=a.agency_id
      LEFT JOIN school_schedule_appointment_links l ON l.appointment_id=a.id
      WHERE a.agency_id=? AND a.provider_user_id=? AND sl.school_organization_id=? AND a.status IN ('scheduled','confirmed','client_confirmed')
        AND a.start_at>=? AND a.start_at<? AND (EXISTS(SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=c.id AND coa.organization_id=? AND coa.is_active=TRUE) OR c.organization_id=?)
      ORDER BY a.start_at,a.id LIMIT 501`,[context.agencyId,context.providerId,context.schoolId,wallMysqlToUtcMysql(`${startDate} 00:00:00`,context.timeZone),wallMysqlToUtcMysql(`${endDate} 00:00:00`,context.timeZone),context.schoolId,context.schoolId]);
    if(candidates.length>500)throw fail(422,'Choose a shorter school schedule range.');
  }
  res.json({...context,...result,today,startDate,endDate,slots,candidates});
});
export const putSchoolTransition=schoolTransitionHandler(async(req,res)=>{
  const context=await access(req,true);
  res.json({transition:await saveSchoolTransition({context,actorUserId:req.user.id,input:req.body||{}})});
});
export const linkSchoolTransitionAppointments=schoolTransitionHandler(async(req,res)=>{
  const context=await access(req,true),ids=[...new Set((Array.isArray(req.body?.appointmentIds)?req.body.appointmentIds:[]).map(Number))];
  if(req.body?.reviewed!==true || !ids.length || ids.length>52 || ids.some(id=>!Number.isSafeInteger(id)||id<1)) throw fail(400,'Review between 1 and 52 appointment links.');
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[context.agencyId]);
    const links=[];
    for(const appointmentId of ids) links.push(await linkSchoolAppointment({db,agencyId:context.agencyId,schoolId:context.schoolId,
      slotId:req.body.slotId,appointmentId,actorUserId:req.user.id,seriesKey:req.body.seriesKey||null}));
    await db.commit();res.json({ok:true,links});
  }catch(error){await db.rollback();throw error;}finally{db.release();}
});
export const putSchoolBookedSession=schoolTransitionHandler(async(req,res)=>{
  const context=await access(req);
  res.json(await moveSchoolBookedSession({context,appointmentId:req.params.appointmentId,actorUserId:req.user.id,input:req.body||{}}));
});
