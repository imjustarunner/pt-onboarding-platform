import { resolveInterviewSender, interviewDeliveryStatus } from './hiringInterviewSender.service.js';
import { canAccessHiringInterview } from './hiringInterviewAccess.service.js';
import pool from '../config/database.js';
import config from '../config/config.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import User from '../models/User.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { joinUrlForTeamMeeting } from '../utils/joinToken.js';
import {
  isValidTimeZone,
  utcDateToZonedParts,
  zonedWallTimeToUtc
} from '../utils/zonedWallTime.util.js';
import {
  ensureDefaultTemplate,
  buildInterviewFlow
} from './interviewHub.service.js';
import InterviewHubTemplate from '../models/InterviewHubTemplate.model.js';
import InterviewHubJobQuestionSet from '../models/InterviewHubJobQuestionSet.model.js';
import { isValidInterviewRoundKey } from '../constants/hiringInterviewRounds.js';
import { buildHiringInterviewTitle } from '../utils/hiringInterviewTitle.js';
import { sendHiringInterviewInviteEmail } from './hiringInterviewInviteEmail.service.js';

/** Google Calendar event color: 3 = grape/purple (distinct from general meetings). */
export const INTERVIEW_GOOGLE_COLOR_ID = '3';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatWallFromParts(parts) {
  if (!parts) return null;
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second || 0)}`;
}

/**
 * Interpret startsAt as wall-clock in `timezone` unless it already has a Z/offset.
 * Instant values are converted to wall-clock in that timezone so Google Calendar
 * does not double-apply the offset (1pm local → ISO Z → 6pm wall).
 */
export function parseInterviewStart(startsAt, timezone) {
  const tz = isValidTimeZone(timezone) ? String(timezone).trim() : 'America/Denver';
  const raw = String(startsAt || '').trim();
  if (!raw) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const wallStart = formatWallFromParts(utcDateToZonedParts(d, tz));
    if (!wallStart) return null;
    return { startDate: d, wallStart, timeZone: tz };
  }
  const normalized = raw.length === 16 ? `${raw}:00` : raw.replace(' ', 'T').slice(0, 19);
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const startDate = zonedWallTimeToUtc({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] || 0),
    timeZone: tz
  });
  if (!startDate || Number.isNaN(startDate.getTime())) return null;
  const wallStart = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${pad2(m[6] || 0)}`;
  return { startDate, wallStart, timeZone: tz };
}

