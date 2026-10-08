import pool from '../config/database.js';
import { buildExchangeEmail } from '../utils/clientExchangeSummary.js';
import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { matchesExchangeListing } from '../utils/clientExchangeMatching.js';

export async function notifyExchangeMatches({ listing, client }) {
  const agencyId = Number(listing.agencyId);
  const [users] = await pool.execute(`SELECT DISTINCT u.* FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    WHERE COALESCE(ua.is_active, 1) = 1
      AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
      AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING')
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access = 1)`, [agencyId]);
  const facets = await listClinicalFacetsForUsers(users.map(u => u.id), { agencyId });
  const agency = await Agency.findById(agencyId);
  const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
  const sender = identities.find(row => row.identity_key === 'notifications')
    || identities.find(row => /^notifications@/i.test(row.from_email || ''));
  const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${listing.id}&agencyId=${agencyId}`;
  const summary = { matched: 0, sent: 0, queued: 0, skipped: 0, failed: 0 };
  for (const user of users) {
    if (Number(user.id) === Number(listing.currentProviderUserId)) continue;
    if (listing.targetProviderUserId && Number(user.id) !== Number(listing.targetProviderUserId)) continue;
    try {
      const profile = await Profile.getForProvider({ providerUserId: user.id, agencyId });
      if (!matchesExchangeListing({ user, profile, facets: facets.get(Number(user.id)), listing, client })) continue;
      summary.matched++;
      await Notification.create({
        type: 'client_exchange_match', severity: 'info', title: '1 client is available in Client Exchange',
        message: 'A client matches your care preferences and you are open for scheduling. Open Client Exchange to review the requested care and request the client.',
        userId: user.id, agencyId, relatedEntityType: 'client_exchange_listing', relatedEntityId: listing.id,
        actorUserId: listing.postedByUserId, actorSource: 'client_exchange',
        audienceJson: { agencySlug: agency?.slug || agency?.portal_url }
      });
      const enabled = await isNotificationChannelEnabled({ userId: user.id, userRole: user.role, agencyId, type: 'client_exchange_match', channel: 'email' });
      if (!enabled) { summary.skipped++; continue; }
      const to = user.work_email || user.email || user.personal_email;
      if (!sender?.id || !to) { summary.failed++; continue; }
      const result = await sendEmailFromIdentity({
        senderIdentityId: sender.id, to, userId: user.id, source: 'auto',
        subject: '1 client is available in Client Exchange',
        ...buildExchangeEmail({ listing, link, client }),
        templateType: 'client_exchange_match', linkUrl: link, fromDisplayNameOverride: 'Notifications'
      });
      if (result?.skipped || result?.blocked) summary.failed++;
      else if (result?.queued) summary.queued++;
      else summary.sent++;
    } catch (error) {
      summary.failed++;
      console.error('[clientExchange] Match notification failed', { listingId: listing.id, userId: user.id, error: error?.message });
    }
  }
  return summary;
}

async function exchangeActivityNotification({ listing, userId, type, title, message, actorUserId }) {
  const agency = await Agency.findById(listing.agency_id);
  await Notification.create({
    type, severity: 'info', title, message, userId, agencyId: listing.agency_id,
    relatedEntityType: 'client_exchange_listing', relatedEntityId: listing.id, actorUserId,
    actorSource: 'client_exchange', audienceJson: { agencySlug: agency?.slug || agency?.portal_url }
  });
  const [[recipient]] = await pool.execute(`SELECT u.id, u.role, u.work_email, u.email, u.personal_email FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? WHERE u.id = ? AND COALESCE(u.is_active,1) = 1 AND COALESCE(u.is_archived,0) = 0 LIMIT 1`, [listing.agency_id, userId]);
  if (!recipient || !await isNotificationChannelEnabled({ userId, userRole: recipient.role, agencyId: listing.agency_id, type, channel: 'email' })) return;
  const identities = await EmailSenderIdentity.list({ agencyId: listing.agency_id, includePlatformDefaults: false, onlyActive: true });
  const sender = identities.find(row => row.identity_key === 'notifications') || identities.find(row => /^notifications@/i.test(row.from_email || ''));
  const to = recipient.work_email || recipient.email || recipient.personal_email;
  if (!sender?.id || !to) throw new Error('Client Exchange notification email sender or recipient is unavailable.');
  const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${listing.id}&agencyId=${listing.agency_id}`;
  const result = await sendEmailFromIdentity({ senderIdentityId: sender.id, to, userId, source: 'auto',
    subject: title, text: `${message}\n\n${link}`, templateType: type, linkUrl: link });
  if (result?.blocked || result?.skipped || result?.failed) throw new Error('Client Exchange email was not delivered.');
}

export async function notifyExchangeClaim({ listing, requestingProviderUserId }) {
  const [reviewers] = await pool.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND u.role IN ('admin','super_admin','support','staff')
    AND COALESCE(u.is_active,1) = 1 AND COALESCE(u.is_archived,0) = 0`, [listing.agency_id]);
  const recipients = new Set([listing.current_provider_user_id, listing.posted_by_user_id, ...reviewers.map(user => user.id)].filter(Boolean).map(Number));
  recipients.delete(Number(requestingProviderUserId));
  const results = await Promise.allSettled([...recipients].map(userId => exchangeActivityNotification({ listing, userId, type: 'client_exchange_claim',
    title: 'New Client Exchange request', message: 'A provider has requested a referral. Review the request in Client Exchange.', actorUserId: requestingProviderUserId })));
  if (results.some(result => result.status === 'rejected')) throw new Error('Some Client Exchange request notifications could not be delivered.');
}

export async function notifyExchangeAssignment({ listing, request, actingUserId }) {
  await exchangeActivityNotification({ listing, userId: request.requesting_provider_user_id, type: 'client_exchange_assigned',
    title: 'Client Exchange assignment confirmed', message: 'You have been assigned the client you requested. Open the exchange to view the client record.', actorUserId: actingUserId });
}
