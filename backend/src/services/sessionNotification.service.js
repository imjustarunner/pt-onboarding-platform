/**
 * Fully customizable session notification system.
 * Platform floors → tenant channels/rules → client prefs → schedule / buffer / send.
 */

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import EmailService from './email.service.js';
import VonageService from './vonage.service.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { resolveReminderNumber } from './communicationRouting.service.js';
import {
  logCommunication,
  cancelPendingReminders
} from './appointmentReminder.service.js';
import {
  buildReminderMessage,
  buildConfirmationMessage,
  interpretAppointmentReply as interpretReplyIntent
} from './appointmentReply.service.js';

const CHANNELS = ['in_app', 'email', 'sms', 'phone'];

const DEFAULT_PLATFORM = {
  channels: {
    in_app: 'available',
    email: 'available',
    sms: 'consent_required',
    phone: 'disabled'
  },
  minRules: [
    {
      kind: 'standard_reminder',
      offsetValue: 24,
      offsetUnit: 'hours',
      channel: 'email',
      required: true,
      label: 'Platform minimum 24h email'
    }
  ],
  defaultBufferMinutes: 15,
  allowTenantDisable: { in_app: true, email: false, sms: true, phone: true }
};

const DEFAULT_TENANT_CHANNELS = { in_app: true, email: true, sms: false, phone: false };

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
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseStartAt(startAt) {
  if (!startAt) return null;
  if (startAt instanceof Date) return startAt;
  const s = String(startAt).trim();
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
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
  // Mirror consent onto clients row when present
  try {
    await pool.execute(
      `UPDATE clients SET
         session_email_opt_in = ?,
         session_sms_opt_in = ?,
         session_phone_opt_in = ?
       WHERE id = ?`,
      [
        channels.email === false ? 0 : 1,
        channels.sms === true ? 1 : 0,
        channels.phone === true ? 1 : 0,
        Number(clientId)
      ]
    );
  } catch { /* columns may not exist until migration */ }
  return getClientPreferences(agencyId, clientId, guardianUserId);
}

async function loadClientConsent(clientId) {
  if (!clientId) return { email: true, sms: false, phone: false };
  try {
    const [rows] = await pool.execute(
      `SELECT session_email_opt_in, session_sms_opt_in, session_phone_opt_in,
              email, phone, guardian_email, guardian_phone
       FROM clients WHERE id = ? LIMIT 1`,
      [Number(clientId)]
    );
    const c = rows?.[0];
    if (!c) return { email: true, sms: false, phone: false, emailAddress: null, phoneNumber: null };
    return {
      email: c.session_email_opt_in == null ? true : Number(c.session_email_opt_in) === 1,
      sms: Number(c.session_sms_opt_in) === 1,
      phone: Number(c.session_phone_opt_in) === 1,
      emailAddress: c.email || c.guardian_email || null,
      phoneNumber: c.phone || c.guardian_phone || null
    };
  } catch {
    return { email: true, sms: false, phone: false };
  }
}

/**
 * Build the effective delivery plan for an appointment (confirmation + reminders).
 */
