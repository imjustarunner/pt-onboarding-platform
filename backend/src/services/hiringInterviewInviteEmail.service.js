import { interviewInvitationBody } from '../utils/interviewInvitationBody.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
/**
 * Helpers for hiring interview candidate invite emails (People Operations).
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import StorageService from './storage.service.js';
import { resolveInterviewSender } from './hiringInterviewSender.service.js';
import { wrapOutboundHtmlWithTenantChrome } from './tenantEmailChrome.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import {
  buildJobDescriptionAttachmentForEmail,
  buildPublicJobDescriptionUrl,
  peopleOperationsFromDisplayName
} from './publicJobDescription.service.js';

function formatPersonName(row) {
  const name = [row?.first_name, row?.last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ').trim();
  return name || String(row?.email || '').trim() || 'Team member';
}

function agencyBrandOrName(agency) {
  const name = String(agency?.name || '').trim();
  const official = String(agency?.official_name || '').trim();
  if (name && name.length <= 40) return name;
  return official || name || 'our agency';
}

async function findLatestJobApplicationSubmission({ agencyId, candidateUserId, jobDescriptionId = null }) {
  const aid = Number(agencyId);
  const uid = Number(candidateUserId);
  if (!aid || !uid) return null;
  const params = [uid, aid];
  let jobFilter = '';
  if (Number(jobDescriptionId) > 0) {
    jobFilter = ' AND il.job_description_id = ?';
    params.push(Number(jobDescriptionId));
  }
  const [rows] = await pool.execute(
    `SELECT s.id
       FROM intake_submissions s
       INNER JOIN intake_links il ON il.id = s.intake_link_id
      WHERE s.guardian_user_id = ?
        AND il.organization_id = ?
        AND il.form_type = 'job_application'
        AND s.status IN ('submitted', 'completed', 'approved')
        ${jobFilter}
      ORDER BY COALESCE(s.submitted_at, s.updated_at, s.created_at) DESC
      LIMIT 1`,
    params
  );
  const sid = Number(rows?.[0]?.id || 0);
  if (!sid) return null;
  return IntakeSubmission.findById(sid);
}

/**
 * Prepare the candidate invitation without sending so delivery and review copies
 * share the same body, personal links, sender, and application materials.
 */
