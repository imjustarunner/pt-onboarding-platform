import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { summaryItems } from '../utils/clientExchangeSummary.js';
import { intakePresentingProblems, latestPresentingProblem, parseSummaryJson } from '../utils/clientCareSummary.js';
import { listBillingDiagnosesForClient } from './billingReportIngest.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import { clientAge } from '../utils/clientExchangeMatching.js';

async function optionalClinicalQuery(sql, params) {
  try { const [rows] = await clinicalPool.execute(sql, params); return rows; }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; }
}

async function intakeConcerns(clientId) {
  const [rows] = await pool.execute(`SELECT s.id, s.client_id, s.intake_data, s.submitted_at, s.created_at,
      s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
      l.intake_fields, l.intake_steps
    FROM intake_submissions s LEFT JOIN intake_links l ON l.id = s.intake_link_id
    WHERE s.submitted_at IS NOT NULL AND (s.client_id = ? OR EXISTS
      (SELECT 1 FROM intake_submission_clients isc WHERE isc.intake_submission_id = s.id AND isc.client_id = ?))
    ORDER BY s.submitted_at DESC`, [clientId, clientId]);
  if (!rows.length) return [];
  decryptIntakeSubmissionRows(rows);
  const ids = rows.map(row => row.id);
  const [associations] = await pool.execute(`SELECT intake_submission_id, client_id FROM intake_submission_clients
    WHERE intake_submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`, ids);
  return rows.map(row => ({
    values: intakePresentingProblems({ row, clientId, clientIds: associations.filter(a => Number(a.intake_submission_id) === Number(row.id)).map(a => a.client_id) }),
    recordedAt: row.submitted_at || row.created_at
  }));
}

/** A single current summary for the chart overview, exchange, and match email. */
export async function loadClientExchangeSummary({ client, agencyId = client.agency_id }) {
  const params = [Number(agencyId), Number(client.id)];
  const [diagnoses, plans, intakes] = await Promise.all([
    optionalClinicalQuery(`SELECT icd10_code, description FROM clinical_diagnoses
      WHERE agency_id = ? AND client_id = ? AND (is_active IS NULL OR is_active = 1)
      ORDER BY is_primary DESC, created_at DESC`, params),
    optionalClinicalQuery(`SELECT * FROM clinical_treatment_plans WHERE agency_id = ? AND client_id = ?
      AND status = 'active' ORDER BY updated_at DESC, created_at DESC`, params),
    intakeConcerns(Number(client.id))
  ]);
  const billing = diagnoses.length ? [] : await listBillingDiagnosesForClient({ agencyId, clientId: client.id });
  const intake = parseSummaryJson(client.intake_preferences_json);
  const age = clientAge(client);
  return {
    demographics: { ...(age == null ? {} : { ageBand: String(age) }), ...(client.gender ? { gender: client.gender } : {}) },
    diagnoses: summaryItems(diagnoses.length ? diagnoses : billing),
    ...latestPresentingProblem({ plans, intakes, preferences: intake }),
    preferences: { modality: intake.preferredModality || null }
  };
}
