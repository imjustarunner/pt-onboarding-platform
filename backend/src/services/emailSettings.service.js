import PlatformEmailSettings from '../models/PlatformEmailSettings.model.js';
import AgencyEmailSettings from '../models/AgencyEmailSettings.model.js';

export function normalizeEmailSendingMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'manual_only') return 'manual_only';
  if (v === 'all') return 'all';
  return 'all';
}

export async function getPlatformEmailSettings() {
  const row = await PlatformEmailSettings.get();
  return {
    sendingMode: normalizeEmailSendingMode(row?.sending_mode || process.env.EMAIL_SENDING_MODE || 'all'),
    notificationsEnabled: row?.notifications_enabled !== undefined ? row.notifications_enabled !== 0 : true,
    missingTable: row?.missingTable === true
  };
}

export async function setEmailSendingMode(sendingMode, actorUserId = null) {
  const normalized = normalizeEmailSendingMode(sendingMode);
  const current = await getPlatformEmailSettings();
  const updated = await PlatformEmailSettings.update({
    sendingMode: normalized,
    notificationsEnabled: current.notificationsEnabled,
    actorUserId
  });
  return normalizeEmailSendingMode(updated?.sending_mode || normalized);
}

export async function setPlatformEmailSettings({ sendingMode, notificationsEnabled, actorUserId }) {
  const updated = await PlatformEmailSettings.update({
    sendingMode: normalizeEmailSendingMode(sendingMode),
    notificationsEnabled: notificationsEnabled !== false,
    actorUserId
  });
  return {
    sendingMode: normalizeEmailSendingMode(updated?.sending_mode || 'all'),
    notificationsEnabled: updated?.notifications_enabled !== 0
  };
}

export async function getAgencyEmailSettings(agencyId) {
  const row = await AgencyEmailSettings.getByAgencyId(agencyId);
  return {
    agencyId,
    notificationsEnabled: row?.notifications_enabled !== 0
  };
}

export async function listAgencyEmailSettings(agencyIds) {
  const rows = await AgencyEmailSettings.listByAgencyIds(agencyIds);
  const byId = new Map((rows || []).map((r) => [Number(r.agency_id), r]));
  return (agencyIds || []).map((id) => {
    const row = byId.get(Number(id)) || null;
    return {
      agencyId: Number(id),
      notificationsEnabled: row ? row.notifications_enabled !== 0 : true
    };
  });
}

export async function getEmailSendingMode() {
  const platform = await getPlatformEmailSettings();
  return platform.sendingMode;
}

export async function isEmailNotificationsEnabled({ agencyId, source } = {}) {
  if (String(source || '').trim().toLowerCase() === 'manual') return true;
  const platform = await getPlatformEmailSettings();
  if (!platform.notificationsEnabled) return false;
  if (!agencyId) return true;
  const agency = await getAgencyEmailSettings(agencyId);
  return agency.notificationsEnabled !== false;
}
