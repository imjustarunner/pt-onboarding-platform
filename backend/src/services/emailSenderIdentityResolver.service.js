import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { preferredIdentityKeysForOutboundSend } from '../constants/automatedEmailCatalog.js';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function pickPreferredSenderIdentity(list = [], preferredKeys = []) {
  const normalizedPreferred = (preferredKeys || []).map(normalizeKey).filter(Boolean);
  for (const key of normalizedPreferred) {
    const match = (list || []).find((identity) => normalizeKey(identity?.identity_key) === key);
    if (match) return match;
  }
  return (list || [])[0] || null;
}

/** Like pickPreferredSenderIdentity but never returns an unrelated first-active identity. */
export function pickPreferredSenderIdentityStrict(list = [], preferredKeys = []) {
  const normalizedPreferred = (preferredKeys || []).map(normalizeKey).filter(Boolean);
  for (const key of normalizedPreferred) {
    const match = (list || []).find((identity) => normalizeKey(identity?.identity_key) === key);
    if (match) return match;
  }
  return null;
}

async function resolveTriggerSenderIdentityId(agencyId, triggerKey) {
  const a = Number(agencyId);
  const key = String(triggerKey || '').trim();
  if (!a || !key) return null;

  const trigger = await NotificationTrigger.findByKey(key);
  if (!trigger) return null;

  const settings = await AgencyNotificationTriggerSetting.listForAgency(a);
  const setting = (settings || []).find((s) => s.triggerKey === key) || null;
  if (setting?.senderIdentityId) return Number(setting.senderIdentityId);
  if (trigger.defaultSenderIdentityId) return Number(trigger.defaultSenderIdentityId);
  return null;
}

export async function resolveConfiguredSenderIdentityId({
  agencyId,
  templateType = null,
  triggerKey = null,
  includeAgencyDefault = true
}) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;

  if (triggerKey) {
    const triggerId = await resolveTriggerSenderIdentityId(aid, triggerKey);
    if (triggerId) return triggerId;
  }

  const settings = await getAgencyEmailSettings(aid);
  const byType = settings.templateSenderIdentityIds || {};
  const tt = String(templateType || '').trim().toLowerCase();
  if (tt && byType[tt]) return Number(byType[tt]);

  if (includeAgencyDefault && settings.defaultSenderIdentityId) {
    return Number(settings.defaultSenderIdentityId);
  }
  return null;
}

export async function resolveConfiguredSenderIdentity({
  agencyId = null,
  templateType = null,
  triggerKey = null,
  schoolOrganizationId = null,
  preferredKeys = ['school_intake', 'intake', 'notifications', 'system'],
  includePlatformDefaults = true,
  onlyActive = true
} = {}) {
  const configuredId = await resolveConfiguredSenderIdentityId({ agencyId, templateType, triggerKey });
  if (configuredId) {
    const identity = await EmailSenderIdentity.findById(configuredId);
    if (identity && (onlyActive ? identity.is_active !== 0 && identity.is_active !== false : true)) {
      return identity;
    }
  }

  const schoolId = Number(schoolOrganizationId || 0) || null;
  if (schoolId) {
    const schoolList = await EmailSenderIdentity.list({
      agencyId: schoolId,
      includePlatformDefaults,
      onlyActive
    });
    const schoolMatch = pickPreferredSenderIdentity(schoolList, preferredKeys);
    if (schoolMatch?.id) return schoolMatch;
  }

  return await resolvePreferredSenderIdentityForAgency({
    agencyId,
    preferredKeys,
    includePlatformDefaults,
    onlyActive
  });
}

export async function resolvePreferredSenderIdentityForAgency({
  agencyId = null,
  preferredKeys = [],
  templateType = null,
  triggerKey = null,
  includePlatformDefaults = true,
  onlyActive = true
} = {}) {
  const configured = await resolveConfiguredSenderIdentity({
    agencyId,
    templateType,
    triggerKey,
    preferredKeys,
    includePlatformDefaults,
    onlyActive
  });
  if (configured?.id) return configured;

  const aid = Number(agencyId || 0) || null;
  if (!aid && aid !== null) return null;
  const list = await EmailSenderIdentity.list({
    agencyId: aid,
    includePlatformDefaults,
    onlyActive
  });
  return pickPreferredSenderIdentity(list, preferredKeys);
}

export async function resolvePreferredSenderIdentityForSchoolThenAgency(params = {}) {
  return await resolveConfiguredSenderIdentity(params);
}

/**
 * Resolve a From identity for an outbound send without silently using an
 * unrelated first-active mailbox. Preferred-key matches (e.g. login_recovery
 * for password reset) count as configured. Agency default outbound does not.
 */
export async function resolveSenderIdentityForSend({
  agencyId = null,
  templateType = null,
  triggerKey = null,
  preferredKeys = null,
  includePlatformDefaults = true,
  onlyActive = true
} = {}) {
  const aid = Number(agencyId || 0) || null;
  const keys = (preferredKeys && preferredKeys.length)
    ? preferredKeys
    : preferredIdentityKeysForOutboundSend({ templateType, triggerKey });

  const configuredId = await resolveConfiguredSenderIdentityId({
    agencyId: aid,
    templateType,
    triggerKey,
    includeAgencyDefault: false
  });
  if (configuredId) {
    const identity = await EmailSenderIdentity.findById(configuredId);
    if (identity && (onlyActive ? identity.is_active !== 0 && identity.is_active !== false : true)) {
      return { identity, usedFallback: false, resolution: 'configured' };
    }
  }

  if (aid) {
    const list = await EmailSenderIdentity.list({
      agencyId: aid,
      includePlatformDefaults,
      onlyActive
    });
    const match = pickPreferredSenderIdentityStrict(list, keys);
    if (match?.id) {
      return { identity: match, usedFallback: false, resolution: 'preferred_key' };
    }

    const tt = String(templateType || '').trim().toLowerCase();
    if (tt === 'password_reset' || tt === 'admin_initiated_password_reset') {
      const notificationsMailbox = (list || []).find((identity) =>
        String(identity?.from_email || '').trim().toLowerCase().startsWith('notifications@')
      );
      if (notificationsMailbox?.id) {
        return { identity: notificationsMailbox, usedFallback: false, resolution: 'notifications_mailbox' };
      }
    }
  }

  return { identity: null, usedFallback: true, resolution: 'none' };
}
