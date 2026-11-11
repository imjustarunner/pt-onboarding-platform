/**
 * Whether a client chart still needs the one-time demographics, intake, and treatment-plan setup.
 */
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { clientHasDemographicsOnFile } from './demographicsImport.service.js';
import { isPaperPacketClient, isSchoolRegistrationClient } from '../utils/paperPacketClient.js';
import { readPaperPacketDemographicCandidate } from './paperPacketDemographics.service.js';
import { isIntakeAutoTreatmentPlan } from './treatmentPlanPrecedence.service.js';
import {
  getLatestPaperPacketVisionEval,
  schedulePaperPacketVisionEval
} from './paperPacketVision.service.js';

async function intakeOnFile(clientId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM client_intake_note_drafts
       WHERE client_id = ? AND status = 'final'
       LIMIT 1`,
      [clientId]
    );
    return rows.length > 0;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

async function planOnFile(agencyId, clientId) {
  if (!agencyId || !clientId) return false;
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT p.id, p.title
       FROM clinical_treatment_plans p
       WHERE p.agency_id = ? AND p.client_id = ? AND p.status = 'active'
       ORDER BY p.id DESC`,
      [agencyId, clientId]
    );
    // The chart excludes the automatically generated enrollment placeholder.
    // Use the same rule here so setup cannot claim a clinical plan is complete
    // while Records correctly shows no authored treatment plan.
    return rows.some(plan => !isIntakeAutoTreatmentPlan(plan));
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
  // School registration and paper-packet reads fill the chart fields directly.
  // That is not the workspace chart-update import, so it must not count as updated.
  const demographicsOnFile = schoolClient ? false : clientHasDemographicsOnFile(client);
  const [intakeDone, planDone] = await Promise.all([
    intakeOnFile(clientId),
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
    demographicsOnFile,
    intakeOnFile: intakeDone,
    planOnFile: planDone,
    setupComplete: schoolClient ? intakeDone && planDone : demographicsOnFile && intakeDone && planDone,
    schoolClient,
    paperPacket,
    packetReadPending,
    packetCandidate
  };
}
