import crypto from 'crypto';
import config from '../config/config.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveHiringReferenceSenderIdentity } from './hiringReferenceIdentity.service.js';
import StorageService from './storage.service.js';
import EmailTemplateService from './emailTemplate.service.js';
import {
  appendEmailOpenPixel,
  buildReferenceOpenPixelUrl,
  logHiringReferenceEvent
} from './hiringReferenceActivity.service.js';

const TOKEN_BYTES = 32;

async function markRequestSendFailed(rowId) {
  try {
    await pool.execute(
      `UPDATE hiring_reference_requests SET status='send_failed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='sent'`,
      [rowId]
    );
  } catch {
    // ignore
  }
}

export async function sendHiringReferenceOutboundEmail({ identity, to, subject, text, html, openTrackToken = null }) {
  const pixel = openTrackToken ? buildReferenceOpenPixelUrl(openTrackToken) : '';
  const htmlWithPixel = pixel ? appendEmailOpenPixel(html, pixel) : html;
  try {
    const out = await sendEmailFromIdentity({
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      html: htmlWithPixel,
      source: 'auto'
    });
    if (out?.skipped) {
      return { ok: false, skipped: true, reason: out.reason || 'skipped', messageId: null };
    }
    return { ok: true, skipped: false, messageId: out?.id || null };
  } catch (e) {
    return { ok: false, skipped: false, error: String(e?.message || e), messageId: null };
  }
}

export function buildReferenceFormUrl(rawToken) {
  const base = String(config.frontendUrl || '').replace(/\/$/, '');
  if (!base) return `/public/hiring/reference/${rawToken}`;
  return `${base}/public/hiring/reference/${rawToken}`;
}

