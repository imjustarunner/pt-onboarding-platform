import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationDispatcherService from './notificationDispatcher.service.js';

function resolveTriggerSetting(trigger, setting) {
  const enabled =
    setting?.enabled === null || setting?.enabled === undefined
      ? !!trigger.defaultEnabled
      : !!setting.enabled;

  const channels =
    setting?.channels && typeof setting.channels === 'object'
      ? setting.channels
      : (trigger.defaultChannels && typeof trigger.defaultChannels === 'object' ? trigger.defaultChannels : { inApp: true, sms: false, email: false });

  const recipients =
    setting?.recipients && typeof setting.recipients === 'object'
      ? setting.recipients
      : (trigger.defaultRecipients && typeof trigger.defaultRecipients === 'object' ? trigger.defaultRecipients : { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true });

  return { enabled, channels, recipients };
}

async function resolveRecipientsForAgency({ agencyId, recipients }) {
  const roles = [];
  if (recipients?.provider) roles.push('provider');
  if (recipients?.supervisor) roles.push('supervisor');
  if (recipients?.clinicalPracticeAssistant) roles.push('clinical_practice_assistant');
  if (recipients?.admin) roles.push('admin', 'support', 'super_admin', 'staff');

  let explicitUserIds = [];
  if (Array.isArray(recipients?.userIds)) {
    const rawIds = recipients.userIds.map((id) => Number(id)).filter(Boolean);
    if (rawIds.length) {
      const placeholders = rawIds.map(() => '?').join(',');
      const [allowed] = await pool.execute(
        `SELECT u.id
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ? AND u.id IN (${placeholders})`,
        [agencyId, ...rawIds]
      );
      explicitUserIds = (allowed || []).map((r) => Number(r.id));
    }
  }

  const rolePlaceholders = roles.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND u.is_active = TRUE
       ${roles.length ? `AND u.role IN (${rolePlaceholders})` : ''}`,
    roles.length ? [agencyId, ...roles] : [agencyId]
  );

  const roleUserIds = (rows || []).map((r) => Number(r.id)).filter(Boolean);
  return Array.from(new Set([...roleUserIds, ...explicitUserIds]));
}

class ProgramReminderService {
  static async dispatchReminder({ agencyId, title, message, recipientsOverride = null, channelsOverride = null }) {
    const trigger = await NotificationTrigger.findByKey('program_reminder');
    if (!trigger) throw new Error('Program reminder trigger missing');

    const settings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const triggerSetting = (settings || []).find((s) => s.triggerKey === 'program_reminder') || null;
    const resolved = resolveTriggerSetting(trigger, triggerSetting);
    if (!resolved.enabled) return { count: 0, skipped: true };

    const recipients = recipientsOverride || resolved.recipients;
    const channels = {
      inApp: true,
      sms: channelsOverride?.sms === true ? true : !!resolved.channels?.sms,
      email: channelsOverride?.email === true ? true : !!resolved.channels?.email
    };

    const recipientUserIds = await resolveRecipientsForAgency({ agencyId, recipients });
    const created = [];
    for (const userId of recipientUserIds) {
      const notification = await Notification.create({
        type: 'program_reminder',
        severity: 'info',
        title,
        message,
        userId,
        agencyId,
        relatedEntityType: 'program_reminder',
        relatedEntityId: null
      });
      if (channels.sms) {
        await NotificationDispatcherService.dispatchForNotification(notification, { context: { severity: 'info' } }).catch(() => {});
      }
      created.push(notification);
    }
    return { count: created.length, notifications: created, channels, recipients };
  }
}

export default ProgramReminderService;
