import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import EmailService from './email.service.js';
import AgencyEmailSettings from '../models/AgencyEmailSettings.model.js';
import {
  getAgencyEmailSettings
} from './emailSettings.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';

export const INTAKE_SUMMARY_PDF_EMAIL_TYPE = 'intake_summary_pdf_copy';

export const DEFAULT_INTAKE_SUMMARY_PDF_EMAIL = {
  name: 'Intake summary PDF copy',
  subject: '{{AGENCY_NAME}}: copy of intake summary',
  body: [
    'A copy of an intake summary from {{AGENCY_NAME}} is attached.',
    '',
    'This file contains protected health information. After it is saved on a device, we cannot retrieve, change, or delete that copy. Keep it private and only share it if you mean to.',
    '',
    'If you received this in error, delete the email and the attachment.'
  ].join('\n')
};

function applyTokens(text, { agencyName } = {}) {
  return String(text || '')
    .replace(/\{\{AGENCY_NAME\}\}/g, agencyName || 'Care team')
    .replace(/\{\{agency_name\}\}/g, agencyName || 'Care team');
}

function identityPayload(identity) {
  if (!identity) return null;
  return {
    id: Number(identity.id),
    displayName: identity.display_name || identity.from_name || '',
    fromEmail: identity.from_email || '',
    identityKey: identity.identity_key || ''
  };
}

export async function getIntakeSummaryPdfEmailSettings(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  const template = await EmailTemplate.findByTypeAndAgency(INTAKE_SUMMARY_PDF_EMAIL_TYPE, aid);
  const settings = await getAgencyEmailSettings(aid);
  const mappedId = Number(settings.templateSenderIdentityIds?.[INTAKE_SUMMARY_PDF_EMAIL_TYPE] || 0) || null;
  const resolved = await resolveSenderIdentityForSend({
    agencyId: aid,
    templateType: INTAKE_SUMMARY_PDF_EMAIL_TYPE
  });
  const identities = await EmailSenderIdentity.list({
    agencyId: aid,
    includePlatformDefaults: true,
    onlyActive: true
  });
  return {
    type: INTAKE_SUMMARY_PDF_EMAIL_TYPE,
    subject: String(template?.subject || DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.subject),
    body: String(template?.body || DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.body),
    isAgencyOverride: template?.agency_id != null,
    senderIdentityId: mappedId || (resolved.usedFallback ? null : Number(resolved.identity?.id || 0) || null),
    sender: identityPayload(resolved.identity),
    identities: (identities || []).map(identityPayload).filter(Boolean)
  };
}

export async function upsertIntakeSummaryPdfEmailSettings({
  agencyId,
  subject,
  body,
  senderIdentityId = undefined,
  actorUserId = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  const trimmedSubject = String(subject || '').trim();
  const trimmedBody = String(body || '').trim();
  if (!trimmedSubject || !trimmedBody) {
    const err = new Error('Subject and body are required.');
    err.status = 400;
    throw err;
  }
  const existing = await EmailTemplate.findByTypeAndAgency(INTAKE_SUMMARY_PDF_EMAIL_TYPE, aid);
  const agencyTemplate = existing?.agency_id ? existing : null;
  if (!agencyTemplate) {
    await EmailTemplate.create({
      name: existing?.name || DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.name,
      type: INTAKE_SUMMARY_PDF_EMAIL_TYPE,
      subject: trimmedSubject,
      body: trimmedBody,
      agencyId: aid,
      createdByUserId: actorUserId
    });
  } else {
    await EmailTemplate.update(agencyTemplate.id, {
      name: agencyTemplate.name || DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.name,
      subject: trimmedSubject,
      body: trimmedBody
    });
  }

  if (senderIdentityId !== undefined) {
    const settings = await getAgencyEmailSettings(aid);
    const map = { ...(settings.templateSenderIdentityIds || {}) };
    const nextId = Number(senderIdentityId || 0);
    if (nextId > 0) map[INTAKE_SUMMARY_PDF_EMAIL_TYPE] = nextId;
    else delete map[INTAKE_SUMMARY_PDF_EMAIL_TYPE];
    await AgencyEmailSettings.update({
      agencyId: aid,
      notificationsEnabled: settings.notificationsEnabled,
      schoolRoiEmailsRequireApproval: settings.schoolRoiEmailsRequireApproval,
      aiDraftPolicyMode: settings.aiDraftPolicyMode,
      allowSchoolOverrides: settings.allowSchoolOverrides,
      aiAllowedIntents: settings.aiAllowedIntentClasses,
      aiMatchConfidenceThreshold: settings.aiMatchConfidenceThreshold,
      aiAllowedSenderIdentityKeys: settings.aiAllowedSenderIdentityKeys,
      defaultSenderIdentityId: settings.defaultSenderIdentityId,
      templateSenderIdentityJson: map,
      actorUserId
    });
  }

  return getIntakeSummaryPdfEmailSettings(aid);
}

export async function emailSummaryPdfCopy({
  to,
  agency,
  filename,
  pdfBuffer,
  clientId = null
}) {
  const email = String(to || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
  const org = String(agency?.official_name || agency?.name || 'Care team').trim();
  const bytes = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const aid = Number(agency?.id || 0);
  const settings = aid ? await getIntakeSummaryPdfEmailSettings(aid) : {
    subject: DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.subject,
    body: DEFAULT_INTAKE_SUMMARY_PDF_EMAIL.body,
    sender: null
  };
  const rendered = EmailTemplateService.renderTemplate(
    { subject: settings.subject, body: settings.body },
    { AGENCY_NAME: org, agency_name: org }
  );
  const subject = applyTokens(rendered.subject || settings.subject, { agencyName: org });
  const text = applyTokens(rendered.body || settings.body, { agencyName: org });
  const resolved = aid
    ? await resolveSenderIdentityForSend({ agencyId: aid, templateType: INTAKE_SUMMARY_PDF_EMAIL_TYPE })
    : { identity: null, usedFallback: true };
  const identity = resolved.identity;
  const result = await EmailService.sendEmail({
    to: email,
    subject,
    text,
    fromName: identity?.display_name || identity?.from_name || org,
    fromAddress: identity?.from_email || null,
    agencyId: aid || null,
    clientId,
    source: 'manual',
    templateType: INTAKE_SUMMARY_PDF_EMAIL_TYPE,
    usedFallbackSender: false,
    attachments: [{
      filename: filename || 'intake-summary.pdf',
      contentType: 'application/pdf',
      contentBase64: bytes.toString('base64')
    }]
  });
  if (result?.skipped) {
    const err = new Error(result.reason === 'notifications_disabled'
      ? 'Email notifications are turned off, so this copy was not sent.'
      : 'The email was not sent.');
    err.status = 503;
    throw err;
  }
  if (result?.blocked) {
    const err = new Error('The email was blocked by an outbound quality check.');
    err.status = 400;
    throw err;
  }
  if (result?.queued || result?.pendingApproval) {
    const err = new Error('This email is waiting for admin approval instead of sending. Assign a From identity for intake summary copies, then try again.');
    err.status = 503;
    throw err;
  }
  return { ok: true, queued: false };
}
