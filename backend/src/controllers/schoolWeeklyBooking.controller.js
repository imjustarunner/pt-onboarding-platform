import { schoolWeeklyContext, schoolWeeklyPayload } from '../services/schoolWeeklyBooking.service.js';
import { createAppointmentHandler } from './appointment.controller.js';

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
    // The appointment controller retains service, provider eligibility, conflicts,
    // recurrence, clinical-link, billing and normal notification behavior.
    return createAppointmentHandler({ ...req, user:req.user, params:req.params, body },res,next);
  } catch(error) { if(error.status) return res.status(error.status).json({error:{message:error.message}}); next(error); }
}