export async function buildDeliveryPlan(appointmentId) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) return { appointment: null, deliveries: [] };
  const tenant = await getTenantSettings(appt.agencyId);
  const platform = tenant.platform || (await getPlatformSettings());
  const effectiveChannels = resolveEffectiveChannels(platform, tenant.channelsEnabled);
  const participants = await Appointment.listParticipants(appt.id);
  const clientId = participants.find((p) => p.clientId)?.clientId || null;
  const prefs = clientId
    ? await getClientPreferences(appt.agencyId, clientId)
    : null;
  const consent = await loadClientConsent(clientId);
  const start = parseStartAt(appt.startAt);
  const deliveries = [];

  const canUseChannel = (channel, { required = false } = {}) => {
    const ch = String(channel || '').toLowerCase();
    if (!effectiveChannels[ch]) return false;
    if (required) return true; // floors ignore optional user channel prefs except consent gates
    if (prefs?.channels && prefs.channels[ch] === false) return false;
    if (ch === 'sms' && !consent.sms) return false;
    if (ch === 'phone' && !consent.phone) return false;
    if (ch === 'email' && consent.email === false) return false;
    return true;
  };

  // Platform minimums
  for (const rule of platform.minRules || []) {
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
          when: appt.startAt
        }),
        sendImmediately: true
      });
    }
  }

  // Standard reminder (tenant) — confirmation (Y/N/R) on by default
  const std = tenant.standardReminder || {};
  if (std.enabled !== false) {
    const channels = Array.isArray(std.channels) ? std.channels : [std.channel || 'email'].filter(Boolean);
    let mins = offsetToMinutes(std.offsetValue ?? 24, std.offsetUnit || 'hours');
    // User may request earlier optional timing — not later than required floor for required rules
    if (prefs?.reminderLead && std.required !== true) {
      mins = offsetToMinutes(prefs.reminderLead.offsetValue, prefs.reminderLead.offsetUnit);
    }
    const askConfirm = std.askConfirmation !== false && prefs?.confirmationRequestsEnabled !== false;
    for (const channel of channels) {
      if (!canUseChannel(channel, { required: !!std.required })) continue;
      if (channel === 'sms' && !consent.sms) continue;
      deliveries.push({
        kind: 'standard_reminder',
        ruleKey: 'tenant_standard',
        channel,
        offsetMinutes: mins,
        recipientRole: 'client',
        requiresConfirmation: askConfirm,
        isRequired: std.required !== false,
        templateKey: std.templateKey || 'standard_reminder',
        messageBody: std.message || buildReminderMessage({
          title: appt.title,
          when: appt.startAt,
          askConfirmation: askConfirm
        })
      });
    }
  }

  // Additional optional reminders — confirmation on by default when enabled
  if (prefs?.optionalRemindersEnabled !== false) {
    for (const rule of tenant.additionalReminders || []) {
      if (rule.enabled === false) continue;
      const channel = rule.channel || 'email';
      if (!canUseChannel(channel)) continue;
      const askConfirm = rule.askConfirmation !== false && prefs?.confirmationRequestsEnabled !== false;
      deliveries.push({
        kind: 'additional_reminder',
        ruleKey: String(rule.id || rule.label || channel),
        channel,
        offsetMinutes: offsetToMinutes(rule.offsetValue, rule.offsetUnit),
        recipientRole: rule.recipient || 'client',
        requiresConfirmation: askConfirm,
        isRequired: false,
        templateKey: rule.templateKey || null,
        messageBody: rule.message || buildReminderMessage({
          title: appt.title,
          when: appt.startAt,
          askConfirmation: askConfirm
        })
      });
    }
  }

  // Dedupe by kind+channel+offset
  const seen = new Set();
  const unique = [];
  for (const d of deliveries) {
    const key = `${d.kind}|${d.channel}|${d.offsetMinutes}|${d.ruleKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

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
  const plan = await buildDeliveryPlan(appointmentId);
  if (!plan.appointment || !plan.start) return [];
  if (replace) await cancelPendingReminders(appointmentId);

  const created = [];
  for (const d of plan.deliveries) {
    let when;
    if (d.sendImmediately || d.kind === 'confirmation') {
      when = new Date(Date.now() + 30 * 1000); // ~30s buffer after book
    } else {
      when = new Date(plan.start.getTime() - d.offsetMinutes * 60 * 1000);
    }
    if (when.getTime() <= Date.now() - 60 * 1000 && d.kind !== 'confirmation') continue;
    const scheduledFor = toMysqlDateTime(when);
    try {
      const [result] = await pool.execute(
        `INSERT INTO appointment_reminders
          (appointment_id, agency_id, channel, kind, rule_key, recipient_role,
           requires_confirmation, template_key, is_required, message_body,
           offset_minutes, scheduled_for, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
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
          scheduledFor
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
      if (String(e?.message || '').includes('Unknown column')) {
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

function defaultMessage(appt, kind, requiresConfirmation) {
  if (kind === 'confirmation' || String(kind).startsWith('confirmation')) {
    return buildConfirmationMessage({ title: appt.title, when: appt.startAt });
  }
  return buildReminderMessage({
    title: appt.title,
    when: appt.startAt,
    askConfirmation: !!requiresConfirmation
  });
}

async function sendInAppIfPossible(appt, body) {
  try {
    const NotificationDispatcher = (await import('./notificationDispatcher.service.js')).default;
    if (appt.providerUserId && typeof NotificationDispatcher.createNotificationAndDispatch === 'function') {
      await NotificationDispatcher.createNotificationAndDispatch({
        userId: appt.providerUserId,
        agencyId: appt.agencyId,
        type: 'program_reminder',
        title: 'Session notification',
        message: body,
        relatedEntityType: 'appointment',
        relatedEntityId: appt.id
      });
    }
  } catch {
    /* optional */
  }
}

/** Drain due appointment_reminders using session notification send rules. */
export async function processDueSessionNotifications({ limit = 50 } = {}) {
  // Prefer new columns; fall back to Phase 4 processor shape
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT * FROM appointment_reminders
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC
       LIMIT ?`,
      [Math.max(1, Math.min(200, Number(limit) || 50))]
    );
  } catch (e) {
    return { processed: 0, error: e.message };
  }

  const results = { sent: 0, skipped: 0, failed: 0, voiceScaffold: 0 };
  for (const row of rows || []) {
    const appt = await Appointment.findById(row.appointment_id);
    if (!appt || String(appt.status || '').includes('canceled')) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'canceled', skip_reason = 'canceled_appt' WHERE id = ?`,
        [row.id]
      );
      results.skipped += 1;
      continue;
    }

    const participants = await Appointment.listParticipants(appt.id);
    const clientId = participants.find((p) => p.clientId)?.clientId || null;
    const consent = await loadClientConsent(clientId);
    const kind = String(row.kind || 'reminder');
    const isInApp = kind.includes(':in_app') || kind.endsWith('in_app');
    let channel = String(row.channel || 'email');
    if (isInApp) channel = 'in_app';

    const body = row.message_body || defaultMessage(appt, kind.replace(':in_app', ''), !!row.requires_confirmation);

    if (channel === 'phone') {
      // Voice scaffold — do not place real calls yet
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'voice_not_configured' WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'phone',
        kind: 'reminder',
        bodyPreview: 'Automated phone call skipped — voice dialer not configured',
        reminderId: row.id
      });
      results.voiceScaffold += 1;
      results.skipped += 1;
      continue;
    }

    if (channel === 'in_app') {
      await sendInAppIfPossible(appt, body);
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'in_app',
        kind: kind.startsWith('confirmation') ? 'reminder' : 'reminder',
        bodyPreview: body.slice(0, 500),
        reminderId: row.id
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
        const resolved = await resolveReminderNumber({
          providerUserId: appt.providerUserId,
          clientId
        });
        const from = resolved?.number?.phone_number
          ? PhoneNumber.normalizePhone(resolved.number.phone_number) || resolved.number.phone_number
          : null;
        if (!from) {
          await pool.execute(
            `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_from_number' WHERE id = ?`,
            [row.id]
          );
          results.skipped += 1;
          continue;
        }
        await VonageService.sendSms({ to: toPhoneNorm, from, body: body.slice(0, 480) });
        await pool.execute(
          `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW() WHERE id = ?`,
          [row.id]
        );
        await logCommunication({
          appointmentId: appt.id,
          agencyId: appt.agencyId,
          channel: 'sms',
          kind: 'reminder',
          bodyPreview: body.slice(0, 500),
          reminderId: row.id
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
    if (!consent.emailAddress && !consent.email) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'skipped', skip_reason = 'no_recipient' WHERE id = ?`,
        [row.id]
      );
      results.skipped += 1;
      continue;
    }
    try {
      if (EmailService.isConfigured?.() && consent.emailAddress) {
        await EmailService.sendEmail({
          to: consent.emailAddress,
          subject: kind.startsWith('confirmation') ? 'Please confirm your session' : 'Session reminder',
          text: body,
          html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
        });
      }
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'sent', sent_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'email',
        kind: 'reminder',
        bodyPreview: body.slice(0, 500),
        reminderId: row.id
      });
      results.sent += 1;
    } catch (e) {
      await pool.execute(
        `UPDATE appointment_reminders SET status = 'failed', error_message = ? WHERE id = ?`,
        [String(e?.message || 'email failed').slice(0, 500), row.id]
      );
      results.failed += 1;
    }
  }

  // Also drain change buffer
  const bufferResult = await processDueChangeNotifications({ limit: 20 });
  return { ...results, processed: (rows || []).length, changeBuffer: bufferResult };
}

// ── Provider-pushed buffered updates ─────────────────────────────────────────

const TRACKED_FIELDS = [
  'startAt', 'endAt', 'modality', 'officeLocationId', 'roomId',
  'providerUserId', 'title', 'notes', 'tenantServiceId'
];

export function diffAppointmentChanges(before = {}, after = {}, actorUserId = null) {
  const changes = [];
  const fieldMap = {
    startAt: 'Time / date (start)',
    endAt: 'End time',
    modality: 'Modality',
    officeLocationId: 'Location',
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
  const prefs = clientId ? await getClientPreferences(appt.agencyId, clientId) : null;
  const consent = await loadClientConsent(clientId);
  const requested = channels || tenant.changeNotify?.channels || ['email'];
  const available = {};
  for (const ch of CHANNELS) {
    available[ch] = !!effectiveChannels[ch];
  }
  const willNotify = [];
  for (const ch of requested) {
    if (!effectiveChannels[ch]) continue;
    if (tenant.changeNotify?.respectUserOptOut !== false) {
      if (prefs?.providerPushedUpdatesEnabled === false) continue;
      if (prefs?.schedulingChangesEnabled === false) continue;
      if (prefs?.channels?.[ch] === false) continue;
    }
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
  if (!changes.length) {
    throw Object.assign(new Error('No changes to notify'), { status: 400 });
  }
  const preview = await previewPushUpdate(appointmentId, { channels });
  if (!preview.willNotifyChannels.length && !sendImmediately) {
    // Still allow queue for audit with empty channels when user opted out
  }
  const mins = Math.max(
    0,
    Number(bufferMinutes ?? preview.bufferMinutes ?? 15) || 0
  );
  const fireAt = sendImmediately
    ? new Date()
    : new Date(Date.now() + mins * 60 * 1000);

  const [existing] = await pool.execute(
    `SELECT id, changes_json FROM appointment_change_notification_queue
     WHERE appointment_id = ? AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [appt.id]
  );

  if (existing?.[0] && !sendImmediately) {
    const prev = parseJson(existing[0].changes_json, []);
    const merged = [...prev, ...changes];
    await pool.execute(
      `UPDATE appointment_change_notification_queue
       SET changes_json = ?, message_override = COALESCE(?, message_override),
           channels_json = ?, preview_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        JSON.stringify(merged),
        messageOverride,
        JSON.stringify(channels || preview.willNotifyChannels),
        JSON.stringify(preview),
        existing[0].id
      ]
    );
    return getPendingPushUpdate(appt.id);
  }

  const [result] = await pool.execute(
    `INSERT INTO appointment_change_notification_queue
      (appointment_id, agency_id, fire_at, buffer_minutes, status, changes_json,
       channels_json, message_override, preview_json, created_by_user_id)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      appt.id,
      appt.agencyId,
      toMysqlDateTime(fireAt),
      mins,
      JSON.stringify(changes),
      JSON.stringify(channels || preview.willNotifyChannels),
      messageOverride,
      JSON.stringify(preview),
      actorUserId || null
    ]
  );
  if (sendImmediately) {
    await processChangeNotificationRow(result.insertId);
  }
  return getPendingPushUpdate(appt.id);
}

export async function getPendingPushUpdate(appointmentId) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_change_notification_queue
     WHERE appointment_id = ? AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [Number(appointmentId)]
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    appointmentId: Number(r.appointment_id),
    fireAt: r.fire_at,
    bufferMinutes: Number(r.buffer_minutes),
    status: r.status,
    changes: parseJson(r.changes_json, []),
    channels: parseJson(r.channels_json, []),
    messageOverride: r.message_override,
    preview: parseJson(r.preview_json, null),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id)
  };
}

