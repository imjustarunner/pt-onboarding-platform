/**
 * Client-affiliated contacts: create/link, reminder prefs, notify email.
 */
import Agency from '../models/Agency.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import Client from '../models/Client.model.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import User from '../models/User.model.js';
import { buildContactAssignedReminderEmailForAgency } from './brandedNotificationEmail.service.js';
import {
  buildContactReminderLinks,
  publicAppBaseUrl
} from './contactReminderToken.service.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

function clientInitials(client) {
  const a = String(client?.preferred_name || client?.preferredName || client?.first_name || client?.firstName || '').trim();
  const b = String(client?.last_name || client?.lastName || '').trim();
  return `${a[0] || ''}${b[0] || ''}`.toUpperCase() || '?';
}

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e && e.includes('@') ? e : '';
}

async function loadAgencyContext(agencyId) {
  const agency = await Agency.findById(agencyId);
  if (!agency) {
    const err = new Error('Agency not found');
    err.status = 404;
    throw err;
  }
  const domain = await inferAgencyMailDomain(agencyId);
  let flags = {};
  try {
    flags =
      typeof agency.feature_flags === 'string'
        ? JSON.parse(agency.feature_flags || '{}')
        : agency.feature_flags || {};
  } catch {
    flags = {};
  }
  const notificationsEmail = domain ? `notifications@${domain}` : 'notifications@itsco.health';
  return { agency, domain, flags, notificationsEmail };
}

export async function sendContactAssignedNotifyEmail({
  affiliation,
  assignerUserId,
  agencyId
} = {}) {
  const row = affiliation?.contact_email
    ? affiliation
    : await ClientContactAffiliation.findById(affiliation?.id || affiliation);
  if (!row?.contact_email) return { skipped: true, reason: 'no_email' };
  if (!row.email_reminders_enabled && !row.sms_reminders_enabled) {
    return { skipped: true, reason: 'no_channels' };
  }
  if (!row.notify_ack_at) {
    return { skipped: true, reason: 'missing_ack' };
  }

  const { agency, domain, notificationsEmail } = await loadAgencyContext(agencyId || row.agency_id);
  const assigner = assignerUserId ? await User.findById(assignerUserId).catch(() => null) : null;
  const assignerName = assigner
    ? [assigner.first_name, assigner.last_name].filter(Boolean).join(' ') || assigner.email
    : 'A team member';

  const links = buildContactReminderLinks(row.id);
  const built = await buildContactAssignedReminderEmailForAgency({
    agencyId: Number(agencyId || row.agency_id),
    agencyName: agency.name || 'Care team',
    assignerName,
    contactName: row.contact_full_name,
    clientFirstName: row.client_first_name,
    clientLastName: row.client_last_name,
    clientPreferredName: row.client_preferred_name,
    emailRemindersEnabled: !!row.email_reminders_enabled,
    smsRemindersEnabled: !!row.sms_reminders_enabled,
    notificationsEmail,
    links,
    unsubscribeUrl: links.off,
    supportUrl: `${publicAppBaseUrl()}/support`,
    agencyPhone: agency.phone || agency.main_phone || '',
    agencyWebsite: agency.website || (domain ? `https://${domain}` : ''),
    colorPalette: agency.color_palette
  });

  const result = await sendNotificationEmail({
    agencyId: Number(agencyId || row.agency_id),
    triggerKey: 'contact_reminder_assigned',
    to: row.contact_email,
    subject: built.subject,
    text: built.text,
    html: built.html,
    generatedByUserId: assignerUserId || null,
    clientId: Number(row.client_id),
    templateType: 'contact_reminder_assigned',
    source: 'auto'
  });

  if (!result?.skipped) {
    await ClientContactAffiliation.update(row.id, {
      notifyEmailSentAt: new Date(),
      notifyEmailMessageId: result?.messageId || result?.id || null
    });
  }
  return result;
}

