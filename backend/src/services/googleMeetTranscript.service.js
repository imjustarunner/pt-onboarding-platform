import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  logGoogleUnauthorizedHint
} from './googleWorkspaceAuth.service.js';

const MEET_READONLY_SCOPE = 'https://www.googleapis.com/auth/meetings.space.readonly';
const MEET_CREATED_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

function parseMeetCodeFromUrl(meetUrlRaw) {
  const meetUrl = String(meetUrlRaw || '').trim();
  if (!meetUrl) return null;
  const m = meetUrl.match(/meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/i);
  return m?.[1]?.toLowerCase?.() || null;
}

export async function ensureMeetAutoTranscriptionEnabled({
  hostEmail,
  meetLink
} = {}) {
  const subject = String(hostEmail || '').trim().toLowerCase();
  const meetingCode = parseMeetCodeFromUrl(meetLink);
  if (!subject) return { ok: false, reason: 'missing_host_email' };
  if (!meetingCode) return { ok: false, reason: 'missing_meeting_code' };

  try {
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: subject,
      scopes: [MEET_CREATED_SCOPE]
    });
    const meet = google.meet({ version: 'v2', auth });
    const spaceName = `spaces/${meetingCode}`;

    await meet.spaces.patch({
      name: spaceName,
      updateMask: 'config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration',
      requestBody: {
        config: {
          artifactConfig: {
            transcriptionConfig: {
              autoTranscriptionGeneration: 'ON'
            }
          }
        }
      }
    });

    return { ok: true, meetingCode };
  } catch (e) {
    logGoogleUnauthorizedHint(e, { context: 'ensureMeetAutoTranscriptionEnabled' });
    return {
      ok: false,
      reason: 'meet_api_error',
      error: String(e?.message || e)
    };
  }
}

function toIso(input) {
  const d = new Date(input || '');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickClosestConferenceRecord(records, sessionStartAt) {
  const all = Array.isArray(records) ? records : [];
  if (!all.length) return null;

  const startMs = new Date(sessionStartAt || '').getTime();
  if (!Number.isFinite(startMs)) return all[0];

  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const r of all) {
    const rStartMs = new Date(r?.startTime || '').getTime();
    if (!Number.isFinite(rStartMs)) continue;
    const delta = Math.abs(rStartMs - startMs);
    if (delta < bestDelta) {
      best = r;
      bestDelta = delta;
    }
  }
  return best || all[0];
}

function pickTranscript(transcripts) {
  const all = Array.isArray(transcripts) ? transcripts : [];
  if (!all.length) return null;
  const generated = all.filter((t) => String(t?.state || '') === 'FILE_GENERATED');
  const source = generated.length ? generated : all;
  source.sort((a, b) => {
    const aMs = new Date(a?.endTime || a?.startTime || 0).getTime();
    const bMs = new Date(b?.endTime || b?.startTime || 0).getTime();
    return bMs - aMs;
  });
  return source[0] || null;
}

async function fetchCalendarEventMeetCode({ auth, hostEmail, eventId }) {
  const subject = String(hostEmail || '').trim().toLowerCase();
  const eid = String(eventId || '').trim();
  if (!subject || !eid) return null;
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const ev = await calendar.events.get({
      calendarId: 'primary',
      eventId: eid,
      fields: 'conferenceData(conferenceId,entryPoints),hangoutLink'
    });
    const conferenceId = String(ev?.data?.conferenceData?.conferenceId || '').trim().toLowerCase();
    if (conferenceId) return conferenceId;
    const entryPoints = Array.isArray(ev?.data?.conferenceData?.entryPoints) ? ev.data.conferenceData.entryPoints : [];
    const videoUri = entryPoints.find((p) => String(p?.entryPointType || '').toLowerCase() === 'video')?.uri;
    return parseMeetCodeFromUrl(videoUri || ev?.data?.hangoutLink || null);
  } catch {
    return null;
  }
}

export async function fetchMeetTranscriptForSession({
  hostEmail,
  meetLink,
  googleEventId,
  sessionStartAt
} = {}) {
  const subject = String(hostEmail || '').trim().toLowerCase();
  if (!subject) return { ok: false, reason: 'missing_host_email' };

  try {
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: subject,
      scopes: [MEET_READONLY_SCOPE]
    });
    const meet = google.meet({ version: 'v2', auth });

    let meetingCode = parseMeetCodeFromUrl(meetLink);
    if (!meetingCode && googleEventId) {
      meetingCode = await fetchCalendarEventMeetCode({
        auth,
        hostEmail: subject,
        eventId: googleEventId
      });
    }
    if (!meetingCode) return { ok: false, reason: 'missing_meeting_code' };

    const startIso = toIso(sessionStartAt);
    const recordFilters = [
      `space.meeting_code = "${meetingCode}"`
    ];
    if (startIso) {
      recordFilters.push(`start_time >= "${startIso}"`);
    }

    let recordResp;
    try {
      recordResp = await meet.conferenceRecords.list({
        pageSize: 10,
        filter: recordFilters.join(' AND ')
      });
    } catch {
      // Fall back to meeting-code-only filter in case time filtering causes parse issues.
      recordResp = await meet.conferenceRecords.list({
        pageSize: 10,
        filter: `space.meeting_code = "${meetingCode}"`
      });
    }

    const records = Array.isArray(recordResp?.data?.conferenceRecords) ? recordResp.data.conferenceRecords : [];
    const chosenRecord = pickClosestConferenceRecord(records, sessionStartAt);
    const conferenceRecordName = String(chosenRecord?.name || '').trim();
    if (!conferenceRecordName) return { ok: false, reason: 'conference_record_not_found' };

    const transcriptsResp = await meet.conferenceRecords.transcripts.list({
      parent: conferenceRecordName,
      pageSize: 20
    });
    const transcripts = Array.isArray(transcriptsResp?.data?.transcripts) ? transcriptsResp.data.transcripts : [];
    const transcript = pickTranscript(transcripts);
    const transcriptName = String(transcript?.name || '').trim();
    if (!transcriptName) return { ok: false, reason: 'transcript_not_found' };

    const chunks = [];
    let pageToken = undefined;
    let guard = 0;
    while (guard < 200) {
      guard += 1;
      const entriesResp = await meet.conferenceRecords.transcripts.entries.list({
        parent: transcriptName,
        pageSize: 100,
        ...(pageToken ? { pageToken } : {})
      });
      const entries = Array.isArray(entriesResp?.data?.transcriptEntries) ? entriesResp.data.transcriptEntries : [];
      for (const e of entries) {
        const txt = String(e?.text || '').trim();
        if (txt) chunks.push(txt);
      }
      pageToken = entriesResp?.data?.nextPageToken || undefined;
      if (!pageToken) break;
    }

    const transcriptText = chunks.join('\n').trim();
    const transcriptUrl = String(transcript?.docsDestination?.exportUri || '').trim() || null;
    if (!transcriptText && !transcriptUrl) return { ok: false, reason: 'transcript_empty' };

    return {
      ok: true,
      meetingCode,
      conferenceRecordName,
      transcriptName,
      transcriptUrl,
      transcriptText
    };
  } catch (e) {
    logGoogleUnauthorizedHint(e, { context: 'fetchMeetTranscriptForSession' });
    return {
      ok: false,
      reason: 'meet_api_error',
      error: String(e?.message || e)
    };
  }
}

