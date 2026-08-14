import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';

export const ACCOUNT_ACCESS_EMAIL_TYPES = {
  recovery: 'school_staff_account_recovery',
  portal_access: 'school_staff_portal_access'
};

export const STAGGER_OPTIONS_SECONDS = [10, 15, 30, 60, 120];
export const DEFAULT_STAGGER_SECONDS = 30;
const TOKEN_EXPIRES_HOURS = 48;
const DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS = 168;
const TEST_RESET_PLACEHOLDER = '[reset link omitted in this test — no token attached]';

export function extractTempPasswordFromAccessEmailBody(body) {
  const text = String(body || '');
  const labeled = text.match(/(?:temporary\s+password|temp\s+password|password)\s*:\s*([^\s\r\n]+)/i);
  if (labeled?.[1]) {
    const pwd = labeled[1].trim();
    if (pwd.length >= 6 && pwd.length <= 128) return pwd;
  }
  return null;
}

function normalizeSharedTempPassword(value) {
  const pwd = String(value || '').trim();
  if (!pwd || pwd.length < 6 || pwd.length > 128) return null;
  return pwd;
}

function resolveSharedTempPassword(send, overridePassword = null) {
  return (
    normalizeSharedTempPassword(overridePassword) ||
    normalizeSharedTempPassword(send?.shared_temporary_password) ||
    extractTempPasswordFromAccessEmailBody(send?.body)
  );
}

async function applySharedTemporaryPasswordForUser({
  userId,
  temporaryPassword,
  expiresInHours,
  setAt = null,
  performedByUserId = null,
  performedByEmail = null,
  source,
  sendId = null
}) {
  const user = await User.findById(userId);
  if (!user) {
    return { userId, ok: false, error: 'User not found' };
  }
  if (String(user.role || '').toLowerCase() !== 'school_staff') {
    return { userId, ok: false, error: 'Only school_staff users can receive temporary passwords' };
  }
  if (String(user.status || '').toUpperCase() === 'ARCHIVED') {
    return { userId, ok: false, error: 'Cannot reset password for an archived user' };
  }

  const hours = Math.min(720, Math.max(1, Number(expiresInHours) || DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS));
  const temporaryPasswordResult = await User.setTemporaryPassword(userId, temporaryPassword, hours);

  if (setAt) {
    await pool.execute(
      'UPDATE users SET temporary_password_set_at = ? WHERE id = ?',
      [setAt, userId]
    );
  }

  if (String(user.status || '').toUpperCase() === 'PENDING_SETUP') {
    try {
      await User.updateStatus(userId, 'ACTIVE_EMPLOYEE', performedByUserId || null);
    } catch {
      // ignore
    }
    try {
      await User.update(userId, { isActive: true });
    } catch {
      // ignore
    }
  }

  try {
    await User.markTokenAsUsed(userId);
  } catch {
    // best-effort
  }

  try {
    const ActivityLogService = (await import('./activityLog.service.js')).default;
    ActivityLogService.logActivity({
      actionType: 'school_staff_temporary_password_set',
      userId,
      metadata: {
        performedByUserId,
        performedByEmail,
        source,
        sendId,
        agencyId: null,
        expiresAt: temporaryPasswordResult?.expiresAt || null,
        expiresInHours: hours
      }
    });
  } catch {
    // best-effort
  }

  return {
    userId,
    ok: true,
    temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null,
    temporaryPasswordSetAt: setAt || new Date().toISOString()
  };
}

function normalizeEmailType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'recovery' || raw === 'school_staff_account_recovery') {
    return ACCOUNT_ACCESS_EMAIL_TYPES.recovery;
  }
  if (raw === 'portal_access' || raw === 'portal' || raw === 'school_staff_portal_access') {
    return ACCOUNT_ACCESS_EMAIL_TYPES.portal_access;
  }
  return null;
}

function toMysqlDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text) {
  const escaped = escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5;white-space:pre-wrap;">${escaped}</div>`;
}

function pickRecipientEmail(user) {
  const candidates = [user?.email, user?.username, user?.work_email, user?.personal_email]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.includes('@'));
  return candidates[0] || null;
}

