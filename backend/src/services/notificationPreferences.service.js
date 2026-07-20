import {
  getNotificationCatalogEntry,
  isNotificationEssentialForRole,
  isNotificationRecommendedForRole,
  listNotificationCatalog,
  notificationRoleProfile
} from './notificationCatalog.service.js';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

function resolveBoolean(override, fallback) {
  return override === null || override === undefined ? !!fallback : !!override;
}

function databaseBoolean(value, fallback = false) {
  if (value === null || value === undefined) return !!fallback;
  return value === true || value === 1 || value === '1';
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
  const roleProfile = notificationRoleProfile(context?.userRole);
  const recommendedForRole = isNotificationRecommendedForRole(type, context?.userRole);
  const essentialForRole = isNotificationEssentialForRole(type, context?.userRole);

  let defaultInApp = entry.defaults.inApp && essentialForRole;
  // A legacy category opt-out still narrows delivery. A broad legacy opt-in no
  // longer enables every newly cataloged type in that category.
  if (legacyKey && legacyCategories[legacyKey] === false) defaultInApp = false;
  if (!recommendedForRole) defaultInApp = false;

  let inApp = resolveBoolean(override.inApp, defaultInApp);
  let locked = false;
  let lockReason = null;
  const requiredForRole = entry.required || (type === 'support_safety_net_alert' && context?.userRole === 'support');
  if (requiredForRole) {
    inApp = true;
    locked = true;
    lockReason = entry.required ? 'Required safety notification' : 'Required for support users';
  } else if (!recommendedForRole) {
    inApp = false;
    locked = true;
    lockReason = 'Not used for your role';
  } else if (agency && legacyKey && agencyDefaults[legacyKey] !== undefined && agency.enforceDefaults) {
    inApp = agencyDefaults[legacyKey] !== false;
    locked = true;
    lockReason = 'Required by agency notification policy';
  } else if (agency?.userEditable === false) {
    locked = true;
    lockReason = 'Notification preferences are managed by the agency';
  }

  const capabilities = entry.capabilities;
  const roleDefault = (channel) => essentialForRole ? entry.defaults[channel] : false;
  const effective = {
    inApp,
    toast: capabilities.toast && resolveBoolean(override.toast, roleDefault('toast')),
    sound: capabilities.sound && databaseBoolean(globals.notification_sound_enabled, true) && resolveBoolean(override.sound, roleDefault('sound')),
    digest: capabilities.digest && resolveBoolean(override.digest, roleDefault('digest')),
    push: capabilities.push && databaseBoolean(globals.push_notifications_enabled, false) && resolveBoolean(override.push, roleDefault('push')),
    email: capabilities.email && databaseBoolean(globals.email_enabled, true) && resolveBoolean(override.email, roleDefault('email')),
    sms: capabilities.sms && databaseBoolean(globals.sms_enabled, false) && resolveBoolean(override.sms, roleDefault('sms')),
    toastDurationMode: override.toastDurationMode || entry.defaults.toastDurationMode,
    toastDurationSeconds: override.toastDurationMode === 'dismissable'
      ? null
      : (override.toastDurationSeconds ?? entry.defaults.toastDurationSeconds)
  };
  if (!recommendedForRole && !requiredForRole) {
    effective.inApp = false;
    effective.toast = false;
    effective.sound = false;
    effective.digest = false;
    effective.push = false;
    effective.email = false;
    effective.sms = false;
  }
  if (entry.digestOnly) {
    effective.inApp = false;
    effective.toast = false;
    effective.sound = false;
    effective.push = false;
    effective.email = false;
    effective.sms = false;
    effective.digest = recommendedForRole;
    locked = true;
    lockReason = recommendedForRole
      ? 'High-volume activity is delivered in the daily activity digest'
      : 'Administrative activity is not delivered to this role';
  }
  return {
    ...entry,
    override,
    effective,
    locked,
    lockReason,
    roleProfile,
    recommendedForRole,
    essentialForRole,
    relevanceReason: recommendedForRole
      ? (essentialForRole ? 'Essential for your role' : 'Optional for your role')
      : 'Administrative or unrelated to your normal responsibilities'
  };
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
