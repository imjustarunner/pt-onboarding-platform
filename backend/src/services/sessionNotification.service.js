import { readAppointmentNotificationRules, normalizeCustomSessionReminders } from './appointmentNotificationCustomization.service.js';
import { readSessionReminderDefaults, saveSessionReminderDefaults, organizationReminderRules } from './sessionReminderDefaults.service.js';
import { APP_SESSION_REMINDERS, sessionRsvpState, scheduledReminderSpacing, sessionReminderMessage } from './sessionReminderPolicy.js';
import { rebuildSessionReminderPolicies } from './sessionReminderPolicyRebuild.service.js';
import { serviceNotificationBlocked } from './clientServiceNotificationPolicy.service.js';
import { appointmentFamilyRecipients } from './appointmentFamilyRecipients.service.js';
import { createHash } from 'node:crypto';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { contactReminderPhoneHash } from '../utils/contactReminderConsent.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import {hasTerminalClientStatus} from './clientTerminationRoster.service.js';
import { latestIntakeCommunicationChoices, INTAKE_COMMUNICATION_VERSION } from './intakeCommunicationChoices.service.js';
/**
 * Fully customizable session notification system.
 * Platform floors → tenant channels/rules → client prefs → schedule / buffer / send.
 */

import pool from '../config/database.js';
import { dedupeSessionReminders } from '../../../frontend/src/navigation/sessionReminderRules.js';
import { withSessionSchedulingLock } from './sessionSchedulingLock.service.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import Appointment from '../models/Appointment.model.js';
import VonageService from './vonage.service.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { resolveRegisteredSmsSender, recordedReminderConsent } from './smsCompliance.service.js';
import { resolveAppointmentServiceSetting, buildSchoolReminder } from './appointmentServiceSetting.service.js';
import { schoolAppointmentReminderWindow, schoolAppointmentReminderText } from '../utils/schoolAppointmentReminder.js';
import {
  logCommunication,
  cancelPendingReminders
} from './appointmentReminder.service.js';
import {
  buildReminderMessage,
  buildConfirmationMessage,
  interpretAppointmentReply as interpretReplyIntent
} from './appointmentReply.service.js';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function minimalContactSessionReminder(appointment) {
  const start = parseStartAt(appointment.startAt);
  const when = start && !Number.isNaN(start.getTime()) ? new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: appointment.timeZone || appointment.timezone || 'America/Denver'
  }).format(start) : 'the scheduled time';
  return `An upcoming session is scheduled for ${when}. Please contact the account guardian for details.`;
}

const CHANNELS = ['in_app', 'email', 'sms', 'phone'];

/** Shared session cadence; legacy callers use the same persisted notification plan. */
export const DEFAULT_CADENCE_OFFSETS = Object.freeze({
  seventyTwoHour: 72 * 60,
  twentyFourHour: 24 * 60,
  twoHour: 2 * 60
});

const DEFAULT_PLATFORM = {
  channels: {
    in_app: 'available',
    email: 'available',
    sms: 'consent_required',
    phone: 'disabled'
  },
  minRules: [],
  defaultBufferMinutes: 15,
  allowTenantDisable: { in_app: true, email: false, sms: true, phone: true }
};

const DEFAULT_TENANT_CHANNELS = { in_app: true, email: true, sms: true, phone: false };

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function toMysqlDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return dateToMysqlUtcDateTime(d);
}

function parseStartAt(startAt) {
  if (!startAt) return null;
  if (startAt instanceof Date) return startAt;
  const d = new Date(utcMysqlToIso(startAt) || NaN);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sessionReminderTime(appointment) {
  const start = parseStartAt(appointment.startAt);
  if (!start) return 'the scheduled time';
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const timeZone = appointment.sourceTimezone || appointment.timeZone || appointment.timezone || 'America/Denver';
  try { return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(start); }
  catch { return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Denver' }).format(start); }
}

export function formatQueuedSessionMessage(appointment, body) {
  if (typeof body !== 'string') return body;
  // Older generated defaults cached Date.toString(). Correct those at delivery,
  // including queues enabled later, without rewriting tenant-authored templates.
  const legacy = body.match(/^(?:Reminder: .+ on |Please confirm your appointment ".+" on )((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^)]+\))\.(?: Reply Y to confirm, N to cancel, R to request a reschedule\.)?$/);
  return legacy ? body.replace(legacy[1], sessionReminderTime(appointment)) : body;
}

export function offsetToMinutes(value, unit) {
  const v = Math.max(0, Number(value) || 0);
  const u = String(unit || 'hours').toLowerCase();
  if (u === 'days' || u === 'day') return v * 24 * 60;
  if (u === 'minutes' || u === 'minute' || u === 'min') return v;
  return v * 60; // hours default
}

export async function getPlatformSettings() {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM platform_session_notification_settings WHERE id = 1 LIMIT 1`
    );
    const r = rows?.[0];
    if (!r) return { ...DEFAULT_PLATFORM };
    return {
      channels: parseJson(r.channels_json, DEFAULT_PLATFORM.channels),
      minRules: parseJson(r.min_rules_json, DEFAULT_PLATFORM.minRules),
      defaultBufferMinutes: Number(r.default_buffer_minutes || 15),
      allowTenantDisable: parseJson(r.allow_tenant_disable_json, DEFAULT_PLATFORM.allowTenantDisable)
    };
  } catch {
    return { ...DEFAULT_PLATFORM };
  }
}

export async function putPlatformSettings(body = {}, updatedByUserId = null) {
  const channels = body.channels || body.channels_json || DEFAULT_PLATFORM.channels;
  const minRules = body.minRules || body.min_rules_json || DEFAULT_PLATFORM.minRules;
  const defaultBufferMinutes = Math.max(
    0,
    Number(body.defaultBufferMinutes ?? body.default_buffer_minutes ?? 15) || 15
  );
  const allowTenantDisable = body.allowTenantDisable || body.allow_tenant_disable_json || DEFAULT_PLATFORM.allowTenantDisable;
  await pool.execute(
    `INSERT INTO platform_session_notification_settings
      (id, channels_json, min_rules_json, default_buffer_minutes, allow_tenant_disable_json, updated_by_user_id)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       channels_json = VALUES(channels_json),
       min_rules_json = VALUES(min_rules_json),
       default_buffer_minutes = VALUES(default_buffer_minutes),
       allow_tenant_disable_json = VALUES(allow_tenant_disable_json),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      JSON.stringify(channels),
      JSON.stringify(minRules),
      defaultBufferMinutes,
      JSON.stringify(allowTenantDisable),
      updatedByUserId || null
    ]
  );
  return getPlatformSettings();
}

