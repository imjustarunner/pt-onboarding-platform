import HiringInterview from '../models/HiringInterview.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import User from '../models/User.model.js';
import { prepareHiringInterviewInviteEmail } from './hiringInterviewInviteEmail.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

export async function sendHiringInterviewReminder(event, candidate) {
  const interview = await HiringInterview.findByScheduleEventId(event.id);
  if (!interview || Number(interview.candidate_user_id) !== Number(candidate.id) || interview.guest_access_ended_at || ['completed', 'cancelled'].includes(interview.status)) return { skipped: true };
  const profile = await HiringProfile.findByCandidateUserId(candidate.id);
  const interviewers = await Promise.all((interview.interviewer_user_ids_json || []).map(id => User.findById(id)));
  const email = await prepareHiringInterviewInviteEmail({
    agencyId: event.agency_id, candidate, title: interview.display_title || event.title,
    startsAt: event.start_at, endsAt: event.end_at, timezone: event.event_timezone || interview.interview_timezone || 'America/Denver',
    interviewId: interview.id, publicJoinUrl: interview.public_join_url,
    interviewerRows: interviewers.filter(Boolean), jobDescriptionId: profile?.job_description_id, jobTitle: profile?.applied_role
  });
  if (email.skipped) return email;
  const { from, ...delivery } = email;
  return sendEmailFromIdentity({ ...delivery, subject: `Interview reminder: ${email.subject}`, templateType: 'meeting_join_reminder' });
}
