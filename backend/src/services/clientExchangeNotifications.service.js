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
    WHERE COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
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
    try {
      const profile = await Profile.getForProvider({ providerUserId: user.id, agencyId });
      if (!matchesExchangeListing({ user, profile, facets: facets.get(Number(user.id)), listing, client })) continue;
      summary.matched++;
      await Notification.create({
        type: 'client_exchange_match', severity: 'info', title: 'New Client Exchange match',
        message: 'A new referral matches your client preferences. View the client and request it in the exchange.',
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
        subject: 'New Client Exchange match',
        ...buildExchangeEmail({ listing, link }),
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
  return Notification.create({
    type, severity: 'info', title, message, userId, agencyId: listing.agency_id,
    relatedEntityType: 'client_exchange_listing', relatedEntityId: listing.id, actorUserId,
    actorSource: 'client_exchange', audienceJson: { agencySlug: agency?.slug || agency?.portal_url }
  });
}

export async function notifyExchangeClaim({ listing, requestingProviderUserId }) {
  const recipient = listing.current_provider_user_id || listing.posted_by_user_id;
  if (!recipient || Number(recipient) === Number(requestingProviderUserId)) return;
  await exchangeActivityNotification({ listing, userId: recipient, type: 'client_exchange_claim',
    title: 'New Client Exchange request', message: 'A provider has requested your referral. Review all requests and choose a provider in Client Exchange.', actorUserId: requestingProviderUserId });
}

export async function notifyExchangeAssignment({ listing, request, actingUserId }) {
  await exchangeActivityNotification({ listing, userId: request.requesting_provider_user_id, type: 'client_exchange_assigned',
    title: 'Client Exchange assignment confirmed', message: 'You have been assigned the client you requested. Open the exchange to view the client record.', actorUserId: actingUserId });
}
