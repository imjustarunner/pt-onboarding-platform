import clinicalPool from '../config/clinicalDatabase.js';
import { requireClientAccountSupport } from './clientAccountSupportAccess.service.js';

// Explicit metadata allowlist: never read note text, diagnoses, claim payloads,
// treatment plans or document URLs to produce the support view.
export function operationalSession(row) {
  return { sessionId: row.id, providerUserId: row.provider_user_id,
    startsAt: row.scheduled_start_at, endsAt: row.scheduled_end_at,
    sessionStatus: row.encounter_status,
    noteStatus: row.supervisor_cosigned_at ? 'cosigned' : row.provider_signed_at ? 'signed' : row.note_id ? 'draft' : 'missing',
    noteWritten: !!row.note_id, providerSignedAt: row.provider_signed_at || null,
    supervisorCosignedAt: row.supervisor_cosigned_at || null,
    claimStatus: row.claim_lifecycle || row.claim_status || 'none' };
}
export async function clientOperationalStatus(user, clientId, { db = clinicalPool, authorize = requireClientAccountSupport } = {}) {
  const client = await authorize(user, clientId);
  const [rows] = await db.execute(`SELECT s.id,s.provider_user_id,s.scheduled_start_at,s.scheduled_end_at,s.encounter_status,
    n.id AS note_id,n.provider_signed_at,n.supervisor_cosigned_at,c.claim_status,c.claim_lifecycle
    FROM clinical_sessions s
    LEFT JOIN clinical_notes n ON n.id=(SELECT MAX(nn.id) FROM clinical_notes nn
      WHERE nn.clinical_session_id=s.id AND nn.agency_id=s.agency_id AND nn.client_id=s.client_id AND nn.is_deleted=0)
    LEFT JOIN clinical_claims c ON c.id=(SELECT MAX(cc.id) FROM clinical_claims cc
      WHERE cc.clinical_session_id=s.id AND cc.agency_id=s.agency_id AND cc.client_id=s.client_id AND cc.is_deleted=0)
    WHERE s.agency_id=? AND s.client_id=? ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 100`, [client.agency_id, client.id]);
  return { sessions: rows.map(operationalSession), limit: 100,
    scope: 'Latest note and claim for up to 100 recorded clinical sessions. Use Scheduling for all appointments.' };
}
