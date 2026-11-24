import { referenceQuestionnaire, legacyReferenceQuestionnaire, normalizeReferenceQuestionnaire, normalizeReferenceAnswers, referenceDeadline } from '../utils/hiringReferenceQuestionnaire.js';
import { brandedReferenceEmail, referenceEmailFrame, referenceEmployerBrand, referenceRequestsSentEmail } from './hiringReferenceEmail.service.js';
import { runReferenceReceiptNotifications } from './hiringReferenceReceipt.service.js';
import { resolveHiringReferenceConsent } from './hiringReferenceConsent.service.js';
import crypto from 'crypto';
import config from '../config/config.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import { referenceContactDetails } from '../utils/hiringReferenceContact.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveHiringReferenceSenderIdentity, resolveHiringReferenceReplyTo } from './hiringReferenceIdentity.service.js';
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
    const replyTo = await resolveHiringReferenceReplyTo(identity.agency_id, identity);
    if (!replyTo) throw new Error('Configure the company People Operations reply address before sending references.');
    const out = await sendEmailFromIdentity({
      replyToOverride: replyTo,
      senderIdentityId: identity.id,
      to,
      subject,
      text,
      html: htmlWithPixel,
      source: 'auto',
      templateType: 'hiring_references',
      // agency comes from identity; @example.com / demo recipients redirect to testing@itsco.health
    });
    if (out?.skipped || out?.blocked) {
      return { ok: false, skipped: true, reason: out.reason || 'skipped', messageId: null };
    }
    if (out?.queued || out?.pendingApproval) {
      return {
        ok: false,
        skipped: false,
        pendingApproval: true,
        reason: out.reason || 'pending_approval',
        messageId: null,
        communicationId: out.communicationId || null
      };
    }
    return { ok: true, skipped: false, messageId: out?.id || null, redirected: !!out?.redirected };
  } catch (e) {
    return { ok: false, skipped: false, error: String(e?.message || e), messageId: null };
  }
}

