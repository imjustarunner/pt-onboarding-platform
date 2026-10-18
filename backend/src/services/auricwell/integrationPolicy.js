import { fail } from './policy.js';

export const integrationDefaults = () => ({
  videoProvider: 'google_meet',
  googleOrganizer: process.env.AURICWELL_GOOGLE_MEET_ORGANIZER || 'ai@plottwistco.com',
  alwaysAvailableOffice: false,
  emailReminders: true,
  smsProvider: 'disabled',
  notifyre: { from: '', campaignId: '', baaReference: '', apiToken: '', verifiedAt: null, webhookSecret: '', webhookVerifiedAt: null },
  vonage: { from: '', campaignId: '' },
  clientMessaging: { routes: [] },
});
export function requirePlatformSuperadmin(ctx) {
  if (ctx?.profile?.operator !== true || ctx.verified !== true)
    throw fail(403, 'AuricWell platform superadmin access and authenticator verification are required.');
}
export function cleanPlatformSettings(input, current) {
  if (!['google_meet', 'vonage', 'disabled'].includes(input.videoProvider))
    throw fail(400, 'Choose Google Meet, Vonage video, or disabled.');
  if (!['disabled', 'notifyre', 'vonage'].includes(input.smsProvider))
    throw fail(400, 'Choose an appointment SMS provider.');
  if (typeof input.alwaysAvailableOffice !== 'boolean' || typeof input.emailReminders !== 'boolean')
    throw fail(400, 'Choose the platform room and reminder settings.');
  const organizer = String(input.googleOrganizer || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizer) || organizer.length > 254)
    throw fail(400, 'Enter the Google Workspace organizer address.');
  const settings = { ...current, videoProvider: input.videoProvider, googleOrganizer: organizer,
    alwaysAvailableOffice: input.alwaysAvailableOffice, emailReminders: input.emailReminders,
    smsProvider: input.smsProvider };
  for (const name of ['notifyre', 'vonage']) {
    const value = input[name] || {};
    const from = String(value.from || '').trim();
    if (from && !/^\+[1-9]\d{7,14}$/.test(from)) throw fail(400, 'Enter the sending number with its country code, for example +17195550123.');
    settings[name] = { ...current[name], from, campaignId: String(value.campaignId || '').trim().slice(0, 100) };
  }
  const token = String(input.notifyre?.apiToken || '');
  if (token.length > 4096) throw fail(400, 'Invalid Notifyre API token.');
  settings.notifyre.apiToken = input.notifyre?.removeToken === true ? '' : token || current.notifyre.apiToken;
  settings.notifyre.baaReference = String(input.notifyre?.baaReference || '').trim().slice(0, 1000);
  const secret = String(input.notifyre?.webhookSecret || '');
  if (secret.length > 4096) throw fail(400, 'Invalid webhook secret.');
  settings.notifyre.webhookSecret = input.notifyre?.removeWebhookSecret === true ? '' : secret || current.notifyre.webhookSecret || '';
  if (settings.notifyre.webhookSecret !== current.notifyre.webhookSecret || settings.notifyre.apiToken !== current.notifyre.apiToken)
    settings.notifyre.webhookVerifiedAt = null;
  const routes = input.clientMessaging?.routes ?? current.clientMessaging?.routes ?? [];
  if (!Array.isArray(routes) || routes.length > 100) throw fail(400, 'Invalid agency routes.');
  const seen = new Set(), practices = new Set();
  settings.clientMessaging = { routes: routes.map(r => {
    if (!/^[0-9a-f-]{36}$/i.test(r.practiceId || '') || practices.has(r.practiceId)) throw fail(400, 'Choose each practice only once.');
    practices.add(r.practiceId);
    if (!['draft', 'submitted', 'approved', 'rejected'].includes(r.approval)) throw fail(400, 'Choose the campaign approval status.');
    const result = { practiceId: r.practiceId, brand: String(r.brand || '').trim().slice(0, 150),
      campaignId: String(r.campaignId || '').trim().slice(0, 100), approval: r.approval,
      approvalReference: String(r.approvalReference || '').trim().slice(0, 1000), enabled: r.enabled === true,
      support: String(r.support || '').trim().slice(0, 254), mainNumber: '', providerNumber: '' };
    if (!result.brand || !result.support) throw fail(400, 'Enter the agency name and HELP contact.');
    for (const line of ['mainNumber', 'providerNumber']) {
      const number = String(r[line] || '').trim();
      if (number && (!/^\+[1-9]\d{7,14}$/.test(number) || seen.has(number))) throw fail(400, 'Each SMS number must be unique and include its country code.');
      if (number) seen.add(number);
      result[line] = number;
    }
    const old = current.clientMessaging?.routes?.find(v => v.practiceId === r.practiceId);
    result.verifiedAt = old && ['campaignId','approval','approvalReference','mainNumber','providerNumber'].every(k => old[k] === result[k])
      && settings.notifyre.apiToken === current.notifyre.apiToken && settings.smsProvider === current.smsProvider ? old.verifiedAt : null;
    // Enabling a previously verified route after saving with texting off is safe;
    // verification records which carrier owns the checked numbers.
    if (old?.verifiedProvider === settings.smsProvider && ['campaignId','approval','approvalReference','mainNumber','providerNumber'].every(k => old[k] === result[k])
      && settings.notifyre.apiToken === current.notifyre.apiToken) result.verifiedAt = old.verifiedAt;
    result.verifiedProvider = old?.verifiedProvider || null;
    result.faxVerifiedAt = old?.mainNumber === result.mainNumber
      && settings.notifyre.apiToken === current.notifyre.apiToken
      && settings.notifyre.baaReference === current.notifyre.baaReference ? old?.faxVerifiedAt || null : null;
    result.faxEnabled = r.faxEnabled === true;
    if (result.faxEnabled && (!result.faxVerifiedAt || !result.mainNumber || !settings.notifyre.apiToken || !settings.notifyre.baaReference || !settings.notifyre.webhookSecret))
      throw fail(409, 'Save with fax sending off, verify the primary fax number and Notifyre connection, then enable fax sending.');
    if (result.approval === 'approved' && !result.approvalReference) throw fail(400, 'Record the carrier approval reference before marking a campaign approved.');
    if (result.enabled && (result.approval !== 'approved' || !result.verifiedAt || !result.mainNumber)) throw fail(409, 'Save with the agency disabled, then verify its approved campaign and numbers before enabling.');
    return result;
  }) };
  if (['from', 'campaignId', 'apiToken', 'baaReference'].some(k => settings.notifyre[k] !== current.notifyre[k]))
    settings.notifyre.verifiedAt = null;
  if (settings.smsProvider === 'notifyre' && !settings.notifyre.verifiedAt && !settings.clientMessaging.routes.some(r => r.verifiedAt && r.verifiedProvider === 'notifyre'))
    throw fail(409, 'Save the Notifyre setup with SMS off, verify the number, then enable Notifyre.');
  if (settings.smsProvider === 'vonage' && !settings.clientMessaging.routes.length && (!settings.vonage.from || !settings.vonage.campaignId))
    throw fail(409, 'Link the Vonage Campaign 1 number before enabling appointment texts.');
  return settings;
}
export function publicPlatformSettings(settings) {
  const { apiToken, webhookSecret, apiTokenFingerprint, webhookSecretFingerprint, ...notifyre } = settings.notifyre;
  return { ...settings, notifyre: { ...notifyre, hasApiToken: !!apiToken, hasWebhookSecret: !!webhookSecret } };
}
export function assertVideoWindow(appointment, now = Date.now()) {
  const a = appointment.data;
  if (a.modality !== 'video' || !['scheduled', 'confirmed'].includes(a.status)
    || !Number.isFinite(Date.parse(a.start)) || !Number.isFinite(Date.parse(a.end))
    || now < Date.parse(a.start) - 15 * 60000 || now > Date.parse(a.end) + 30 * 60000)
    throw fail(409, 'This video appointment opens 15 minutes before the start and closes 30 minutes after the end.');
}
export function smsScope(settings) {
  const provider = settings.smsProvider;
  return provider === 'disabled' ? null : `${provider}:${settings[provider].campaignId}:${settings[provider].from}`;
}
export function normalizeSessionPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^1\d{10}$/.test(digits) ? `+${digits}` : /^\d{10}$/.test(digits) ? `+1${digits}` : /^\+[1-9]\d{7,14}$/.test(String(value || '')) ? value : '';
}