function applyMissingPlaceholders(text, { isTest = false } = {}) {
  let out = String(text || '');
  if (isTest) {
    out = out.replace(/\{\{RESET_TOKEN_LINK\}\}/g, TEST_RESET_PLACEHOLDER);
  }
  out = out.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return out;
}

function isAiSender(identity) {
  const key = String(identity?.identity_key || '').trim().toLowerCase();
  const email = String(identity?.from_email || '').trim().toLowerCase();
  return email.startsWith('ai@') || key === 'ai' || key.startsWith('ai_');
}

export async function resolveAccessEmailSender(agencyId, emailType, senderIdentityId = null) {
  const explicitId = Number(senderIdentityId || 0);
  if (explicitId > 0) {
    const identity = await EmailSenderIdentity.findById(explicitId);
    if (identity && identity.is_active !== 0 && identity.is_active !== false) {
      return { identity, usedFallback: false, resolution: 'explicit' };
    }
  }
  return await resolveSenderIdentityForSend({
    agencyId,
    templateType: emailType,
    preferredKeys: ['login_recovery', 'notifications']
  });
}

export async function getAccessEmailTemplate(agencyId, emailType) {
  const template = await EmailTemplate.findByTypeAndAgency(emailType, agencyId);
  if (!template) {
    const err = new Error(`No template found for ${emailType}. Create one in Email Settings.`);
    err.status = 404;
    throw err;
  }
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    subject: template.subject,
    body: template.body,
    isAgencyOverride: template.agency_id != null
  };
}

export async function upsertAccessEmailTemplate({
  agencyId,
  emailType,
  name,
  subject,
  body,
  saveMode = 'update',
  actorUserId = null
}) {
  const existing = await EmailTemplate.findByTypeAndAgency(emailType, agencyId);
  const agencyTemplate = existing?.agency_id ? existing : null;
  const trimmedName = String(name || existing?.name || 'School staff account access').trim();
  const trimmedSubject = String(subject || '').trim();
  const trimmedBody = String(body || '').trim();
  if (!trimmedSubject || !trimmedBody) {
    const err = new Error('Subject and body are required');
    err.status = 400;
    throw err;
  }

  if (saveMode === 'new' || !agencyTemplate) {
    return await EmailTemplate.create({
      name: saveMode === 'new' && trimmedName ? trimmedName : (existing?.name || trimmedName),
      type: emailType,
      subject: trimmedSubject,
      body: trimmedBody,
      agencyId,
      createdByUserId: actorUserId
    });
  }

  return await EmailTemplate.update(agencyTemplate.id, {
    name: trimmedName || agencyTemplate.name,
    subject: trimmedSubject,
    body: trimmedBody
  });
}

async function renderAccessEmail({
  user,
  agency,
  template,
  senderName,
  passwordlessToken = null,
  tempPassword = null,
  isTest = false
}) {
  const keepPortalLoginLink = true;
  const parameters = await EmailTemplateService.collectParameters(user, agency, {
    passwordlessToken,
    senderName,
    tempPassword,
    keepPortalLoginLink
  });
  if (isTest) {
    parameters.RESET_TOKEN_LINK = TEST_RESET_PLACEHOLDER;
  }
  const rendered = EmailTemplateService.renderTemplate(
    { subject: template.subject, body: template.body },
    parameters
  );
  return {
    subject: applyMissingPlaceholders(rendered.subject, { isTest }),
    body: applyMissingPlaceholders(rendered.body, { isTest }),
    parameters
  };
}

