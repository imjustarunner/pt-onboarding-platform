/**
 * Auto-generate team meeting summary from transcript.
 * Called after Twilio Video room recording is transcribed or client posts transcript.
 */

import { callGeminiText } from './geminiText.service.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';

function buildTeamMeetingSummaryPrompt(transcriptText) {
  const cleaned = String(transcriptText || '').trim().slice(0, 15000);
  return [
    'You are generating a staff/team meeting summary for internal documentation.',
    'Return concise markdown with these sections only:',
    '- Key updates',
    '- Decisions made',
    '- Action items',
    '- To-dos by person (only include people explicitly named in transcript)',
    '- Follow-ups',
    '',
    'Rules:',
    '- Be factual, no invented details.',
    '- Keep each section to 2-5 bullets.',
    '- In "To-dos by person", format bullets as "Name: todo 1; todo 2".',
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
 * Generate AI summary from transcript and save to provider_schedule_event_artifacts.
 * @param {number} eventId - provider_schedule_events.id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function triggerTeamMeetingSummaryFromTranscript(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false };

  const artifact = await ProviderScheduleEventArtifact.findByEventId(eid);
  const transcriptText = artifact?.transcript_text || null;
  if (!transcriptText || !String(transcriptText).trim()) {
    return { ok: false };
  }

  const prompt = buildTeamMeetingSummaryPrompt(transcriptText);
  const summaryResp = await callGeminiText({
    prompt,
    temperature: 0.1,
    maxOutputTokens: 900
  });
  const summaryText = String(summaryResp?.text || '').trim();
  const summaryModel = String(summaryResp?.modelName || '').trim() || null;

  await ProviderScheduleEventArtifact.upsertByEventId({
    eventId: eid,
    summaryText,
    summaryModel,
    summaryGeneratedAt: mysqlNowDateTime(),
    updatedByUserId: null
  });

  return { ok: true };
}
