import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import { sendMeetingInviteEmail } from './meetingCancellation.service.js';

const MEETING_ROLES = new Set([
  'admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant'
]);

function toMysqlLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function canStartTeamMeeting(role) {
  return MEETING_ROLES.has(String(role || '').toLowerCase());
}

/**
 * Create an ad-hoc 1:1 TEAM_MEETING or HUDDLE and return join URLs.
 */
export async function startAdhocTeamMeeting({
  actorUserId,
  actorRole,
  agencyId,
  withUserId,
  kind = 'TEAM_MEETING',
  title = null,
  durationMinutes = 30,
  description = null
}) {
  const role = String(actorRole || '').toLowerCase();
  if (!canStartTeamMeeting(role)) {
    const err = new Error('Meetings are not available for your role');
    err.status = 403;
    throw err;
  }

  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }

  const actorId = Number(actorUserId || 0);
  const otherId = Number(withUserId || 0);
  if (!actorId || !otherId) {
    const err = new Error('actor and withUserId are required');
    err.status = 400;
    throw err;
  }
  if (actorId === otherId) {
    const err = new Error('You cannot start a meeting with yourself');
    err.status = 400;
    throw err;
  }

  const kindUpper = String(kind || 'TEAM_MEETING').trim().toUpperCase();
  if (!['TEAM_MEETING', 'HUDDLE'].includes(kindUpper)) {
    const err = new Error('kind must be TEAM_MEETING or HUDDLE');
    err.status = 400;
    throw err;
  }
  if (kindUpper === 'HUDDLE' && role !== 'provider_plus') {
    const err = new Error('Only provider_plus can start huddles');
    err.status = 403;
    throw err;
  }

  const target = await User.findById(otherId);
  if (!target) {
    const err = new Error('Person not found');
    err.status = 404;
    throw err;
  }

  const targetName =
    [target.first_name, target.last_name].filter(Boolean).join(' ').trim() || target.email || `User #${otherId}`;
  const meetingTitle =
    (title && String(title).trim().slice(0, 200)) ||
    (kindUpper === 'HUDDLE' ? `Huddle with ${targetName}` : `Quick meeting with ${targetName}`);
  const mins = Math.min(Math.max(5, Number(durationMinutes) || 30), 240);

  const now = new Date();
  const roundedMs = Math.ceil(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
  const startAt = new Date(roundedMs);
  const endAt = new Date(startAt.getTime() + mins * 60 * 1000);

  const created = await ProviderScheduleEvent.create({
    agencyId: aid,
    providerId: actorId,
    kind: kindUpper,
    title: meetingTitle,
    description: description || `Ad-hoc ${kindUpper === 'HUDDLE' ? 'huddle' : 'meeting'} from Messages.`,
    isPrivate: false,
    allDay: false,
    startAt: toMysqlLocal(startAt),
    endAt: toMysqlLocal(endAt),
    platformVideoLink: true,
    createdByUserId: actorId
  });

  if (!created?.id) {
    const err = new Error('Failed to create meeting');
    err.status = 500;
    throw err;
  }

  await ProviderScheduleEventAttendee.upsertForEvent(created.id, [otherId]);

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const joinPath = `/join/team-meeting/${created.id}`;
  const joinUrl = frontendUrl ? `${frontendUrl}${joinPath}` : joinPath;

  let inviteEmailed = false;
  try {
    const host = await User.findById(actorId);
    inviteEmailed = await sendMeetingInviteEmail({
      agencyId: aid,
      attendeeUser: { id: otherId, email: target.email },
      hostUser: host,
      meetingTitle,
      meetingStartAt: startAt,
      meetingEndAt: endAt,
      joinUrl
    });
  } catch {
    // best-effort
  }

  return {
    eventId: created.id,
    title: meetingTitle,
    kind: kindUpper,
    startAt: toMysqlLocal(startAt),
    endAt: toMysqlLocal(endAt),
    durationMinutes: mins,
    withUser: {
      id: otherId,
      name: targetName,
      email: target.email
    },
    joinUrl,
    joinPath,
    inviteEmailed
  };
}
