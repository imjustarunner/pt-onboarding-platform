/**
 * Client-affiliated contacts: create/link, reminder prefs, notify email.
 */
import ClientGuardian from '../models/ClientGuardian.model.js';
import Agency from '../models/Agency.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import Client from '../models/Client.model.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import User from '../models/User.model.js';
import { buildContactAssignedReminderEmailForAgency } from './brandedNotificationEmail.service.js';
import { buildContactReminderLinks } from './contactReminderToken.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { contactReminderPhoneHash } from '../utils/contactReminderConsent.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

export async function requireReminderGuardian(clientId, userId) {
  const link = await ClientGuardian.getLink({ clientId, guardianUserId: userId });
  if (!link) {
    const client = await Client.findById(clientId);
    const user = await User.findById(userId);
    if (user?.role === 'client' && Number(client?.user_id) === Number(userId)) return;
  }
  if (!link || Number(link.access_enabled) !== 1 || ClientGuardian.isNoView(link.permissions_json)) {
    throw Object.assign(new Error('An account guardian must authorize reminders for an additional contact'), { status: 403 });
  }
}

function clientInitials(client) {
  if (String(client?.initials || '').trim()) return String(client.initials).trim();
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

  await requireReminderGuardian(row.client_id, row.notify_ack_by_user_id);
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
    clientFirstName: clientInitials({ initials: row.client_initials }),
    clientLastName: '',
    clientPreferredName: '',
    emailRemindersEnabled: !!row.email_reminders_enabled,
    smsRemindersEnabled: !!row.sms_reminders_enabled,
    smsOptIn: !!row.sms_opt_in && row.sms_consent_status === 'opted_in' && row.sms_consent_phone_hash === contactReminderPhoneHash(row.contact_phone),
    clientInitials: row.client_initials,
    notificationsEmail,
    links,
    unsubscribeUrl: links.off,
    supportUrl: buildPublicAppUrl(agency, 'support'),
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

  if (notificationTransportReceipt(result, agencyId || row.agency_id).accepted) {
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
  existingContactId = null,
  recipientPermissionToInvite = false,
  importOnly = false
} = {}) {
  if (importOnly) {
    emailRemindersEnabled = false;
    smsRemindersEnabled = false;
    acknowledgeNotify = false;
    recipientPermissionToInvite = false;
  }
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

  if (Number(client.agency_id || client.agencyId) !== resolvedAgencyId) throw Object.assign(new Error('Client does not belong to this agency'), { status: 403 });

  const wantsReminders = !!(emailRemindersEnabled || smsRemindersEnabled);
  if (wantsReminders) await requireReminderGuardian(clientId, userId);
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

  if (contact && Number(contact.agency_id) !== resolvedAgencyId) {
    throw Object.assign(new Error('Contact not found in this agency'), { status: 404 });
  }

  const normEmail = normalizeEmail(email);
  if (!existingContactId) {
    const ownContacts = await ClientContactAffiliation.listForClient(clientId, { includeInactive: true });
    const own = ownContacts.find(row => (normEmail && normalizeEmail(row.contact_email) === normEmail)
      || (phone && contactReminderPhoneHash(row.contact_phone) === contactReminderPhoneHash(phone)));
    if (own) contact = await AgencyContact.findById(own.agency_contact_id);
  }
  if (!contact && normEmail) {
    contact = await AgencyContact.findByEmail(normEmail, resolvedAgencyId);
  }
  if (!contact && phone) {
    contact = await AgencyContact.findByPhone(phone, resolvedAgencyId);
  }

  if (contact && Number(contact.client_id) !== Number(clientId)
      && !await ClientContactAffiliation.findByClientAndContact(clientId, contact.id)) {
    if (existingContactId) throw Object.assign(new Error('Contact not found for this client'), { status: 404 });
    // An email/phone guess is not permission to reveal another client's contact.
    // Create this client's contact from the supplied fields only.
    contact = null;
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
    const changesIdentity = (phone && contactReminderPhoneHash(phone) !== contactReminderPhoneHash(contact.phone))
      || (normEmail && normEmail !== contact.email) || (fullName && fullName !== contact.full_name);
    if (changesIdentity && ((contact.client_id && Number(contact.client_id) !== Number(clientId))
        || await ClientContactAffiliation.isSharedAcrossClients(contact.id, clientId))) {
      throw Object.assign(new Error('This contact is shared with another record. Use their existing details or add a separate contact.'), { status: 409 });
    }
    const patch = {};
    if (fullName) patch.full_name = fullName;
    if (normEmail) patch.email = normEmail;
    if (phone) patch.phone = phone;
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
      smsOptIn: false,
      notifyAckByUserId: ackAt ? userId : null,
      notifyAckAt: ackAt,
      createdByUserId: userId
    });
  } else {
    const enabling =
      (emailRemindersEnabled && !wasEmail) || (smsRemindersEnabled && !wasSms);
    affiliation = await ClientContactAffiliation.update(affiliation.id, {
      relationshipType: relationshipType || affiliation.relationship_type,
      ...(!importOnly ? { emailRemindersEnabled, smsRemindersEnabled, isActive: true } : {}),
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

  let smsInvitationResult = null;
  if (smsRemindersEnabled && recipientPermissionToInvite) {
    const { requestContactSmsInvitation } = await import('./contactReminderSmsConsent.service.js');
    smsInvitationResult = await requestContactSmsInvitation({ affiliationId: full.id, clientId, userId, recipientPermissionToInvite });
  }
  return {
    smsInvitationResult,
    affiliation: ClientContactAffiliation.toApi(await ClientContactAffiliation.findById(full.id)),
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

  if (enabling || (patch.isActive && (nextEmail || nextSms))) await requireReminderGuardian(clientId, userId);

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

  let smsInvitationResult = null;
  if (nextSms && patch.recipientPermissionToInvite) {
    const { requestContactSmsInvitation } = await import('./contactReminderSmsConsent.service.js');
    smsInvitationResult = await requestContactSmsInvitation({ affiliationId, clientId, userId, recipientPermissionToInvite: true });
  }
  return {
    smsInvitationResult,
    affiliation: ClientContactAffiliation.toApi(await ClientContactAffiliation.findById(updated.id)),
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

  if (action !== 'off' && action !== 'view') await requireReminderGuardian(row.client_id, row.notify_ack_by_user_id);
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

    contactLastChoice: choice,
    contactChoiceAt: new Date()
  });

  return { affiliation: ClientContactAffiliation.toApi(updated), applied: true, choice };
}