export async function prepareHiringInterviewInviteEmail({
  agencyId,
  candidate,
  title,
  whenLabel,
  startsAt, endsAt, timezone = 'America/Denver', interviewId,
  publicJoinUrl,
  interviewerRows = [],
  jobDescriptionId = null,
  jobTitle = ''
}) {
  interviewerRows = await Promise.all(interviewerRows.map(async user=>({...user,...await resolveMeetingRecipient({agencyId,user})})));
  const to = String(candidate?.email || '').trim();
  if (!to || !publicJoinUrl) return { skipped: true, reason: 'missing_to_or_url' };

  const agency = await Agency.findById(agencyId).catch(() => null);
  const identity = await resolveInterviewSender(agencyId);

  let job = null;
  const jid = Number(jobDescriptionId || 0);
  if (jid) {
    job = await HiringJobDescription.findById(jid).catch(() => null);
    if (job && Number(job.agency_id) !== Number(agencyId)) job = null;
  }

  const attachments = [];
  const { interviewCalendar } = await import('../utils/interviewCalendar.js');
  const calendar = interviewCalendar({ startsAt, endsAt, timezone, title, publicJoinUrl, interviewId });
  if (calendar) {
    whenLabel = calendar.whenLabel;
    attachments.push({ filename: 'interview.ics', contentType: 'text/calendar; charset=utf-8', contentBase64: Buffer.from(calendar.ics).toString('base64') });
  }
  let submission = null;
  try {
    submission = await findLatestJobApplicationSubmission({
      agencyId,
      candidateUserId: candidate.id,
      jobDescriptionId: jid || null
    });
  } catch (e) {
    console.warn('[sendHiringInterviewInviteEmail] submission lookup failed', e?.message || e);
  }

  let applicationPdfBase64 = null;
  let receiptPdfBase64 = null;

  try {
    if (submission?.intake_link_id) {
      const link = await IntakeLink.findById(submission.intake_link_id);
      const intakeData = submission.intake_data
        || (typeof submission.intakeData === 'object' ? submission.intakeData : null);
      if (link && intakeData) {
        const { buildAnswersPdfBuffer } = await import('../controllers/publicIntake.controller.js');
        const receiptPdf = await buildAnswersPdfBuffer({
          link,
          intakeData,
          submissionId: submission.id,
          submission
        });
        if (receiptPdf) {
          receiptPdfBase64 = Buffer.from(receiptPdf).toString('base64');
        }
      }
    }
  } catch (e) {
    console.warn('[sendHiringInterviewInviteEmail] receipt PDF failed', e?.message || e);
  }

  if (submission?.combined_pdf_path) {
    try {
      const buf = await StorageService.readObject(submission.combined_pdf_path);
      applicationPdfBase64 = Buffer.from(buf).toString('base64');
    } catch (e) {
      console.warn('[sendHiringInterviewInviteEmail] stored application PDF failed', e?.message || e);
    }
  }

  // Prefer branded rebuild for both names when available; otherwise reuse stored bundle.
  const applicationB64 = receiptPdfBase64 || applicationPdfBase64;
  const receiptB64 = receiptPdfBase64 || applicationPdfBase64;
  if (applicationB64) {
    attachments.push({
      filename: 'job-application.pdf',
      contentType: 'application/pdf',
      contentBase64: applicationB64
    });
  }
  if (receiptB64) {
    attachments.push({
      filename: 'job-application-receipt.pdf',
      contentType: 'application/pdf',
      contentBase64: receiptB64
    });
  }

  const jdAttach = await buildJobDescriptionAttachmentForEmail(job, { agency });
  if (jdAttach) attachments.push(jdAttach);

  const jdUrl = job?.id ? buildPublicJobDescriptionUrl(agency, job.id) : '';
  const roleLabel = String(jobTitle || job?.title || '').trim();
  const interviewerNames = (Array.isArray(interviewerRows) ? interviewerRows : [])
    .map(person => `${formatPersonName(person)}${person.email ? ` <${person.email}>` : ''}`)
    .filter(Boolean);
  const uniqueInterviewers = [...new Set(interviewerNames)];
  const interviewerLine = uniqueInterviewers.length
    ? uniqueInterviewers.join(', ')
    : 'our hiring team';

  const firstName = String(candidate.first_name || '').trim() || formatPersonName(candidate);
  const fromDisplay = peopleOperationsFromDisplayName(agency || {});
  const replyTo = (Array.isArray(interviewerRows) ? interviewerRows : []).map(row=>String(row.email || '').trim()).filter(Boolean).join(', ') || String(identity.from_email).trim();

  const subject = String(title || 'Interview invitation').trim();
  const rsvpUrl = publicJoinUrl.replace('/join/team-meeting/','/interview-rsvp/');
  const text = [
    `Hi ${firstName},`,
    '',
    `Thank you for your interest in ${agencyBrandOrName(agency)}${roleLabel ? ` and the ${roleLabel} position` : ''}. We enjoyed learning about your experience and would love to meet you, hear more about your goals, and answer your questions about the team.`,
    roleLabel ? `Role: ${roleLabel}` : '',
    `When: ${whenLabel}`,
    `Invited from ${agencyBrandOrName(agency)}: ${interviewerLine}`,
    '',
    `Join link: ${publicJoinUrl}`,
    `Confirm attendance or decline: ${rsvpUrl}`,
    ...(calendar ? [`Add to Google Calendar: ${calendar.googleUrl}`, `Add to Outlook: ${calendar.outlookUrl}`, calendar.downloadUrl ? `Apple Calendar / iCal: ${calendar.downloadUrl}` : 'Apple Calendar / iCal: open the attached interview.ics file.'] : []),
    '',
    'Please join a few minutes early. You will wait in a lobby until admitted.',
    'Need to reschedule or have a question? Just reply to this email to reach your interview team.',
    jdUrl ? `Job description: ${jdUrl}` : '',
    attachments.length
      ? `Attached for your reference: ${attachments.map(a => a.filename).join(', ')}.`
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = interviewInvitationBody({
    firstName, candidateName: formatPersonName(candidate), agencyName: agencyBrandOrName(agency),
    title: subject, jobTitle: roleLabel, whenLabel, timezone, calendar,
    interviewers: interviewerRows.map(person => ({ name: formatPersonName(person), email: person.email })),
    joinUrl: publicJoinUrl, rsvpUrl, jobUrl: jdUrl, attachmentNames: attachments.map(a => a.filename)
  });

  return {
    senderIdentityId: identity.id, to, subject, text, html: bodyHtml,
    attachments: attachments.length ? attachments : null,
    source: 'auto', userId: candidate?.id || null, templateType: 'hiring_interview_invite',
    jobDescriptionId: job?.id || jid || null, intakeSubmissionId: submission?.id || null,
    fromDisplayNameOverride: fromDisplay, replyToOverride: replyTo, linkUrl: publicJoinUrl,
    from: identity.from_email
  };
}

export async function sendHiringInterviewInviteEmail(options) {
  const email = await prepareHiringInterviewInviteEmail(options);
  if (email.skipped) return email;
  const { from, ...delivery } = email;
  if (options.preview) {
    const html = await wrapOutboundHtmlWithTenantChrome({ html: email.html, agencyId: options.agencyId, opts: { replyMailto: email.replyToOverride } });
    return { to: email.to, from, fromDisplay: email.fromDisplayNameOverride, subject: email.subject, html, attachments: (email.attachments || []).map(a => a.filename) };
  }
  return sendEmailFromIdentity(delivery);
}
