import pool from '../config/database.js';
import { SCHOOL_PROVIDER_ASSIGNMENT_SQL } from '../utils/schoolProviderAudience.js';
import { activeManagedStaff } from './managedWorkspaceGroupPolicy.js';
import { withMessagingJobLock } from './messagingJobLock.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { canRunSchedulingMaintenance } from './schedulingWorkerGate.js';

export const SCHOOL_SCHEDULE_TRAINING = Object.freeze({
  id: 'school-my-schedule-update',
  campaignKey: 'school-my-schedule-20261109',
  title: 'My Schedule updates for school providers',
  description: 'A quick video on updates to My Schedule for ITSCO providers assigned to schools.',
  url: 'https://youtu.be/qfVy1Czud2w'
});

export async function schoolScheduleTrainingForUser({ userId, agencyId }, database = pool) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 || !Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) return [];
  const [[user]] = await database.execute(`SELECT u.*, ua.is_active AS membership_active,
    ${SCHOOL_PROVIDER_ASSIGNMENT_SQL} AS has_school_assignments
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    JOIN agencies a ON a.id=ua.agency_id
    WHERE u.id=? AND ua.agency_id=? AND a.slug='itsco' AND a.is_active=1 AND a.organization_type='agency'`, [Number(userId), Number(agencyId)]);
  if (!user || !activeManagedStaff(user) || Number(user.is_assistant_account) || Number(user.has_school_assignments) !== 1) return [];
  const [campaigns] = await database.execute(`SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at
    FROM school_schedule_training_campaigns
    WHERE agency_id=? AND campaign_key=? AND starts_at<=UTC_TIMESTAMP() AND expires_at>UTC_TIMESTAMP()`, [Number(agencyId), SCHOOL_SCHEDULE_TRAINING.campaignKey]);
  return campaigns.map(campaign => ({ id: SCHOOL_SCHEDULE_TRAINING.id, title: SCHOOL_SCHEDULE_TRAINING.title,
    description: SCHOOL_SCHEDULE_TRAINING.description, url: SCHOOL_SCHEDULE_TRAINING.url, expiresAt: campaign.expires_at,
    agencyIds: [Number(agencyId)] }));
}

export function schoolScheduleTrainingEmail(kind) {
  const expired = kind === 'expiry';
  const text = expired
    ? `The My Schedule update video for school staff (ITSCO providers assigned to schools) has expired after 30 days and has disappeared from My Schedule.\n\nMichael indicated that we should either renew this one or add a new one for school staff at this time.\n\nCurrent video: ${SCHOOL_SCHEDULE_TRAINING.url}`
    : `Hi school providers,\n\nHere is a quick video on updates to your My Schedule:\n${SCHOOL_SCHEDULE_TRAINING.url}\n\nYou can also watch it using the purple How-to video button near the top of My Schedule. This update is available in the app for 30 days.`;
  return {
    to: expired ? 'admin@itsco.health' : 'schoolproviders@itsco.health',
    subject: expired ? 'My Schedule update for school staff has expired — renew or replace' : 'Quick video: updates to My Schedule for school providers',
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}<p><a href="${SCHOOL_SCHEDULE_TRAINING.url}">Watch the My Schedule update video</a></p></div>`
  };
}

// Recover an accepted send from its persistent communication log if a process
// stopped before saving the campaign receipt. Pending approval is accepted once.
async function deliverCampaignEmail(campaign, kind, database, sendEmail) {
  const column = kind === 'expiry' ? 'expiry_communication_id' : 'launch_communication_id';
  const acceptedColumn = kind === 'expiry' ? 'expiry_accepted_at' : 'launch_accepted_at';
  if (campaign[acceptedColumn]) return { skipped: 'already_recorded' };
  const templateType = `school_schedule_training_${kind}`;
  const [existing] = await database.execute(`SELECT id, delivery_status FROM user_communications
    WHERE agency_id=? AND template_type=? AND template_id=? AND channel='email'
      AND delivery_status IN ('pending','sent','delivered','flagged')
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.testInboxRedirect')),'false') <> 'true'
    ORDER BY id DESC LIMIT 1`,
  [campaign.agency_id, templateType, campaign.id]);
  if (existing[0] && ['pending', 'flagged'].includes(existing[0].delivery_status)) {
    return { skipped: 'existing_delivery_pending_review', communicationId: existing[0].id };
  }
  let communicationId = existing[0]?.id;
  if (!communicationId) {
    let actorUserId = null;
    if (kind === 'launch') {
      // Use a configured group manager; never bypass distribution permissions.
      const [[group]] = await database.execute(`SELECT manager_user_ids FROM managed_workspace_groups
        WHERE agency_id=? AND group_key='schoolproviders' AND email='schoolproviders@itsco.health'`, [campaign.agency_id]);
      const managers = typeof group?.manager_user_ids === 'string' ? JSON.parse(group.manager_user_ids) : group?.manager_user_ids;
      if (!Array.isArray(managers) || !managers.length) return { skipped: 'schoolproviders_group_not_ready' };
      const [users] = await database.execute(`SELECT u.*,ua.is_active AS membership_active FROM users u
        JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND u.id IN (${managers.map(() => '?').join(',')})`, [campaign.agency_id, ...managers]);
      actorUserId = users.find(activeManagedStaff)?.id;
      if (!actorUserId) return { skipped: 'schoolproviders_group_manager_not_ready' };
    }
    const result = await sendEmail({ agencyId: campaign.agency_id, triggerKey: 'school_schedule_training',
      ...schoolScheduleTrainingEmail(kind), generatedByUserId: actorUserId, templateType, templateId: campaign.id, source: 'auto' });
    // A gated/redirected/failed send must not be recorded as a real delivery.
    if (result?.skipped || result?.blocked || result?.redirected || !(result?.id || result?.communicationId)) return result;
    communicationId = result.communicationId || null;
  }
  await database.execute(`UPDATE school_schedule_training_campaigns SET ${column}=?, ${acceptedColumn}=UTC_TIMESTAMP() WHERE id=? AND ${acceptedColumn} IS NULL`, [communicationId, campaign.id]);
  return { communicationId };
}

export async function processSchoolScheduleTraining(database = pool, sendEmail = sendNotificationEmail) {
  const [campaigns] = await database.execute(`SELECT c.*, c.expires_at<=UTC_TIMESTAMP() AS expired
    FROM school_schedule_training_campaigns c JOIN agencies a ON a.id=c.agency_id
    WHERE a.slug='itsco' AND a.is_active=1 AND c.campaign_key=? AND c.starts_at<=UTC_TIMESTAMP()
      AND ((c.expires_at>UTC_TIMESTAMP() AND c.launch_accepted_at IS NULL)
        OR (c.expires_at<=UTC_TIMESTAMP() AND c.expiry_accepted_at IS NULL))`, [SCHOOL_SCHEDULE_TRAINING.campaignKey]);
  const results = [];
  for (const campaign of campaigns) {
    try { results.push(await deliverCampaignEmail(campaign, Number(campaign.expired) ? 'expiry' : 'launch', database, sendEmail)); }
    catch (error) { results.push({ campaignId: campaign.id, error: error.code || 'delivery_failed' }); }
  }
  return results;
}

export async function runSchoolScheduleTrainingTick() {
  if (!await canRunSchedulingMaintenance()) return { skipped: 'not_live_revision' };
  return withMessagingJobLock('school-schedule-training', () => processSchoolScheduleTraining());
}
