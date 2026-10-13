import pool from '../config/database.js';
import {reminderRecipientSql} from '../utils/providerUpdateReminders.js';

// Held emails may be approved hours later. Never release a reminder after the
// update was submitted, closed, expired, or its reminder schedule was paused.
export async function assertProviderUpdateReminderDelivery({templateType,existingCommunicationId,userId,agencyId},db=pool) {
  if(templateType!=='provider_update_reminder'||!existingCommunicationId)return;
  const [[row]]=await db.execute(`SELECT r.id ${reminderRecipientSql}
    AND r.provider_user_id=? AND r.agency_id=?
    AND EXISTS (SELECT 1 FROM provider_update_reminder_deliveries d WHERE d.recipient_id=r.id AND d.communication_id=?)`,[userId,agencyId,existingCommunicationId]);
  if(!row)throw Object.assign(Error('This Provider Update reminder is no longer needed or has been paused.'),{code:'PROVIDER_UPDATE_REMINDER_CANCELLED',status:409});
}