function parseReferencesArray(profile) {
  const raw = profile?.references_json;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseConsent(profile) {
  const raw = profile?.references_consent_json;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function candidateDisplayName(user) {
  const fn = String(user?.first_name || '').trim();
  const ln = String(user?.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || 'Applicant';
}

/**
 * Footer for reference-facing emails: agency "People Operations" / HR label from terminology_settings.people_ops_term
 * plus onboarding_team_email (or people_ops_email if present) and main phone.
 */
export function buildPeopleOpsContactFooter(agency) {
  const teamLabel = EmailTemplateService.getTerminologySettings(agency);
  const org = String(agency?.name || agency?.official_name || 'our organization').trim();
  const contactEmail = String(agency?.onboarding_team_email || agency?.people_ops_email || '').trim();
  const ext = String(agency?.phone_extension || '').trim();
  const rawPhone = String(agency?.phone_number || '').trim();
  const phoneLine = rawPhone ? (ext ? `${rawPhone} (ext. ${ext})` : rawPhone) : '';

  if (!contactEmail && !phoneLine) {
    const text = `If you have any additional questions, please contact ${teamLabel} at ${org}.`;
    const html = `<p style="margin-top:14px;font-size:14px;color:#444;">If you have any additional questions, please contact <strong>${escapeHtml(teamLabel)}</strong> at <strong>${escapeHtml(org)}</strong>.</p>`;
    return { text, html };
  }
  const lines = [];
  if (contactEmail) lines.push(`${teamLabel} email: ${contactEmail}`);
  if (phoneLine) lines.push(`${teamLabel} phone: ${phoneLine}`);
  const text = `If you have any additional questions, please contact our ${teamLabel} team:\n${lines.join('\n')}`;
  const htmlParts = [];
  htmlParts.push(
    `<p style="margin-top:14px;font-size:14px;color:#444;">If you have any additional questions, please contact our <strong>${escapeHtml(teamLabel)}</strong> team:</p>`
  );
  if (contactEmail) {
    htmlParts.push(
      `<p style="margin:6px 0 0;font-size:14px;color:#444;">Email: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></p>`
    );
  }
  if (phoneLine) {
    htmlParts.push(`<p style="margin:6px 0 0;font-size:14px;color:#444;">Phone: ${escapeHtml(phoneLine)}</p>`);
  }
  return { text, html: htmlParts.join('') };
}

async function sendReferenceThankYouToReferee({ row, identity }) {
  const agency = await Agency.findById(row.agency_id);
  const user = await User.findById(row.candidate_user_id);
  const cand = candidateDisplayName(user);
  const agencyName = String(agency?.name || agency?.official_name || '').trim();
  const refEmail = String(row.reference_email || '').trim();
  if (!refEmail || !identity?.id) return;
  const greetingName = String(row.reference_name || '').trim();
  const contact = buildPeopleOpsContactFooter(agency);
  const subject = `Thank you — reference for ${cand}`;
  const text = [
    `Hello${greetingName ? ` ${greetingName}` : ''},`,
    '',
    `Thank you for taking the time to complete the professional reference for ${cand}. We sincerely appreciate your help and thoughtful consideration.`,
    '',
    contact.text,
    '',
    'With gratitude,',
    agencyName || 'Hiring team'
  ].join('\n');
  const html = `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <p>Hello${greetingName ? ` ${escapeHtml(greetingName)}` : ''},</p>
    <p>Thank you for taking the time to complete the professional reference for <strong>${escapeHtml(cand)}</strong>. We sincerely appreciate your help and thoughtful consideration.</p>
    ${contact.html}
    <p style="margin-top:18px;">With gratitude,<br/>${escapeHtml(agencyName || 'Hiring team')}</p>
  </div>`;
  const openTok = String(row?.open_track_token || '').trim() || null;
  const out = await sendHiringReferenceOutboundEmail({
    identity,
    to: refEmail,
    subject,
    text,
    html,
    openTrackToken: openTok
  });
  logHiringReferenceEvent({
    candidateUserId: row.candidate_user_id,
    agencyId: row.agency_id,
    kind: 'reference_thank_you_referee',
    hiringReferenceRequestId: row.id,
    referenceIndex: row.reference_index,
    referenceEmail: refEmail,
    to: refEmail,
    subject,
    textBody: text,
    htmlBody: html,
    outcome: out.ok ? 'sent' : out.skipped ? 'skipped' : 'failed',
    skipReason: out.skipped ? out.reason : null,
    error: out.ok ? null : out.error || null,
    gmailMessageId: out.messageId || null
  });
}

/**
 * Create tokenized rows and send reference invite emails. Caller must validate interview + consent.
 * @returns {{ sent: Array, skipped: Array, errors: string[] }}
 */
export async function createAndSendReferenceRequests({
  agencyId,
  candidateUserId,
  profile,
  sentByUserId,
  intakeSubmissionId = null,
  onlyIfNotSent = false
}) {
  const errors = [];
  const sent = [];
  const skipped = [];
  const pid = Number(profile?.id);
  const aid = Number(agencyId);
  const uid = Number(candidateUserId);
  if (!pid || !aid || !uid) {
    errors.push('Invalid profile or agency');
    return { sent, skipped, errors };
  }

  const consent = parseConsent(profile);
  if (consent.referencesWaived === true) {
    errors.push('References were waived on the application; digital reference forms cannot be sent.');
    return { sent, skipped, errors };
  }
  if (!consent.digitalFormAtInterviewOrOffer) {
    errors.push('Applicant did not consent to digital reference forms at interview or offer stage.');
    return { sent, skipped, errors };
  }

  const refs = parseReferencesArray(profile);
  const identity = await resolveHiringReferenceSenderIdentity(aid);
  if (!identity?.id) {
    errors.push(
      'No email sender identity is configured for this agency. Set “Hiring reference emails” in Email settings (or create an identity with key hiring_references / default_notifications).'
    );
    return { sent, skipped, errors };
  }

  const user = await User.findById(uid);
  const agency = await Agency.findById(aid);
  const candName = candidateDisplayName(user);
  const agencyName = String(agency?.name || agency?.official_name || 'Our organization').trim();
  const contactFooter = buildPeopleOpsContactFooter(agency);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiresSql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  for (let i = 0; i < refs.length; i += 1) {
    const r = refs[i] || {};
    const name = String(r.name || '').trim();
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    if (onlyIfNotSent) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await HiringReferenceRequest.hasActiveSentForIndex(pid, i);
      if (exists) {
        skipped.push({ referenceIndex: i, email, reason: 'already_sent' });
        logHiringReferenceEvent({
          candidateUserId: uid,
          agencyId: aid,
          kind: 'reference_invite_skipped',
          referenceIndex: i,
          referenceEmail: email,
          reason: 'already_sent',
          outcome: 'skipped'
        });
        continue;
      }
    }

    const publicLinkToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');

    let row;
    try {
      // eslint-disable-next-line no-await-in-loop
      row = await HiringReferenceRequest.insertRow({
        hiringProfileId: pid,
        agencyId: aid,
        candidateUserId: uid,
        referenceIndex: i,
        referenceName: name || 'Reference',
        referenceEmail: email,
        publicLinkToken,
        tokenExpiresAt: expiresSql,
        status: 'sent',
        sentByUserId,
        intakeSubmissionId
      });
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        skipped.push({ referenceIndex: i, email, reason: 'duplicate_token' });
        continue;
      }
      errors.push(String(e?.message || e));
      continue;
    }

    const url = buildReferenceFormUrl(publicLinkToken);
    const subject = `${agencyName} — reference request for ${candName}`;
    const text = [
      `Hello${name ? ` ${name}` : ''},`,
      '',
      `${agencyName} is gathering a professional reference regarding ${candName}. When you have a moment, we would be grateful if you could complete a brief confidential online form — ideally as soon as your schedule allows.`,
      '',
      `Your candid perspective is very important to us, and we truly appreciate your time and effort. The form usually takes less than five minutes.`,
      '',
      `Your responses remain confidential: they are not shared with the applicant and are used only for hiring decisions by ${agencyName}.`,
      '',
      `Complete the form here (secure link; expires ${expiresAt.toUTCString()}):`,
      url,
      '',
      contactFooter.text,
      '',
      'If you did not expect this request, you may disregard this message.',
      '',
      'Thank you,',
      agencyName
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <p>Hello${name ? ` ${escapeHtml(name)}` : ''},</p>
        <p><strong>${escapeHtml(agencyName)}</strong> is gathering a professional reference regarding <strong>${escapeHtml(candName)}</strong>. When you have a moment, we would be grateful if you could complete a brief confidential online form — ideally as soon as your schedule allows.</p>
        <p>Your candid perspective is very important to us, and we truly appreciate your time and effort. The form usually takes <strong>less than five minutes</strong>.</p>
        <p>Your responses remain <strong>confidential</strong>: they are not shared with the applicant and are used only for hiring decisions by ${escapeHtml(agencyName)}.</p>
        <p><a href="${escapeHtml(url)}">Complete reference form</a></p>
        <p style="color:#555;font-size:13px;">This secure link expires ${escapeHtml(expiresAt.toUTCString())}.</p>
        ${contactFooter.html}
        <p style="font-size:13px;color:#555;margin-top:16px;">If you did not expect this request, you may disregard this message.</p>
        <p style="margin-top:18px;">Thank you,<br/>${escapeHtml(agencyName)}</p>
      </div>
    `.trim();

    const openTok = String(row?.open_track_token || '').trim() || null;
    // eslint-disable-next-line no-await-in-loop
    const out = await sendHiringReferenceOutboundEmail({
      identity,
      to: email,
      subject,
      text,
      html,
      openTrackToken: openTok
    });

    if (!out.ok) {
      await markRequestSendFailed(row.id);
      if (out.skipped) {
        errors.push(`Reference invite not sent to ${email} (${out.reason || 'skipped'}).`);
      } else {
        errors.push(`Failed to email ${email}: ${out.error || 'unknown error'}`);
      }
      logHiringReferenceEvent({
        candidateUserId: uid,
        agencyId: aid,
        kind: 'reference_invite',
        hiringReferenceRequestId: row.id,
        referenceIndex: i,
        referenceEmail: email,
        to: email,
        subject,
        textBody: text,
        htmlBody: html,
        outcome: out.skipped ? 'skipped' : 'failed',
        skipReason: out.skipped ? out.reason : null,
        error: out.ok ? null : out.error || null,
        gmailMessageId: out.messageId || null
      });
      continue;
    }

    logHiringReferenceEvent({
      candidateUserId: uid,
      agencyId: aid,
      kind: 'reference_invite',
      hiringReferenceRequestId: row.id,
      referenceIndex: i,
      referenceEmail: email,
      to: email,
      subject,
      textBody: text,
      htmlBody: html,
      outcome: 'sent',
      gmailMessageId: out.messageId || null
    });

    sent.push({ id: row?.id, referenceIndex: i, email });
  }

  if (!sent.length && !skipped.length && !errors.length) {
    errors.push('No references with valid email addresses were found on this application.');
  }

  if (sent.length) {
    const applicantTo = String(user?.email || user?.personal_email || '').trim();
    if (applicantTo) {
      const lines = sent.map((s) => `• ${s.email}`).join('\n');
      const subj = 'Reference requests sent';
      const batchText = [
        `Hi ${candName},`,
        '',
        'We sent reference forms to:',
        lines,
        '',
        'You will receive another notice when each reference is completed.'
      ].join('\n');
      const batchHtml = `<p>Hi ${escapeHtml(candName)},</p><p>We sent reference forms to:</p><ul>${sent
        .map((s) => `<li>${escapeHtml(s.email)}</li>`)
        .join('')}</ul><p>You will receive another notice when each reference is completed.</p>`;
      const batchOut = await sendHiringReferenceOutboundEmail({
        identity,
        to: applicantTo,
        subject: subj,
        text: batchText,
        html: batchHtml,
        openTrackToken: null
      });
      logHiringReferenceEvent({
        candidateUserId: uid,
        agencyId: aid,
        kind: 'applicant_reference_batch_notice',
        to: applicantTo,
        subject: subj,
        textBody: batchText,
        htmlBody: batchHtml,
        referenceEmails: sent.map((s) => s.email),
        outcome: batchOut.ok ? 'sent' : batchOut.skipped ? 'skipped' : 'failed',
        skipReason: batchOut.skipped ? batchOut.reason : null,
        error: batchOut.ok ? null : batchOut.error || null,
        gmailMessageId: batchOut.messageId || null
      });
    }
  }

  return { sent, skipped, errors };
}

export async function notifyApplicantReferenceCompleted({ agencyId, candidateUserId, referenceName }) {
  const uid = Number(candidateUserId);
  const aid = Number(agencyId);
  if (!uid || !aid) return;
  const user = await User.findById(uid);
  const to = String(user?.email || user?.personal_email || '').trim();
  if (!to) return;
  const identity = await resolveHiringReferenceSenderIdentity(aid);
  if (!identity?.id) return;
  const nm = String(referenceName || 'A reference').trim();
  const cand = candidateDisplayName(user);
  const subj = 'Reference form completed';
  const bodyText = `Hi ${cand},\n\n${nm} submitted a reference form for your application.\n`;
  const bodyHtml = `<p>Hi ${escapeHtml(cand)},</p><p><strong>${escapeHtml(nm)}</strong> submitted a reference form for your application.</p>`;
  const out = await sendHiringReferenceOutboundEmail({
    identity,
    to,
    subject: subj,
    text: bodyText,
    html: bodyHtml,
    openTrackToken: null
  });
  logHiringReferenceEvent({
    candidateUserId: uid,
    agencyId: aid,
    kind: 'applicant_reference_completed_notice',
    to,
    subject: subj,
    textBody: bodyText,
    htmlBody: bodyHtml,
    referenceName: nm,
    outcome: out.ok ? 'sent' : out.skipped ? 'skipped' : 'failed',
    skipReason: out.skipped ? out.reason : null,
    error: out.ok ? null : out.error || null,
    gmailMessageId: out.messageId || null
  });
}

export async function getPublicReferenceMetaByRawToken(rawToken) {
  await HiringReferenceRequest.expireStaleRows();
  const row = await HiringReferenceRequest.findByPublicLinkToken(String(rawToken || '').trim());
  if (!row) return { error: 'not_found' };
  if (row.status === 'expired' || row.status === 'cancelled') return { error: 'expired', row };
  if (row.status === 'completed') return { error: 'completed', row };
  if (row.status !== 'sent') return { error: 'invalid', row };

  const exp = row.token_expires_at ? new Date(row.token_expires_at) : null;
  if (!exp || !Number.isFinite(exp.getTime()) || exp.getTime() < Date.now()) {
    try {
      await pool.execute(`UPDATE hiring_reference_requests SET status='expired' WHERE id=?`, [row.id]);
    } catch {
      // ignore
    }
    return { error: 'expired', row };
  }

  const user = await User.findById(row.candidate_user_id);
  const agency = await Agency.findById(row.agency_id);
  const fn = String(user?.first_name || '').trim();
  const ln = String(user?.last_name || '').trim();
  const candidateLabel = fn ? (ln ? `${fn} ${ln.charAt(0)}.` : fn) : 'Candidate';

  return {
    ok: true,
    expiresAt: exp.toISOString(),
    agencyName: String(agency?.name || agency?.official_name || '').trim() || null,
    candidateLabel,
    referenceName: String(row.reference_name || '').trim() || null,
    disclaimer:
      'This form is confidential: your answers are not shared with the applicant and are used only for hiring decisions. The form typically takes less than five minutes. Final wording is subject to legal review.'
  };
}

const TRAIT_KEYS = ['reliability', 'communication', 'workQuality', 'teamwork', 'initiative'];
const RATING_OPTS = new Set(['excellent', 'good', 'average', 'below_average', 'would_not_recommend']);
const REL_OPTS = new Set(['manager', 'coworker', 'direct_report', 'other']);
const TRAIT_OPTS = new Set(['strong', 'average', 'weak']);
const CONCERN_OPTS = new Set(['no', 'minor', 'yes']);

export function normalizeReferenceResponses(body) {
  const relationshipType = String(body?.relationshipType || '').trim().toLowerCase();
  if (!REL_OPTS.has(relationshipType)) {
    throw new Error('relationshipType is required');
  }
  const relationshipOther =
    relationshipType === 'other' ? String(body?.relationshipOther || '').trim().slice(0, 500) || null : null;
  const workedTogether = String(body?.workedTogether || '').trim().toLowerCase();
  if (!['yes', 'no'].includes(workedTogether)) {
    throw new Error('workedTogether must be yes or no');
  }
  const overallRating = String(body?.overallRating || '').trim().toLowerCase();
  if (!RATING_OPTS.has(overallRating)) {
    throw new Error('overallRating is required');
  }
  const traitsIn = body?.traits && typeof body.traits === 'object' ? body.traits : {};
  const traits = {};
  for (const k of TRAIT_KEYS) {
    const v = String(traitsIn[k] || '').trim().toLowerCase();
    if (!TRAIT_OPTS.has(v)) throw new Error(`Trait ${k} is required`);
    traits[k] = v;
  }
  const additionalComments = String(body?.additionalComments || '').trim().slice(0, 8000) || null;
  const concernsLevel = String(body?.concernsLevel || '').trim().toLowerCase();
  if (!CONCERN_OPTS.has(concernsLevel)) {
    throw new Error('concernsLevel is required');
  }
  const concernsComment = String(body?.concernsComment || '').trim().slice(0, 4000) || null;
  const referenceName = String(body?.referenceName || '').trim().slice(0, 255);
  if (!referenceName) throw new Error('referenceName is required');

  return {
    relationshipType,
    relationshipOther,
    workedTogether,
    overallRating,
    traits,
    additionalComments,
    concernsLevel,
    concernsComment,
    referenceName,
    submittedAt: new Date().toISOString()
  };
}

export async function submitPublicReferenceForm(rawToken, body) {
  await HiringReferenceRequest.expireStaleRows();
  const row = await HiringReferenceRequest.findByPublicLinkToken(String(rawToken || '').trim());
  if (!row) {
    const err = new Error('Invalid or expired link');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'sent') {
    const err = new Error(row.status === 'completed' ? 'This form was already submitted.' : 'This link is no longer valid.');
    err.status = 409;
    throw err;
  }
  const exp = row.token_expires_at ? new Date(row.token_expires_at) : null;
  if (!exp || exp.getTime() < Date.now()) {
    const err = new Error('This link has expired.');
    err.status = 410;
    throw err;
  }

  const responses = normalizeReferenceResponses(body);
  const updated = await HiringReferenceRequest.markCompleted(row.id, responses);
  if (!updated || updated.status !== 'completed') {
    const err = new Error('Unable to save responses.');
    err.status = 409;
    throw err;
  }

  logHiringReferenceEvent({
    candidateUserId: row.candidate_user_id,
    agencyId: row.agency_id,
    kind: 'reference_form_submitted',
    hiringReferenceRequestId: row.id,
    referenceIndex: row.reference_index,
    referenceEmail: String(row.reference_email || '').trim(),
    referenceNameSubmitted: responses.referenceName,
    overallRating: responses.overallRating,
    submittedAt: responses.submittedAt,
    outcome: 'completed'
  });

  const identity = await resolveHiringReferenceSenderIdentity(row.agency_id);
  if (identity?.id) {
    await sendReferenceThankYouToReferee({ row: updated, identity });
  }

  await notifyApplicantReferenceCompleted({
    agencyId: row.agency_id,
    candidateUserId: row.candidate_user_id,
    referenceName: responses.referenceName
  });

  return { success: true };
}

export async function buildJobDescriptionAttachmentForEmail(jobDescription) {
  if (!jobDescription) return null;
  const title = String(jobDescription.title || 'Job description').trim() || 'Job description';
  const path = String(jobDescription.storage_path || '').trim();
  if (path) {
    try {
      const buf = await StorageService.readObject(path);
      const orig = String(jobDescription.original_name || 'job-description.pdf').trim() || 'job-description.pdf';
      const mime = String(jobDescription.mime_type || 'application/pdf').trim() || 'application/pdf';
      return {
        filename: orig,
        contentType: mime,
        contentBase64: Buffer.from(buf).toString('base64')
      };
    } catch {
      // fall through to text excerpt
    }
  }
  const text = String(jobDescription.description_text || '').trim();
  if (!text) return null;
  const snippet = text.slice(0, 12000);
  const buf = Buffer.from(snippet, 'utf8');
  return {
    filename: `${title.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'job'}-description.txt`,
    contentType: 'text/plain; charset=utf-8',
    contentBase64: buf.toString('base64')
  };
}
