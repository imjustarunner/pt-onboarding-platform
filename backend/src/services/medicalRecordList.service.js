import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { listBillingEncountersForClient } from './billingReportIngest.service.js';
import { mergeMedicalRecordSources } from './medicalRecordTimeline.service.js';
import { collectChartScope } from '../utils/noteAidClientAgency.js';

export async function listClientMedicalRecordRows({ agencyId, clientId, limit = 200 }) {
  const aid = Number(agencyId || 0);
  const cid = Number(clientId || 0);
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  if (!aid || !cid) return [];

  const scope = await collectChartScope({ clientId: cid, agencyId: aid });
  const agencyIds = scope.agencyIds.length ? scope.agencyIds : [aid];
  const clientIds = scope.clientIds.length ? scope.clientIds : [cid];
  const inList = agencyIds.map(() => '?').join(',');
  const clientIn = clientIds.map(() => '?').join(',');

  let billing = [];
  try {
    billing = await listBillingEncountersForClient({
      agencyId: aid,
      agencyIds,
      clientId: cid,
      clientIds,
      limit: lim
    });
  } catch {
    billing = [];
  }

  let sessions = [];
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT cs.*, u.first_name AS provider_first_name, u.last_name AS provider_last_name
       FROM clinical_sessions cs
       LEFT JOIN users u ON u.id = COALESCE(cs.rendering_provider_user_id, cs.provider_user_id)
       WHERE cs.client_id IN (${clientIn})
         AND cs.agency_id IN (${inList})
         AND cs.scheduled_start_at IS NOT NULL
       ORDER BY cs.scheduled_start_at DESC
       LIMIT ${lim}`,
      [...clientIds, ...agencyIds]
    );
    sessions = rows || [];
  } catch (e) {
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT cs.*
         FROM clinical_sessions cs
         WHERE cs.client_id IN (${clientIn})
           AND cs.agency_id IN (${inList})
           AND cs.scheduled_start_at IS NOT NULL
         ORDER BY cs.scheduled_start_at DESC
         LIMIT ${lim}`,
        [...clientIds, ...agencyIds]
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
       WHERE oe.client_id IN (${clientIn})
         AND oe.start_at IS NOT NULL
         AND UPPER(COALESCE(oe.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'RELEASED')
       ORDER BY oe.start_at DESC
       LIMIT ${lim}`,
      [...clientIds]
    );
    officeEvents = rows || [];
  } catch (e) {
    console.warn('[medicalRecordTimeline] office_events query failed', e?.message || e);
    officeEvents = [];
  }

  let signedNotes = [];
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT n.id, n.agency_id, n.client_id, n.clinical_session_id, n.title, n.note_type,
              n.provider_signed_at, n.provider_signed_by_user_id, n.created_by_user_id, n.created_at,
              cs.service_code AS session_service_code,
              cs.scheduled_start_at AS service_date,
              u.first_name AS provider_first_name, u.last_name AS provider_last_name
       FROM clinical_notes n
       LEFT JOIN clinical_sessions cs ON cs.id = n.clinical_session_id
       LEFT JOIN users u ON u.id = COALESCE(n.provider_signed_by_user_id, n.created_by_user_id)
       WHERE n.client_id IN (${clientIn})
         AND n.agency_id IN (${inList})
         AND n.is_deleted = 0
         AND n.provider_signed_at IS NOT NULL
       ORDER BY n.provider_signed_at DESC
       LIMIT ${lim}`,
      [...clientIds, ...agencyIds]
    );
    signedNotes = rows || [];
  } catch (e) {
    console.warn('[medicalRecordTimeline] signed notes query failed', e?.message || e);
    signedNotes = [];
  }

  let claims = [];
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, clinical_note_id, agency_id, client_id, claim_status
       FROM clinical_claims
       WHERE client_id IN (${clientIn})
         AND agency_id IN (${inList})
         AND COALESCE(is_deleted, 0) = 0
         AND UPPER(COALESCE(claim_status, '')) NOT IN ('VOID', 'CANCELLED', 'CANCELED')
       ORDER BY id DESC
       LIMIT ${lim}`,
      [...clientIds, ...agencyIds]
    );
    claims = rows || [];
  } catch (e) {
    console.warn('[medicalRecordTimeline] claims query failed', e?.message || e);
    claims = [];
  }

  return mergeMedicalRecordSources({ billing, sessions, officeEvents, signedNotes, claims }).slice(0, lim);
}

export default { listClientMedicalRecordRows };
