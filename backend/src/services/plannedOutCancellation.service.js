import dayCancellation from './providerDayCancellation.service.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export function plannedOutCancellationInput({ payload, providerId, agencyId }) {
  if (payload.availability === 'available') return null;
  const timeZone = payload.timeZone || 'America/Denver';
  const localDate = value => new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).format(parseUtcDate(value));
  const start = payload.allDay ? payload.startDate : localDate(payload.startAt);
  const end = payload.allDay ? payload.endDate : addDaysYmd(localDate(payload.endAt),1);
  const dates = [];
  for (let date = start; date < end && dates.length <= 90; date = addDaysYmd(date,1)) dates.push(date);
  return { providerId, agencyIds:[agencyId],date:start,dates,timeZone,scopeMode:'days',absenceSource:'planned_out',urgent:false,
    reasonCategory:'planned_out',followUpAction:'none',notificationMode:'send',messagesReviewed:true,
    ...(payload.allDay ? {} : { windowStart:payload.startAt, windowEnd:payload.endAt }) };
}

export async function preparePlannedOutCancellation(args, actor) {
  const input = plannedOutCancellationInput(args);
  if (!input) return null;
  const { authorizeDayCancellation } = await import('../controllers/providerDayCancellation.controller.js');
  const { assertAppointmentChangeAccess } = await import('../controllers/appointment.controller.js');
  return dayCancellation.preview(input,actor,authorizeDayCancellation,(who,a) => assertAppointmentChangeAccess({ user:who },a));
}
export async function completePlannedOutCancellation(plan, actor) {
  if (!plan) return null;
  const { authorizeDayCancellation } = await import('../controllers/providerDayCancellation.controller.js');
  const { assertAppointmentChangeAccess } = await import('../controllers/appointment.controller.js');
  // Each step persists independently. A partial result remains resumable in Cancel day.
  let result = plan;
  try {
    result = await dayCancellation.apply(plan.token,{ providerId:plan.providerId,signatureConfirmed:true },actor,authorizeDayCancellation,
      (who,a) => assertAppointmentChangeAccess({user:who},a));
    return result;
  } catch (error) {
    return { ...result,status:'partial',error:error.status ? error.message : 'Cancellation processing was interrupted. Resume the saved review from the provider schedule.' };
  }
}

export async function processPlannedOutCancellations({ agencyId = null, limit = 10 } = {}) {
  const [rows] = await pool.execute(`SELECT DISTINCT d.token,d.provider_id,d.actor_user_id,u.role
    FROM provider_day_cancellations d JOIN planned_outs po ON po.cancellation_review_token=d.token
    JOIN users u ON u.id=d.actor_user_id WHERE d.status='processing'
    AND (? IS NULL OR po.agency_id=?) ORDER BY d.token LIMIT ${Math.min(20,Math.max(1,Number(limit)||10))}`, [agencyId,agencyId]);
  let processed = 0;
  for (const row of rows) {
    const result = await completePlannedOutCancellation({ token:row.token,providerId:Number(row.provider_id) },{ id:Number(row.actor_user_id),role:row.role });
    if (!result.error) processed++;
  }
  return { processed };
}
