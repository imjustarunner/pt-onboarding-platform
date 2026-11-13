import pool from '../config/database.js';
import { appointmentServiceKind } from '../utils/guardianCancellationScope.js';

// Termination is scoped to one agency/provider/service, never a global unsubscribe.
// The one saved termination confirmation is the only scheduling-email exception.
export async function serviceNotificationBlocked({ appointment, clientId, facts = {} }, db = pool) {
  if (!clientId || !appointment?.agencyId || !appointment.providerUserId) return false;
  let kind=appointmentServiceKind(appointment);
  if(!appointment.businessType&&!appointment.business_type){
    const [clients]=await db.execute('SELECT client_type FROM clients WHERE id=?',[clientId]);
    kind=appointmentServiceKind(appointment,clients?.[0]||{});
  }
  const [endedRows] = await db.execute(`SELECT id AS notification_stop_id FROM client_service_enrollments
    WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND is_active=0 LIMIT 1`,
  [clientId, appointment.agencyId, appointment.providerUserId, kind]);
  if (!endedRows?.[0]?.notification_stop_id) return false;
  if (facts.guardianSummary?.endsService === true && /^[0-9a-f-]{36}$/i.test(facts.guardianCancellationOperationId || '')) {
    const [confirmationRows] = await db.execute(`SELECT id AS confirmation_id FROM guardian_service_cancellations
      WHERE id=? AND client_id=? AND agency_id=? AND provider_user_id=? AND appointment_id=? AND actor_user_id=?
      AND scope='end_services' AND status IN ('processing','completed') AND team_notified_at IS NOT NULL LIMIT 1`,
    [facts.guardianCancellationOperationId, clientId, appointment.agencyId, appointment.providerUserId, appointment.id, facts.cancellationActorUserId || null]);
    if (confirmationRows?.[0]?.confirmation_id) return false;
  }
  return true;
}
