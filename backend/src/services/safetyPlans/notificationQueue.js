/** Enqueue with the portal share transaction. One notification per recipient/agency
 * for 30 minutes after their first share; additions neither reset nor resend it.
 * No clinical content or contact details are stored here.
 */
export async function queueClinicalFormNotification(db,agencyId,recipientUserId) {
 const expired="batch_key<UNIX_TIMESTAMP()-1800 AND email_state<>'sending' AND sms_state<>'sending'";
 await db.execute(`INSERT INTO clinical_form_notification_batches
  (agency_id,recipient_user_id,batch_key,available_at)
  VALUES (?,?,UNIX_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE))
  ON DUPLICATE KEY UPDATE
   available_at=IF(${expired},VALUES(available_at),available_at),
   email_provider_ref=IF(${expired},NULL,email_provider_ref),
   sms_provider_ref=IF(${expired},NULL,sms_provider_ref),
   email_state=IF(${expired},'pending',email_state),
   sms_state=IF(${expired},'pending',sms_state),
   batch_key=IF(${expired},VALUES(batch_key),batch_key)`,[agencyId,recipientUserId]);
}