/**
 * Create or update an affiliated contact for a client.
 */
export async function upsertClientAffiliatedContact({
  agencyId,
  clientId,
  userId,
  fullName,
  email,
  phone,
  relationshipType = null,
  emailRemindersEnabled = false,
  smsRemindersEnabled = false,
  acknowledgeNotify = false,
  existingContactId = null
} = {}) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const resolvedAgencyId = Number(agencyId || client.agency_id || client.agencyId);
  if (!resolvedAgencyId) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }

  const wantsReminders = !!(emailRemindersEnabled || smsRemindersEnabled);
  if (wantsReminders && !acknowledgeNotify) {
    const err = new Error(
      'You must acknowledge that an email will be sent on your behalf notifying this contact of their reminder subscription.'
    );
    err.status = 400;
    throw err;
  }
  if (emailRemindersEnabled && !normalizeEmail(email) && !existingContactId) {
    const err = new Error('Email is required when email reminders are enabled');
    err.status = 400;
    throw err;
  }
  if (smsRemindersEnabled && !phone && !existingContactId) {
    const err = new Error('Phone is required when text reminders are enabled');
    err.status = 400;
    throw err;
  }

  let contact = existingContactId ? await AgencyContact.findById(existingContactId) : null;
  if (existingContactId && !contact) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }

  const normEmail = normalizeEmail(email);
  if (!contact && normEmail) {
    contact = await AgencyContact.findByEmail(normEmail, resolvedAgencyId);
  }
  if (!contact && phone) {
    contact = await AgencyContact.findByPhone(phone, resolvedAgencyId);
  }

  if (!contact) {
    if (!fullName && !normEmail && !phone) {
      const err = new Error('Name, email, or phone is required');
      err.status = 400;
      throw err;
    }
    contact = await AgencyContact.create({
      agencyId: resolvedAgencyId,
      createdByUserId: userId,
      clientId,
      fullName: fullName || normEmail || phone,
      email: normEmail || null,
      phone: phone || null,
      source: 'manual',
      relationshipType
    });
  } else {
    const patch = {};
    if (fullName) patch.full_name = fullName;
    if (normEmail) patch.email = normEmail;
    if (phone) patch.phone = phone;
    if (relationshipType) patch.relationship_type = relationshipType;
    if (!contact.client_id) patch.client_id = clientId;
    if (Object.keys(patch).length) {
      contact = await AgencyContact.update(contact.id, patch);
    }
  }

  let affiliation = await ClientContactAffiliation.findByClientAndContact(clientId, contact.id);
  const ackAt = wantsReminders && acknowledgeNotify ? new Date() : null;
  const wasEmail = !!affiliation?.email_reminders_enabled;
  const wasSms = !!affiliation?.sms_reminders_enabled;

  if (!affiliation) {
    affiliation = await ClientContactAffiliation.create({
      agencyId: resolvedAgencyId,
      clientId,
      agencyContactId: contact.id,
      relationshipType: relationshipType || contact.relationship_type || null,
      emailRemindersEnabled,
      smsRemindersEnabled,
      smsOptIn: !!smsRemindersEnabled,
      notifyAckByUserId: ackAt ? userId : null,
      notifyAckAt: ackAt,
      createdByUserId: userId
    });
  } else {
    const enabling =
      (emailRemindersEnabled && !wasEmail) || (smsRemindersEnabled && !wasSms);
    affiliation = await ClientContactAffiliation.update(affiliation.id, {
      relationshipType: relationshipType || affiliation.relationship_type,
      emailRemindersEnabled,
      smsRemindersEnabled,
      smsOptIn: smsRemindersEnabled ? true : affiliation.sms_opt_in,
      isActive: true,
      ...(enabling && acknowledgeNotify
        ? { notifyAckByUserId: userId, notifyAckAt: new Date() }
        : {})
    });
  }

  const full = await ClientContactAffiliation.findById(affiliation.id);
  let notifyResult = null;
  const shouldNotify =
    wantsReminders &&
    acknowledgeNotify &&
    full.contact_email &&
    (!full.notify_email_sent_at || !wasEmail || !wasSms || emailRemindersEnabled !== wasEmail || smsRemindersEnabled !== wasSms);

  if (shouldNotify) {
    notifyResult = await sendContactAssignedNotifyEmail({
      affiliation: full,
      assignerUserId: userId,
      agencyId: resolvedAgencyId
    });
  }

  return {
    affiliation: ClientContactAffiliation.toApi(full),
    notifyResult,
    clientInitials: clientInitials(client)
  };
}