function toSqlDatetimeUtc(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
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
  titleOverride = null,
  interviewRound = 'initial',
  roundLabelCustom = null,
  jobTitleOverride = null
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

  const candidateAgencies = await User.getAgencies(candidateId);
  if (!candidateAgencies.some(a => Number(a.id) === agency)) throw Object.assign(new Error('Candidate is not in this agency'), { status: 400 });
  const sender = sendInvites ? await resolveInterviewSender(agency) : null;
  const calendarSender = sender?.from_email || host.email;

  let resolvedTemplateId = templateId ? Number(templateId) : null;
  let template = resolvedTemplateId ? await InterviewHubTemplate.findById(resolvedTemplateId) : null;
  if (template && Number(template.agency_id) !== agency) throw Object.assign(new Error('Template is not in this agency'), { status: 400 });
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
  let profileRow = null;
  try {
    profileRow = await HiringProfile.findByCandidateUserId(candidateId);
    if (!profileId && profileRow?.id) profileId = Number(profileRow.id);
  } catch {
    profileRow = null;
  }

  if (profileId && Number(profileRow?.id) !== profileId) throw Object.assign(new Error('Hiring profile does not belong to the candidate'), { status: 400 });

  let jobTitle = String(jobTitleOverride || '').trim();
  let resolvedJobDescriptionId = null;
  if (!jobTitle) {
    const jobDescriptionId = profileRow?.job_description_id
      ?? jobQuestionSet?.job_description_id
      ?? null;
    if (jobDescriptionId) {
      resolvedJobDescriptionId = Number(jobDescriptionId);
      try {
        const [jobRows] = await pool.execute(
          `SELECT title FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
          [Number(jobDescriptionId)]
        );
        jobTitle = String(jobRows?.[0]?.title || '').trim();
      } catch {
        jobTitle = '';
      }
    }
  } else if (profileRow?.job_description_id) {
    resolvedJobDescriptionId = Number(profileRow.job_description_id);
  } else if (jobQuestionSet?.job_description_id) {
    resolvedJobDescriptionId = Number(jobQuestionSet.job_description_id);
  }
  if (!jobTitle && profileRow?.applied_role) {
    jobTitle = String(profileRow.applied_role).trim();
  }

  const tz = String(timezone || 'America/Denver').trim() || 'America/Denver';
  if (!isValidTimeZone(tz)) throw Object.assign(new Error('Choose a valid timezone'), { status: 400 });
  const parsed = parseInterviewStart(startsAt, tz);
  if (!parsed?.startDate) {
    const err = new Error('Invalid startsAt');
    err.status = 400;
    throw err;
  }
  const startDate = parsed.startDate;
  const mins = Math.min(Math.max(parseInt(durationMinutes, 10) || 60, 15), 240);
  const endDate = new Date(startDate.getTime() + mins * 60 * 1000);
  const wallStart = parsed.wallStart;
  const wallEnd = formatWallFromParts(utcDateToZonedParts(endDate, parsed.timeZone)) || wallStart;

  const interviewerIds = Array.from(new Set(
    (Array.isArray(interviewerUserIds) ? interviewerUserIds : [])
      .map((id) => Number(id))
      .filter((id) => id > 0)
  ));
  if (!interviewerIds.includes(hostId)) interviewerIds.unshift(hostId);

  if (interviewerIds.includes(candidateId)) throw Object.assign(new Error('The candidate cannot be an interviewer'), { status: 400 });
  for (const id of interviewerIds) {
    if (!await canAccessHiringInterview({ id }, { candidate_user_id: candidateId, agency_id: agency, interviewer_user_ids: interviewerIds })) {
      throw Object.assign(new Error('Every interviewer must be active staff in this agency'), { status: 400 });
    }
  }

  const candidateName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
    || candidate.email
    || `Candidate ${candidateId}`;

  const roundKey = isValidInterviewRoundKey(interviewRound)
    ? String(interviewRound || 'initial').trim().toLowerCase() || 'initial'
    : 'initial';
  const title = String(titleOverride || '').trim()
    || buildHiringInterviewTitle({
      interviewRound: roundKey,
      roundLabelCustom: roundLabelCustom,
      candidateName,
      jobTitle
    });

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

  let calendarWarning = null;
  let googleEventId = null;
  let googleHtmlLink = null;
  const descriptionParts = [
    `Hiring interview for ${candidateName}.`,
    'Join with the PlotTwist interview link (app video). Google Meet is not used for this interview.'
  ];

  try {
    const gcal = await GoogleCalendarService.createProviderScheduleEvent({
      subjectEmail: calendarSender,
      startAt: wallStart.includes('T') ? wallStart : wallStart.replace(' ', 'T'),
      endAt: wallEnd.includes('T') ? wallEnd : wallEnd.replace(' ', 'T'),
      timeZone: tz,
      summary: title,
      description: descriptionParts.join('\n\n'),
      kind: 'TEAM_MEETING',
      attendeeEmails,
      createMeetLink: false,
      sendUpdates: 'none',
      colorId: INTERVIEW_GOOGLE_COLOR_ID
    });
    if (gcal?.ok) {
      googleEventId = gcal.eventId || null;
      googleHtmlLink = gcal.htmlLink || null;
    } else calendarWarning = 'Calendar invitation was not created. Check the People Operations calendar connection.';
  } catch (e) {
    calendarWarning = 'Calendar invitation was not created. Check the People Operations calendar connection.';
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
    eventTimezone: tz,
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
      const linkUpdate = await GoogleCalendarService.appendToEventDescription({
        subjectEmail: calendarSender,
        googleEventId,
        appendText: `\n\nJoin interview:\n${publicJoinUrl}\n\nInterviewers: sign in with your staff account to open the private workspace.`,
        sendUpdates: sendInvites ? 'all' : 'none'
      });
      if (!linkUpdate?.ok) calendarWarning = 'Calendar join-link update failed. Use the emailed interview link.';
    } catch (e) {
      calendarWarning = 'Calendar join-link update failed. Use the emailed interview link.';
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
        `${descriptionParts.join('\n\n')}\n\nJoin interview:\n${publicJoinUrl || ''}`,
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
    interviewStartsAt: startDate,
    interviewTimezone: tz,
    interviewerUserIds: interviewerIds,
    guestJoinToken: guestToken,
    hostJoinToken: hostToken,
    inviteSentAt: null,
    publicJoinUrl,
    interviewRound: roundKey,
    displayTitle: title,
    createdByUserId: hostId
  });

  await pool.execute('UPDATE hiring_interviews SET calendar_sender_email = ? WHERE id = ?', [calendarSender, interview.id]);

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
          WHERE candidate_user_id = ?
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

  let delivery = { sent: false, reason: sendInvites ? 'Candidate email or join link is missing.' : 'Invitations have not been sent.' };
  if (sendInvites && candidate.email && publicJoinUrl) {
    try {
      const whenLabel = `${wallStart.replace('T', ' ')} (${tz})`;
      const interviewerRows = (attendeeRows || []).filter((r) => interviewerIds.includes(Number(r.id)));
      const sent = await sendHiringInterviewInviteEmail({
        agencyId: agency,
        candidate,
        title,
        whenLabel,
        publicJoinUrl,
        interviewerRows,
        jobDescriptionId: resolvedJobDescriptionId,
        jobTitle
      });
      delivery = interviewDeliveryStatus(sent);
      if (delivery.sent) {
        const updated = await HiringInterview.updateById(interview.id, { inviteSentAt: new Date() });
        interview.invite_sent_at = updated.invite_sent_at;
      }
    } catch (e) {
      delivery = { sent: false, reason: e?.message || 'Invitation delivery failed.' };
      console.warn('[scheduleHiringInterview] candidate invite email failed:', e?.message || e);
    }
  }

  await pool.execute('UPDATE hiring_interviews SET invite_error = ? WHERE id = ?', [delivery.sent ? null : delivery.reason, interview.id]);
  interview.invite_error = delivery.sent ? null : delivery.reason;
  return {
    interview,
    artifact,
    flow,
    scheduleEvent: saved,
    publicJoinUrl,
    hostJoinUrl, delivery, calendarWarning
  };
}