export async function patchPendingPushUpdate(appointmentId, patch = {}) {
  const pending = await getPendingPushUpdate(appointmentId);
  if (!pending) throw Object.assign(new Error('No pending update'), { status: 404 });

  if (patch.cancel === true || patch.status === 'canceled') {
    await pool.execute(
      `UPDATE appointment_change_notification_queue
       SET status = 'canceled', canceled_at = NOW() WHERE id = ?`,
      [pending.id]
    );
    return { canceled: true, id: pending.id };
  }

  let fireAt = pending.fireAt;
  if (patch.sendImmediately) {
    fireAt = toMysqlDateTime(new Date());
  } else if (patch.extendBufferMinutes != null) {
    const extra = Math.max(0, Number(patch.extendBufferMinutes) || 0);
    fireAt = toMysqlDateTime(new Date(Date.now() + extra * 60 * 1000));
  } else if (patch.bufferMinutes != null) {
    fireAt = toMysqlDateTime(new Date(Date.now() + Math.max(0, Number(patch.bufferMinutes) || 0) * 60 * 1000));
  }

  await pool.execute(
    `UPDATE appointment_change_notification_queue
     SET fire_at = COALESCE(?, fire_at),
         message_override = COALESCE(?, message_override),
         channels_json = COALESCE(?, channels_json),
         buffer_minutes = COALESCE(?, buffer_minutes)
     WHERE id = ?`,
    [
      fireAt,
      patch.messageOverride !== undefined ? patch.messageOverride : null,
      patch.channels ? JSON.stringify(patch.channels) : null,
      patch.bufferMinutes != null ? Number(patch.bufferMinutes) : null,
      pending.id
    ]
  );

  if (patch.sendImmediately) {
    await processChangeNotificationRow(pending.id);
  }
  return getPendingPushUpdate(appointmentId);
}

