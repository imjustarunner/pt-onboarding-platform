import Agency from '../models/Agency.model.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { resolveInterviewSender } from './hiringInterviewSender.service.js';
import { escapeInterviewHtml } from '../utils/interviewInvitationBody.js';
import { referenceEmailFrame } from './hiringReferenceEmail.service.js';
import { emailActionButton } from '../utils/emailActionButton.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import User from '../models/User.model.js';
import { prepareHiringInterviewInviteEmail } from './hiringInterviewInviteEmail.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { tenantInterviewJoinUrl } from '../utils/tenantMeetingUrl.js';

export async function sendHiringInterviewReminder(event, candidate) {
  const interview = await HiringInterview.findByScheduleEventId(event.id);
  if (!interview || Number(interview.candidate_user_id) !== Number(candidate.id) || interview.guest_access_ended_at || ['completed', 'cancelled'].includes(interview.status)) return { skipped: true };
  const profile = await HiringProfile.findByCandidateUserId(candidate.id);
  const interviewers = await Promise.all((interview.interviewer_user_ids_json || []).map(id => User.findById(id)));
  const email = await prepareHiringInterviewInviteEmail({
    agencyId: event.agency_id, candidate, title: interview.display_title || event.title,
    startsAt: event.start_at, endsAt: event.end_at, timezone: event.event_timezone || interview.interview_timezone || 'America/Denver',
    interviewId: interview.id, publicJoinUrl: (interview.guest_join_token ? await tenantInterviewJoinUrl(interview.agency_id, interview.guest_join_token) : interview.public_join_url),
    interviewerRows: interviewers.filter(Boolean), jobDescriptionId: profile?.job_description_id, jobTitle: profile?.applied_role
  });
  if (email.skipped) return email;
  const { from, ...delivery } = email;
  return sendEmailFromIdentity({ ...delivery, subject: `Interview reminder: ${email.subject}`, templateType: 'meeting_join_reminder' });
}

export async function prepareStaffInterviewEmail(event, user, joinUrl, { reminder = false } = {}) {
  const interview = await HiringInterview.findByScheduleEventId(event.id);
  if (interview && (interview.guest_access_ended_at || ['completed','cancelled'].includes(interview.status))) return { skipped: true };
  const [agency, identity, recipient] = await Promise.all([
    Agency.findById(event.agency_id),
    resolveInterviewSender(event.agency_id),
    resolveMeetingRecipient({ agencyId: event.agency_id, user })
  ]);
  if (!recipient.email) return { skipped: true };
  const agencyName = agency?.name || agency?.official_name || 'Hiring agency';
  const title = interview?.display_title || event.title || 'Interview';
  const zone = event.event_timezone || interview?.interview_timezone || 'America/Denver';
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: zone });
  const when = `${date.formatRange(parseUtcDate(event.start_at), parseUtcDate(event.end_at))} (${zone})`;
  const rsvp = new URL(joinUrl);
  rsvp.searchParams.set('rsvp', '1');
  rsvp.searchParams.set('eventId', String(event.id));
  const heading = reminder ? 'Interview reminder' : 'You’ve been invited to an interview';
  const message = reminder ? 'Your interview is coming up.' : 'You’ve been invited to join the interview team. The interview is on My Schedule.';
  const choiceUrl = response => { const url = new URL(rsvp);url.searchParams.set('response', response);return url.href; };
  const html = referenceEmailFrame({ agency, heading, marketing: false, body: `
    <p>Hello ${escapeInterviewHtml(user.preferred_name || user.first_name || 'there')},</p>
    <p>${escapeInterviewHtml(message)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:#f0f5f2;border:1px solid #dce6e1;border-radius:10px"><tr><td style="padding:18px"><strong>${escapeInterviewHtml(title)}</strong><br>${escapeInterviewHtml(when)}</td></tr></table>
    ${emailActionButton('Join interview', joinUrl, true)}
    <p style="font-size:13px;color:#546c62">This personal email link identifies you as the invited staff member and opens only this interview. No app sign-in is required. Do not forward it.</p>
    <h2 style="font-size:19px">Will you attend?</h2>
    ${emailActionButton('Yes, I’m attending', choiceUrl('accepted'))}
    ${emailActionButton('I can’t attend', choiceUrl('declined'))}
    <p style="font-size:13px;color:#546c62">Confirm your response on the page that opens. RSVP does not record attendance or paid time.</p>
    <p>For eligible hourly staff, actual interview attendance is recorded for payroll using your assigned administrative or indirect-time rate. Salaried coverage and existing payroll review still apply.</p>
    <p>Questions or a scheduling conflict? Reply to this email to reach ${escapeInterviewHtml(agencyName)} People Operations.</p>` });
  return {
    senderIdentityId: identity.id, fromDisplayNameOverride: `${agencyName} People Operations`, replyToOverride: identity.from_email,
    to: recipient.email, userId: user.id, subject: `${heading} · ${title}`, html,
    text: `Plotline · ${agencyName}\n${message}\n${title}\n${when}\nJoin: ${joinUrl}\nRSVP: ${rsvp.href}`,
    templateType: reminder ? 'meeting_join_reminder' : 'meeting_invited', source: 'auto'
  };
}

export async function sendStaffInterviewEmail(...args) {
  const email = await prepareStaffInterviewEmail(...args);
  return email.skipped ? email : sendEmailFromIdentity(email);
}
