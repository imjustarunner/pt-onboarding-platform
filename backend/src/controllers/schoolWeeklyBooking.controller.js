import { schoolWeeklyContext, schoolWeeklyPayload, reviewSchoolWeeklyLink } from '../services/schoolWeeklyBooking.service.js';
import { createAppointmentHandler } from './appointment.controller.js';
import pool from '../config/database.js';
import { linkSchoolAppointment } from '../services/schoolAppointmentTransition.service.js';

const contextFor = req => schoolWeeklyContext({ actor:req.user, schoolId:req.params.schoolId,
  providerUserId:req.params.providerId, weekday:req.params.weekday });
export async function getSchoolWeeklyBooking(req,res,next) {
  try { return res.json(await contextFor(req)); }
  catch(error) { if(error.status) return res.status(error.status).json({error:{message:error.message}}); next(error); }
}
export async function bookSchoolWeeklySessions(req,res,next) {
  try {
    const context = await contextFor(req);
    if (!context.enabled) return res.status(403).json({error:{message:context.reason}});
    const body = schoolWeeklyPayload({context,input:req.body || {},today:context.today});
    const link=context.transition?await reviewSchoolWeeklyLink(context,body,req.body.slotId):null;
    const onAppointmentsCreated=link?async({appointments,recurrenceSeriesId})=>{
      const db=await pool.getConnection();
      try {
        await db.beginTransaction();
        await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[context.agencyId]);
        for(const appointment of appointments) await linkSchoolAppointment({db,agencyId:context.agencyId,schoolId:context.schoolId,
          slotId:link.slotId,appointmentId:appointment.id,actorUserId:req.user.id,seriesKey:recurrenceSeriesId});
        await db.commit();
      }catch(error){await db.rollback();throw error;}finally{db.release();}
    }:undefined;
    // The appointment controller retains service, provider eligibility, conflicts,
    // recurrence, clinical-link, billing and normal notification behavior.
    return createAppointmentHandler({ ...req, user:req.user, params:req.params, body, onAppointmentsCreated },res,next);
  } catch(error) { if(error.status) return res.status(error.status).json({error:{message:error.message}}); next(error); }
}