/**
 * Fetch participants from a Google Meet conference record.
 * Returns array of { email, displayName, earliestStartTime, latestEndTime, totalSeconds }.
 * Signed-in users: extract email from signedinUser.user (format users/email or users/id).
 */
export async function fetchMeetParticipantsForRecord({
  hostEmail,
  meetLink,
  googleEventId,
  sessionStartAt
} = {}) {
  const subject = String(hostEmail || '').trim().toLowerCase();
  if (!subject) return { ok: false, reason: 'missing_host_email', participants: [] };

  try {
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: subject,
      scopes: [MEET_READONLY_SCOPE]
    });
    const meet = google.meet({ version: 'v2', auth });

    let meetingCode = parseMeetCodeFromUrl(meetLink);
    if (!meetingCode && googleEventId) {
      meetingCode = await fetchCalendarEventMeetCode({
        auth,
        hostEmail: subject,
        eventId: googleEventId
      });
    }
    if (!meetingCode) return { ok: false, reason: 'missing_meeting_code', participants: [] };

    const startIso = toIso(sessionStartAt);
    const recordFilters = [`space.meeting_code = "${meetingCode}"`];
    if (startIso) recordFilters.push(`start_time >= "${startIso}"`);

    let recordResp;
    try {
      recordResp = await meet.conferenceRecords.list({
        pageSize: 10,
        filter: recordFilters.join(' AND ')
      });
    } catch {
      recordResp = await meet.conferenceRecords.list({
        pageSize: 10,
        filter: `space.meeting_code = "${meetingCode}"`
      });
    }

    const records = Array.isArray(recordResp?.data?.conferenceRecords) ? recordResp.data.conferenceRecords : [];
    const chosenRecord = pickClosestConferenceRecord(records, sessionStartAt);
    const conferenceRecordName = String(chosenRecord?.name || '').trim();
    if (!conferenceRecordName) return { ok: false, reason: 'conference_record_not_found', participants: [] };

    const participants = [];
    let pageToken = undefined;
    let guard = 0;
    while (guard < 50) {
      guard += 1;
      const partResp = await meet.conferenceRecords.participants.list({
        parent: conferenceRecordName,
        pageSize: 100,
        ...(pageToken ? { pageToken } : {})
      });
      const list = Array.isArray(partResp?.data?.participants) ? partResp.data.participants : [];
      for (const p of list) {
        const earliest = p?.earliestStartTime || null;
        const latest = p?.latestEndTime || null;
        let email = null;
        let displayName = null;
        if (p?.signedinUser) {
          const userStr = String(p.signedinUser.user || '').trim();
          if (userStr.startsWith('users/')) {
            const suffix = userStr.slice(6);
            if (suffix.includes('@')) email = suffix;
          }
          displayName = String(p.signedinUser.displayName || '').trim() || null;
        } else if (p?.anonymousUser) {
          displayName = String(p.anonymousUser.displayName || '').trim() || null;
        } else if (p?.phoneUser) {
          displayName = String(p.phoneUser.displayName || '').trim() || null;
        }
        const startMs = earliest ? new Date(earliest).getTime() : 0;
        const endMs = latest ? new Date(latest).getTime() : startMs;
        const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
        participants.push({
          email,
          displayName,
          earliestStartTime: earliest,
          latestEndTime: latest,
          totalSeconds
        });
      }
      pageToken = partResp?.data?.nextPageToken;
      if (!pageToken) break;
    }

    return {
      ok: true,
      meetingCode,
      conferenceRecordName,
      participants
    };
  } catch (e) {
    logGoogleUnauthorizedHint(e, { context: 'fetchMeetParticipantsForRecord' });
    return {
      ok: false,
      reason: 'meet_api_error',
      error: String(e?.message || e),
      participants: []
    };
  }
}

export default {
  fetchMeetTranscriptForSession,
  fetchMeetParticipantsForRecord,
  ensureMeetAutoTranscriptionEnabled
};
