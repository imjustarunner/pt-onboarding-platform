import { runtimeIntegrationSecrets, storedIntegrationSecrets, assertManagedSecretsUnchanged } from './integrationSecrets.js';
import { pool, seal, open, transaction } from './repository.js';
import { fail } from './policy.js';
import { integrationDefaults, requirePlatformSuperadmin, cleanPlatformSettings, publicPlatformSettings } from './integrationPolicy.js';
import { notifyreRequest, notifyreNumbers } from './sessionTransports.js';

const context = 'auricwell:platform:integrations';
export async function platformIntegrations(db = pool, lock = false) {
  const [[row]] = await db.execute(`SELECT * FROM auricwell_platform_integrations WHERE id=1${lock ? ' FOR UPDATE' : ''}`);
  const defaults = integrationDefaults(), saved = row ? open(row.payload, context) : {};
  return { settings: runtimeIntegrationSecrets({ ...defaults, ...saved, notifyre: { ...defaults.notifyre, ...saved.notifyre } }), revision: row?.revision || 0 };
}
export async function integrationStatus(ctx) {
  requirePlatformSuperadmin(ctx);
  const value = await platformIntegrations();
  const [practices] = await pool.execute("SELECT id,name,slug FROM auricwell_practices WHERE product='auricwell_ehr' AND status='active' ORDER BY name");
  return { ...value, settings: publicPlatformSettings(value.settings),
    practices, webhookPath: '/api/auricwell-sms/webhook',
    googleCredentialsConfigured: !!(process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 || process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON),
    vonageClinicalApproved: process.env.VONAGE_CLINICAL_APPROVED === 'true',
    vonageVideoApproved: process.env.VONAGE_CLINICAL_VIDEO_APPROVED === 'true' };
}
async function write(ctx, settings, revision, db, action) {
  if (!revision) {
    await db.execute('INSERT INTO auricwell_platform_integrations (id,payload,updated_by) VALUES (1,?,?)', [seal(storedIntegrationSecrets(settings), context), ctx.accountId]);
  } else {
    const [r] = await db.execute('UPDATE auricwell_platform_integrations SET payload=?,revision=revision+1,updated_by=?,updated_at=UTC_TIMESTAMP(3) WHERE id=1 AND revision=?',
      [seal(storedIntegrationSecrets(settings), context), ctx.accountId, revision]);
    if (!r.affectedRows) throw fail(409, 'Platform settings changed. Reload before saving.');
  }
  await db.execute('INSERT INTO auricwell_platform_integration_audit (actor_id,revision,action) VALUES (?,?,?)', [ctx.accountId, revision + 1, action]);
}
export async function savePlatformIntegrations(ctx, input) {
  requirePlatformSuperadmin(ctx);
  await transaction(async db => {
    const current = await platformIntegrations(db, true);
    if (input.revision !== current.revision) throw fail(409, 'Platform settings changed. Reload before saving.');
    assertManagedSecretsUnchanged(input.settings);
    const settings = cleanPlatformSettings(input.settings || {}, current.settings);
    for (const route of settings.clientMessaging.routes) {
      const [[practice]] = await db.execute("SELECT id FROM auricwell_practices WHERE id=? AND product='auricwell_ehr' AND status='active'", [route.practiceId]);
      if (!practice) throw fail(400, 'Choose an active AuricWell practice for each agency.');
    }
    if ((settings.videoProvider === 'vonage' || settings.alwaysAvailableOffice) && process.env.VONAGE_CLINICAL_VIDEO_APPROVED !== 'true')
      throw fail(409, 'Enable Vonage clinical video readiness on the server before turning on native sessions or permanent offices.');
    if (settings.smsProvider === 'vonage') {
      if (process.env.VONAGE_CLINICAL_APPROVED !== 'true') throw fail(409, 'Enable Vonage clinical SMS readiness in the server configuration before switching.');
      const { getSmsSender } = await import('../smsCompliance.service.js');
      if (!settings.clientMessaging.routes.length) {
        const sender = await getSmsSender(settings.vonage.from);
        if (String(sender.campaign_id) !== settings.vonage.campaignId || !sender.registration?.purposes?.includes('reminders') || sender.registration?.purposes?.includes('workforce'))
          throw fail(409, 'Choose the registered patient Campaign 1 sender, not the workforce Campaign 2 number.');
      }
    }
    await write(ctx, settings, current.revision, db, 'platform.integrations_saved');
  });
  return integrationStatus(ctx);
}
export async function verifyVonageAgency(ctx, practiceId) {
  requirePlatformSuperadmin(ctx);
  if (process.env.VONAGE_CLINICAL_APPROVED !== 'true') throw fail(409, 'Vonage clinical approval must be enabled on the server first.');
  const current = await platformIntegrations();
  const route = current.settings.clientMessaging.routes.find(r => r.practiceId === practiceId);
  if (!route || route.approval !== 'approved' || !route.approvalReference || !route.mainNumber) throw fail(409, 'Save the agency’s approved Vonage campaign with sending disabled first.');
  const [[practice]] = await pool.execute('SELECT agency_id FROM auricwell_practices WHERE id=?', [practiceId]);
  const { getSmsSender } = await import('../smsCompliance.service.js');
  for (const number of [route.mainNumber, route.providerNumber].filter(Boolean)) {
    const sender = await getSmsSender(number);
    if (!practice?.agency_id || Number(sender.agency_id) !== Number(practice.agency_id) || String(sender.campaign_id) !== route.campaignId
      || sender.registration?.purposes?.includes('workforce') || !['care','reminders','billing'].every(p=>sender.registration?.purposes?.includes(p)))
      throw fail(409, 'Both numbers must belong to this agency’s registered clinical campaign with care, reminder and billing purposes.');
  }
  await transaction(async db => {
    const latest = await platformIntegrations(db, true);
    if (latest.revision !== current.revision) throw fail(409, 'Settings changed. Try verification again.');
    route.verifiedAt = new Date().toISOString(); route.verifiedProvider = 'vonage';
    await write(ctx, { ...latest.settings, clientMessaging: current.settings.clientMessaging }, latest.revision, db, 'platform.vonage_agency_verified');
  });
  return integrationStatus(ctx);
}
export async function verifyNotifyre(ctx, practiceId = null) {
  requirePlatformSuperadmin(ctx);
  const current = await platformIntegrations();
  const n = current.settings.notifyre;
  if (practiceId) {
    const route = current.settings.clientMessaging.routes.find(r => r.practiceId === practiceId);
    if (!route || route.approval !== 'approved' || !route.approvalReference || !route.campaignId || !route.mainNumber || !n.apiToken || !n.baaReference || !n.webhookSecret)
      throw fail(409, 'Save the approved campaign, approval reference, numbers, executed BAA, API token and webhook secret first.');
    const numbers = notifyreNumbers(await notifyreRequest(n.apiToken, '/sms/numbers'));
    if (![route.mainNumber, route.providerNumber].filter(Boolean).every(number => numbers.includes(number)))
      throw fail(409, 'One or more agency numbers are not available in this Notifyre account. Complete SMS hosting/porting and campaign assignment first.');
    await transaction(async db => {
      const latest = await platformIntegrations(db, true);
      if (latest.revision !== current.revision) throw fail(409, 'Settings changed during verification. Try again.');
      route.verifiedAt = new Date().toISOString(); route.verifiedProvider = 'notifyre';
      await write(ctx, { ...latest.settings, clientMessaging: current.settings.clientMessaging }, latest.revision, db, 'platform.notifyre_agency_verified');
    });
    return integrationStatus(ctx);
  }
  if (!n.apiToken || !n.from || !n.campaignId || !n.baaReference)
    throw fail(409, 'Save the API token, linked number, approved campaign reference, and executed BAA reference first.');
  const numbers = notifyreNumbers(await notifyreRequest(n.apiToken, '/sms/numbers'));
  if (!numbers.includes(n.from)) throw fail(409, 'That number was not found in this Notifyre account. Link your purchased number in Notifyre first.');
  await transaction(async db => {
    const latest = await platformIntegrations(db, true);
    if (latest.revision !== current.revision) throw fail(409, 'Settings changed during verification. Try again.');
    await write(ctx, { ...latest.settings, notifyre: { ...n, verifiedAt: new Date().toISOString() } }, latest.revision, db, 'platform.notifyre_number_verified');
  });
  return integrationStatus(ctx);
}
export async function recordNotifyreWebhookVerified() {
  await transaction(async db => {
    const current = await platformIntegrations(db, true);
    if (!current.revision || current.settings.notifyre.webhookVerifiedAt) return;
    current.settings.notifyre.webhookVerifiedAt = new Date().toISOString();
    await db.execute('UPDATE auricwell_platform_integrations SET payload=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE id=1', [seal(storedIntegrationSecrets(current.settings), context)]);
  });
}
export async function requireOfficeEnabled() {
  if (!(await platformIntegrations()).settings.alwaysAvailableOffice)
    throw fail(403, 'Always-available virtual offices are turned off for AuricWell. Join your scheduled appointment instead.');
}

export async function verifyNotifyreFax(ctx, practiceId) {
  requirePlatformSuperadmin(ctx);
  const current = await platformIntegrations();
  const route = current.settings.clientMessaging.routes.find(r => r.practiceId === practiceId);
  const n = current.settings.notifyre;
  if (!route?.mainNumber || !n.apiToken || !n.baaReference || !n.webhookSecret)
    throw fail(409, 'Save the primary number, executed BAA reference, API token and webhook secret first.');
  const { notifyreFaxNumbers } = await import('./faxPolicy.js');
  const numbers = notifyreFaxNumbers(await notifyreRequest(n.apiToken, '/fax/numbers'));
  if (!numbers.includes(route.mainNumber)) throw fail(409, 'The primary number is not an active fax number in this Notifyre account. Ask Notifyre to confirm fax capability and number hosting first.');
  await transaction(async db => {
    const latest = await platformIntegrations(db, true);
    if (latest.revision !== current.revision) throw fail(409, 'Settings changed during verification. Try again.');
    route.faxVerifiedAt = new Date().toISOString();
    await write(ctx, { ...latest.settings, clientMessaging: current.settings.clientMessaging }, latest.revision, db, 'platform.notifyre_fax_verified');
  });
  return integrationStatus(ctx);
}
