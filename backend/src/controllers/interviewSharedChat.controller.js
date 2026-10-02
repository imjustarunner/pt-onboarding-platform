import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import VideoMeetingActivity from '../models/VideoMeetingActivity.model.js';
import { requireHiringInterviewAccess } from '../services/hiringInterviewAccess.service.js';
import { requireApplicantInRoom } from '../services/interviewApplicantAccess.service.js';
import { roomUnavailable } from '../services/meetingJoinPolicy.service.js';

async function chatActor(req) {
  const applicant = req.interviewApplicant;
  if (applicant) {
    await requireApplicantInRoom(applicant);
    return { event: applicant.event, identity: applicant.identity, userId: null,
      personId: applicant.interview.candidate_user_id, roleLabel: 'Applicant' };
  }
  const event = await ProviderScheduleEvent.findById(Number(req.params.eventId));
  if (!event || event.meeting_subtype !== 'interview') throw Object.assign(new Error('Interview not found.'), { status: 404 });
  await requireHiringInterviewAccess(req.user, await HiringInterview.findByScheduleEventId(event.id));
  const unavailable = roomUnavailable(event);
  if (unavailable) throw Object.assign(new Error(unavailable.error.message), { status: unavailable.status });
  return { event, identity: `user-${req.user.id}`, userId: req.user.id, personId: req.user.id, roleLabel: 'Interviewer' };
}

export const getInterviewSharedChat = async (req, res, next) => {
  try {
    const actor = await chatActor(req);
    const rows = await VideoMeetingActivity.list({ eventId: actor.event.id });
    // Private team chat lives in hiring interview artifacts, never this channel.
    // Legacy activity is NOT implicitly shared with applicants.
    res.json({ messages: rows.filter(r => r.activityType === 'chat' && r.payload?.audience === 'interview_shared')
      .map(r => ({ id: r.id, text: r.payload.text, authorName: r.payload.authorName, roleLabel: r.payload.roleLabel, createdAt: r.createdAt })) });
  } catch (e) { next(e); }
};

export const postInterviewSharedChat = async (req, res, next) => {
  try {
    const actor = await chatActor(req);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 4000) return res.status(400).json({ error: { message: 'Enter a message of 1–4,000 characters.' } });
    const person = await User.findById(actor.personId);
    const authorName = [person?.first_name, person?.last_name].filter(Boolean).join(' ') || actor.roleLabel;
    const id = await VideoMeetingActivity.create({ eventId: actor.event.id, userId: actor.userId,
      participantIdentity: actor.identity, activityType: 'chat',
      payload: { audience: 'interview_shared', text, authorName, roleLabel: actor.roleLabel } });
    res.json({ id });
  } catch (e) { next(e); }
};
