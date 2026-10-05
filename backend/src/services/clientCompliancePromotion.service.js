/** Reconcile service evidence without inventing dates or requiring intake/day completion. */
import pool from '../config/database.js';
import { setClientLifecycleStatus } from './clientLifecycleStatus.service.js';
import { servicesConfirmedThisSchoolYear } from '../utils/fallReadiness.js';

export default class ClientCompliancePromotionService {
  static async run({ now = new Date(), dryRun = false, agencyId = null } = {}) {
    const [rows] = await pool.execute(`SELECT c.*, cs.status_key client_status_key
      FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
      WHERE c.client_type='school' AND UPPER(COALESCE(c.status,'')) NOT IN ('ARCHIVED','TERMINATED','ON_HOLD')
        AND cs.status_key IN ('scheduled','onboarded','ready_to_schedule','current','pending','needs_day_assignment','confirmed_returning','confirmation_pending','returning')
        AND (c.services_started_at IS NOT NULL OR c.first_service_at IS NOT NULL)
        AND (? IS NULL OR c.agency_id=?)`, [agencyId, agencyId]);
    let promoted = 0;
    const candidates = [];
    for (const client of rows) {
      if (!servicesConfirmedThisSchoolYear(client, now)) continue;
      candidates.push({ clientId: client.id, agencyId: client.agency_id, from: client.client_status_key, to: 'being_seen',
        evidence: client.services_started_at || client.first_service_at });
      if (dryRun) continue;
      // Re-read facts before a write, so a concurrently closed record is not reopened.
      const [[fresh]] = await pool.execute(`SELECT c.*,cs.status_key client_status_key FROM clients c
        LEFT JOIN client_statuses cs ON cs.id=c.client_status_id WHERE c.id=?`, [client.id]);
      if (!fresh || ['ARCHIVED','TERMINATED','ON_HOLD'].includes(fresh.status) || fresh.client_status_key !== client.client_status_key || !servicesConfirmedThisSchoolYear(fresh, now)) continue;
      const result = await setClientLifecycleStatus({ clientId: client.id, statusKey: 'being_seen',
        note: 'Reconciled current-school-year service evidence; scheduling follow-up remains separate' });
      if (result.changed) promoted++;
    }
    return { promoted, candidates, dryRun };
  }
}