async function processChangeNotificationRow(queueId) {
  const [rows] = await pool.execute(
    `SELECT * FROM appointment_change_notification_queue WHERE id = ? LIMIT 1`,
    [Number(queueId)]
  );
  const row = rows?.[0];
  if (!row || row.status !== 'pending') return;
  await pool.execute(
    `UPDATE appointment_change_notification_queue SET status = 'sending' WHERE id = ?`,
    [row.id]
  );

  const appt = await Appointment.findById(row.appointment_id);
  if (!appt) {
    await pool.execute(
      `UPDATE appointment_change_notification_queue SET status = 'canceled', canceled_at = NOW() WHERE id = ?`,
      [row.id]
    );
    return;
  }

  const changes = parseJson(row.changes_json, []);
  const lines = changes.map((c) => `• ${c.label || c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`);
  const body = row.message_override
    || `Your session "${appt.title || 'Session'}" was updated:\n${lines.join('\n')}`;
  const preview = parseJson(row.preview_json, null);
  const channels = parseJson(row.channels_json, preview?.willNotifyChannels || ['email']);
  const participants = await Appointment.listParticipants(appt.id);
  const clientId = participants.find((p) => p.clientId)?.clientId || null;
  const consent = await loadClientConsent(clientId);

  // Opt-out check at send time
  if (clientId) {
    const prefs = await getClientPreferences(appt.agencyId, clientId);
    if (prefs.providerPushedUpdatesEnabled === false) {
      await pool.execute(
        `UPDATE appointment_change_notification_queue SET status = 'canceled', canceled_at = NOW() WHERE id = ?`,
        [row.id]
      );
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'in_app',
        kind: 'other',
        bodyPreview: 'Change notification canceled — client opted out of session updates',
        metadata: { queueId: row.id }
      });
      return;
    }
  }

  for (const ch of channels) {
    if (ch === 'email' && consent.emailAddress && EmailService.isConfigured?.()) {
      try {
        await EmailService.sendEmail({
          to: consent.emailAddress,
          subject: 'Session update',
          text: body,
          html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
        });
      } catch { /* continue */ }
    }
    if (ch === 'sms' && consent.sms && consent.phoneNumber) {
      try {
        const to = PhoneNumber.normalizePhone(consent.phoneNumber);
        const resolved = await resolveReminderNumber({
          providerUserId: appt.providerUserId,
          clientId
        });
        const from = resolved?.number?.phone_number
          ? PhoneNumber.normalizePhone(resolved.number.phone_number)
          : null;
        if (from) await VonageService.sendSms({ to, from, body: body.slice(0, 480) });
      } catch { /* continue */ }
    }
    if (ch === 'in_app') await sendInAppIfPossible(appt, body);
    if (ch === 'phone') {
      await logCommunication({
        appointmentId: appt.id,
        agencyId: appt.agencyId,
        channel: 'phone',
        kind: 'other',
        bodyPreview: 'Voice update skipped — dialer scaffold',
        metadata: { queueId: row.id }
      });
    }
  }

  await pool.execute(
    `UPDATE appointment_change_notification_queue SET status = 'sent', sent_at = NOW() WHERE id = ?`,
    [row.id]
  );
  await logCommunication({
    appointmentId: appt.id,
    agencyId: appt.agencyId,
    channel: 'email',
    kind: 'other',
    bodyPreview: body.slice(0, 500),
    metadata: { queueId: row.id, changes }
  });

  // Reschedule reminders if time changed
  if (changes.some((c) => c.field === 'startAt' || c.field === 'endAt')) {
    try {
      await scheduleSessionNotifications(appt.id, { replace: true });
    } catch { /* ignore */ }
  }
}

export async function processDueChangeNotifications({ limit = 20 } = {}) {
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT id FROM appointment_change_notification_queue
       WHERE status = 'pending' AND fire_at <= NOW()
       ORDER BY fire_at ASC
       LIMIT ?`,
      [Math.max(1, Math.min(50, Number(limit) || 20))]
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
