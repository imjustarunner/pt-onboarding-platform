/**
 * Auto-generate supervision session summary from transcript.
 * Called after Twilio Video room recording is transcribed (room-ended pipeline).
 */

import { callGeminiText } from './geminiText.service.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';

function buildSupervisionSummaryPrompt(transcriptText) {
  const cleaned = String(transcriptText || '').trim().slice(0, 15000);
  return [
    'You are generating a supervision meeting summary for internal documentation.',
    'Return concise markdown with these sections only:',
    '- Key updates',
    '- Clinical/operational decisions',
    '- Action items (with owner)',
    '- Risks/follow-ups',
    '',
    'Rules:',
    '- Be factual, no invented details.',
    '- Keep each section to 2-5 bullets.',
    '- If information is missing, state "Not discussed".',
    '',
    'Transcript:',
    cleaned
  ].join('\n');
}

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
export async function triggerSupervisionSummaryFromTranscript(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return { ok: false };

  const artifact = await SupervisionSessionArtifact.findBySessionId(sid);
  const transcriptText = artifact?.transcript_text || null;
  if (!transcriptText || !String(transcriptText).trim()) {
    return { ok: false };
  }

  const prompt = buildSupervisionSummaryPrompt(transcriptText);
  const summaryResp = await callGeminiText({
    prompt,
    temperature: 0.1,
    maxOutputTokens: 900
  });
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