export async function getTenantSettings(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const platform = await getPlatformSettings();
  const savedReminderRules = await readSessionReminderDefaults(aid);
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_session_notification_settings WHERE agency_id = ? LIMIT 1`,
      [aid]
    );
    const r = rows?.[0];
    if (!r) {
      return {
        agencyId: aid,
        channelsEnabled: { ...DEFAULT_TENANT_CHANNELS },
        bookingConfirmation: { enabled: false, channels: ['email'], requireResponse: true },
        standardReminder: {
          enabled: true,
          offsetValue: 24,
          offsetUnit: 'hours',
          channels: ['email'],
          required: true,
          askConfirmation: true
        },
        additionalReminders: [
          { id: 'r24h', label: '24 hours before', offsetValue: 24, offsetUnit: 'hours', channel: 'email', recipient: 'client', askConfirmation: true, enabled: false },
          { id: 'r4h', label: '4 hours before', offsetValue: 4, offsetUnit: 'hours', channel: 'email', recipient: 'client', askConfirmation: true, enabled: false },
          { id: 'r1h', label: '1 hour before', offsetValue: 1, offsetUnit: 'hours', channel: 'sms', recipient: 'client', askConfirmation: true, enabled: false }
        ],
        changeNotify: {
          enabled: true,
          bufferMinutes: platform.defaultBufferMinutes || 15,
          channels: ['email'],
          respectUserOptOut: true
        },
        messageTemplates: {},
        reminderRules: savedReminderRules || APP_SESSION_REMINDERS,
        platform
      };
    }
    return {
      agencyId: aid,
      channelsEnabled: parseJson(r.channels_enabled_json, DEFAULT_TENANT_CHANNELS),
      bookingConfirmation: parseJson(r.booking_confirmation_json, { enabled: false }),
      standardReminder: parseJson(r.standard_reminder_json, { enabled: true, offsetValue: 24, offsetUnit: 'hours', channels: ['email'] }),
      additionalReminders: parseJson(r.additional_reminders_json, []),
      changeNotify: parseJson(r.change_notify_json, { enabled: true, bufferMinutes: 15, channels: ['email'], respectUserOptOut: true }),
      messageTemplates: parseJson(r.message_templates_json, {}),
      reminderRules: organizationReminderRules({ standardReminder: parseJson(r.standard_reminder_json, {}), additionalReminders: parseJson(r.additional_reminders_json, []) }, savedReminderRules),
      platform
    };
  } catch {
    return {
      agencyId: aid,
      channelsEnabled: { ...DEFAULT_TENANT_CHANNELS },
      bookingConfirmation: { enabled: false },
      standardReminder: { enabled: true, offsetValue: 24, offsetUnit: 'hours', channels: ['email'] },
      additionalReminders: [],
      changeNotify: { enabled: true, bufferMinutes: 15, channels: ['email'], respectUserOptOut: true },
      messageTemplates: {},
      reminderRules: savedReminderRules || APP_SESSION_REMINDERS,
      platform
    };
  }
}

/** Merge tenant channel toggles with platform availability locks. */
export function resolveEffectiveChannels(platform, tenantChannelsEnabled = {}) {
  const out = {};
  for (const ch of CHANNELS) {
    const plat = String(platform?.channels?.[ch] || 'disabled').toLowerCase();
    const tenantOn = tenantChannelsEnabled?.[ch] !== false && tenantChannelsEnabled?.[ch] !== 0;
    const allowDisable = platform?.allowTenantDisable?.[ch] !== false;
    if (plat === 'disabled') {
      out[ch] = false;
      continue;
    }
    if (!allowDisable && (plat === 'available' || plat === 'consent_required')) {
      out[ch] = true;
      continue;
    }
    out[ch] = !!tenantOn;
  }
  return out;
}

export async function putTenantSettings(agencyId, body = {}, updatedByUserId = null) {
  const aid = Number(agencyId || 0);
  const platform = await getPlatformSettings();
  const channelsEnabled = resolveEffectiveChannels(
    platform,
    body.channelsEnabled || body.channels_enabled_json || DEFAULT_TENANT_CHANNELS
  );
  const reminderRules = body.reminderRules === undefined ? null : normalizeCustomSessionReminders(body.reminderRules);
  if(reminderRules && !reminderRules.length) throw Object.assign(new Error('Choose at least one organization reminder.'),{status:400});
  if(reminderRules) for(const rule of reminderRules) for(const channel of rule.channels||[rule.channel]) {
    if(!channelsEnabled[channel]) throw Object.assign(new Error('Enable each selected reminder channel before saving the organization default.'),{status:400});
  }
  await pool.execute(
    `INSERT INTO agency_session_notification_settings
      (agency_id, channels_enabled_json, booking_confirmation_json, standard_reminder_json,
       additional_reminders_json, change_notify_json, message_templates_json, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       channels_enabled_json = VALUES(channels_enabled_json),
       booking_confirmation_json = VALUES(booking_confirmation_json),
       standard_reminder_json = VALUES(standard_reminder_json),
       additional_reminders_json = VALUES(additional_reminders_json),
       change_notify_json = VALUES(change_notify_json),
       message_templates_json = VALUES(message_templates_json),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      aid,
      JSON.stringify(channelsEnabled),
      JSON.stringify(body.bookingConfirmation || body.booking_confirmation_json || { enabled: false }),
      JSON.stringify(body.standardReminder || body.standard_reminder_json || { enabled: true, offsetValue: 24, offsetUnit: 'hours', channels: ['email'] }),
      JSON.stringify(body.additionalReminders || body.additional_reminders_json || []),
      JSON.stringify(body.changeNotify || body.change_notify_json || { enabled: true, bufferMinutes: 15, channels: ['email'] }),
      JSON.stringify(body.messageTemplates || body.message_templates_json || {}),
      updatedByUserId || null
    ]
  );
  if (reminderRules) await saveSessionReminderDefaults(aid, 0, reminderRules, updatedByUserId);
  return getTenantSettings(aid);
}

export async function getClientPreferences(agencyId, clientId, guardianUserId = null) {
  const gid = Number(guardianUserId || 0) || 0;
  const params = [Number(agencyId), Number(clientId), gid];
  const sql = `SELECT * FROM client_session_notification_preferences
             WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ?
             LIMIT 1`;
  try {
    const [rows] = await pool.execute(sql, params);
    const r = rows?.[0];
    if (!r) {
      return {
        agencyId: Number(agencyId),
        clientId: Number(clientId),
        guardianUserId: gid || null,
        channels: { in_app: true, email: true, sms: false, phone: false },
        reminderLead: null,
        optionalRemindersEnabled: true,
        confirmationRequestsEnabled: true,
        providerPushedUpdatesEnabled: true,
        schedulingChangesEnabled: true,
        isDefault: true
      };
    }
    return {
      agencyId: Number(r.agency_id),
      clientId: Number(r.client_id),
      guardianUserId: Number(r.guardian_user_id || 0) || null,
      channels: parseJson(r.channels_json, {}),
      reminderLead: parseJson(r.reminder_lead_json, null),
      optionalRemindersEnabled: Number(r.optional_reminders_enabled) === 1,
      confirmationRequestsEnabled: Number(r.confirmation_requests_enabled) === 1,
      providerPushedUpdatesEnabled: Number(r.provider_pushed_updates_enabled) === 1,
      schedulingChangesEnabled: Number(r.scheduling_changes_enabled) === 1,
      isDefault: false
    };
  } catch {
    return {
      agencyId: Number(agencyId),
      clientId: Number(clientId),
      channels: { in_app: true, email: true, sms: false, phone: false },
      optionalRemindersEnabled: true,
      confirmationRequestsEnabled: true,
      providerPushedUpdatesEnabled: true,
      schedulingChangesEnabled: true,
      isDefault: true
    };
  }
}

export async function putClientPreferences(agencyId, clientId, body = {}, guardianUserId = null) {
  const channels = body.channels || body.channels_json || { in_app: true, email: true, sms: false, phone: false };
  const gid = Number(guardianUserId || 0) || 0;
  await pool.execute(
    `INSERT INTO client_session_notification_preferences
      (agency_id, client_id, guardian_user_id, channels_json, reminder_lead_json,
       optional_reminders_enabled, confirmation_requests_enabled,
       provider_pushed_updates_enabled, scheduling_changes_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       channels_json = VALUES(channels_json),
       reminder_lead_json = VALUES(reminder_lead_json),
       optional_reminders_enabled = VALUES(optional_reminders_enabled),
       confirmation_requests_enabled = VALUES(confirmation_requests_enabled),
       provider_pushed_updates_enabled = VALUES(provider_pushed_updates_enabled),
       scheduling_changes_enabled = VALUES(scheduling_changes_enabled)`,
    [
      Number(agencyId),
      Number(clientId),
      gid,
      JSON.stringify(channels),
      body.reminderLead != null ? JSON.stringify(body.reminderLead) : null,
      body.optionalRemindersEnabled !== false ? 1 : 0,
      body.confirmationRequestsEnabled !== false ? 1 : 0,
      body.providerPushedUpdatesEnabled !== false ? 1 : 0,
      body.schedulingChangesEnabled !== false ? 1 : 0
    ]
  );
  // A guardian-specific choice must not rewrite another recipient's preferences.
  if (!gid) try {
    await pool.execute(
      `UPDATE clients SET
         session_email_opt_in = ?,
         session_sms_opt_in = ?,
         session_phone_opt_in = ?
       WHERE id = ? AND agency_id = ?`,
      [
        channels.email === false ? 0 : 1,
        channels.sms === true ? 1 : 0,
        channels.phone === true ? 1 : 0,
        Number(clientId), Number(agencyId)
      ]
    );
  } catch { /* columns may not exist until migration */ }
  const { refreshClientSessionNotifications } = await import('./sessionPreferenceSchedule.service.js');
  await refreshClientSessionNotifications(Number(agencyId), Number(clientId), guardianUserId);
  return getClientPreferences(agencyId, clientId, guardianUserId);
}

