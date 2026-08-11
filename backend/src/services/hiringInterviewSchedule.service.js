import pool from '../config/database.js';
import config from '../config/config.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import User from '../models/User.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import EmailService from './email.service.js';
import { joinUrlForTeamMeeting } from '../utils/joinToken.js';
import {
  ensureDefaultTemplate,
  buildInterviewFlow
} from './interviewHub.service.js';
import InterviewHubTemplate from '../models/InterviewHubTemplate.model.js';
import InterviewHubJobQuestionSet from '../models/InterviewHubJobQuestionSet.model.js';

/** Google Calendar event color: 3 = grape/purple (distinct from general meetings). */
export const INTERVIEW_GOOGLE_COLOR_ID = '3';

function toSqlDatetimeUtc(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function parseLocalWallClock(startsAt, timezone) {
  // Accept ISO or "YYYY-MM-DDTHH:mm" — treat as wall clock in timezone when no Z/offset.
  const raw = String(startsAt || '').trim();
  if (!raw) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Approximate: parse as local Date then store ISO; Google insert uses wall + timeZone.
  const normalized = raw.length === 16 ? `${raw}:00` : raw;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Create TEAM_MEETING (subtype interview) + hiring_interviews row + Google Calendar invite.
 */
export async function scheduleHiringInterview({
  agencyId,
  candidateUserId,
  hostUserId,
  startsAt,
  durationMinutes = 60,
  timezone = 'America/Denver',
  interviewerUserIds = [],
  templateId = null,
  jobQuestionSetId = null,
  hiringProfileId = null,
  sendInvites = true,
  titleOverride = null
}) {
  const agency = Number(agencyId);
  const candidateId = Number(candidateUserId);
  const hostId = Number(hostUserId);
  if (!agency || !candidateId || !hostId) {
    const err = new Error('agencyId, candidateUserId, and hostUserId are required');
    err.status = 400;
    throw err;
  }

  const candidate = await User.findById(candidateId);
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }

  const host = await User.findById(hostId);
  if (!host?.email) {
    const err = new Error('Host user must have an email for calendar sync');
    err.status = 400;
    throw err;
  }

  let resolvedTemplateId = templateId ? Number(templateId) : null;
  let template = resolvedTemplateId ? await InterviewHubTemplate.findById(resolvedTemplateId) : null;
  if (!template) {
    template = await ensureDefaultTemplate(agency, hostId);
    resolvedTemplateId = template.id;
  }

  let jobQuestionSet = null;
  if (jobQuestionSetId) {
    jobQuestionSet = await InterviewHubJobQuestionSet.findById(jobQuestionSetId);
    if (!jobQuestionSet || Number(jobQuestionSet.agency_id) !== agency) {
      const err = new Error('Invalid jobQuestionSetId for agency');
      err.status = 400;
      throw err;
    }
  }

  let profileId = hiringProfileId ? Number(hiringProfileId) : null;
  if (!profileId) {
    try {
      const profile = await HiringProfile.findByCandidateUserId(candidateId);
      profileId = profile?.id ? Number(profile.id) : null;
    } catch {
      profileId = null;
    }
  }

  const tz = String(timezone || 'America/Denver').trim() || 'America/Denver';
  const startDate = parseLocalWallClock(startsAt, tz);
  if (!startDate) {
    const err = new Error('Invalid startsAt');
    err.status = 400;
    throw err;
  }
  const mins = Math.min(Math.max(parseInt(durationMinutes, 10) || 60, 15), 240);
  const endDate = new Date(startDate.getTime() + mins * 60 * 1000);

  const interviewerIds = Array.from(new Set(
    (Array.isArray(interviewerUserIds) ? interviewerUserIds : [])
      .map((id) => Number(id))
      .filter((id) => id > 0)
  ));
  if (!interviewerIds.includes(hostId)) interviewerIds.unshift(hostId);

  const candidateName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
    || candidate.email
    || `Candidate ${candidateId}`;
  const title = String(titleOverride || `Interview: ${candidateName}`).trim();

  const wallStart = String(startsAt).trim().length === 16
    ? `${String(startsAt).trim()}:00`
    : String(startsAt).trim().replace(/[zZ]|[+-]\d{2}:?\d{2}$/, '').slice(0, 19);
  const wallEndDate = new Date(startDate.getTime() + mins * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  // Prefer wall-clock strings derived from the input when possible
  let wallEnd = wallStart;
  try {
    const base = new Date(wallStart.includes('T') ? wallStart : wallStart.replace(' ', 'T'));
    if (!Number.isNaN(base.getTime())) {
      const e = new Date(base.getTime() + mins * 60 * 1000);
      wallEnd = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}T${pad(e.getHours())}:${pad(e.getMinutes())}:${pad(e.getSeconds())}`;
    } else {
      wallEnd = wallEndDate.toISOString().slice(0, 19);
    }
  } catch {
    wallEnd = wallEndDate.toISOString().slice(0, 19);
  }

  // Resolve attendee emails (interviewers + candidate)
  const allUserIds = Array.from(new Set([...interviewerIds, candidateId]));
  const placeholders = allUserIds.map(() => '?').join(',');
  const [attendeeRows] = await pool.execute(
    `SELECT id, email, first_name, last_name FROM users WHERE id IN (${placeholders})`,
    allUserIds
  );
  const emailById = new Map((attendeeRows || []).map((r) => [Number(r.id), String(r.email || '').trim().toLowerCase()]));
  const attendeeEmails = Array.from(new Set(
    allUserIds.map((id) => emailById.get(id)).filter(Boolean)
  ));

  let googleEventId = null;
  let googleHtmlLink = null;
  const descriptionParts = [
    `Hiring interview for ${candidateName}.`,
    'Join with the PlotTwist interview link (app video). Google Meet is not used for this interview.'
  ];

  try {
    const gcal = await GoogleCalendarService.createProviderScheduleEvent({
      subjectEmail: host.email,
      startAt: wallStart.includes('T') ? wallStart : wallStart.replace(' ', 'T'),
      endAt: wallEnd.includes('T') ? wallEnd : wallEnd.replace(' ', 'T'),
      timeZone: tz,
      summary: title,
      description: descriptionParts.join('\n\n'),
      kind: 'TEAM_MEETING',
      attendeeEmails,
      createMeetLink: false,
      sendUpdates: sendInvites ? 'all' : 'none',
      colorId: INTERVIEW_GOOGLE_COLOR_ID
    });
    if (gcal?.ok) {
      googleEventId = gcal.eventId || null;
      googleHtmlLink = gcal.htmlLink || null;
    }
  } catch (e) {
    console.warn('[scheduleHiringInterview] Google Calendar create failed:', e?.message || e);
  }

  const saved = await ProviderScheduleEvent.create({
    agencyId: agency,
    providerId: hostId,
    kind: 'TEAM_MEETING',
    title,
    description: descriptionParts.join('\n\n'),
    allDay: false,
    startAt: toSqlDatetimeUtc(startDate),
    endAt: toSqlDatetimeUtc(endDate),
    googleEventId,
    googleHtmlLink,
    googleMeetLink: null,
    platformVideoLink: true,
    createdByUserId: hostId,
    waitingRoomEnabled: true,
    meetingSubtype: 'interview',
    notifyParticipants: !!sendInvites
  });

  if (!saved?.id) {
    const err = new Error('Failed to create schedule event');
    err.status = 500;
    throw err;
  }

  try {
    await ProviderScheduleEventAttendee.upsertForEvent(
      saved.id,
      interviewerIds.filter((id) => id !== hostId)
    );
  } catch (e) {
    console.warn('[scheduleHiringInterview] attendee upsert failed:', e?.message || e);
  }

  const guestToken = saved.participant_join_token || saved.join_token || null;
  const hostToken = saved.host_join_token || guestToken;
  const publicJoinUrl = joinUrlForTeamMeeting(config.frontendUrl || process.env.FRONTEND_URL, guestToken);
  const hostJoinUrl = joinUrlForTeamMeeting(config.frontendUrl || process.env.FRONTEND_URL, hostToken);

  if (publicJoinUrl && googleEventId) {
    try {
      await GoogleCalendarService.appendToEventDescription({
        subjectEmail: host.email,
        googleEventId,
        appendText: `\n\nJoin interview (candidate):\n${publicJoinUrl}\n\nJoin interview (host):\n${hostJoinUrl || publicJoinUrl}`,
        sendUpdates: sendInvites ? 'all' : 'none'
      });
    } catch (e) {
      console.warn('[scheduleHiringInterview] append join URL failed:', e?.message || e);
    }
  }

  // Keep description on the event row updated
  try {
    await pool.execute(
      `UPDATE provider_schedule_events
          SET description = ?
        WHERE id = ?
        LIMIT 1`,
      [
        `${descriptionParts.join('\n\n')}\n\nJoin interview (candidate):\n${publicJoinUrl || ''}\n\nJoin interview (host):\n${hostJoinUrl || publicJoinUrl || ''}`,
        saved.id
      ]
    );
  } catch {
    // ignore
  }

  const interview = await HiringInterview.create({
    agencyId: agency,
    candidateUserId: candidateId,
    hiringProfileId: profileId,
    providerScheduleEventId: saved.id,
    templateId: resolvedTemplateId,
    jobQuestionSetId: jobQuestionSet ? Number(jobQuestionSet.id) : null,
    status: 'scheduled',
    interviewStartsAt: toSqlDatetimeUtc(startDate),
    interviewTimezone: tz,
    interviewerUserIds: interviewerIds,
    guestJoinToken: guestToken,
    hostJoinToken: hostToken,
    inviteSentAt: sendInvites ? new Date() : null,
    publicJoinUrl,
    createdByUserId: hostId
  });

  // Mirror onto hiring_profiles interview fields for Applicants compatibility
  try {
    if (profileId || candidateId) {
      await pool.execute(
        `UPDATE hiring_profiles
            SET interview_starts_at = ?,
                interview_timezone = ?,
                interview_interviewer_user_ids = ?,
                interview_status = 'scheduled',
                interview_scheduled_by_user_id = ?
          WHERE user_id = ?
          LIMIT 1`,
        [
          toSqlDatetimeUtc(startDate),
          tz,
          JSON.stringify(interviewerIds),
          hostId,
          candidateId
        ]
      );
    }
  } catch (e) {
    console.warn('[scheduleHiringInterview] hiring_profiles sync failed:', e?.message || e);
  }

  const flow = buildInterviewFlow({
    template,
    jobQuestionSet,
    regenerateSalutation: true,
    regenerateIcebreaker: true
  });
  const artifact = await HiringInterviewArtifact.upsertByInterviewId(interview.id, {
    flowStateJson: flow
  });

  if (sendInvites && candidate.email && publicJoinUrl) {
    try {
      const whenLabel = `${wallStart.replace('T', ' ')} (${tz})`;
      await EmailService.sendEmail({
        to: candidate.email,
        subject: title,
        html: `
          <p>Hi ${candidate.first_name || candidateName},</p>
          <p>You are invited to an interview.</p>
          <p><strong>When:</strong> ${whenLabel}</p>
          <p><strong>Join link:</strong> <a href="${publicJoinUrl}">${publicJoinUrl}</a></p>
          <p>Please join a few minutes early. You will wait in a lobby until admitted.</p>
        `,
        text: `Hi ${candidate.first_name || candidateName},\n\nYou are invited to an interview.\nWhen: ${whenLabel}\nJoin: ${publicJoinUrl}\n`
      });
    } catch (e) {
      console.warn('[scheduleHiringInterview] candidate invite email failed:', e?.message || e);
    }
  }

  return {
    interview,
    artifact,
    flow,
    scheduleEvent: saved,
    publicJoinUrl,
    hostJoinUrl
  };
}
