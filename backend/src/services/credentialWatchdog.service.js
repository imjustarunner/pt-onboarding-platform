import Notification from '../models/Notification.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

class CredentialWatchdogService {
  /**
   * Create notifications for:
   * - blocking credentials that are expired
   * - credentials expiring soon (default: 30 days)
   *
   * Note: we intentionally keep this lightweight for MVP.
   */
  static async run({ expiringWithinDays = 30 } = {}) {
    // 1) Expired blocking credentials (urgent)
    const expiredBlocking = await UserComplianceDocument.findExpiredBlockingAll();
    for (const doc of expiredBlocking) {
      const agencyId = doc.agency_id || null;
      if (!agencyId) continue;

      // Avoid duplicates: check existing unresolved notifications for this agency/type
      const existing = await Notification.findByAgency(agencyId, {
        type: 'credential_expired_blocking',
        isResolved: false
      });
      const alreadyNotified = existing.some(
        (n) => n.user_id === doc.user_id && n.related_entity_type === 'compliance_document' && n.related_entity_id === doc.id
      );
      if (alreadyNotified) continue;

      await createNotificationAndDispatch(
        {
        type: 'credential_expired_blocking',
        severity: 'urgent',
        title: 'Blocking credential expired',
        message: `A blocking credential (${doc.document_type}) has expired for user ID ${doc.user_id}.`,
        userId: doc.user_id,
        agencyId: agencyId,
        relatedEntityType: 'compliance_document',
        relatedEntityId: doc.id
        },
        { context: { isBlockingCompliance: true, isUrgent: true } }
      );
    }

    // 2) Credentials expiring soon (warning)
    const expiringSoon = await UserComplianceDocument.findExpiringWithinDays(expiringWithinDays);
    for (const doc of expiringSoon) {
      const agencyId = doc.agency_id || null;
      if (!agencyId) continue;

      const existing = await Notification.findByAgency(agencyId, {
        type: 'credential_expiring',
        isResolved: false
      });
      const alreadyNotified = existing.some(
        (n) => n.user_id === doc.user_id && n.related_entity_type === 'compliance_document' && n.related_entity_id === doc.id
      );
      if (alreadyNotified) continue;

      await createNotificationAndDispatch({
        type: 'credential_expiring',
        severity: 'warning',
        title: 'Credential expiring soon',
        message: `A credential (${doc.document_type}) is expiring soon for user ID ${doc.user_id}.`,
        userId: doc.user_id,
        agencyId: agencyId,
        relatedEntityType: 'compliance_document',
        relatedEntityId: doc.id
      });
    }
  }
}

export default CredentialWatchdogService;

