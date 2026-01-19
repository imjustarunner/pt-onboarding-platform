import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import User from '../models/User.model.js';

function normalizeBoolOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

async function ensureAgencyAccess(req, agencyId) {
  if (req.user?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
  if (!ok) return false;
  return true;
}

function resolveSetting(trigger, setting) {
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

  const senderIdentityId =
    setting?.senderIdentityId !== null && setting?.senderIdentityId !== undefined
      ? setting.senderIdentityId
      : (trigger?.defaultSenderIdentityId || null);

  return { enabled, channels, recipients, senderIdentityId };
}

export const listAgencyNotificationTriggers = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    const ok = await ensureAgencyAccess(req, agencyId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this agency' } });

    const triggers = await NotificationTrigger.listAll();
    const settings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const byKey = new Map((settings || []).map((s) => [s.triggerKey, s]));

    const out = (triggers || []).map((t) => {
      const s = byKey.get(t.triggerKey) || null;
      const resolved = resolveSetting(t, s);
      return {
        triggerKey: t.triggerKey,
        name: t.name,
        description: t.description,
        defaults: {
          enabled: !!t.defaultEnabled,
          channels: t.defaultChannels,
          recipients: t.defaultRecipients,
          senderIdentityId: t.defaultSenderIdentityId || null
        },
        agencyOverride: s
          ? {
              enabled: s.enabled,
              channels: s.channels,
              recipients: s.recipients,
              senderIdentityId: s.senderIdentityId || null
            }
          : null,
        resolved
      };
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const updateAgencyNotificationTrigger = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.id);
    const triggerKey = String(req.params.triggerKey || '').trim();
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!triggerKey) return res.status(400).json({ error: { message: 'Invalid trigger key' } });

    const ok = await ensureAgencyAccess(req, agencyId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied to this agency' } });

    const trigger = await NotificationTrigger.findByKey(triggerKey);
    if (!trigger) return res.status(404).json({ error: { message: 'Trigger not found' } });

    const enabled = normalizeBoolOrNull(req.body?.enabled);
    const channels = req.body?.channels && typeof req.body.channels === 'object' ? req.body.channels : null;
    const recipients = req.body?.recipients && typeof req.body.recipients === 'object' ? req.body.recipients : null;
    const senderIdentityId =
      req.body?.senderIdentityId === null || req.body?.senderIdentityId === undefined || req.body?.senderIdentityId === ''
        ? null
        : Number(req.body?.senderIdentityId);

    const saved = await AgencyNotificationTriggerSetting.upsert({ agencyId, triggerKey, enabled, channels, recipients, senderIdentityId });
    const resolved = resolveSetting(trigger, saved);

    res.json({
      triggerKey: trigger.triggerKey,
      agencyOverride: saved
        ? { enabled: saved.enabled, channels: saved.channels, recipients: saved.recipients, senderIdentityId: saved.senderIdentityId || null }
        : null,
      resolved
    });
  } catch (e) {
    next(e);
  }
};

