/**
 * Daily: promote Scheduled school clients to Being Seen when first_service_at has passed
 * (and provider checklist milestones are complete). Does not promote assign-day alone.
 */
import pool from '../config/database.js';
import { markClientBeingSeen } from './clientLifecycleStatus.service.js';
import { notifyClientBecameCurrent } from './clientNotifications.service.js';
import { isReturningSchoolClient, julyCutoffYmd } from '../utils/fallReadiness.js';

export default class ClientCompliancePromotionService {
  /**
   * Find scheduled clients whose first_service_at <= today and mark Being Seen.
   * @param {{ now?: Date }} options - Optional now for testing
   * @returns {{ promoted: number }}
   */
  static async run({ now = new Date() } = {}) {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cutoff = julyCutoffYmd(now);

    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT c.id, c.agency_id, c.organization_id, c.provider_id, c.service_day,
                c.first_service_at, c.services_started_at, c.parents_contacted_at, c.parents_contacted_successful,
                c.identifier_code, c.full_name, c.initials, c.client_status_id, c.status,
                c.client_type, c.staff_onboarding_completed_at, c.school_year,
                c.submission_date, c.created_at, c.continuation_services_json,
                cs.status_key AS client_status_key,
                EXISTS (
                  SELECT 1 FROM client_provider_assignments cpa
                  WHERE cpa.client_id = c.id
                    AND cpa.is_active = TRUE
                    AND cpa.service_day IS NOT NULL
                    AND TRIM(cpa.service_day) <> ''
                ) AS has_weekday
         FROM clients c
         LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
         WHERE c.first_service_at IS NOT NULL
           AND c.first_service_at <= ?
           AND c.parents_contacted_at IS NOT NULL
           AND COALESCE(c.parents_contacted_successful, 0) = 1
           AND c.intake_at IS NOT NULL
           AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
           AND LOWER(COALESCE(cs.status_key, '')) IN (
             'scheduled', 'onboarded', 'ready_to_schedule', 'current', 'pending'
           )
           AND c.services_started_at IS NULL`,
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

    for (const client of rows) {
      try {
        if (isReturningSchoolClient(client, now)) {
          continue;
        }
        const isSchool = String(client.client_type || '').toLowerCase() === 'school';
        if (isSchool && !Number(client.has_weekday)) {
          const anchor = client.submission_date
            ? String(client.submission_date).slice(0, 10)
            : (client.created_at ? String(client.created_at).slice(0, 10) : null);
          if (anchor && anchor < cutoff) continue;
        }

        const clientId = parseInt(client.id, 10);
        const result = await markClientBeingSeen({
          clientId,
          actorUserId: null,
          serviceDate: client.first_service_at ? String(client.first_service_at).slice(0, 10) : todayStr
        });
        if (!result?.changed) continue;
        promoted += 1;

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
