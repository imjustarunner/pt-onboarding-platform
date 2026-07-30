import pool from '../config/database.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { FEDERAL_BG_ITEM_KEY } from './federalBackgroundCheck.service.js';
import { providerHasDistrict11Assignment } from '../utils/districtCompliance.js';

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

async function alreadyNotified({ agencyId, userId, type, relatedEntityType, relatedEntityId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE agency_id = ?
       AND user_id = ?
       AND type = ?
       AND related_entity_type = ?
       AND related_entity_id = ?
       AND is_resolved = FALSE
     LIMIT 1`,
    [agencyId, userId, type, relatedEntityType, relatedEntityId]
  );
  return !!rows[0]?.id;
}

async function notifyRecipients({
  agencyId,
  recipientIds,
  type,
  severity,
  title,
  message,
  relatedEntityType,
  relatedEntityId,
  context = {},
}) {
  await Promise.all(
    recipientIds.map(async (userId) => {
      if (await alreadyNotified({
        agencyId,
        userId,
        type,
        relatedEntityType,
        relatedEntityId,
      })) return null;
      return createNotificationAndDispatch({
        type,
        severity,
        title,
        message,
        userId,
        agencyId,
        relatedEntityType,
        relatedEntityId,
        actorSource: 'System',
      }, { context }).catch(() => null);
    })
  );
}

class BackgroundCheckWatchdogService {
  /**
   * - Reimbursement reminder: 6 months after background check receipt upload
   * - Renewal reminder: expiring soon for background check docs (default: 30 days)
   * - Lifecycle Federal Background/Fingerprint Check: expired + expiring soon (user + admins)
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

      await notifyRecipients({
        agencyId,
        recipientIds: recipients,
        type: 'background_check_reimbursement_due',
        severity: 'info',
        title,
        message,
        relatedEntityType: 'compliance_document',
        relatedEntityId: doc.id,
      });
    }

    // 2) Renewal due soon (background check compliance docs expiring)
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
      // Expiration tracking is District 11 only
      if (!(await providerHasDistrict11Assignment(doc.user_id))) continue;
      const recipients = await getAgencyAdminStaffUserIds(agencyId);
      const title = 'Background check renewal due soon';
      const message = `Background check (${doc.document_type}) is expiring soon for user ID ${doc.user_id} (expires ${new Date(doc.expiration_date).toLocaleDateString()}).`;

      await notifyRecipients({
        agencyId,
        recipientIds: recipients,
        type: 'background_check_renewal_due',
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'compliance_document',
        relatedEntityId: doc.id,
      });
    }

    // 3) Lifecycle Federal Background/Fingerprint Check — expired + expiring soon
    //    Notify the provider and agency admin/staff (same idea as licensure credential flags).
    try {
      const [lifecycleRows] = await pool.execute(
        `SELECT ulci.id,
                ulci.user_id,
                ulci.expires_at,
                ua.agency_id,
                u.first_name,
                u.last_name
         FROM user_lifecycle_checklist_items ulci
         JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
         JOIN users u ON u.id = ulci.user_id
         JOIN user_agencies ua ON ua.user_id = ulci.user_id
         WHERE lcd.item_key = ?
           AND lcd.agency_id IS NULL
           AND ulci.is_completed = 1
           AND ulci.expires_at IS NOT NULL
           AND u.is_active = TRUE
           AND u.status IN ('ACTIVE_EMPLOYEE','ONBOARDING','PREHIRE_OPEN','PREHIRE_REVIEW','TERMINATED_PENDING')`,
        [FEDERAL_BG_ITEM_KEY]
      );

      const seenExpired = new Set();
      const seenSoon = new Set();

      for (const row of lifecycleRows) {
        const agencyId = row.agency_id;
        if (!agencyId || !row.expires_at) continue;
        // Only District 11 assignees track federal BG expiration
        if (!(await providerHasDistrict11Assignment(row.user_id))) continue;
        const expiresYmd = String(row.expires_at).slice(0, 10);
        const expiresDate = new Date(`${expiresYmd}T00:00:00`);
        if (Number.isNaN(expiresDate.getTime())) continue;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((expiresDate - today) / (24 * 60 * 60 * 1000));
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || `user ID ${row.user_id}`;
        const expiresLabel = expiresDate.toLocaleDateString();
        const dedupeKey = `${agencyId}:${row.user_id}:${row.id}`;

        const adminIds = await getAgencyAdminStaffUserIds(agencyId);
        const recipients = Array.from(new Set([row.user_id, ...adminIds]));

        if (days < 0) {
          if (seenExpired.has(dedupeKey)) continue;
          seenExpired.add(dedupeKey);
          await notifyRecipients({
            agencyId,
            recipientIds: recipients,
            type: 'background_check_expired',
            severity: 'urgent',
            title: 'Federal Background/Fingerprint Check expired',
            message: `Federal Background/Fingerprint Check for ${name} expired on ${expiresLabel}.`,
            relatedEntityType: 'lifecycle_checklist_item',
            relatedEntityId: row.id,
            context: { isUrgent: true },
          });
        } else if (days <= renewalWithinDays) {
          if (seenSoon.has(dedupeKey)) continue;
          seenSoon.add(dedupeKey);
          await notifyRecipients({
            agencyId,
            recipientIds: recipients,
            type: 'background_check_renewal_due',
            severity: 'warning',
            title: 'Federal Background/Fingerprint Check renewal due soon',
            message: `Federal Background/Fingerprint Check for ${name} expires on ${expiresLabel}.`,
            relatedEntityType: 'lifecycle_checklist_item',
            relatedEntityId: row.id,
          });
        }
      }
    } catch {
      // Table/column may not exist until migration 1089 runs
    }
  }
}

export default BackgroundCheckWatchdogService;