export async function loadClientConsent(clientId, agencyId, recipientGuardianUserId = null) {
  if (!clientId) return { email: true, sms: false, phone: false };
  try {
    const [rows] = await pool.execute(
      `SELECT c.session_email_opt_in,c.session_sms_opt_in,c.session_phone_opt_in,
              c.email,c.contact_phone AS phone,c.status,s.status_key AS client_status_key,s.label AS client_status_label
       FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id
       WHERE c.id=? AND c.agency_id=? LIMIT 1`,
      [Number(clientId), Number(agencyId)]
    );
    const c = rows?.[0];
    if (!c || c.status==='ARCHIVED' || hasTerminalClientStatus(c)) return { email: false, sms: false, phone: false, emailAddress: null, phoneNumber: null };
    const guardians = await ClientGuardian.listForClient(clientId);
    const recipientGuardian = recipientGuardianUserId ? guardians.find(g => Number(g.guardian_user_id) === Number(recipientGuardianUserId) && Number(g.access_enabled) === 1) : null;
    if (recipientGuardianUserId && !recipientGuardian) return { email:false, sms:false, phone:false };
    const cp = await latestIntakeCommunicationChoices(clientId, agencyId, recipientGuardianUserId);
    const signed = cp?.version === INTAKE_COMMUNICATION_VERSION && cp?.signatureAccepted && cp?.signedAt;
    const phoneNumber = (recipientGuardianUserId ? recipientGuardian.phone : c.phone || c.guardian_phone) || (signed ? cp.recipientPhone : null) || null;
    const recorded = await recordedReminderConsent(agencyId, phoneNumber, {clientId,recipientUserId:recipientGuardianUserId || undefined,requireActive:true});
    const declinedAt = cp?.signedAt || cp?.submittedAt;
    const laterReviewedConsent = recorded && declinedAt && Date.parse(recorded.collectedAt) > new Date(declinedAt).getTime();
    const matchingGuardians = guardians.filter(g => Number(g.access_enabled) === 1 && PhoneNumber.normalizePhone(g.phone)
      && PhoneNumber.normalizePhone(g.phone) === PhoneNumber.normalizePhone(phoneNumber));
    const emailAddress = signed && cp.recipientEmail ? cp.recipientEmail : recipientGuardianUserId ? recipientGuardian.email : c.email || c.guardian_email || null;
    const {latestFamilyEmailSchedulingChoice}=await import('./familyNotificationChoices.service.js');
    const emailChoice=await latestFamilyEmailSchedulingChoice({agencyId,clientId,to:emailAddress,after:cp?.signedAt||cp?.submittedAt});
    const guardianUserId = recipientGuardianUserId || emailChoice?.guardianUserId || (signed ? cp.guardianUserId : null) || (matchingGuardians.length === 1 ? matchingGuardians[0].guardian_user_id : null);
    return {
      guardianUserId,
      intakeChoice: cp?.smsPreference || null,
      email: emailChoice ? emailChoice.email : cp?.emailPreference === 'no' ? false : recipientGuardianUserId && cp?.emailPreference ? true : c.session_email_opt_in == null ? true : Number(c.session_email_opt_in) === 1,
      sms: !!recorded && (cp?.smsPreference !== 'no' || !!laterReviewedConsent),
      phone: Number(c.session_phone_opt_in) === 1,
      emailAddress,
      phoneNumber
    };
  } catch {
    // A failed consent lookup cannot be treated as permission to email a family.
    return { email: false, sms: false, phone: false };
  }
}

async function affiliatedRecipientAllowsChannel(appt, clientId, contact, channel) {
  if (Number(contact.agency_id) !== Number(appt.agencyId) || Number(contact.client_id) !== Number(clientId)) return false;
  if (channel === 'sms' && (contact.sms_consent_status !== 'opted_in' || !contact.sms_opt_in || contact.sms_consent_phone_hash !== contactReminderPhoneHash(contact.contact_phone))) return false;
  const guardians = await ClientGuardian.listForClient(clientId);
  const matches = guardians.filter(g => channel === 'sms'
    ? PhoneNumber.normalizePhone(g.phone) && PhoneNumber.normalizePhone(g.phone) === PhoneNumber.normalizePhone(contact.contact_phone)
    : g.email && String(g.email).toLowerCase() === String(contact.contact_email || '').toLowerCase());
  for (const guardian of matches) {
    const prefs = await getClientPreferences(appt.agencyId, clientId, guardian.guardian_user_id);
    if (!prefs.isDefault && prefs.channels?.[channel] === false) return false;
  }
  return true;
}

/**
 * Build the effective delivery plan for an appointment (confirmation + reminders).
 */
