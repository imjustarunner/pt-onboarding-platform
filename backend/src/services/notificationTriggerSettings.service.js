import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';

export function resolveTriggerSetting(trigger, setting) {
  const enabled =
    setting?.enabled === null || setting?.enabled === undefined
      ? !!trigger?.defaultEnabled
      : !!setting.enabled;

  const channels =
    setting?.channels && typeof setting.channels === 'object'
      ? setting.channels
      : (trigger?.defaultChannels && typeof trigger.defaultChannels === 'object'
        ? trigger.defaultChannels
        : { inApp: true, sms: false, email: false });

  const recipients =
    setting?.recipients && typeof setting.recipients === 'object'
      ? setting.recipients
      : (trigger?.defaultRecipients && typeof trigger.defaultRecipients === 'object'
        ? trigger.defaultRecipients
        : { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true });

  const senderIdentityId =
    setting?.senderIdentityId !== null && setting?.senderIdentityId !== undefined
      ? setting.senderIdentityId
      : (trigger?.defaultSenderIdentityId || null);

  const subjectOverride =
    setting?.subjectOverride !== null && setting?.subjectOverride !== undefined
      ? String(setting.subjectOverride)
      : null;

  const requireApproval = !!setting?.requireApproval;

  return { enabled, channels, recipients, senderIdentityId, subjectOverride, requireApproval };
}

export async function resolveAgencyTriggerSettings(agencyId, triggerKey) {
  const aid = Number(agencyId || 0);
  const key = String(triggerKey || '').trim();
  if (!aid || !key) return null;

  const trigger = await NotificationTrigger.findByKey(key);
  if (!trigger) return null;

  const settings = await AgencyNotificationTriggerSetting.listForAgency(aid);
  const setting = (settings || []).find((s) => s.triggerKey === key) || null;
  return resolveTriggerSetting(trigger, setting);
}

export function isTriggerChannelEnabled(resolved, channel) {
  if (!resolved?.enabled) return false;
  const ch = String(channel || '').trim().toLowerCase();
  if (ch === 'inapp' || ch === 'in_app') return resolved.channels?.inApp !== false;
  if (ch === 'sms') return !!resolved.channels?.sms;
  if (ch === 'email') return !!resolved.channels?.email;
  return false;
}

export async function isAgencyTriggerChannelEnabled({ agencyId, triggerKey, channel }) {
  const resolved = await resolveAgencyTriggerSettings(agencyId, triggerKey);
  if (!resolved) return channel === 'email' ? false : true;
  return isTriggerChannelEnabled(resolved, channel);
}
