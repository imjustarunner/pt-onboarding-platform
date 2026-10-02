/**
 * Auto-generate team meeting summary from transcript.
 * Interview meetings use interviewTranscriptIntelligence.service.js instead.
 */

import { generateMeetingSummaryContent } from './meetingSummaryContent.service.js';
import { enqueueMeetingSummary } from './meetingSummaryJobs.service.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';

async function isInterviewEvent(eventId) {
  try {
    const event = await ProviderScheduleEvent.findById(eventId);
    return String(event?.meeting_subtype || '').toLowerCase() === 'interview';
  } catch {
    return false;
  }
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
export async function generateTeamMeetingSummaryFromTranscript(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false };

  if (await isInterviewEvent(eid)) {
    try {
      const { syncInterviewIntelligenceFromEventId } = await import('./interviewTranscriptIntelligence.service.js');
      return await syncInterviewIntelligenceFromEventId(eid);
    } catch (err) {
      console.warn('[triggerTeamMeetingSummaryFromTranscript] interview intelligence failed:', err?.message);
      return { ok: false, error: err?.message };
    }
  }

  const artifact = await ProviderScheduleEventArtifact.findByEventId(eid);
  const transcriptText = artifact?.transcript_text || null;
  if (!transcriptText || !String(transcriptText).trim()) {
    return { ok: false };
  }

  const summaryResp = await generateMeetingSummaryContent(transcriptText, 'staff / CPA');
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

export async function triggerTeamMeetingSummaryFromTranscript(eventId) {
  const artifact = await ProviderScheduleEventArtifact.findByEventId(eventId);
  if (!String(artifact?.transcript_text || '').trim()) return { ok: false, reason: 'no_transcript' };
  return enqueueMeetingSummary('team', eventId);
}