export async function buildDeliveryPlan(appointmentId, options = {}) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment || appointment.productOrigin === 'auricwell_ehr') return { appointment, deliveries: [] };
  const participants = await Appointment.listParticipants(appointmentId);
  const clientId = participants.find(p => p.clientId)?.clientId;
  if (!clientId) return buildRecipientDeliveryPlan(appointmentId, null, null, null, options);
  const family = await appointmentFamilyRecipients(clientId, appointment.agencyId);
  let plan = family.hasRelationships ? { appointment, deliveries: [] } : await buildRecipientDeliveryPlan(appointmentId, null, null, null, options);
  const seen = new Set(plan.deliveries.map(delivery => JSON.stringify([delivery.kind, delivery.channel, delivery.channel === 'sms' ? PhoneNumber.normalizePhone(plan.consent?.phoneNumber) : String(plan.consent?.emailAddress || '').toLowerCase(), delivery.offsetMinutes, delivery.ruleKey, delivery.sendImmediately])));
  for (const recipient of family.recipients) {
    const own = await buildRecipientDeliveryPlan(appointmentId, recipient.userId, clientId, null, options);
    plan = { ...own, deliveries: [...plan.deliveries, ...own.deliveries.filter(delivery => {
      const address = delivery.channel === 'sms' ? PhoneNumber.normalizePhone(own.consent.phoneNumber)
        : delivery.channel === 'email' ? String(own.consent.emailAddress || '').toLowerCase() : `portal:${recipient.userId}`;
      const key = JSON.stringify([delivery.kind, delivery.channel, address, delivery.offsetMinutes, delivery.ruleKey, delivery.sendImmediately]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(delivery => ({ ...delivery,
      recipientGuardianUserId: recipient.userId, recipientClientId: clientId }))] };
  }
  const { default: Affiliations } = await import('../models/ClientContactAffiliation.model.js');
  const contacts = await Affiliations.listReminderRecipientsForClient(clientId);
  for (const contact of contacts) {
    if (Number(contact.agency_id) !== Number(appointment.agencyId)) continue;
    const own = await buildRecipientDeliveryPlan(appointmentId, null, clientId, contact, options);
    plan = { ...own, deliveries: [...plan.deliveries, ...own.deliveries.filter(delivery => {
      const address = delivery.channel === 'sms' ? PhoneNumber.normalizePhone(contact.contact_phone) : String(contact.contact_email || '').toLowerCase();
      const key = JSON.stringify([delivery.kind, delivery.channel, address, delivery.offsetMinutes, delivery.ruleKey, delivery.sendImmediately]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(delivery => ({ ...delivery, requiresConfirmation: false, messageBody: null,
      recipientAffiliationId: contact.affiliation_id, recipientClientId: clientId }))] };
  }
  plan.deliveries = plan.deliveries.map(delivery => ({ ...delivery, recipientClientId: clientId }));
  return plan;
}

async function buildRecipientDeliveryPlan(appointmentId, recipientGuardianUserId = null, recipientClientId = null, contact = null, { manual = false } = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) return { appointment: null, deliveries: [] };
  if (appt.productOrigin === 'auricwell_ehr') return { appointment: appt, deliveries: [] };
  if (sessionRsvpState(appt) === 'declined') return { appointment: appt, deliveries: [] };
  const tenant = await getTenantSettings(appt.agencyId);
  const platform = tenant.platform || (await getPlatformSettings());
  const effectiveChannels = resolveEffectiveChannels(platform, tenant.channelsEnabled);
  const participants = await Appointment.listParticipants(appt.id);
  const clientId = recipientClientId || participants.find((p) => p.clientId)?.clientId || null;
  if(await serviceNotificationBlocked({appointment:appt,clientId}))return {appointment:appt,deliveries:[]};
  const consent = contact ? {
    email: !!contact.email_reminders_enabled && !!contact.contact_email,
    sms: !!contact.sms_reminders_enabled && !!contact.sms_opt_in && contact.sms_consent_status === 'opted_in' && contact.sms_consent_phone_hash === contactReminderPhoneHash(contact.contact_phone),
    phone: false, emailAddress: contact.contact_email, phoneNumber: contact.contact_phone
  } : await loadClientConsent(clientId, appt.agencyId, recipientGuardianUserId);
  const prefs = !contact && clientId ? await getClientPreferences(appt.agencyId, clientId, consent.guardianUserId) : null;
  const start = parseStartAt(appt.startAt);
  const serviceSetting = await resolveAppointmentServiceSetting(appt);
  const deliveries = [];
  const contactChannels = contact ? Object.fromEntries(await Promise.all(['email','sms'].map(async channel =>
    [channel, await affiliatedRecipientAllowsChannel(appt, clientId, contact, channel)]))) : null;

  const canUseChannel = (channel) => {
    const ch = String(channel || '').toLowerCase();
    if(manual && prefs?.optionalRemindersEnabled === false) return false;
    if (contact && !['email', 'sms'].includes(ch)) return false;
    if(ch === 'in_app' && !recipientGuardianUserId) return false;
    if (contactChannels && !contactChannels[ch]) return false;
    if (!effectiveChannels[ch] || participants.find(p => p.clientId === clientId)?.receivesReminders === false) return false;
    // A configured minimum never overrides a recipient's channel choice.
    if (!prefs?.isDefault && prefs?.channels && prefs.channels[ch] === false) return false;
    if (ch === 'sms' && !consent.sms) return false;
    if (ch === 'phone' && !consent.phone) return false;
    if (ch === 'email' && consent.email === false) return false;
    return true;
  };

  if (manual) return { appointment: appt, start, clientId, prefs, consent, effectiveChannels,
    deliveries: ['email', 'sms', 'in_app'].filter(channel => canUseChannel(channel) && (channel !== 'in_app' || consent.guardianUserId || recipientGuardianUserId))
      .map(channel => ({ kind: 'additional_reminder', ruleKey: 'manual_extra', channel, offsetMinutes: 0,
        recipientRole: 'client', requiresConfirmation: !serviceSetting.isSchool && sessionRsvpState(appt) === 'unanswered', isRequired: false })) };

  // School visits have a single morning notice per opted-in channel, independent
  // of platform floors, booking confirmations or optional office cadences.
  if (serviceSetting.isSchool) {
    const window = schoolAppointmentReminderWindow(appt);
    return { appointment: appt, start, clientId, prefs, consent, effectiveChannels,
      deliveries: window ? ['email', 'sms'].filter(canUseChannel).map(channel => ({
        kind: 'standard_reminder', ruleKey: 'school_morning', channel,
        offsetMinutes: window.offsetMinutes, recipientRole: 'client',
        requiresConfirmation: false, isRequired: true, messageBody: buildSchoolReminder(appt)
      })) : [] };
  }

  // Explicit platform requirements apply to organization defaults. Personal/custom
  // reminder selections are complete schedules rather than additions.
  for (const rule of appt.notificationMode === 'customizable' ? [] : platform.minRules || []) {
    const channel = rule.channel || 'email';
    if (!canUseChannel(channel, { required: true })) continue;
    if (channel === 'sms' && !consent.sms) continue;
    if (channel === 'phone' && !consent.phone) continue;
    const mins = offsetToMinutes(rule.offsetValue, rule.offsetUnit);
    deliveries.push({
      kind: rule.kind || 'standard_reminder',
      ruleKey: `platform:${rule.label || mins}`,
      channel,
      offsetMinutes: mins,
      recipientRole: 'client',
      requiresConfirmation: rule.askConfirmation !== false,
      isRequired: true,
      templateKey: rule.templateKey || null,
      messageBody: rule.message || null
    });
  }

  // Booking confirmation
  const conf = tenant.bookingConfirmation || {};
  if (conf.enabled && prefs?.confirmationRequestsEnabled !== false) {
    for (const channel of conf.channels || ['email']) {
      if (!canUseChannel(channel)) continue;
      const ask = conf.requireResponse !== false;
      deliveries.push({
        kind: 'confirmation',
        ruleKey: 'booking_confirmation',
        channel,
        offsetMinutes: 0, // send soon after book
        recipientRole: 'client',
        requiresConfirmation: ask,
        isRequired: false,
        templateKey: conf.templateKey || 'booking_confirmation',
        messageBody: conf.message || buildConfirmationMessage({
          title: appt.title,
          when: sessionReminderTime(appt)
        }),
        sendImmediately: true
      });
    }
  }

  const custom = appt.notificationMode === 'customizable';
  const rules = custom ? await readAppointmentNotificationRules(appt.id, appt.agencyId)
    : tenant.reminderRules || organizationReminderRules(tenant);
  if (prefs?.optionalRemindersEnabled !== false) for (const rule of rules) {
    for (const channel of rule.channels || [rule.channel]) {
      if (!canUseChannel(channel) || (channel === 'in_app' && !consent.guardianUserId && !recipientGuardianUserId)) continue;
      const ask = rule.askConfirmation !== false && prefs?.confirmationRequestsEnabled !== false;
      deliveries.push({ kind: 'standard_reminder', ruleKey: `${custom ? 'appointment_custom' : 'organization'}:${rule.id}`,
        channel, offsetMinutes: rule.offsetMinutes, recipientRole: 'client', requiresConfirmation: ask,
        isRequired: false, messageBody: rule.message || null });
    }
  }
  const unique = dedupeSessionReminders(deliveries);

  return {
    appointment: appt,
    start,
    clientId,
    prefs,
    consent,
    effectiveChannels,
    deliveries: unique
  };
}

export async function scheduleSessionNotifications(appointmentId, { replace = true } = {}) {
  return withSessionSchedulingLock(appointmentId, () => scheduleSessionNotificationsUnlocked(appointmentId, { replace }));
}

async function scheduleSessionNotificationsUnlocked(appointmentId, { replace = true } = {}) {
  const plan = await buildDeliveryPlan(appointmentId);
  if (!plan.appointment) return [];
  if (replace) await cancelPendingReminders(appointmentId, { preserveManual: sessionRsvpState(plan.appointment)!=='declined' });
  if (!plan.start) return [];
  const [storedRows] = await pool.execute('SELECT * FROM appointment_reminders WHERE appointment_id=?', [appointmentId]);
  const existing = Array.isArray(storedRows) ? storedRows : [];

  const created = [];
  for (const d of plan.deliveries) {
    // Booking and edit confirmations use the shared schedule-change buffer.
    if (d.kind === 'confirmation') continue;
    let when;
    if (d.sendImmediately || d.kind === 'confirmation') {
      when = new Date(Date.now() + 30 * 1000); // ~30s buffer after book
    } else {
      when = new Date(plan.start.getTime() - d.offsetMinutes * 60 * 1000);
    }
    if (d.ruleKey === 'school_morning') {
      const window = schoolAppointmentReminderWindow(plan.appointment);
      if (!window || Date.now() >= +window.deadline) continue;
      if (+when < Date.now()) when = new Date(Date.now() + 30 * 1000);
    }
    if (when.getTime() <= Date.now() - 60 * 1000 && d.kind !== 'confirmation') continue;
    const scheduledFor = toMysqlDateTime(when);
    if (existing.some(row => row.status !== 'canceled' && row.channel === (d.channel === 'in_app' ? 'email' : d.channel)
      && String(row.kind || '').includes(':in_app') === (d.channel === 'in_app')
      && utcMysqlToIso(row.scheduled_for) === utcMysqlToIso(scheduledFor)
      && Number(row.recipient_guardian_user_id || 0) === Number(d.recipientGuardianUserId || 0)
      && Number(row.recipient_client_id || 0) === Number(d.recipientClientId || 0)
      && Number(row.recipient_affiliation_id || 0) === Number(d.recipientAffiliationId || 0))) continue;
    try {
      const [result] = await pool.execute(
        `INSERT INTO appointment_reminders
          (appointment_id, agency_id, channel, kind, rule_key, recipient_role,
           requires_confirmation, template_key, is_required, message_body,
           offset_minutes, scheduled_for, recipient_guardian_user_id, recipient_client_id, recipient_affiliation_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          plan.appointment.id,
          plan.appointment.agencyId,
          d.channel === 'in_app' ? 'email' : d.channel, // DB enum may be email|sms|phone; map in_app→email row + flag in kind
          d.kind,
          d.ruleKey,
          d.recipientRole || 'client',
          d.requiresConfirmation ? 1 : 0,
          d.templateKey || null,
          d.isRequired ? 1 : 0,
          d.messageBody || null,
          d.offsetMinutes || 0,
          scheduledFor,
          d.recipientGuardianUserId || null,
          d.recipientClientId || null,
          d.recipientAffiliationId || null
        ]
      );
      // Store in_app as channel via kind prefix when needed
      if (d.channel === 'in_app') {
        await pool.execute(
          `UPDATE appointment_reminders SET kind = ?, message_body = COALESCE(message_body, ?) WHERE id = ?`,
          [`${d.kind}:in_app`, d.messageBody || 'In-app notification', result.insertId]
        );
      }
      created.push({ id: Number(result.insertId), ...d, scheduledFor });
    } catch (e) {
      // Fallback without new columns if migration not applied yet
      if (!d.recipientGuardianUserId && !d.recipientAffiliationId && String(e?.message || '').includes('Unknown column')) {
        const [result] = await pool.execute(
          `INSERT INTO appointment_reminders
            (appointment_id, agency_id, channel, offset_minutes, scheduled_for, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [
            plan.appointment.id,
            plan.appointment.agencyId,
            d.channel === 'in_app' ? 'email' : (d.channel === 'phone' ? 'sms' : d.channel),
            d.offsetMinutes || 0,
            scheduledFor
          ]
        );
        created.push({ id: Number(result.insertId), ...d, scheduledFor });
      } else {
        throw e;
      }
    }
  }

  if (created.length) {
    await logCommunication({
      appointmentId: plan.appointment.id,
      agencyId: plan.appointment.agencyId,
      direction: 'system',
      channel: 'in_app',
      kind: 'reminder',
      bodyPreview: `Scheduled ${created.length} session notification(s)`,
      metadata: { count: created.length, kinds: created.map((c) => c.kind) }
    });
  }
  return created;
}

/**
 * Book Session default cadence foundation (7d → conditional 24h → conditional 4h).
 * Always schedules the 7-day reminder. 24h/4h are scheduled when:
 *  - includeFollowUps is true, OR
 *  - existing interaction_json shows the client opened/confirmed/chose cadence.
 * Confirm replies set appointment status to client_confirmed (see applyConfirmReply).
 * SMS remains TBD / unchanged elsewhere.
 */
export async function scheduleDefaultCadenceReminders(appointmentId, options = {}) {
  return withSessionSchedulingLock(appointmentId, () => scheduleDefaultCadenceRemindersUnlocked(appointmentId, options));
}

async function scheduleDefaultCadenceRemindersUnlocked(appointmentId, { replace = false } = {}) {
  // Bookings, edits, preferences and RSVP replies all use the same persisted plan.
  return scheduleSessionNotificationsUnlocked(appointmentId, { replace });
}

/**
 * Apply a confirm reply: sets appointment to client_confirmed and stamps interaction_json.
 */
export async function applyConfirmReply(appointmentId, {
  channel = 'email',
  reminderId = null,
  interactionPatch = null
} = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  if (appt.productOrigin === 'auricwell_ehr') throw Object.assign(new Error('Manage this appointment in the secure AuricWell practice workspace.'), { status: 409 });

  const serviceSetting = await resolveAppointmentServiceSetting(appt);
  if (serviceSetting.isSchool) return appt;

  await Appointment.update(appointmentId, {
    status: 'client_confirmed',
    updatedByUserId: null
  });

  const interaction = {
    ...(interactionPatch && typeof interactionPatch === 'object' ? interactionPatch : {}),
    confirmed_at: new Date().toISOString(),
    chosen_cadence: interactionPatch?.chosen_cadence || 'confirmed'
  };

  if (reminderId) {
    try {
      await pool.execute(
        `UPDATE appointment_reminders
         SET interaction_json = ?
         WHERE id = ?`,
        [JSON.stringify(interaction), Number(reminderId)]
      );
    } catch {
      /* column may not exist yet */
    }
  }

  await logCommunication({
    appointmentId: appt.id,
    agencyId: appt.agencyId,
    direction: 'inbound',
    channel: channel === 'sms' ? 'sms' : 'email',
    kind: 'confirm_reply',
    bodyPreview: 'Client confirmed session',
    reminderId: reminderId || null,
    metadata: { status: 'client_confirmed', interaction }
  });

  // Preserve the normal follow-ups after confirmation; send-time copy drops RSVP prompts.
  try {
    await scheduleDefaultCadenceReminders(appointmentId, {
      replace: false,
      includeFollowUps: true,
      interaction
    });
  } catch {
    /* best-effort */
  }

  return Appointment.findById(appointmentId);
}


async function sendContactSessionEmail({ contact, appointment, clientId }) {
  if ((await resolveAppointmentServiceSetting(appointment)).isSchool) {
    return sendSessionEmail({ to: contact.contact_email, agencyId: appointment.agencyId,
      clientId, appointment });
  }
  const { sendNotificationEmail } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const text = minimalContactSessionReminder(appointment);
  const result = await sendNotificationEmail({ agencyId: appointment.agencyId, clientId, to: contact.contact_email,
    triggerKey: 'appointment_affiliated_contact_reminder', templateType: 'appointment_affiliated_contact_reminder',
    subject: 'Upcoming appointment reminder', text, html: `<p>${escapeHtml(text)}</p>`, source: 'auto' });
  if (!notificationTransportReceipt(result, appointment.agencyId).accepted) throw new Error('Contact reminder email needs delivery review.');
  return result;
}

async function sendSessionEmail({to,agencyId,clientId,kind='reminder',appointment,text,requiresConfirmation=true,reminderId=null,guardianUserId=null}) {
  const {sendAppointmentEmail}=await import('./appointmentEmailActions.service.js');
  const result=await sendAppointmentEmail({to,clientId,kind,appointment,message:text,requiresConfirmation,reminderId,guardianUserId});
  if(['school_session_email_opted_out','service_ended_notifications_disabled'].includes(result?.reason)) return result;
  if(!result?.id || result.skipped || result.blocked || result.queued || result.pendingApproval) throw new Error('The appointment email was not confirmed as sent.');
  return result;
}

function defaultMessage(appt, kind, requiresConfirmation) {
  if (kind === 'confirmation' || String(kind).startsWith('confirmation')) {
    return buildConfirmationMessage({ title: appt.title, when: sessionReminderTime(appt) });
  }
  return buildReminderMessage({
    title: appt.title,
    when: sessionReminderTime(appt),
    askConfirmation: !!requiresConfirmation
  });
}

async function sendInAppIfPossible(appt, body, recipientUserId, clientId) {
  if (!recipientUserId) throw new Error('No active portal account is available for this reminder.');
    const NotificationDispatcher = (await import('./notificationDispatcher.service.js')).default;
    if (typeof NotificationDispatcher.createNotificationAndDispatch === 'function') {
      await NotificationDispatcher.createNotificationAndDispatch({
        userId: recipientUserId,
        agencyId: appt.agencyId,
        type: 'program_reminder',
        title: 'Session notification',
        message: body,
        relatedEntityType: 'appointment',
        relatedEntityId: appt.id,
        audienceJson: { clientId }
      });
    }
}

async function trackReminderEmail({appointment,row,clientId,to,result}) {
  if(!result?.internetMessageId||result.redirected||result.skipped||result.blocked)return;
  try { const {recordSessionReminderEmail}=await import('./sessionNotificationEmailReplies.service.js');
    await recordSessionReminderEmail({appointment,reminderId:row.id,clientId,guardianUserId:row.recipient_guardian_user_id,
      affiliationId:row.recipient_affiliation_id,to,result});
  } catch(error){console.warn('[session notification] Reply linkage needs review',row.id,error.code||'projection_failed');}
}

async function logReminderCommunication(input) {
  try { await logCommunication(input); }
  catch(error) { console.warn('[session notification] Delivery history projection needs review',input.appointmentId,error.code||'projection_failed'); }
}

/** Drain due appointment_reminders using session notification send rules. */
export async function processDueSessionNotifications({ limit = 50, agencyId = null, includeRelatedQueues = true } = {}) {
  if (agencyId !== null && (!Number.isSafeInteger(agencyId) || agencyId < 1)) throw new Error('A valid notification agency is required');
  await rebuildSessionReminderPolicies({schedule:scheduleSessionNotifications,agencyId,limit:10});
  // Prefer new columns; fall back to Phase 4 processor shape
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT r.* FROM appointment_reminders r
       JOIN agencies a ON a.id = r.agency_id AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0
       WHERE r.status = 'pending' AND r.scheduled_for <= NOW()
         AND (? IS NULL OR r.agency_id = ?)
       ORDER BY r.scheduled_for ASC
       LIMIT ?`,
      [agencyId, agencyId, Math.max(1, Math.min(200, Number(limit) || 50))]
    );
  } catch (e) {
    return { processed: 0, error: e.message };
  }

  const results = { sent: 0, skipped: 0, failed: 0, voiceScaffold: 0 };
  const settingsByAgency=new Map();
  for (const row of rows || []) {
    // Both legacy/manual and scheduled drains use this connection-scoped lock.
    // Recheck under the lock so overlapping workers cannot send the same row.
    const lock = await pool.getConnection();
    let acquired = false;
    let schoolDeliveryLock = null;
    let recipientDeliveryLock = null;
    try {
      const [[result]] = await lock.execute('SELECT GET_LOCK(?, 0) AS acquired', [`session_reminder:${row.id}`]);
      acquired = Number(result?.acquired) === 1;
      if (!acquired) continue;
      const [[current]] = await lock.execute('SELECT status FROM appointment_reminders WHERE id = ?', [row.id]);
      if (current?.status !== 'pending') continue;
      if(row.rule_key!=='manual_extra') {
        const [[policy]]=await pool.execute('SELECT status FROM session_reminder_policy_rebuilds WHERE appointment_id=?',[row.appointment_id]);
        if(policy?.status==='pending') {await rebuildSessionReminderPolicies({schedule:scheduleSessionNotifications,appointmentId:row.appointment_id,agencyId,limit:1});continue;}
        if(policy?.status==='review') {await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='reminder_schedule_needs_review' WHERE id=?",[row.id]);results.skipped++;continue;}
      }
    const appt = await Appointment.findById(row.appointment_id);
    if (appt && Number(row.agency_id) !== Number(appt.agencyId)) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='recipient_agency_mismatch' WHERE id=?",[row.id]);
      results.skipped++; continue;
    }
    if (!appt || appt.productOrigin === 'auricwell_ehr' || sessionRsvpState(appt) === 'declined' || ['completed', 'no_show', 'rescheduled', 'reschedule_requested', 'draft'].includes(appt.status)) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'canceled', skip_reason = 'canceled_appt' WHERE id = ?`,
        [row.id]
      );
      results.skipped += 1;
      continue;
    }

    const serviceSetting = await resolveAppointmentServiceSetting(appt);
    if(!serviceSetting.isSchool && +parseStartAt(appt.startAt)<=Date.now()) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='session_already_started' WHERE id=?",[row.id]);
      results.skipped++;continue;
    }
    if (serviceSetting.isSchool) {
      const window = schoolAppointmentReminderWindow(appt);
      if (!window || Date.now() >= +window.deadline) {
        await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='school_morning_window_ended' WHERE id=?", [row.id]);
        results.skipped++; continue;
      }
      // Old queued booking/24h/4h messages obey the current school policy too.
      if (Date.now() < +window.scheduledAt) {
        await pool.execute(`UPDATE appointment_reminders SET scheduled_for=?,offset_minutes=?,
          kind='standard_reminder',rule_key='school_morning',requires_confirmation=0,message_body=? WHERE id=?`,
        [toMysqlDateTime(window.scheduledAt), window.offsetMinutes, buildSchoolReminder(appt), row.id]);
        continue;
      }
      // Rows from old cadences may overlap. Serialize the recipient/channel and
      // check sent history, rather than only protecting one reminder row.
      const recipient = `${row.recipient_client_id || 'legacy'}:${row.recipient_guardian_user_id || 0}:${row.recipient_affiliation_id || 0}`;
      schoolDeliveryLock = `school-reminder:${createHash('sha256').update(`${appt.id}:${row.channel}:${recipient}`).digest('hex').slice(0, 40)}`;
      const [[deliveryLock]] = await lock.execute('SELECT GET_LOCK(?, 0) AS acquired', [schoolDeliveryLock]);
      if (Number(deliveryLock?.acquired) !== 1) { schoolDeliveryLock = null; continue; }
      const [sent] = await pool.execute(`SELECT id FROM appointment_reminders
        WHERE appointment_id=? AND channel=? AND status='sent'
          AND recipient_client_id <=> ? AND recipient_guardian_user_id <=> ? AND recipient_affiliation_id <=> ?
          AND sent_at >= ? LIMIT 1`,
      [appt.id, row.channel, row.recipient_client_id || null, row.recipient_guardian_user_id || null, row.recipient_affiliation_id || null,
        toMysqlDateTime(window.dayStart)]);
      if (sent.length) {
        await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='school_morning_already_sent' WHERE id=?", [row.id]);
        results.skipped++; continue;
      }
    }

    const [pendingUpdates] = await pool.execute("SELECT id FROM appointment_schedule_notices WHERE appointment_id=? AND status IN ('pending','sending') LIMIT 1", [appt.id]);
    if (pendingUpdates.length) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='schedule_update_pending' WHERE id=?",[row.id]);
      results.skipped++; continue;
    }
    const participants = await Appointment.listParticipants(appt.id);
    const clientId = row.recipient_client_id || participants.find(p => p.clientId)?.clientId || null;
    if(!settingsByAgency.has(appt.agencyId))settingsByAgency.set(appt.agencyId,await getTenantSettings(appt.agencyId));
    const currentSettings=settingsByAgency.get(appt.agencyId);
    const currentChannel=String(row.kind||'').includes(':in_app')?'in_app':row.channel;
    if(!resolveEffectiveChannels(currentSettings.platform,currentSettings.channelsEnabled)[currentChannel]) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='organization_channel_disabled' WHERE id=?",[row.id]);results.skipped++;continue;
    }
    if(await serviceNotificationBlocked({appointment:appt,clientId})){
      await pool.execute("UPDATE appointment_reminders SET status='canceled',skip_reason='service_ended' WHERE id=?",[row.id]);
      results.skipped++;continue;
    }
    if (row.recipient_client_id && !participants.some(p => Number(p.clientId) === Number(clientId))) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='recipient_unlinked' WHERE id=?",[row.id]);results.skipped++;continue;
    }
    if (!serviceSetting.isSchool) {
      recipientDeliveryLock = `session-recipient:${createHash('sha256').update(`${appt.id}:${clientId || 0}:${row.recipient_guardian_user_id || 0}:${row.recipient_affiliation_id || 0}`).digest('hex').slice(0, 40)}`;
      const [[deliveryLock]] = await lock.execute('SELECT GET_LOCK(?, 0) AS acquired', [recipientDeliveryLock]);
      if (Number(deliveryLock?.acquired) !== 1) { recipientDeliveryLock = null; continue; }
      if (row.rule_key !== 'manual_extra') {
        const [recent] = await pool.execute(`SELECT sent_at FROM appointment_reminders WHERE appointment_id=? AND status='sent'
          AND recipient_guardian_user_id <=> ? AND recipient_client_id <=> ? AND recipient_affiliation_id <=> ?
          AND NOT (scheduled_for <=> ? AND offset_minutes <=> ?) ORDER BY sent_at DESC LIMIT 1`,
        [appt.id, row.recipient_guardian_user_id || null, row.recipient_client_id || null, row.recipient_affiliation_id || null, row.scheduled_for, row.offset_minutes]);
        if (!scheduledReminderSpacing({startAt:appt.startAt,lastSentAt:recent?.[0]?.sent_at}).allowed) {
          await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='within_24_hours_of_previous_reminder' WHERE id=?",[row.id]);
          results.skipped++; continue;
        }
      }
    }
    if (row.recipient_affiliation_id) {
      const { default: Affiliations } = await import('../models/ClientContactAffiliation.model.js');
      const contacts = await Affiliations.listReminderRecipientsForClient(clientId);
      const contact = contacts.find(c => Number(c.affiliation_id) === Number(row.recipient_affiliation_id));
      if (!contact || participants.find(p => Number(p.clientId) === Number(clientId))?.receivesReminders === false
          || !await affiliatedRecipientAllowsChannel(appt, clientId, contact, row.channel)) {
        await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='contact_access_removed' WHERE id=?", [row.id]);
        results.skipped++; continue;
      }
      const text = serviceSetting.isSchool ? `${schoolAppointmentReminderText} Please contact the account guardian if plans change.`
        : minimalContactSessionReminder(appt);
      try {
        const notificationCategory = serviceSetting.isSchool ? 'school_sessions' : 'appointments';
        const { familyNotificationDeliveryGate } = await import('./familyNotificationChoices.service.js');
        const gate = await familyNotificationDeliveryGate({ agencyId: appt.agencyId, clientId, channel: row.channel,
          to: row.channel === 'sms' ? contact.contact_phone : contact.contact_email, notificationCategory });
        if (!gate.allowed) {
          await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='contact_category_off' WHERE id=?", [row.id]);
          results.skipped++; continue;
        }
        let receipt;
        if (row.channel === 'email' && contact.email_reminders_enabled && contact.contact_email) {
          receipt = await sendContactSessionEmail({ contact, appointment: appt, clientId });
        } else if (row.channel === 'sms' && contact.sms_reminders_enabled && contact.sms_opt_in && contact.sms_consent_status === 'opted_in') {
          const from = await resolveRegisteredSmsSender({ agencyId: appt.agencyId, purpose: 'reminders' });
          if (from && contact.contact_phone) receipt = await VonageService.sendSms({ purpose: 'reminders', agencyId: appt.agencyId, clientId,
            to: PhoneNumber.normalizePhone(contact.contact_phone), from, body: text, notificationCategory });
        }
        if (!receipt || !notificationTransportReceipt(receipt, appt.agencyId).accepted) {
          await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='contact_channel_unavailable' WHERE id=?", [row.id]);
          results.skipped++; continue;
        }
        if(row.channel==='email')await trackReminderEmail({appointment:appt,row,clientId,to:contact.contact_email,result:receipt});
        await pool.execute("UPDATE appointment_reminders SET status='sent',sent_at=NOW(),message_body=? WHERE id=?", [text,row.id]);
        await logReminderCommunication({ appointmentId: appt.id, agencyId: appt.agencyId, channel: row.channel, kind: 'reminder', reminderId: row.id,
          bodyPreview: text, metadata: { recipientRole: 'contact', affiliationId: contact.affiliation_id, deliveryStatus: 'sent',bodyRendered:true,
            recipient: row.channel === 'sms' ? contact.contact_phone : contact.contact_email } });
        results.sent++;
      } catch (error) {
        await pool.execute("UPDATE appointment_reminders SET status='failed',error_message=? WHERE id=?", [String(error?.message || 'Contact reminder failed').slice(0,500), row.id]);
        results.failed++;
      }
      continue;
    }
    const family = clientId ? await appointmentFamilyRecipients(clientId, appt.agencyId) : {hasRelationships:false,recipients:[]};
    if (!row.recipient_guardian_user_id && (family.hasRelationships || !row.recipient_client_id) && ['sms','email'].includes(row.channel) && !String(row.kind).includes('in_app')) {
      const { default: Affiliations } = await import('../models/ClientContactAffiliation.model.js');
      const contacts = await Affiliations.listReminderRecipientsForClient(clientId);
      const destinations = new Set();
      for (const contact of contacts) {
        const destination = row.channel === 'sms' ? PhoneNumber.normalizePhone(contact.contact_phone) : String(contact.contact_email || '').toLowerCase();
        if (!destination || !await affiliatedRecipientAllowsChannel(appt, clientId, contact, row.channel)
            || (row.channel === 'email' ? !contact.email_reminders_enabled : !contact.sms_reminders_enabled)) continue;
        if (destinations.has(destination)) continue;
        destinations.add(destination);
        await pool.execute(`INSERT IGNORE INTO appointment_reminders
          (appointment_id,agency_id,channel,kind,rule_key,recipient_role,requires_confirmation,
           offset_minutes,scheduled_for,status,recipient_client_id,recipient_affiliation_id,parent_reminder_id)
          VALUES (?,?,?,?,?,'client',0,?,?,'pending',?,?,?)`,
          [appt.id,appt.agencyId,row.channel,row.kind||'reminder',row.rule_key||null,row.offset_minutes||0,row.scheduled_for,clientId,contact.affiliation_id,row.id]);
      }
      for (const recipient of family.recipients) {
        const contact = await loadClientConsent(clientId,appt.agencyId,recipient.userId);
        const destination = row.channel === 'sms' ? PhoneNumber.normalizePhone(contact.phoneNumber) : String(contact.emailAddress || '').toLowerCase();
        if (contact[row.channel] && destination && destinations.has(destination)) continue;
        if (contact[row.channel] && destination) destinations.add(destination);
        await pool.execute(`INSERT IGNORE INTO appointment_reminders
        (appointment_id,agency_id,channel,kind,rule_key,recipient_role,requires_confirmation,template_key,is_required,message_body,
         offset_minutes,scheduled_for,status,recipient_guardian_user_id,recipient_client_id,parent_reminder_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`,
        [appt.id,appt.agencyId,row.channel,row.kind||'reminder',row.rule_key||null,'guardian',row.requires_confirmation||0,
          row.template_key||null,row.is_required||0,row.message_body||null,row.offset_minutes||0,row.scheduled_for,recipient.userId,clientId,row.id]);
      }
      if (family.hasRelationships) {
        await pool.execute("UPDATE appointment_reminders SET status='canceled',skip_reason='expanded_guardian_recipients' WHERE id=?",[row.id]);continue;
      }
    }
    if (row.recipient_guardian_user_id && !family.recipients.some(r => r.userId === Number(row.recipient_guardian_user_id))) {
      await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='guardian_access_removed' WHERE id=?",[row.id]);results.skipped++;continue;
    }
    const consent = await loadClientConsent(clientId, appt.agencyId, row.recipient_guardian_user_id || null);
    const kind = String(row.kind || 'reminder');
    const isInApp = kind.includes(':in_app') || kind.endsWith('in_app');
    let channel = String(row.channel || 'email');
    if (isInApp) channel = 'in_app';

    const askConfirmation = !serviceSetting.isSchool && sessionRsvpState(appt) !== 'confirmed' && !!row.requires_confirmation;
    const body = serviceSetting.isSchool ? buildSchoolReminder(appt) : sessionReminderMessage({appointment:appt,
      when:sessionReminderTime(appt),requiresConfirmation:askConfirmation,
      message:formatQueuedSessionMessage(appt,row.message_body),nearSession:+parseStartAt(appt.startAt)-Date.now()<=5*3600000});
    const contactBody = minimalContactSessionReminder(appt);
    const prefs = clientId ? await getClientPreferences(appt.agencyId, clientId, consent.guardianUserId) : null;
    const participant = participants.find((p) => p.clientId === clientId);
    const optedOut = participant?.receivesReminders === false || (!prefs?.isDefault && prefs?.channels?.[channel] === false)
      || (channel === 'email' && !consent.email)
      || (!row.is_required && prefs?.optionalRemindersEnabled === false && kind.includes('reminder'))
      || (!serviceSetting.isSchool && kind.startsWith('confirmation') && prefs?.confirmationRequestsEnabled === false);
    if (optedOut) {
      await pool.execute("UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'recipient_opted_out' WHERE id = ?", [row.id]);
      results.skipped += 1;
      continue;
    }

    if (channel === 'phone') {
      // Voice scaffold — do not place real calls yet
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'voice_not_configured' WHERE id = ?`,
        [row.id]
      );
      await logReminderCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'phone',
        kind: 'reminder',
        bodyPreview: 'Automated phone call skipped — voice dialer not configured',
        reminderId: row.id,
          metadata: { deliveryStatus: 'skipped', reason: 'Voice reminders are not configured.', guardianUserId: row.recipient_guardian_user_id || null }
      });
      results.voiceScaffold += 1;
      results.skipped += 1;
      continue;
    }

    if (channel === 'in_app') {
      if(!row.recipient_guardian_user_id) {
        await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason='no_portal_recipient' WHERE id=?",[row.id]);results.skipped++;continue;
      }
      const appBody=askConfirmation ? body.replace('Reply Y to confirm, N to cancel, R to request a reschedule.','Open this appointment in your portal to confirm, cancel, or request a new time.') : body;
      await sendInAppIfPossible(appt, appBody, row.recipient_guardian_user_id, clientId);
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW(),message_body=? WHERE id = ?`,
        [appBody,row.id]
      );
      await logReminderCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'in_app',
        kind: kind.startsWith('confirmation') ? 'reminder' : 'reminder',
        bodyPreview: appBody.slice(0, 500),
        reminderId: row.id,
          metadata: { deliveryStatus: 'sent', bodyRendered:true, guardianUserId: row.recipient_guardian_user_id || null, recipient: channel === 'sms' ? consent.phoneNumber : consent.emailAddress }
      });
      results.sent += 1;
      continue;
    }

    if (channel === 'sms') {
      if (!consent.sms || !consent.phoneNumber) {
        await pool.execute(
          `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_consent' WHERE id = ?`,
          [row.id]
        );
        results.skipped += 1;
        continue;
      }
      try {
        const toPhoneNorm = PhoneNumber.normalizePhone(consent.phoneNumber);
        const from = await resolveRegisteredSmsSender({ agencyId: appt.agencyId, purpose: 'reminders' });
        if (!from) {
          await pool.execute(
            `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_from_number' WHERE id = ?`,
            [row.id]
          );
          results.skipped += 1;
          continue;
        }
        const sent = await VonageService.sendSms({ purpose: 'reminders', agencyId: appt.agencyId, clientId, notificationCategory: serviceSetting.isSchool ? 'school_sessions' : 'appointments', to: toPhoneNorm, from, body: body.slice(0, 480) });
        if (!(sent?.id || sent?.sid || sent?.messageId || sent?.messageUuid || sent?.messageUUID) || sent?.skipped || sent?.blocked || sent?.queued || sent?.pendingApproval) throw new Error(sent?.reason || 'Text delivery was not accepted; review before resending.');
        await pool.execute(
          `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW(),message_body=? WHERE id = ?`,
          [body.slice(0,480),row.id]
        );
        await logReminderCommunication({
          appointmentId: appt.id,
          agencyId: appt.agencyId,
          channel: 'sms',
          kind: 'reminder',
          bodyPreview: body.slice(0, 500),
          reminderId: row.id,
          metadata: { deliveryStatus: 'sent', bodyRendered:true, guardianUserId: row.recipient_guardian_user_id || null, recipient: channel === 'sms' ? consent.phoneNumber : consent.emailAddress }
        });
        results.sent += 1;
      } catch (e) {
        await pool.execute(
          `UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ?`,
          [String(e?.message || 'sms failed').slice(0, 500), row.id]
        );
        results.failed += 1;
      }
      continue;
    }

    // email default
    if (!consent.emailAddress || !consent.email) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_recipient' WHERE id = ?`,
        [row.id]
      );
      results.skipped += 1;
      continue;
    }
    try {
      let emailSent=false,emailSkipReason='school_session_email_opted_out';
      if (consent.emailAddress) {
        const delivery=await sendSessionEmail({
          to: consent.emailAddress,
          appointment: appt,
          subject: serviceSetting.isSchool ? 'School session notice' : kind.startsWith('confirmation') ? 'Please confirm your session' : 'Session reminder',
          text: body,
          html: `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>`,
          agencyId: appt.agencyId || null,
          clientId: clientId || null,
          kind,
          requiresConfirmation: askConfirmation, reminderId: row.id, guardianUserId: row.recipient_guardian_user_id || null
        });
        emailSent=!delivery?.skipped;
        if(emailSent)await trackReminderEmail({appointment:appt,row,clientId,to:consent.emailAddress,result:delivery});
        if(delivery?.reason)emailSkipReason=delivery.reason;
      }
      if(emailSent) {
      await pool.execute("UPDATE appointment_reminders SET status='sent',sent_at=NOW(),message_body=? WHERE id=?",[body,row.id]);
      await logReminderCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'email',
        kind: 'reminder',
        bodyPreview: body.slice(0, 500),
        reminderId: row.id,
          metadata: { deliveryStatus: 'sent', bodyRendered:true, guardianUserId: row.recipient_guardian_user_id || null, recipient: channel === 'sms' ? consent.phoneNumber : consent.emailAddress }
      });
      }

      if(emailSent) {
        results.sent += 1;
      } else {
        await pool.execute("UPDATE appointment_reminders SET status='skipped',skip_reason=? WHERE id=?",[emailSkipReason,row.id]);
        results.skipped += 1;
      }
    } catch (e) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(e?.message || 'email failed').slice(0, 500), row.id]
      );
      results.failed += 1;
    }
    } catch (error) {
      await pool.execute("UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ? AND status = 'pending'",
        [String(error?.message || 'Reminder could not be processed').slice(0, 500), row.id]);
      results.failed += 1;
    } finally {
      try {
        if (schoolDeliveryLock) await lock.execute('SELECT RELEASE_LOCK(?)', [schoolDeliveryLock]);
        if (recipientDeliveryLock) await lock.execute('SELECT RELEASE_LOCK(?)', [recipientDeliveryLock]);
        if (acquired) await lock.execute('SELECT RELEASE_LOCK(?)', [`session_reminder:${row.id}`]);
      }
      finally { lock.release(); }
    }
  }

  if(!includeRelatedQueues)return results;
  // Also drain change buffer
  const bufferResult = await processDueChangeNotifications({ limit: 20, agencyId });
  const { processDueCancellationNotifications } = await import('./appointmentCancellationNotification.service.js');
  const cancellations = await processDueCancellationNotifications({ limit: 20, agencyId });
  let replacementBookings;
  try { replacementBookings = await (await import('./appointmentReplacementOffer.service.js')).replacementOffers.processBookings({limit:20, agencyId}); }
  catch (e) { replacementBookings = {failed:1}; console.warn('[replacement-offers] Automatic booking retry needs attention:',e.message); }
  const scheduleUpdates = await (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.processDue({ limit: 20, agencyId });
  let plannedOutCancellations;
  try { plannedOutCancellations = await (await import('./plannedOutCancellation.service.js')).processPlannedOutCancellations({ agencyId,limit:10 }); }
  catch (e) { plannedOutCancellations = { failed:1 }; console.warn('[planned-out] Cancellation processing needs attention:',e.message); }
  let replacementOutcomes;
  try { replacementOutcomes = await (await import('./replacementOfferEvents.service.js')).replacementOfferEvents.processDue({ limit: 20, agencyId }); }
  catch (e) { replacementOutcomes = { failed: 1 }; console.warn('[replacement-offers] Outcome processing needs attention:', e.message); }
  return { ...results, processed: (rows || []).length, changeBuffer: bufferResult, cancellations, scheduleUpdates, plannedOutCancellations, replacementBookings, replacementOutcomes };
}

