/**
 * Auto-generate supervision session summary from transcript.
 * Called after video room recording is transcribed (room-ended pipeline).
 */

import { generateMeetingSummaryContent } from './meetingSummaryContent.service.js';
import { enqueueMeetingSummary } from './meetingSummaryJobs.service.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import pool from '../config/database.js';
import { normalizeSupervisionSpeakerLabels } from '../utils/supervisionSpeakerLabels.js';

function mysqlNowDateTime() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/**
 * Generate AI summary from transcript and save to supervision_session_artifacts.
 * @param {number} sessionId - supervision_sessions.id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function generateSupervisionSummaryFromTranscript(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return { ok: false };

  const artifact = await SupervisionSessionArtifact.findBySessionId(sid);
  const transcriptText = artifact?.transcript_text || null;
  if (!transcriptText || !String(transcriptText).trim()) {
    return { ok: false };
  }

  const [participants] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.preferred_name FROM users u
    JOIN supervision_sessions s ON s.id=? WHERE u.id IN (s.supervisor_user_id,s.co_facilitator_user_id,s.supervisee_user_id)
    OR EXISTS (SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=u.id)`, [sid]);
  const summaryResp = await generateMeetingSummaryContent(normalizeSupervisionSpeakerLabels(transcriptText, participants), 'supervision');
  const summaryText = String(summaryResp?.text || '').trim();
  const summaryModel = String(summaryResp?.modelName || '').trim() || null;

  await SupervisionSessionArtifact.upsertBySessionId({
    sessionId: sid,
    summaryText,
    summaryModel,
    summaryGeneratedAt: mysqlNowDateTime(),
    updatedByUserId: null
  });

  return { ok: true };
}

export async function triggerSupervisionSummaryFromTranscript(sessionId) {
  const artifact = await SupervisionSessionArtifact.findBySessionId(sessionId);
  if (!String(artifact?.transcript_text || '').trim()) return { ok: false, reason: 'no_transcript' };
  return enqueueMeetingSummary('supervision', sessionId);
}