export async function previewAccessEmail({
  agencyId,
  emailType: emailTypeRaw,
  userIds = [],
  subject = null,
  body = null,
  senderIdentityId = null,
  senderName = null,
  temporaryPassword = null
}) {
  const emailType = normalizeEmailType(emailTypeRaw);
  if (!emailType) {
    const err = new Error('emailType must be recovery or portal_access');
    err.status = 400;
    throw err;
  }

  const agency = await Agency.findById(agencyId);
  const stored = await getAccessEmailTemplate(agencyId, emailType);
  const template = {
    ...stored,
    subject: subject != null ? String(subject) : stored.subject,
    body: body != null ? String(body) : stored.body
  };

  const sender = await resolveAccessEmailSender(agencyId, emailType, senderIdentityId);
  const identities = await EmailSenderIdentity.list({
    agencyId,
    includePlatformDefaults: true,
    onlyActive: true
  });
  const recommendedSenders = (identities || []).filter((s) => !isAiSender(s));

  let sampleUser = null;
  const firstId = Number(userIds?.[0] || 0);
  if (firstId) sampleUser = await User.findById(firstId);
  if (!sampleUser) {
    sampleUser = {
      first_name: 'Alex',
      last_name: 'Staff',
      email: 'alex.staff@school.edu'
    };
  }

  const sharedTempPassword =
    normalizeSharedTempPassword(temporaryPassword) ||
    extractTempPasswordFromAccessEmailBody(template.body);

  const sample = await renderAccessEmail({
    user: sampleUser,
    agency,
    template,
    senderName: senderName || sender.identity?.display_name || agency?.name || 'School staff',
    passwordlessToken: null,
    tempPassword: sharedTempPassword,
    isTest: true
  });

  return {
    emailType,
    emailTypeLabel: emailType === ACCOUNT_ACCESS_EMAIL_TYPES.recovery
      ? 'Recovery email (set-password link)'
      : `Access your ${agency?.name || 'tenant'} portal`,
    template,
    sender: sender.identity
      ? {
          id: sender.identity.id,
          display_name: sender.identity.display_name,
          from_email: sender.identity.from_email,
          identity_key: sender.identity.identity_key,
          resolution: sender.resolution
        }
      : null,
    recommendedSenders: recommendedSenders.map((s) => ({
      id: s.id,
      display_name: s.display_name,
      from_email: s.from_email,
      identity_key: s.identity_key
    })),
    samplePreview: sample,
    staggerOptions: STAGGER_OPTIONS_SECONDS,
    defaultStaggerSeconds: DEFAULT_STAGGER_SECONDS,
    tokenExpiresHours: TOKEN_EXPIRES_HOURS,
    detectedTemporaryPassword: sharedTempPassword,
    defaultTempPasswordExpiresHours: DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS
  };
}

export async function sendAccessEmailTest({
  agencyId,
  emailType: emailTypeRaw,
  to,
  subject,
  body,
  senderIdentityId = null,
  senderName = null,
  sampleUserId = null
}) {
  const emailType = normalizeEmailType(emailTypeRaw);
  if (!emailType) {
    const err = new Error('emailType must be recovery or portal_access');
    err.status = 400;
    throw err;
  }
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient.includes('@')) {
    const err = new Error('A valid test email address is required');
    err.status = 400;
    throw err;
  }

  const agency = await Agency.findById(agencyId);
  const stored = await getAccessEmailTemplate(agencyId, emailType);
  const template = {
    ...stored,
    subject: subject != null ? String(subject) : stored.subject,
    body: body != null ? String(body) : stored.body
  };
  const sender = await resolveAccessEmailSender(agencyId, emailType, senderIdentityId);
  if (!sender?.identity?.id) {
    const err = new Error('No tenant From identity is assigned. Pick notifications@ (or login recovery) before sending.');
    err.status = 400;
    throw err;
  }

  let sampleUser = sampleUserId ? await User.findById(sampleUserId) : null;
  if (!sampleUser) {
    sampleUser = {
      first_name: 'Alex',
      last_name: 'Staff',
      email: recipient
    };
  }

  const rendered = await renderAccessEmail({
    user: sampleUser,
    agency,
    template,
    senderName: senderName || sender.identity.display_name,
    passwordlessToken: null,
    isTest: true
  });

  const result = await sendEmailFromIdentity({
    senderIdentityId: sender.identity.id,
    to: recipient,
    subject: `[TEST] ${rendered.subject}`,
    text: rendered.body,
    html: textToHtml(rendered.body),
    source: 'manual',
    templateType: emailType,
    usedFallbackSender: false,
    generatedByUserId: null
  });

  return {
    ok: true,
    queued: !!result?.queued,
    communicationId: result?.communicationId || null,
    fromEmail: sender.identity.from_email
  };
}

