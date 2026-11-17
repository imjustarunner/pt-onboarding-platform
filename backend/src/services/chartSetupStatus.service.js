/**
 * Whether a client chart still needs the one-time demographics, intake, and treatment-plan setup.
 */
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { clientHasDemographicsOnFile } from './demographicsImport.service.js';
import { isAppNativeOfficeClient, isPaperPacketClient, isSchoolRegistrationClient } from '../utils/paperPacketClient.js';
import { readPaperPacketDemographicCandidate } from './paperPacketDemographics.service.js';
import { isIntakeAutoTreatmentPlan } from './treatmentPlanPrecedence.service.js';
import { intakeDraftContext } from './intakeDraftReview.service.js';
import {
  getLatestPaperPacketVisionEval,
  schedulePaperPacketVisionEval
} from './paperPacketVision.service.js';

async function intakeOnFile(clientId, agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id,status,session_context_enc FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ? AND status IN ('final','draft','ready','diagnosis_pending')`,
      [clientId,agencyId]
    );
    return rows.some(row => !row.status || row.status === 'final' || intakeDraftContext(row).source === 'client_records_import');
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

async function planOnFile(agencyId, clientId) {
  if (!agencyId || !clientId) return false;
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT p.id, p.title, p.status, p.source_tool_id
       FROM clinical_treatment_plans p
       WHERE p.agency_id = ? AND p.client_id = ? AND (p.status = 'active' OR (p.status = 'draft' AND (p.source_tool_id LIKE 'client_records_import:%' OR p.source_tool_id='client_creation_record_import')))
       ORDER BY p.id DESC`,
      [agencyId, clientId]
    );
    // The chart excludes the automatically generated enrollment placeholder.
    // Use the same rule here so setup cannot claim a clinical plan is complete
    // while Records correctly shows no authored treatment plan.
    const authored = rows.filter(plan => !isIntakeAutoTreatmentPlan(plan));
    return { onFile: authored.length > 0, reviewPending: authored.length > 0 && !authored.some(plan => !plan.status || plan.status === 'active') };
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') return false;
    console.warn('[chartSetup] treatment plan lookup failed', error?.message || error);
    return false;
  }
}

export async function loadChartSetupStatus({ client, actorUserId = null } = {}) {
  const clientId = Number(client?.id || 0);
  const agencyId = Number(client?.agency_id || 0);
  const schoolClient = isSchoolRegistrationClient(client);
  const demographicsOnFile = clientHasDemographicsOnFile(client);
  const [intakeDone, planDone] = await Promise.all([
    intakeOnFile(clientId,agencyId),
    planOnFile(agencyId, clientId)
  ]);
  const paperPacket = isPaperPacketClient(client);
  let packetCandidate = null;
  let packetReadPending = false;
  if (paperPacket) {
    packetCandidate = readPaperPacketDemographicCandidate(client);
    const latest = await getLatestPaperPacketVisionEval(clientId);
    const attempted = latest?.raw_summary?.demographicsAttempted === true;
    const schoolId = Number(client?.organization_id || 0);
    const orgType = String(client?.organization_type || '').toLowerCase();
    if (!attempted && !packetCandidate && schoolId && (orgType === 'school' || paperPacket)) {
      packetReadPending = true;
      schedulePaperPacketVisionEval({
        clientId,
        schoolOrganizationId: schoolId,
        phiDocumentId: latest?.phi_document_id || null,
        storagePath: latest?.storage_path || null,
        actorUserId
      });
    }
  }
  return {
    recordsImportStatus: (()=>{try{return (typeof client.onboarding_docs_json==='string'?JSON.parse(client.onboarding_docs_json):client.onboarding_docs_json)?.recordsImport?.status||null;}catch{return null;}})(),
    requiresRecordImport: !isAppNativeOfficeClient(client),
    demographicsOnFile,
    intakeOnFile: intakeDone,
    planOnFile: !!planDone?.onFile,
    planReviewPending: !!planDone?.reviewPending,
    setupComplete: demographicsOnFile && intakeDone && !!planDone?.onFile,
    schoolClient,
    paperPacket,
    packetReadPending,
    packetCandidate
  };
}