export async function updateClientAffiliatedContact({
  affiliationId,
  clientId,
  userId,
  patch = {}
} = {}) {
  const row = await ClientContactAffiliation.findById(affiliationId);
  if (!row || Number(row.client_id) !== Number(clientId)) {
    const err = new Error('Affiliation not found');
    err.status = 404;
    throw err;
  }

  const nextEmail =
    patch.emailRemindersEnabled !== undefined
      ? !!patch.emailRemindersEnabled
      : !!row.email_reminders_enabled;
  const nextSms =
    patch.smsRemindersEnabled !== undefined
      ? !!patch.smsRemindersEnabled
      : !!row.sms_reminders_enabled;
  const enabling =
    (nextEmail && !row.email_reminders_enabled) || (nextSms && !row.sms_reminders_enabled);

  if (enabling && !patch.acknowledgeNotify) {
    const err = new Error(
      'You must acknowledge that an email will be sent on your behalf notifying this contact of their reminder subscription.'
    );
    err.status = 400;
    throw err;
  }

  const updated = await ClientContactAffiliation.update(affiliationId, {
    relationshipType: patch.relationshipType,
    emailRemindersEnabled: nextEmail,
    smsRemindersEnabled: nextSms,
    smsOptIn: nextSms ? true : row.sms_opt_in,
    isActive: patch.isActive,
    ...(enabling
      ? { notifyAckByUserId: userId, notifyAckAt: new Date() }
      : {})
  });

  let notifyResult = null;
  if (enabling && updated.contact_email) {
    notifyResult = await sendContactAssignedNotifyEmail({
      affiliation: updated,
      assignerUserId: userId,
      agencyId: row.agency_id
    });
  }

  return {
    affiliation: ClientContactAffiliation.toApi(updated),
    notifyResult
  };
}

export async function applyContactReminderChoice({ affiliationId, action }) {
  const row = await ClientContactAffiliation.findById(affiliationId);
  if (!row || !row.is_active) {
    const err = new Error('Contact affiliation not found');
    err.status = 404;
    throw err;
  }

  let emailOn = !!row.email_reminders_enabled;
  let smsOn = !!row.sms_reminders_enabled;
  let choice = action;

  if (action === 'email_only') {
    emailOn = true;
    smsOn = false;
    choice = 'email_only';
  } else if (action === 'sms_only') {
    emailOn = false;
    smsOn = true;
    choice = 'sms_only';
  } else if (action === 'both') {
    emailOn = true;
    smsOn = true;
    choice = 'both';
  } else if (action === 'off') {
    emailOn = false;
    smsOn = false;
    choice = 'off';
  } else if (action === 'view') {
    return { affiliation: ClientContactAffiliation.toApi(row), applied: false };
  } else {
    const err = new Error('Unknown action');
    err.status = 400;
    throw err;
  }

  const updated = await ClientContactAffiliation.update(affiliationId, {
    emailRemindersEnabled: emailOn,
    smsRemindersEnabled: smsOn,
    smsOptIn: smsOn ? true : row.sms_opt_in,
    contactLastChoice: choice,
    contactChoiceAt: new Date()
  });

  return { affiliation: ClientContactAffiliation.toApi(updated), applied: true, choice };
}
