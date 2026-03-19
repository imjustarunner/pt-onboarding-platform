/**
 * Promotes pending clients to "current" when their first_service_at date has passed.
 * Called daily so clients are promoted even if nobody saves the checklist again after the date.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { notifyClientBecameCurrent } from './clientNotifications.service.js';

export default class ClientCompliancePromotionService {
  /**
   * Find and promote pending clients whose first_service_at <= today.
   * @param {{ now?: Date }} options - Optional now for testing
   * @returns {{ promoted: number }}
   */
  static async run({ now = new Date() } = {}) {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT c.id, c.agency_id, c.organization_id, c.provider_id, c.service_day,
                c.first_service_at, c.parents_contacted_at, c.parents_contacted_successful,
                c.identifier_code, c.full_name, c.initials, c.client_status_id, c.status,
                cs.status_key AS client_status_key
         FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         WHERE c.first_service_at IS NOT NULL
           AND c.first_service_at <= ?
           AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
           AND (LOWER(COALESCE(cs.status_key, '')) = 'pending'
                OR UPPER(COALESCE(c.status, '')) = 'PENDING_REVIEW')`,
        [todayStr]
      );
      rows = r || [];
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('ER_BAD_FIELD_ERROR')) {
        return { promoted: 0 };
      }
      throw e;
    }

    let promoted = 0;
    const systemUserId = null;

    for (const client of rows) {
      try {
        const agencyId = client.agency_id;
        const currentStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'current' });
        if (!currentStatusId) continue;

        const currentClientStatusId = client.client_status_id ? parseInt(client.client_status_id, 10) : null;
        const workflowStatus = String(client.status || '').toUpperCase();
        const alreadyCurrent =
          currentClientStatusId === parseInt(currentStatusId, 10) && workflowStatus !== 'PENDING_REVIEW';
        if (alreadyCurrent) continue;

        const clientId = parseInt(client.id, 10);
        if (currentStatusId && currentClientStatusId !== parseInt(currentStatusId, 10)) {
          await Client.update(clientId, { client_status_id: currentStatusId }, systemUserId);
        }
        if (workflowStatus === 'PENDING_REVIEW') {
          await Client.updateStatus(clientId, 'ACTIVE', systemUserId, 'Auto-marked current based on first date of service (daily job)');
        }
        promoted++;

        notifyClientBecameCurrent({
          agencyId: client.agency_id,
          schoolOrganizationId: client.organization_id,
          clientId: client.id,
          providerUserId: client.provider_id,
          clientNameOrIdentifier: client.identifier_code || client.full_name || client.initials,
          serviceDay: client.service_day || null,
          intakeAt: null,
          firstServiceAt: client.first_service_at ? String(client.first_service_at).slice(0, 10) : null,
          parentsContactedAt: client.parents_contacted_at ? String(client.parents_contacted_at).slice(0, 10) : null,
          parentsContactedSuccessful: client.parents_contacted_successful === 1 || client.parents_contacted_successful === true,
          actorUserId: null
        }).catch(() => {});
      } catch {
        // best-effort per client
      }
    }

    return { promoted };
  }
}