// ── Provider-pushed buffered updates ─────────────────────────────────────────

const TRACKED_FIELDS = [
  'startAt', 'endAt', 'modality', 'serviceLocationId', 'roomId',
  'providerUserId', 'title', 'notes', 'tenantServiceId'
];

export function diffAppointmentChanges(before = {}, after = {}, actorUserId = null) {
  const changes = [];
  const fieldMap = {
    startAt: 'Time / date (start)',
    endAt: 'End time',
    modality: 'Modality',
    serviceLocationId: 'Service location',
    roomId: 'Room',
    providerUserId: 'Provider',
    title: 'Title',
    notes: 'Session instructions',
    tenantServiceId: 'Service'
  };
  for (const key of TRACKED_FIELDS) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (String(from ?? '') === String(to ?? '')) continue;
    changes.push({
      field: key,
      label: fieldMap[key] || key,
      from,
      to,
      at: new Date().toISOString(),
      actorUserId: actorUserId || null
    });
  }
  return changes;
}

export async function previewPushUpdate(appointmentId, { channels = null } = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  const tenant = await getTenantSettings(appt.agencyId);
  const effectiveChannels = resolveEffectiveChannels(tenant.platform, tenant.channelsEnabled);
  const participants = await Appointment.listParticipants(appt.id);
  const clientId = participants.find((p) => p.clientId)?.clientId || null;
  const consent = await loadClientConsent(clientId, appt.agencyId);
  const prefs = clientId ? await getClientPreferences(appt.agencyId, clientId, consent.guardianUserId) : null;
  const requested = channels || tenant.changeNotify?.channels || ['email'];
  const available = {};
  for (const ch of CHANNELS) {
    available[ch] = !!effectiveChannels[ch];
  }
  const willNotify = [];
  for (const ch of requested) {
    if (!effectiveChannels[ch]) continue;
    { // Recipient choices cannot be disabled by a tenant setting.
      if (prefs?.providerPushedUpdatesEnabled === false) continue;
      if (prefs?.schedulingChangesEnabled === false) continue;
      if (!prefs?.isDefault && prefs?.channels?.[ch] === false) continue;
    }
    if (ch === 'email' && !consent.email) continue;
    if (ch === 'sms' && !consent.sms) continue;
    if (ch === 'phone' && !consent.phone) continue;
    willNotify.push(ch);
  }
  return {
    appointmentId: appt.id,
    clientId,
    providerPushedUpdatesEnabled: prefs?.providerPushedUpdatesEnabled !== false,
    schedulingChangesEnabled: prefs?.schedulingChangesEnabled !== false,
    availableChannels: available,
    willNotifyChannels: willNotify,
    bufferMinutes: Number(tenant.changeNotify?.bufferMinutes || tenant.platform?.defaultBufferMinutes || 15),
    recipients: clientId ? [{ role: 'client', clientId }] : [],
    messagePreview: `Your session "${appt.title || 'Session'}" has been updated. Details will be listed in the notification.`
  };
}

