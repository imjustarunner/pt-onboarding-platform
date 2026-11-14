import pool from '../config/database.js';
import { appointmentServiceKind } from '../utils/guardianCancellationScope.js';

/** Ending one service must not end a client's other agencies, providers or services. */
export async function assertClientServiceSchedulingActive({ agencyId, providerUserId, clientId, businessType, source, providerScheduleEventId,officeEventId,officeBookingPlanId }, db = pool) {
  if (!clientId || !providerUserId) return;
  const kind = appointmentServiceKind({ businessType });
  const [[ended]] = await db.execute(`SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=?
    AND provider_user_id=? AND service_kind=? AND is_active=0 LIMIT 1`, [clientId, agencyId, providerUserId, kind]);
  if (Number(ended?.id)>0) throw Object.assign(new Error('This service has ended. Your care team must restart it before scheduling more sessions.'), { status:409, code:'CLIENT_SERVICE_ENDED' });
  let recurrence = null;
  if (providerScheduleEventId) {
    const [[event]] = await db.execute('SELECT recurrence_series_id FROM provider_schedule_events WHERE id=? AND agency_id=?', [providerScheduleEventId, agencyId]);
    recurrence = event?.recurrence_series_id || null;
  }
  if(officeEventId&&!officeBookingPlanId&&!String(source||'').startsWith('reserved_office_session:')) {
    const [[event]]=await db.execute('SELECT booking_plan_id FROM office_events WHERE id=?',[officeEventId]);
    officeBookingPlanId=event?.booking_plan_id||null;
  }
  const [[stopped]] = await db.execute(`SELECT id FROM guardian_service_cancellations WHERE client_id=? AND agency_id=?
    AND provider_user_id=? AND service_kind=? AND scope IN ('future','end_services') AND status IN ('queued','processing','completed','failed')
    AND ((series_kind='source' AND series_key=?) OR (series_kind='provider' AND series_key=?) OR (scope='future' AND series_kind='office_plan' AND series_key=?)
      OR JSON_CONTAINS(review_json,JSON_OBJECT('kind','source','key',?),'$.stoppedSeries')
      OR JSON_CONTAINS(review_json,JSON_OBJECT('kind','provider','key',?),'$.stoppedSeries')) LIMIT 1`,
  [clientId, agencyId, providerUserId, kind, source || '', recurrence,officeBookingPlanId?String(officeBookingPlanId):null,source||'',recurrence]);
  if (stopped?.id) throw Object.assign(new Error('This recurring series was canceled. Start a new series only after confirming the client wants to resume.'), { status:409, code:'CLIENT_SERIES_ENDED' });
}
