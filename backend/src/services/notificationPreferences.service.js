import { getNotificationCatalogEntry, listNotificationCatalog } from './notificationCatalog.service.js';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

function resolveBoolean(override, fallback) {
  return override === null || override === undefined ? !!fallback : !!override;
}

export async function loadNotificationPreferenceContext({ userId, agencyId = null, userRole = null }) {
  const [
    { default: UserPreferences },
    { default: NotificationTypePreference },
    { default: AgencyNotificationPreferences }
  ] = await Promise.all([
    import('../models/UserPreferences.model.js'),
    import('../models/NotificationTypePreference.model.js'),
    import('../models/AgencyNotificationPreferences.model.js')
  ]);
  const [globalPreferences, typePreferences, agencyPreferences] = await Promise.all([
    UserPreferences.findByUserId(Number(userId)),
    NotificationTypePreference.listForUser(Number(userId)),
    agencyId ? AgencyNotificationPreferences.getByAgencyId(Number(agencyId)) : Promise.resolve(null)
  ]);
  return {
    userId: Number(userId),
    userRole: String(userRole || '').toLowerCase(),
    globalPreferences: globalPreferences || {},
    legacyCategories: parseJson(globalPreferences?.notification_categories),
    typePreferences: new Map(typePreferences.map((p) => [p.type, p])),
    agencyPreferences
  };
}

export function resolveNotificationTypePreference(type, context) {
  const entry = getNotificationCatalogEntry(type);
  if (!entry) return null;
  const override = context?.typePreferences?.get(type) || {};
  const globals = context?.globalPreferences || {};
  const legacyCategories = context?.legacyCategories || {};
  const agency = context?.agencyPreferences || null;
  const agencyDefaults = agency?.defaults || {};
  const legacyKey = entry.legacyCategoryKey;

  let defaultInApp = entry.defaults.inApp;
  if (legacyKey && legacyCategories[legacyKey] !== undefined) defaultInApp = legacyCategories[legacyKey] !== false;

  let inApp = resolveBoolean(override.inApp, defaultInApp);
  let locked = false;
  let lockReason = null;
  const requiredForRole = entry.required || (type === 'support_safety_net_alert' && context?.userRole === 'support');
  if (requiredForRole) {
    inApp = true;
    locked = true;
    lockReason = entry.required ? 'Required safety notification' : 'Required for support users';
  } else if (agency && legacyKey && agencyDefaults[legacyKey] !== undefined && agency.enforceDefaults) {
    inApp = agencyDefaults[legacyKey] !== false;
    locked = true;
    lockReason = 'Required by agency notification policy';
  } else if (agency?.userEditable === false) {
    locked = true;
    lockReason = 'Notification preferences are managed by the agency';
  }

  const capabilities = entry.capabilities;
  const effective = {
    inApp,
    toast: capabilities.toast && resolveBoolean(override.toast, entry.defaults.toast),
    sound: capabilities.sound && globals.notification_sound_enabled !== false && resolveBoolean(override.sound, entry.defaults.sound),
    digest: capabilities.digest && resolveBoolean(override.digest, entry.defaults.digest),
    push: capabilities.push && globals.push_notifications_enabled === true && resolveBoolean(override.push, entry.defaults.push),
    email: capabilities.email && globals.email_enabled !== false && resolveBoolean(override.email, entry.defaults.email),
    sms: capabilities.sms && globals.sms_enabled === true && resolveBoolean(override.sms, entry.defaults.sms),
    toastDurationMode: override.toastDurationMode || entry.defaults.toastDurationMode,
    toastDurationSeconds: override.toastDurationMode === 'dismissable'
      ? null
      : (override.toastDurationSeconds ?? entry.defaults.toastDurationSeconds)
  };
  if (entry.digestOnly) {
    effective.inApp = false;
    effective.toast = false;
    effective.sound = false;
    effective.push = false;
    effective.email = false;
    effective.sms = false;
    effective.digest = true;
    locked = true;
    lockReason = 'High-volume activity is delivered in the daily activity digest';
  }
  return { ...entry, override, effective, locked, lockReason };
}

export async function listEffectiveNotificationPreferences(params) {
  const context = await loadNotificationPreferenceContext(params);
  return listNotificationCatalog().map((entry) => resolveNotificationTypePreference(entry.type, context));
}

export async function isNotificationTypeVisible(params) {
  const context = params.context || await loadNotificationPreferenceContext(params);
  return resolveNotificationTypePreference(params.type, context)?.effective?.inApp !== false;
}

export async function isNotificationChannelEnabled({ userId, userRole = null, agencyId = null, type, channel }) {
  const context = await loadNotificationPreferenceContext({ userId, userRole, agencyId });
  const resolved = resolveNotificationTypePreference(type, context);
  return resolved?.effective?.[channel] === true;
}

export default {
  loadNotificationPreferenceContext,
  resolveNotificationTypePreference,
  listEffectiveNotificationPreferences,
  isNotificationTypeVisible,
  isNotificationChannelEnabled
};
