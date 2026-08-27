/**
 * Helpers for hiring interview candidate invite emails (People Operations).
 */
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import StorageService from './storage.service.js';
import { resolveJobApplicationSenderIdentity } from './hiringReferenceIdentity.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import {
  buildJobDescriptionAttachmentForEmail,
  buildPublicJobDescriptionUrl,
  peopleOperationsFromDisplayName
} from './publicJobDescription.service.js';
import EmailService from './email.service.js';

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        AND il.agency_id = ?
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
 * Send candidate interview invite from People Operations with application materials.
 */
export async function sendHiringInterviewInviteEmail({
  agencyId,
  candidate,
  title,
  whenLabel,
  publicJoinUrl,
  interviewerRows = [],
  jobDescriptionId = null,
  jobTitle = ''
}) {
  const to = String(candidate?.email || '').trim();
  if (!to || !publicJoinUrl) return { skipped: true, reason: 'missing_to_or_url' };

  const agency = await Agency.findById(agencyId).catch(() => null);
  const identity = await resolveJobApplicationSenderIdentity(agencyId);
  if (!identity?.id && !EmailService.isConfigured()) {
    console.warn('[sendHiringInterviewInviteEmail] no People Operations / job applications sender identity');
    return { skipped: true, reason: 'no_identity' };
  }

  let job = null;
  const jid = Number(jobDescriptionId || 0);
  if (jid) {
    job = await HiringJobDescription.findById(jid).catch(() => null);
  }

  const attachments = [];
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
  const applicationB64 = applicationPdfBase64 || receiptPdfBase64;
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
    .map(formatPersonName)
    .filter(Boolean);
  const uniqueInterviewers = [...new Set(interviewerNames)];
  const interviewerLine = uniqueInterviewers.length
    ? uniqueInterviewers.join(', ')
    : 'our hiring team';

  const firstName = String(candidate.first_name || '').trim() || formatPersonName(candidate);
  const fromDisplay = peopleOperationsFromDisplayName(agency || {});
  const replyTo = String(identity?.reply_to || identity?.from_email || '').trim() || null;

  const subject = String(title || 'Interview invitation').trim();
  const text = [
    `Hi ${firstName},`,
    '',
    'You are invited to an interview.',
    roleLabel ? `Role: ${roleLabel}` : '',
    `When: ${whenLabel}`,
    `Invited from ${agencyBrandOrName(agency)}: ${interviewerLine}`,
    '',
    `Join link: ${publicJoinUrl}`,
    '',
    'Please join a few minutes early. You will wait in a lobby until admitted.',
    jdUrl ? `Job description: ${jdUrl}` : '',
    attachments.length
      ? 'Your job application and application receipt are attached again for your reference.'
      : ''
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.5; color:#111;">
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>You are invited to an interview.</p>
    ${roleLabel ? `<p><strong>Role:</strong> ${escapeHtml(roleLabel)}</p>` : ''}
    <p><strong>When:</strong> ${escapeHtml(whenLabel)}</p>
    <p><strong>Interviewers from ${escapeHtml(agencyBrandOrName(agency))}:</strong> ${escapeHtml(interviewerLine)}</p>
    <p><strong>Join link:</strong> <a href="${escapeHtml(publicJoinUrl)}">${escapeHtml(publicJoinUrl)}</a></p>
    <p>Please join a few minutes early. You will wait in a lobby until admitted.</p>
    ${jdUrl ? `<p><strong>Job description:</strong> <a href="${escapeHtml(jdUrl)}">${escapeHtml(jdUrl)}</a></p>` : ''}
    ${attachments.length ? '<p style="color:#555;font-size:14px;">Your job application and application receipt are attached again for your reference.</p>' : ''}
  </div>`;

  if (identity?.id) {
    return sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : null,
      source: 'auto',
      userId: candidate?.id || null,
      templateType: 'hiring_interview_invite',
      jobDescriptionId: job?.id || jid || null,
      intakeSubmissionId: submission?.id || null,
      fromDisplayNameOverride: fromDisplay,
      replyToOverride: replyTo,
      linkUrl: publicJoinUrl
    });
  }

  // Demo/@example candidates: still deliver via EmailService so testing@itsco.health gets the invite.
  return EmailService.sendEmail({
    to,
    subject,
    text,
    html,
    fromName: fromDisplay,
    fromAddress:
      process.env.GOOGLE_WORKSPACE_FROM_ADDRESS
      || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM
      || null,
    replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
    attachments: attachments.length ? attachments : null,
    source: 'auto',
    agencyId,
    userId: candidate?.id || null,
    templateType: 'hiring_interview_invite',
    linkUrl: publicJoinUrl
  });
}
