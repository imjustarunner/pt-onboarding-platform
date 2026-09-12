import pool from '../config/database.js';
import User from '../models/User.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import { sendHiringInterviewInviteEmail } from './hiringInterviewInviteEmail.service.js';
import { interviewDeliveryStatus } from './hiringInterviewSender.service.js';

export async function deliverExistingInterview(interview) {
  if (interview.guest_access_ended_at || ['completed', 'cancelled'].includes(interview.status)) {
    throw Object.assign(new Error('This interview has ended. Schedule a new round instead.'), { status: 409 });
  }
  const candidate = await User.findById(interview.candidate_user_id);
  const profile = await HiringProfile.findByCandidateUserId(interview.candidate_user_id);
  const interviewerRows = await Promise.all((interview.interviewer_user_ids_json || []).map(id => User.findById(id)));
  let delivery;
  try {
    delivery = interviewDeliveryStatus(await sendHiringInterviewInviteEmail({
      agencyId: interview.agency_id, candidate, title: interview.display_title || 'Interview invitation',
      whenLabel: new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: interview.interview_timezone || 'America/Denver' }).format(interviewDate(interview.interview_starts_at)) + ` (${interview.interview_timezone || 'America/Denver'})`,
      publicJoinUrl: interview.public_join_url, interviewerRows: interviewerRows.filter(Boolean),
      jobDescriptionId: profile?.job_description_id, jobTitle: profile?.applied_role
    }));
  } catch (e) { delivery = { sent: false, reason: e.message || 'Invitation failed.' }; }
  if (delivery.sent) await HiringInterview.updateById(interview.id, { inviteSentAt: new Date() });
  await pool.execute('UPDATE hiring_interviews SET invite_error = ? WHERE id = ?', [delivery.sent ? null : delivery.reason, interview.id]);
  return delivery;
}

export function interviewDate(value) {
  if (value instanceof Date) return value;
  const raw = String(value || '').replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw + 'Z');
}
