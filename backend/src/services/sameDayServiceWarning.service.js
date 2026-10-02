import pool from '../config/database.js';
import { clientScheduleInstantToUtcMysql, utcMysqlToZonedWallMysql, zonedDateHourToMysqlUtc } from '../utils/zonedWallTime.util.js';

export const SAME_DAY_SERVICE_MESSAGE = 'This client already has a service on this date. To avoid billing issues, we recommend choosing an alternate date of service. A billing modifier is not applied automatically.';
export function serviceDayBounds(startAt, timeZone = 'America/Denver') {
  const instant = clientScheduleInstantToUtcMysql(startAt instanceof Date ? startAt.toISOString() : startAt, timeZone);
  if (!instant) throw Object.assign(new Error('A valid service date is required'), { status:400 });
  const day = utcMysqlToZonedWallMysql(instant,timeZone).slice(0,10);
  const next = new Date(`${day}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
  return {day,start:zonedDateHourToMysqlUtc(day,0,timeZone),end:zonedDateHourToMysqlUtc(next.toISOString().slice(0,10),0,timeZone)};
}
export async function sameDayServiceWarnings({ agencyId, participants, occurrences, timeZone = 'America/Denver', excludeAppointmentId = 0, user }) {
  const clientIds = [...new Set((participants || []).filter(p => (p.role || 'client') === 'client').map(p => Number(p.clientId || p.client_id)).filter(id => Number.isInteger(id)&&id>0))];
  if (!clientIds.length) return [];
  const warnings = [];
  const days = new Map(occurrences.map(o => { const bounds=serviceDayBounds(o.startAt,timeZone); return [bounds.day,bounds]; }));
  for (const clientId of clientIds) {
    // Providers may inspect services only for clients already assigned to them.
    const staff = ['admin','super_admin','superadmin','support','staff','clinical_practice_assistant'].includes(String(user?.role || '').toLowerCase());
    const [access] = await pool.execute(`SELECT c.id FROM clients c WHERE c.id=? AND c.agency_id=?
      AND (?=1 OR c.provider_id=? OR EXISTS (SELECT 1 FROM client_provider_assignments ca WHERE ca.client_id=c.id AND ca.provider_user_id=? AND ca.is_active=1))`,
      [clientId,Number(agencyId),staff?1:0,Number(user.id),Number(user.id)]);
    if (!access.length) throw Object.assign(new Error('Client access required to schedule this service'), {status:403});
    for (const bounds of days.values()) {
      const [rows] = await pool.execute(`SELECT DISTINCT a.id,a.start_at,a.service_code,a.provider_user_id,
        CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name
        FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id
        LEFT JOIN users u ON u.id=a.provider_user_id
        WHERE a.agency_id=? AND ap.client_id=? AND a.start_at>=? AND a.start_at<? AND a.id<>?
        AND a.status IN ('scheduled','confirmed','client_confirmed','completed','reschedule_requested','cancellation_requested')
        ORDER BY a.start_at`,[Number(agencyId),clientId,bounds.start,bounds.end,Number(excludeAppointmentId)||0]);
      warnings.push(...rows.map(row => ({ appointmentId:Number(row.id),clientId,date:bounds.day,
        startAt:row.start_at,serviceCode:row.service_code || null,providerUserId:row.provider_user_id,
        providerName:row.provider_name || 'Provider not assigned' })));
    }
  }
  return warnings;
}
export async function confirmSameDayServiceWarnings(req,res,input) {
  const warnings = await sameDayServiceWarnings({...input,user:req.user});
  if (warnings.length && req.body?.acknowledgeSameDayServices !== true) {
    res.status(409).json({error:{code:'SAME_DAY_SERVICE_WARNING',message:SAME_DAY_SERVICE_MESSAGE},warnings});
    return false;
  }
  return true;
}
