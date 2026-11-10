import pool from '../config/database.js';
import { decryptIntakeSubmissionRow } from './intakeResponsesEncryption.service.js';

// Expose readiness only, never another guardian's private enrollment answers.
export async function clientEnrollmentPacketReview(clientId, db = pool) {
  const [rows] = await db.execute(`SELECT s.* FROM intake_submissions s
    WHERE s.status='submitted' AND (s.client_id=? OR EXISTS (
      SELECT 1 FROM intake_submission_clients ic WHERE ic.intake_submission_id=s.id AND ic.client_id=?))
    ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1`, [clientId, clientId]);
  if (!rows[0]) return null;
  const row = decryptIntakeSubmissionRow(rows[0]);
  const data = typeof row.intake_data === 'string' ? JSON.parse(row.intake_data) : row.intake_data;
  const packet = data?.packetGeneration;
  if (packet?.status !== 'needs_review' || !(packet.failedClientIds || []).map(Number).includes(Number(clientId))) return null;
  return { submission_id: Number(row.id), status: 'needs_review' };
}