export async function queueAccessEmails({
  agencyId,
  emailType: emailTypeRaw,
  userIds,
  subject,
  body,
  senderIdentityId = null,
  staggerSeconds = DEFAULT_STAGGER_SECONDS,
  createdByUserId,
  senderName = null,
  saveTemplate = null,
  temporaryPassword = null,
  expiresInHours = DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS
}) {
  const emailType = normalizeEmailType(emailTypeRaw);
  if (!emailType) {
    const err = new Error('emailType must be recovery or portal_access');
    err.status = 400;
    throw err;
  }
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) {
    const err = new Error('Select at least one school staff member');
    err.status = 400;
    throw err;
  }

  const stagger = STAGGER_OPTIONS_SECONDS.includes(Number(staggerSeconds))
    ? Number(staggerSeconds)
    : DEFAULT_STAGGER_SECONDS;

  let templateRow = await getAccessEmailTemplate(agencyId, emailType);
  const nextSubject = String(subject != null ? subject : templateRow.subject).trim();
  const nextBody = String(body != null ? body : templateRow.body).trim();
  if (!nextSubject || !nextBody) {
    const err = new Error('Subject and body are required');
    err.status = 400;
    throw err;
  }

  if (saveTemplate?.mode === 'update' || saveTemplate?.mode === 'new') {
    templateRow = await upsertAccessEmailTemplate({
      agencyId,
      emailType,
      name: saveTemplate.name || templateRow.name,
      subject: nextSubject,
      body: nextBody,
      saveMode: saveTemplate.mode,
      actorUserId: createdByUserId
    });
  }

  const sender = await resolveAccessEmailSender(agencyId, emailType, senderIdentityId);
  if (!sender?.identity?.id) {
    const err = new Error('No tenant From identity is assigned. Pick notifications@ (or login recovery) before sending.');
    err.status = 400;
    throw err;
  }

  const recipients = [];
  for (const userId of ids) {
    const user = await User.findById(userId);
    if (!user) {
      recipients.push({ userId, ok: false, error: 'User not found' });
      continue;
    }
    const to = pickRecipientEmail(user);
    if (!to) {
      recipients.push({ userId, ok: false, error: 'No email address on file' });
      continue;
    }
    recipients.push({
      userId,
      ok: true,
      email: to,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || to
    });
  }

  const eligible = recipients.filter((r) => r.ok);
  if (!eligible.length) {
    const err = new Error('None of the selected people have an email address');
    err.status = 400;
    throw err;
  }

  const sharedTempPassword =
    emailType === ACCOUNT_ACCESS_EMAIL_TYPES.portal_access
      ? (
        normalizeSharedTempPassword(temporaryPassword) ||
        extractTempPasswordFromAccessEmailBody(nextBody)
      )
      : null;
  const tempPasswordExpiresInHours = Math.min(
    720,
    Math.max(1, Number(expiresInHours) || DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS)
  );

  const [sendResult] = await pool.execute(
    `INSERT INTO school_staff_account_access_sends
      (agency_id, created_by_user_id, email_type, template_id, sender_identity_id,
       subject, body, shared_temporary_password, temp_password_expires_in_hours,
       stagger_seconds, status, total_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
    [
      agencyId,
      createdByUserId,
      emailType,
      templateRow.id || null,
      sender.identity.id,
      nextSubject,
      nextBody,
      sharedTempPassword,
      sharedTempPassword ? tempPasswordExpiresInHours : null,
      stagger,
      eligible.length
    ]
  );
  const sendId = sendResult.insertId;
  const now = Date.now();

  for (let i = 0; i < eligible.length; i += 1) {
    const row = eligible[i];
    const scheduledAt = toMysqlDateTime(new Date(now + i * stagger * 1000));
    await pool.execute(
      `INSERT INTO school_staff_account_access_send_items
        (send_id, user_id, recipient_email, status, scheduled_at)
       VALUES (?, ?, ?, 'queued', ?)`,
      [sendId, row.userId, row.email, scheduledAt]
    );
  }

  return {
    sendId,
    emailType,
    staggerSeconds: stagger,
    totalCount: eligible.length,
    skipped: recipients.filter((r) => !r.ok),
    fromEmail: sender.identity.from_email,
    fromName: sender.identity.display_name,
    estimatedMinutes: Math.ceil(((eligible.length - 1) * stagger) / 60),
    senderName: senderName || sender.identity.display_name,
    sharedTemporaryPasswordConfigured: !!sharedTempPassword,
    tempPasswordExpiresInHours: sharedTempPassword ? tempPasswordExpiresInHours : null
  };
}

export async function getAccessEmailSend(sendId, agencyId = null) {
  const id = Number(sendId);
  if (!id) return null;
  const params = agencyId ? [id, agencyId] : [id];
  const [rows] = await pool.execute(
    `SELECT * FROM school_staff_account_access_sends WHERE id = ?${agencyId ? ' AND agency_id = ?' : ''} LIMIT 1`,
    params
  );
  const send = rows?.[0] || null;
  if (!send) return null;
  const [items] = await pool.execute(
    `SELECT id, user_id, recipient_email, status, scheduled_at, sent_at, error_message
     FROM school_staff_account_access_send_items
     WHERE send_id = ?
     ORDER BY scheduled_at ASC, id ASC`,
    [id]
  );
  const sharedTemporaryPasswordConfigured = !!(
    send?.shared_temporary_password ||
    extractTempPasswordFromAccessEmailBody(send?.body)
  );
  return {
    ...send,
    items: items || [],
    shared_temporary_password: undefined,
    sharedTemporaryPasswordConfigured,
    tempPasswordSynced: !!send?.temp_password_synced_at,
    tempPasswordSyncedAt: send?.temp_password_synced_at || null
  };
}

export async function syncAccessSendTemporaryPasswords({
  sendId,
  agencyId,
  temporaryPassword = null,
  expiresInHours = null,
  performedByUserId = null,
  performedByEmail = null
}) {
  const send = await getAccessEmailSend(sendId, agencyId);
  if (!send) {
    const err = new Error('Send job not found');
    err.status = 404;
    throw err;
  }
  if (send.email_type !== ACCOUNT_ACCESS_EMAIL_TYPES.portal_access) {
    const err = new Error('Temporary password sync is only available for portal access emails');
    err.status = 400;
    throw err;
  }

  const password = resolveSharedTempPassword(send, temporaryPassword);
  if (!password) {
    const err = new Error(
      'No temporary password found for this send. Add a line like "Temp password: your-password" to the email body, or provide temporaryPassword.'
    );
    err.status = 400;
    throw err;
  }

  const hours = Math.min(
    720,
    Math.max(1, Number(expiresInHours || send.temp_password_expires_in_hours) || DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS)
  );

  const sentItems = (send.items || []).filter((item) => String(item.status || '') === 'sent');
  if (!sentItems.length) {
    const err = new Error('No sent recipients found for this email job yet');
    err.status = 400;
    throw err;
  }

  const results = [];
  for (const item of sentItems) {
    const result = await applySharedTemporaryPasswordForUser({
      userId: item.user_id,
      temporaryPassword: password,
      expiresInHours: hours,
      setAt: item.sent_at || null,
      performedByUserId,
      performedByEmail,
      source: 'school_staff_accounts_access_email_sync',
      sendId: send.id
    });
    results.push(result);
  }

  const failed = results.filter((row) => !row.ok);
  if (!failed.length) {
    await pool.execute(
      `UPDATE school_staff_account_access_sends
       SET temp_password_synced_at = UTC_TIMESTAMP(),
           shared_temporary_password = COALESCE(shared_temporary_password, ?),
           temp_password_expires_in_hours = COALESCE(temp_password_expires_in_hours, ?)
       WHERE id = ? AND agency_id = ?`,
      [password, hours, send.id, agencyId]
    );
  }

  return {
    ok: failed.length === 0,
    sendId: send.id,
    passwordApplied: true,
    expiresInHours: hours,
    results
  };
}

export async function getPendingAccessPasswordSync(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return { pending: false };

  const [rows] = await pool.execute(
    `SELECT id, created_at, completed_at, total_count, sent_count, body,
            shared_temporary_password, temp_password_synced_at, temp_password_expires_in_hours
     FROM school_staff_account_access_sends
     WHERE agency_id = ?
       AND email_type = ?
       AND status = 'completed'
       AND temp_password_synced_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [aid, ACCOUNT_ACCESS_EMAIL_TYPES.portal_access]
  );
  const send = rows?.[0] || null;
  if (!send) return { pending: false };

  return {
    pending: true,
    sendId: send.id,
    completedAt: send.completed_at || send.created_at || null,
    sentCount: Number(send.sent_count || 0),
    totalCount: Number(send.total_count || 0),
    expiresInHours: Number(send.temp_password_expires_in_hours || DEFAULT_TEMP_PASSWORD_EXPIRES_HOURS),
    passwordInBody: !!resolveSharedTempPassword(send)
  };
}

