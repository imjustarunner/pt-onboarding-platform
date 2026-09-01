import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { listBillingEncountersForClient } from './billingReportIngest.service.js';
import { mergeMedicalRecordSources } from './medicalRecordTimeline.service.js';

export async function listClientMedicalRecordRows({ agencyId, clientId, limit = 200 }) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  if (!aid || !cid) return [];

  const billing = await listBillingEncountersForClient({ agencyId: aid, clientId: cid, limit: lim });

  let sessions = [];
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT cs.*, u.first_name AS provider_first_name, u.last_name AS provider_last_name
       FROM clinical_sessions cs
       LEFT JOIN users u ON u.id = COALESCE(cs.rendering_provider_user_id, cs.provider_user_id)
       WHERE cs.agency_id = ? AND cs.client_id = ?
         AND TRIM(COALESCE(cs.service_code, '')) <> ''
         AND cs.scheduled_start_at IS NOT NULL
       ORDER BY cs.scheduled_start_at DESC
       LIMIT ${lim}`,
      [aid, cid]
    );
    sessions = rows || [];
  } catch (e) {
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT cs.*
         FROM clinical_sessions cs
         WHERE cs.agency_id = ? AND cs.client_id = ?
           AND TRIM(COALESCE(cs.service_code, '')) <> ''
           AND cs.scheduled_start_at IS NOT NULL
         ORDER BY cs.scheduled_start_at DESC
         LIMIT ${lim}`,
        [aid, cid]
      );
      sessions = rows || [];
    } catch (e2) {
      console.warn('[medicalRecordTimeline] sessions query failed', e2?.message || e?.message);
      sessions = [];
    }
  }

  let officeEvents = [];
  try {
    const [rows] = await pool.execute(
      `SELECT oe.id, oe.start_at, oe.end_at, oe.service_code, oe.client_id, oe.status,
              oe.assigned_provider_id, oe.booked_provider_id, oe.clinical_session_id,
              c.agency_id,
              u.first_name AS provider_first_name, u.last_name AS provider_last_name
       FROM office_events oe
       INNER JOIN clients c ON c.id = oe.client_id
       LEFT JOIN users u ON u.id = COALESCE(oe.booked_provider_id, oe.assigned_provider_id)
       WHERE oe.client_id = ?
         AND TRIM(COALESCE(oe.service_code, '')) <> ''
         AND UPPER(COALESCE(oe.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'RELEASED')
       ORDER BY oe.start_at DESC
       LIMIT ${lim}`,
      [cid]
    );
    officeEvents = rows || [];
  } catch (e) {
    console.warn('[medicalRecordTimeline] office_events query failed', e?.message || e);
    officeEvents = [];
  }

  return mergeMedicalRecordSources({ billing, sessions, officeEvents }).slice(0, lim);
}

export default { listClientMedicalRecordRows };