export async function queuePushUpdate(appointmentId, {
  changes = [],
  channels = null,
  messageOverride = null,
  sendImmediately = false,
  actorUserId = null,
  bufferMinutes = null
} = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  if (appt.productOrigin === 'auricwell_ehr') throw Object.assign(new Error('AuricWell notifications remain in its secure practice workspace.'), { status: 409 });
  if (!changes.length) throw Object.assign(new Error('No changes to notify'), { status: 400 });
  // Never send raw diffs (which can include internal notes) to the client.
  const startChange = changes.find(c => c.field === 'startAt');
  await (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.queue(appointmentId, {
    eventType: startChange ? 'moved' : 'updated', before: startChange ? { ...appt, startAt: startChange.from } : appt,
    actorUserId, channels, sendImmediately
  });
  return getPendingPushUpdate(appointmentId);
}

export async function getPendingPushUpdate(appointmentId) {
  const [rows] = await pool.execute("SELECT * FROM appointment_schedule_notices WHERE appointment_id=? AND status='pending' ORDER BY id DESC LIMIT 1", [Number(appointmentId)]);
  const r = rows[0];
  return r ? { id: Number(r.id), appointmentId: Number(r.appointment_id), fireAt: r.fire_at, bufferMinutes: 15,
    status: r.status, changes: [], channels: parseJson(r.channels_json, []), messageOverride: null,
    preview: { messagePreview: 'One update with the final appointment details. Related edits reset the notification delay.' }, createdByUserId: r.created_by_user_id } : null;
}

export async function patchPendingPushUpdate(appointmentId, patch = {}) {
  const pending = await getPendingPushUpdate(appointmentId);
  if (!pending) throw Object.assign(new Error('No pending update'), { status: 404 });
  if (patch.cancel === true || patch.status === 'canceled') {
    await (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.control(Number(appointmentId), {cancel:true});
    return { canceled: true, id: pending.id };
  }
  if (patch.messageOverride != null || patch.channels != null) throw Object.assign(new Error('Schedule notices use the current appointment details and recorded communication preferences. Edit the appointment or contact the client directly.'), { status: 400 });
  if (patch.sendImmediately) {
    await (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.control(Number(appointmentId), {sendImmediately:true});
  } else if (patch.extendBufferMinutes != null || patch.bufferMinutes != null) {
    throw Object.assign(new Error('Schedule updates use a 15-minute quiet window, shortened for appointments starting soon.'), { status: 400 });
  }
  return getPendingPushUpdate(appointmentId);
}

async function processChangeNotificationRow(queueId) {
  const [[row]] = await pool.execute("SELECT * FROM appointment_change_notification_queue WHERE id=? AND status='pending'", [Number(queueId)]);
  if (!row) return;
  const appt = await Appointment.findById(row.appointment_id);
  if (!appt) return;
  const changes = parseJson(row.changes_json, []);
  await queuePushUpdate(appt.id, { changes: changes.length ? changes : [{ field: 'schedule' }], actorUserId: row.created_by_user_id });
}

export async function processDueChangeNotifications({ limit = 20, agencyId = null } = {}) {
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT id FROM appointment_change_notification_queue
       WHERE status = 'pending' AND fire_at <= NOW()
         AND (? IS NULL OR agency_id = ?)
       ORDER BY fire_at ASC
       LIMIT ?`,
      [agencyId, agencyId, Math.max(1, Math.min(50, Number(limit) || 20))]
    );
  } catch {
    return { processed: 0 };
  }
  for (const r of rows || []) {
    try {
      await processChangeNotificationRow(r.id);
    } catch (e) {
      console.warn('[sessionNotification] change drain failed', e?.message);
    }
  }
  return { processed: (rows || []).length };
}

export { interpretReplyIntent };