export function buildReferenceFormUrl(rawToken) {
  const base = 'https://plotlinepo.com';
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
export function buildPeopleOpsContactFooter(agency, { replyTo = null } = {}) {
  const org = String(agency?.name || agency?.official_name || 'our organization').trim();
  const configuredLabel = EmailTemplateService.getTerminologySettings(agency);
  const teamLabel = configuredLabel && configuredLabel !== org && configuredLabel !== 'our team' ? configuredLabel : 'People Operations';
  const contactEmail = [replyTo, agency?.people_ops_email, agency?.onboarding_team_email]
    .map(value => String(value || '').trim())
    .find(value => /^[^\s@<>";,?:]+@[^\s@<>";,?:]+\.[^\s@<>";,?:]+$/.test(value) && value.toLowerCase() !== 'references@plotlinepo.com') || '';
  const ext = String(agency?.phone_extension || '').trim();
  const rawPhone = String(agency?.phone_number || '').trim();
  const phoneLine = rawPhone ? (ext ? `${rawPhone} (ext. ${ext})` : rawPhone) : '';

  const phone = `${rawPhone.startsWith('+') ? '+' : ''}${rawPhone.replace(/\D/g, '')}`;
  const phoneHref = /\d{7}/.test(phone.replace(/\D/g, '')) ? `tel:${phone}${ext.replace(/\D/g, '') ? `;ext=${ext.replace(/\D/g, '')}` : ''}` : null;
  const emailHref = contactEmail ? `mailto:${encodeURIComponent(contactEmail).replace(/%40/g, '@')}` : null;
  const text = [`Questions about hiring at ${org}?`, contactEmail ? `Contact ${teamLabel}: ${contactEmail}` : `Reply to this email to reach the hiring team.`, phoneHref ? `Phone: ${phoneLine}` : ''].filter(Boolean).join('\n');
  const action = emailHref
    ? `<a href="${escapeHtml(emailHref)}" style="display:inline-block;color:#143e33;font-weight:bold;text-decoration:underline">Contact ${escapeHtml(teamLabel)}</a>`
    : '<span>Reply to this email to reach the hiring team.</span>';
  const phoneLink = phoneHref ? `<br><a href="${escapeHtml(phoneHref)}" style="display:inline-block;margin-top:8px;color:#143e33">${escapeHtml(phoneLine)}</a>` : '';
  return { text, html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" data-reference-contact="people-operations" style="margin-top:24px;background:#f5f8f5;border:1px solid #dce6e1;border-radius:10px"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.6"><p style="margin:0 0 8px">Questions about hiring at ${escapeHtml(org)}?</p>${action}${phoneLink}</td></tr></table>`, email: contactEmail || null, teamLabel };
}

export async function resolveReferencePeopleOpsContact(agency, identity = null) {
  const agencyId = Number(agency?.id || identity?.agency_id);
  const replyTo = agencyId ? await resolveHiringReferenceReplyTo(agencyId, identity) : null;
  return buildPeopleOpsContactFooter(agency, { replyTo });
}

async function sendReferenceThankYouToReferee({ row, identity }) {
  const agency = await Agency.findById(row.agency_id);
  const user = await User.findById(row.candidate_user_id);
  const cand = candidateDisplayName(user);
  const agencyName = String(agency?.name || agency?.official_name || '').trim();
  const refEmail = String(row.reference_email || '').trim();
  if (!refEmail || !identity?.id) return;
  const greetingName = String(row.reference_name || '').trim();
  const contact = await resolveReferencePeopleOpsContact(agency, identity);
  const subject = `Thank you — reference for ${cand}`;
  const text = [
    `Hello${greetingName ? ` ${greetingName}` : ''},`,
    '',
    `Thank you for taking the time to complete the professional reference for ${cand}. We sincerely appreciate your help and thoughtful consideration.`,
    'Your answers and ratings remain confidential and are not shared with the applicant. We only let them know you completed their reference, identifying you by name.',
    '',
    contact.text,
    '',
    'With gratitude,',
    agencyName || 'Hiring team', '', 'Learn more about Plotline — A People Operations Platform: https://plotlinepo.com/plotline/start'
  ].join('\n');
  const html = referenceEmailFrame({ agency, heading: 'Thank you for submitting a reference', body: `
    <p>Hello${greetingName ? ` ${escapeHtml(greetingName)}` : ''},</p>
    <p>Thank you for taking the time to complete the professional reference for <strong>${escapeHtml(cand)}</strong>. We sincerely appreciate your help and thoughtful consideration.</p>
    <p>Your answers and ratings remain confidential and are not shared with the applicant. We only let them know you completed their reference, identifying you by name.</p>
    <p style="margin-top:18px;">With gratitude,<br/>${escapeHtml(agencyName || 'Hiring team')}</p>
  `, footer: contact.html });
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
 * Create tokenized rows and send reference invite emails after checking applicant consent.
 * @returns {{ sent: Array, skipped: Array, errors: string[] }}
 */
export async function createAndSendReferenceRequests({
  agencyId,
  candidateUserId,
  profile,
  sentByUserId,
  intakeSubmissionId = null,
  referenceIndex = null,
  deadline = null,
  onlyIfNotSent = false,
  questionnaire = referenceQuestionnaire
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

  const preparedQuestionnaire = normalizeReferenceQuestionnaire(questionnaire);
  const consent = await resolveHiringReferenceConsent({ profile, agencyId: aid, candidateUserId: uid, referenceIndex });
  if (!consent.allowed) {
    errors.push(consent.message);
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
  const contactFooter = await resolveReferencePeopleOpsContact(agency, identity);

  const expiresAt = deadline ? new Date(`${deadline}T23:59:59Z`) : referenceDeadline();
  if ((deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 86400000 || (deadline && expiresAt.toISOString().slice(0, 10) !== deadline)) {
    return { sent, skipped, errors: ['Choose a valid reference deadline within the next 90 days.'] };
  }
  const expiresSql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  for (let i = 0; i < refs.length; i += 1) {
    if (referenceIndex != null && i !== Number(referenceIndex)) continue;
    const r = refs[i] || {};
    const name = String(r.name || '').trim();
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    const [completedContacts] = await pool.execute(`SELECT id FROM hiring_reference_contacts
      WHERE hiring_profile_id = ? AND agency_id = ? AND reference_index = ? AND outcome = 'completed' LIMIT 1`, [pid, aid, i]);
    if (completedContacts.length) { skipped.push({ referenceIndex: i, email, reason: 'completed_by_phone' }); continue; }
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

    const existing = (await HiringReferenceRequest.listByProfileAndAgency(pid, aid)).filter(r => Number(r.reference_index) === i);
    if (existing.some(r => r.status === 'completed')) { skipped.push({ referenceIndex: i, email, reason: 'completed' }); continue; }
    const active = existing.reverse().find(r => r.status === 'sent' && r.reference_email === email && new Date(r.token_expires_at) > new Date());
    const publicLinkToken = active?.public_link_token || crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const requestDeadline = active ? new Date(active.token_expires_at) : expiresAt;
    let row = active;
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!row) row = await HiringReferenceRequest.insertRow({
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
        intakeSubmissionId,
        questionnaire: preparedQuestionnaire,
        referenceContact: referenceContactDetails({ ...r, name, email })
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
      `Complete the form here (secure link; expires ${requestDeadline.toUTCString()}):`,
      url,
      '',
      contactFooter.text,
      '',
      'If you did not expect this request, you may disregard this message.',
      '',
      'Thank you,',
      agencyName
    ].join('\n');

    const html = brandedReferenceEmail({ agency, candidateName: candName, referenceName: name, url, deadline: requestDeadline, footer: contactFooter.html });

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
      if (!active) await markRequestSendFailed(row.id);
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
      consentSource: consent.source,
      consentSubmissionId: consent.submissionId || null,
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
        'You will receive another notice when each reference is completed.',
        '',
        contactFooter.text
      ].join('\n');
      const batchHtml = referenceRequestsSentEmail({ agency, candidateName: candName,
        references: sent.map(item => ({ name: refs[item.referenceIndex]?.name, email: item.email })), footer: contactFooter.html });
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

export async function notifyApplicantReferenceCompleted({ agencyId, candidateUserId, referenceName, method = 'online' }) {
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
  const agency = await Agency.findById(aid);
  const contact = await resolveReferencePeopleOpsContact(agency, identity);
  const subj = 'Reference form completed';
  const bodyText = `Hi ${cand},\n\n${nm} completed a reference for your application ${method === 'phone' ? 'by phone with People Operations' : 'using the online questionnaire'}.\n\nThis is a completion notice only. The confidential answers and ratings are not shared with you.\n\n${contact.text}\n\nLearn more about Plotline — A People Operations Platform: https://plotlinepo.com/plotline/start`;
  const bodyHtml = referenceEmailFrame({ agency, heading: 'Your reference was completed', body: `<p>Hi ${escapeHtml(cand)},</p><p><strong>${escapeHtml(nm)}</strong> completed a reference for your application ${method === 'phone' ? 'by phone with People Operations' : 'using the online questionnaire'}.</p><p>This is a completion notice only. The confidential answers and ratings are not shared with you.</p>`, footer: contact.html });
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

async function contactForRequest(row) {
  if (row.referenceContact) return referenceContactDetails({ ...row.referenceContact, referenceEmail: row.reference_email });
  if (!row.hiring_profile_id) return referenceContactDetails({ name: row.reference_name, email: row.reference_email });
  // Older invitations have only name/email columns. Look up exactly the bound
  // profile/index/email, never another referee after a list edit or reapplication.
  const [[profile]] = await pool.execute(
    'SELECT references_json FROM hiring_profiles WHERE id = ? AND candidate_user_id = ? LIMIT 1',
    [row.hiring_profile_id, row.candidate_user_id]
  );
  const index = Number(row.reference_index);
  const source = Number.isInteger(index) && index >= 0 ? parseReferencesArray(profile)[index] : null;
  const matches = source && String(source.email || '').trim().toLowerCase() === String(row.reference_email || '').trim().toLowerCase();
  return referenceContactDetails({ ...(matches ? source : {}), name: row.reference_name, email: row.reference_email });
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

  if (await HiringReferenceRequest.recordLinkOpen(row.id)) {
    logHiringReferenceEvent({ candidateUserId: row.candidate_user_id, agencyId: row.agency_id,
      kind: 'reference_link_opened', referenceIndex: row.reference_index, hiringReferenceRequestId: row.id, outcome: 'detected' });
  }

  const user = await User.findById(row.candidate_user_id);
  const agency = await Agency.findById(row.agency_id);
  const fn = String(user?.first_name || '').trim();
  const ln = String(user?.last_name || '').trim();
  const candidateLabel = fn ? (ln ? `${fn} ${ln.charAt(0)}.` : fn) : 'Candidate';

  let branding = null;
  try {
    const { buildPublicFormBranding } = await import('./publicFormBranding.service.js');
    branding = await buildPublicFormBranding({ organization: agency, agency });
  } catch {
    branding = null;
  }
  const employerBrand = referenceEmployerBrand(agency);
  const contact = await resolveReferencePeopleOpsContact(agency);

  return {
    ok: true,
    expiresAt: exp.toISOString(),
    agencyName: String(agency?.name || agency?.official_name || '').trim() || null,
    candidateLabel,
    referenceName: String(row.reference_name || '').trim() || null,
    referenceContact: await contactForRequest(row),
    branding: { ...branding, logoUrl: employerBrand.logoUrl, colorPalette: { ...branding?.colorPalette, primary: employerBrand.color } },
    contact: { email: contact.email, teamLabel: contact.teamLabel },
    questionnaire: row.questionnaire || legacyReferenceQuestionnaire,
    disclaimer:
      'Your answers and ratings are confidential and are not shared with the applicant. Only staff with hiring permission can review them. We will tell the applicant that you completed their reference, identifying you by name, without sharing any answers. The form typically takes less than five minutes.'
  };
}

export const normalizeReferenceResponses = normalizeReferenceAnswers;

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

  if (body?.declined === true) {
    if (!await HiringReferenceRequest.markDeclined(row.id)) throw Object.assign(new Error('This reference request is no longer available.'), { status: 409 });
    logHiringReferenceEvent({ candidateUserId: row.candidate_user_id, agencyId: row.agency_id,
      kind: 'reference_declined', referenceIndex: row.reference_index, hiringReferenceRequestId: row.id, outcome: 'declined' });
    return { ok: true, declined: true };
  }
  const referenceContact = await contactForRequest(row);
  const responses = normalizeReferenceResponses({ ...referenceContact, ...body }, row.questionnaire || legacyReferenceQuestionnaire);
  const updated = await HiringReferenceRequest.markCompleted(row.id, { ...responses, referenceContactSnapshot: referenceContact, questionnaireSnapshot: row.questionnaire || legacyReferenceQuestionnaire });
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
    submittedAt: responses.submittedAt,
    outcome: 'completed'
  });

  // The durable event was committed with the answers. Prompt delivery is best
  // effort here; the independent worker retains anything still pending.
  try { await runReferenceReceiptNotifications({ agencyId: row.agency_id, sourceKind: 'online', sourceId: row.id }); }
  catch (error) { console.warn('Reference receipt alert remains queued', error.code || 'worker_unavailable'); }

  try {
    const identity = await resolveHiringReferenceSenderIdentity(row.agency_id);
    if (identity?.id) await sendReferenceThankYouToReferee({ row: updated, identity });
    await notifyApplicantReferenceCompleted({ agencyId: row.agency_id, candidateUserId: row.candidate_user_id, referenceName: responses.referenceName });
  } catch (error) { console.warn('Reference saved; completion email failed', error.message); }

  return { success: true };
}

export { buildJobDescriptionAttachmentForEmail } from './publicJobDescription.service.js';