async function sendOneQueuedItem(item, send) {
  const user = await User.findById(item.user_id);
  if (!user) throw new Error('User not found');
  const agency = await Agency.findById(send.agency_id);
  const actor = send.created_by_user_id ? await User.findById(send.created_by_user_id) : null;
  const senderName = actor
    ? (`${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email)
    : null;

  const sharedTempPassword = resolveSharedTempPassword(send);
  if (
    sharedTempPassword &&
    send.email_type === ACCOUNT_ACCESS_EMAIL_TYPES.portal_access
  ) {
    await applySharedTemporaryPasswordForUser({
      userId: user.id,
      temporaryPassword: sharedTempPassword,
      expiresInHours: send.temp_password_expires_in_hours,
      setAt: null,
      performedByUserId: send.created_by_user_id,
      performedByEmail: actor?.email || null,
      source: 'school_staff_accounts_access_email_send',
      sendId: send.id
    });
  }

  const tokenResult = await User.generatePasswordlessToken(user.id, TOKEN_EXPIRES_HOURS, 'reset');
  const rendered = await renderAccessEmail({
    user,
    agency,
    template: {
      type: send.email_type,
      subject: send.subject,
      body: send.body
    },
    senderName,
    passwordlessToken: tokenResult.token,
    tempPassword: sharedTempPassword,
    isTest: false
  });

  let comm = null;
  try {
    comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId: user.id,
      agencyId: send.agency_id,
      templateType: send.email_type,
      templateId: send.template_id,
      subject: rendered.subject,
      body: rendered.body,
      generatedByUserId: send.created_by_user_id,
      channel: 'email',
      recipientAddress: item.recipient_email
    });
  } catch {
    comm = null;
  }

  const result = await sendEmailFromIdentity({
    senderIdentityId: send.sender_identity_id,
    to: item.recipient_email,
    subject: rendered.subject,
    text: rendered.body,
    html: textToHtml(rendered.body),
    source: 'manual',
    templateType: send.email_type,
    usedFallbackSender: false,
    generatedByUserId: send.created_by_user_id,
    userId: user.id,
    existingCommunicationId: comm?.id || null
  });

  if (result?.blocked) {
    throw new Error(result.reason || 'Send blocked by quality check');
  }
  if (result?.queued) {
    throw new Error('Send queued for approval instead of delivering — check Email Settings From identity');
  }

  if (comm?.id && result?.id) {
    await CommunicationLoggingService.markAsSent(comm.id, result.id, {
      senderIdentityId: send.sender_identity_id
    }).catch(() => {});
  }

  try {
    const ActivityLogService = (await import('./activityLog.service.js')).default;
    ActivityLogService.logActivity({
      actionType: 'password_reset_link_sent',
      userId: user.id,
      metadata: {
        sendId: send.id,
        emailType: send.email_type,
        performedByUserId: send.created_by_user_id,
        source: 'school_staff_accounts_bulk'
      }
    });
  } catch {
    // best-effort
  }

  return { communicationId: comm?.id || result?.communicationId || null, queued: !!result?.queued };
}

export async function processDueSchoolStaffAccountAccessEmails() {
  let due;
  try {
    [due] = await pool.execute(
      `SELECT i.id
       FROM school_staff_account_access_send_items i
       INNER JOIN school_staff_account_access_sends s ON s.id = i.send_id
       WHERE i.status = 'queued'
         AND i.scheduled_at <= UTC_TIMESTAMP()
         AND s.status IN ('queued', 'sending')
         AND NOT EXISTS (
           SELECT 1 FROM school_staff_account_access_send_items busy
           WHERE busy.send_id = i.send_id AND busy.status = 'sending'
         )
         AND (
           NOT EXISTS (
             SELECT 1 FROM school_staff_account_access_send_items last_sent
             WHERE last_sent.send_id = i.send_id
               AND last_sent.status = 'sent'
               AND last_sent.sent_at IS NOT NULL
           )
           OR (
             SELECT MAX(last_sent.sent_at)
             FROM school_staff_account_access_send_items last_sent
             WHERE last_sent.send_id = i.send_id AND last_sent.status = 'sent'
           ) <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL s.stagger_seconds SECOND)
         )
       ORDER BY i.scheduled_at ASC, i.id ASC
       LIMIT 1`
    );
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { processed: 0 };
    throw e;
  }

  const itemId = Number(due?.[0]?.id || 0);
  if (!itemId) return { processed: 0 };

  const [claim] = await pool.execute(
    `UPDATE school_staff_account_access_send_items
     SET status = 'sending'
     WHERE id = ? AND status = 'queued'`,
    [itemId]
  );
  if (!claim?.affectedRows) return { processed: 0 };

  const [itemRows] = await pool.execute(
    `SELECT * FROM school_staff_account_access_send_items WHERE id = ? LIMIT 1`,
    [itemId]
  );
  const item = itemRows?.[0];
  if (!item) return { processed: 0 };

  const [sendRows] = await pool.execute(
    `SELECT * FROM school_staff_account_access_sends WHERE id = ? LIMIT 1`,
    [item.send_id]
  );
  const send = sendRows?.[0];
  if (!send) return { processed: 0 };

  if (send.status === 'queued') {
    await pool.execute(
      `UPDATE school_staff_account_access_sends
       SET status = 'sending', started_at = COALESCE(started_at, UTC_TIMESTAMP())
       WHERE id = ?`,
      [send.id]
    );
  }

  try {
    const result = await sendOneQueuedItem(item, send);
    await pool.execute(
      `UPDATE school_staff_account_access_send_items
       SET status = 'sent', sent_at = UTC_TIMESTAMP(), communication_id = ?, error_message = NULL
       WHERE id = ?`,
      [result.communicationId || null, item.id]
    );
    await pool.execute(
      `UPDATE school_staff_account_access_sends
       SET sent_count = sent_count + 1
       WHERE id = ?`,
      [send.id]
    );
  } catch (e) {
    await pool.execute(
      `UPDATE school_staff_account_access_send_items
       SET status = 'failed', error_message = ?
       WHERE id = ?`,
      [String(e?.message || e).slice(0, 500), item.id]
    );
    await pool.execute(
      `UPDATE school_staff_account_access_sends
       SET failed_count = failed_count + 1
       WHERE id = ?`,
      [send.id]
    );
  }

  const [counts] = await pool.execute(
    `SELECT
       SUM(status IN ('queued', 'sending')) AS remaining,
       SUM(status = 'sent') AS sent_count,
       SUM(status = 'failed') AS failed_count
     FROM school_staff_account_access_send_items
     WHERE send_id = ?`,
    [send.id]
  );
  const remaining = Number(counts?.[0]?.remaining || 0);
  if (remaining === 0) {
    await pool.execute(
      `UPDATE school_staff_account_access_sends
       SET status = 'completed',
           completed_at = UTC_TIMESTAMP(),
           sent_count = ?,
           failed_count = ?
       WHERE id = ?`,
      [Number(counts?.[0]?.sent_count || 0), Number(counts?.[0]?.failed_count || 0), send.id]
    );
  }

  return { processed: 1, sendId: send.id };
}

export { normalizeEmailType };
