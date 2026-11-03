import pool from '../config/database.js';
import { alertRequestedSupport } from './smsRequestedSupport.service.js';

// The caller holds the enrollment lock and rechecks the exact family and care
// assignment. Persist the request before alerting; the existing worker retries.
export async function requestRelaySupport({ enrollment, route, inboundLogId }) {
  const db = await pool.getConnection();
  let ticketId;
  try {
    await db.beginTransaction();
    const subject = 'Provider requested support for SMS conversation';
    const [existing] = await db.execute(`SELECT id FROM support_tickets WHERE agency_id=? AND client_id=?
      AND created_by_user_id=? AND subject=? AND status='open' ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [enrollment.agency_id,route.client_id,enrollment.provider_user_id,subject]);
    ticketId = existing[0]?.id;
    if (!ticketId) {
      const [created] = await db.execute(`INSERT INTO support_tickets
        (school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status,priority,close_on_read)
        VALUES (?,?,?,?,?,?,'open','high',0)`, [enrollment.agency_id,route.client_id,enrollment.provider_user_id,
        enrollment.agency_id,subject,`A provider requested Support for this client's SMS conversation with the family phone ending ${route.family_phone.slice(-4)}. Review the conversation in the app, claim the request, and close it when handled. This request does not indicate a clinical emergency.`]);
      ticketId = created.insertId;
    }
    await db.execute(`UPDATE sms_care_threads SET care_state='escalated',support_access='respond',support_ticket_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE agency_id=? AND client_id=? AND number_id=?`, [ticketId,enrollment.agency_id,route.client_id,enrollment.number_id]);
    await db.execute(`UPDATE message_logs SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),
      '$.supportChoiceTicketId',?,'$.supportRequestedByProvider',TRUE,'$.relayRouteId',?) WHERE id=? AND agency_id=?`,
      [ticketId,route.id,inboundLogId,enrollment.agency_id]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  await alertRequestedSupport(inboundLogId).catch(error => console.warn('[providerSMS] Support alert pending:',error.code || 'alert_failed'));
  return ticketId;
}
