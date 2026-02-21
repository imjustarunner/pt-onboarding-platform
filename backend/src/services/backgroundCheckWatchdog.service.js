import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

async function getAgencyAdminStaffUserIds(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.is_active = TRUE
       AND u.role IN ('admin','super_admin','support','staff')`,
    [agencyId]
  );
  return rows.map(r => r.id);
}

async function alreadyNotified({ agencyId, userId, type, relatedEntityId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id = ?
       AND type = ?
       AND related_entity_type = 'compliance_document'
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, userId, type, relatedEntityId]
  );
  return !!rows[0]?.id;
}

class BackgroundCheckWatchdogService {
  /**
   * - Reimbursement reminder: 6 months after background check receipt upload
   * - Renewal reminder: expiring soon for background check docs (default: 30 days)
   */
  static async run({ reimbursementAfterMonths = 6, renewalWithinDays = 30 } = {}) {
    // 1) Reimbursement due (receipt uploaded >= 6 months ago)
    const [receipts] = await pool.execute(
      `SELECT id, user_id, agency_id, document_type, uploaded_at
       FROM user_compliance_documents
       WHERE agency_id IS NOT NULL
         AND document_type LIKE 'background_check_receipt%'
         AND uploaded_at <= DATE_SUB(NOW(), INTERVAL ? MONTH)`,
      [parseInt(reimbursementAfterMonths, 10)]
    );

    for (const doc of receipts) {
      const agencyId = doc.agency_id;
      if (!agencyId) continue;
      const recipients = await getAgencyAdminStaffUserIds(agencyId);
      const title = 'Background check reimbursement due';
      const message = `Background check reimbursement may be due for user ID ${doc.user_id} (receipt uploaded ${new Date(doc.uploaded_at).toLocaleDateString()}).`;

      await Promise.all(
        recipients.map(async (userId) => {
          if (await alreadyNotified({ agencyId, userId, type: 'background_check_reimbursement_due', relatedEntityId: doc.id })) return null;
          return await createNotificationAndDispatch({
            type: 'background_check_reimbursement_due',
            severity: 'info',
            title,
            message,
            userId,
            agencyId,
            relatedEntityType: 'compliance_document',
            relatedEntityId: doc.id,
            actorSource: 'System'
          }).catch(() => null);
        })
      );
    }

    // 2) Renewal due soon (background check expiring)
    const [expiring] = await pool.execute(
      `SELECT id, user_id, agency_id, document_type, expiration_date
       FROM user_compliance_documents
       WHERE agency_id IS NOT NULL
         AND document_type LIKE 'background_check%'
         AND document_type NOT LIKE 'background_check_receipt%'
         AND expiration_date IS NOT NULL
         AND expiration_date >= CURDATE()
         AND expiration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [parseInt(renewalWithinDays, 10)]
    );

    for (const doc of expiring) {
      const agencyId = doc.agency_id;
      if (!agencyId) continue;
      const recipients = await getAgencyAdminStaffUserIds(agencyId);
      const title = 'Background check renewal due soon';
      const message = `Background check (${doc.document_type}) is expiring soon for user ID ${doc.user_id} (expires ${new Date(doc.expiration_date).toLocaleDateString()}).`;

      await Promise.all(
        recipients.map(async (userId) => {
          if (await alreadyNotified({ agencyId, userId, type: 'background_check_renewal_due', relatedEntityId: doc.id })) return null;
          return await createNotificationAndDispatch({
            type: 'background_check_renewal_due',
            severity: 'warning',
            title,
            message,
            userId,
            agencyId,
            relatedEntityType: 'compliance_document',
            relatedEntityId: doc.id,
            actorSource: 'System'
          }).catch(() => null);
        })
      );
    }
  }
}

export default BackgroundCheckWatchdogService;

